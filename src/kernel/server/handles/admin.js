import {
  failure,
  jsonResponse,
  success,
} from "../common/response.js";
import { normalizePath } from "../../internal/model/path.js";
import {
  normalizeUser,
  sanitizeUser,
  USER_ROLE,
} from "../../internal/model/user.js";
import { defaultSettings } from "../../internal/bootstrap/data/settings.js";
import {
  driverInfoMap,
  driverNames,
} from "../../internal/driver/info.js";
import { normalizeShare } from "./share.js";

export const createAdminHandlers = ({
  driverRuntime,
  getState,
  isWorkspacePath,
  listSettings,
  now,
  pageSlice,
  parseJson,
  queryValue,
  reloadConfigState,
  saveState,
  saveToolSettings,
  settingItem,
  storageResp,
  workspaceGet,
}) => {
  const state = new Proxy({}, {
    get: (_, prop) => getState()[prop],
    set: (_, prop, value) => {
      getState()[prop] = value;
      return true;
    },
  });
  const refreshConfig = async () => {
    await reloadConfigState?.();
  };
  const storageAddition = (reqAddition, currentAddition = "{}") => {
    if (typeof reqAddition === "string") return reqAddition;
    if (reqAddition !== undefined) return JSON.stringify(reqAddition || {});
    return currentAddition || "{}";
  };
  const exportConfig = () => ({
    version: 1,
    exported_at: new Date().toISOString(),
    source: "siyuan-cloud",
    settings: { ...state.settings },
    users: state.users.map((user) => ({ ...user })),
    storages: state.storages.map((storage) => ({ ...storage })),
    metas: (state.metas || []).map((meta) => ({ ...meta })),
    sharings: (state.sharings || []).map((share) => ({ ...share })),
  });
  const asArray = (value, fallback = []) => Array.isArray(value) ? value : fallback;
  const boolValue = (value, fallback = false) => {
    if (value === undefined || value === null || value === "") return fallback;
    return value === true || value === "true" || value === 1 || value === "1";
  };
  const parseAddition = (value) => {
    if (!value) return {};
    if (typeof value === "object") return value;
    try {
      return JSON.parse(String(value || "{}"));
    } catch (_) {
      return {};
    }
  };
  const driverConfig = (driver) => driverInfoMap()[driver]?.config || {};
  const verifyDataFromError = (error, driver, addition) => {
    const message = error?.message || "driver test failed";
    if (error?.verify) {
      return {
        driver,
        addition: error.addition || addition,
        verify: error.verify,
      };
    }
    const html = String(message.match(/need verify:\s*([\s\S]*)/i)?.[1] || "");
    const qrSrc = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";
    const qrText = html.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1] || "";
    const qrData = qrSrc.match(/base64,([^"')\s<]+)/i)?.[1] || html.match(/base64,([^"')\s<]+)/i)?.[1] || "";
    return {
      driver,
      addition,
      verify: html ? {
        html,
        qr_data: qrData,
        qr_src: qrSrc,
        qr_text: qrText,
        type: "qrcode",
      } : null,
    };
  };
  const proxyDefaults = (driver, source = {}) => {
    const config = driverConfig(driver);
    const addition = parseAddition(source.addition);
    const quarkWebProxy = driver === "Quark" && !boolValue(addition.use_transcoding_address);
    const preferProxy = boolValue(config.prefer_proxy) || quarkWebProxy;
    return {
      web_proxy: boolValue(source.web_proxy, preferProxy),
      webdav_policy: source.webdav_policy || (preferProxy ? "native_proxy" : "302_redirect"),
      proxy_range: boolValue(source.proxy_range),
      down_proxy_url: source.down_proxy_url || "",
      disable_proxy_sign: boolValue(source.disable_proxy_sign),
    };
  };
  const normalizeStorageForImport = (storage, index) => {
    const driver = storage.driver || "SiYuanKernel";
    return {
      id: Number(storage.id || index + 1),
      mount_path: normalizePath(storage.mount_path || storage.mountPath || "/"),
      order: Number(storage.order ?? 0),
      driver,
      cache_expiration: Number(storage.cache_expiration ?? 30),
      custom_cache_policies: storage.custom_cache_policies || "",
      status: storage.status || "work",
      addition: storageAddition(storage.addition),
      remark: storage.remark || "",
      modified: Number(storage.modified || now()),
      disabled: !!storage.disabled,
      disable_index: boolValue(storage.disable_index),
      ...proxyDefaults(driver, storage),
    };
  };
  const nextUserId = () => Math.max(0, ...state.users.map((item) => Number(item.id || 0))) + 1;
  const userById = (id) => state.users.find((item) => Number(item.id) === Number(id));
  const userList = () => state.users.map(sanitizeUser);

  return {
    "GET /api/admin/user/list": async (request) => {
      await refreshConfig();
      return jsonResponse(success(pageSlice(userList(), request)));
    },
    "GET /api/admin/user/get": async (request) => {
      await refreshConfig();
      const id = Number(queryValue(request, "id") || 1);
      const user = userById(id);
      if (!user) return jsonResponse(failure("user not found", 404));
      return jsonResponse(success(sanitizeUser(user)));
    },
    "POST /api/admin/user/update": async (request) => {
      const req = await parseJson(request);
      const index = state.users.findIndex((item) => item.id === Number(req.id));
      if (index < 0) return jsonResponse(failure("user not found", 404));
      const current = state.users[index];
      const role = Number(req.role ?? current.role);
      if (role !== Number(current.role)) return jsonResponse(failure("role can not be changed", 400));
      if (req.disabled && current.role === USER_ROLE.ADMIN) return jsonResponse(failure("admin user can not be disabled", 400));
      const next = normalizeUser({
        ...current,
        ...req,
        id: current.id,
        role: current.role,
        password: req.password ? req.password : current.password,
        otp_secret: req.otp_secret || current.otp_secret || "",
      }, index);
      state.users[index] = next;
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/admin/user/create": async (request) => {
      const req = await parseJson(request);
      if (!req.username) return jsonResponse(failure("username is required", 400));
      if (state.users.some((item) => item.username === req.username)) return jsonResponse(failure("user already exists", 409));
      const role = Number(req.role ?? USER_ROLE.GENERAL);
      if (role === USER_ROLE.ADMIN || role === USER_ROLE.GUEST) return jsonResponse(failure("admin or guest user can not be created", 400));
      const user = normalizeUser({
        ...req,
        id: nextUserId(),
        role: USER_ROLE.GENERAL,
        password: req.password || "",
        base_path: req.base_path || "/",
        permission: Number(req.permission ?? 0),
      }, state.users.length);
      state.users.push(user);
      await saveState();
      return jsonResponse(success(sanitizeUser(user)));
    },
    "POST /api/admin/user/delete": async (request) => {
      const req = await parseJson(request);
      const id = Number(queryValue(request, "id") || req.id);
      const user = userById(id);
      if (!user) return jsonResponse(failure("user not found", 404));
      if (user.role === USER_ROLE.ADMIN || user.role === USER_ROLE.GUEST) return jsonResponse(failure("admin or guest user can not be deleted", 400));
      state.users = state.users.filter((item) => item.id !== id);
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/admin/user/cancel_2fa": async (request) => {
      const req = await parseJson(request);
      const user = state.users.find((item) => item.id === Number(req.id));
      if (!user) return jsonResponse(failure("user not found", 404));
      user.otp = false;
      user.otp_secret = "";
      await saveState();
      return jsonResponse(success());
    },
    "GET /api/admin/storage/list": async (request) => {
      await refreshConfig();
      return jsonResponse(success(pageSlice(state.storages.map(storageResp), request)));
    },
    "GET /api/admin/storage/get": async (request) => {
      await refreshConfig();
      const id = Number(queryValue(request, "id") || 1);
      return jsonResponse(success(storageResp(state.storages.find((item) => item.id === id) || state.storages[0])));
    },
    "POST /api/admin/storage/create": async (request) => {
      const req = await parseJson(request);
      const mountPath = normalizePath(req.mount_path || req.mountPath || "");
      const existing = mountPath && state.storages.find((item) => item.mount_path === mountPath);
      if (existing) {
        const driver = req.driver || existing.driver || "SiYuanKernel";
        Object.assign(existing, {
          order: Number(req.order ?? existing.order ?? 0),
          driver,
          cache_expiration: Number(req.cache_expiration ?? existing.cache_expiration ?? 30),
          custom_cache_policies: req.custom_cache_policies ?? existing.custom_cache_policies ?? "",
          status: req.status || existing.status || "work",
          addition: storageAddition(req.addition, existing.addition),
          remark: req.remark ?? existing.remark ?? "",
          modified: now(),
          disabled: !!req.disabled,
          disable_index: boolValue(req.disable_index, existing.disable_index),
          ...proxyDefaults(driver, { ...existing, ...req }),
        });
        await saveState();
        return jsonResponse(success({ id: existing.id, updated: true }));
      }
      const id = Math.max(0, ...state.storages.map((item) => item.id || 0)) + 1;
      const driver = req.driver || "SiYuanKernel";
      state.storages.push({
        id,
        mount_path: mountPath || normalizePath("/mount-" + id),
        order: Number(req.order || 0),
        driver,
        cache_expiration: Number(req.cache_expiration ?? 30),
        custom_cache_policies: req.custom_cache_policies || "",
        status: req.status || "work",
        addition: storageAddition(req.addition),
        remark: req.remark || "",
        modified: now(),
        disabled: !!req.disabled,
        disable_index: boolValue(req.disable_index),
        ...proxyDefaults(driver, req),
      });
      await saveState();
      return jsonResponse(success({ id }));
    },
    "POST /api/admin/storage/update": async (request) => {
      const req = await parseJson(request);
      const storage = state.storages.find((item) => item.id === Number(req.id));
      if (!storage) return jsonResponse(failure("storage not found", 404));
      Object.assign(storage, {
        ...req,
        mount_path: req.mount_path ? normalizePath(req.mount_path) : storage.mount_path,
        addition: storageAddition(req.addition, storage.addition),
        cache_expiration: Number(req.cache_expiration ?? storage.cache_expiration ?? 30),
        disabled: !!req.disabled,
        disable_index: boolValue(req.disable_index, storage.disable_index),
        modified: now(),
        ...proxyDefaults(req.driver || storage.driver, { ...storage, ...req }),
      });
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/admin/storage/delete": async (request) => {
      const req = await parseJson(request);
      const id = Number(req.id);
      if (id === 1) return jsonResponse(failure("root storage cannot be deleted", 403));
      state.storages = state.storages.filter((item) => item.id !== id);
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/admin/storage/enable": async (request) => {
      const req = await parseJson(request);
      const storage = state.storages.find((item) => item.id === Number(req.id));
      if (!storage) return jsonResponse(failure("storage not found", 404));
      storage.disabled = false;
      storage.status = "work";
      storage.modified = now();
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/admin/storage/disable": async (request) => {
      const req = await parseJson(request);
      const storage = state.storages.find((item) => item.id === Number(req.id));
      if (!storage) return jsonResponse(failure("storage not found", 404));
      storage.disabled = true;
      storage.status = "disabled";
      storage.modified = now();
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/admin/storage/load_all": async () => jsonResponse(success()),
    "GET /api/admin/config/export": async () => jsonResponse(success(exportConfig())),
    "POST /api/admin/config/import": async (request) => {
      const req = await parseJson(request);
      const payload = req?.config || req;
      const mode = req?.mode || "replace";
      if (!payload || typeof payload !== "object") return jsonResponse(failure("config is required", 400));
      if (payload.settings && typeof payload.settings === "object") {
        state.settings = mode === "merge" ? { ...state.settings, ...payload.settings } : { ...defaultSettings(), ...payload.settings };
      }
      if (payload.users) {
        const importedUsers = asArray(payload.users).map(normalizeUser);
        state.users = importedUsers.length ? importedUsers : state.users;
      }
      if (payload.storages) {
        const importedStorages = asArray(payload.storages).map(normalizeStorageForImport);
        if (!importedStorages.some((item) => item.mount_path === "/")) {
          importedStorages.unshift(normalizeStorageForImport({ id: 1, mount_path: "/", driver: "SiYuanKernel", addition: "{}" }, 0));
        }
        state.storages = importedStorages;
      }
      if (payload.metas) state.metas = asArray(payload.metas).map((meta, index) => ({ ...meta, id: Number(meta.id || index + 1) }));
      if (payload.sharings) state.sharings = asArray(payload.sharings).map((share) => normalizeShare(share, now));
      await saveState();
      return jsonResponse(success({
        users: state.users.length,
        storages: state.storages.length,
        metas: state.metas.length,
        sharings: state.sharings.length,
      }));
    },
    "GET /api/admin/driver/names": async () => jsonResponse(success(driverNames())),
    "GET /api/admin/driver/list": async () => jsonResponse(success(driverInfoMap())),
    "GET /api/admin/driver/info": async (request) => {
      const driver = queryValue(request, "driver") || "SiYuanKernel";
      const info = driverInfoMap()[driver];
      if (!info) return jsonResponse(failure(`driver [${driver}] not found`, 404));
      return jsonResponse(success(info));
    },
    "POST /api/admin/driver/test": async (request) => {
      const req = await parseJson(request);
      const driver = req.driver || "SiYuanKernel";
      let addition;
      try {
        addition = typeof req.addition === "string" ? JSON.parse(req.addition || "{}") : (req.addition || {});
      } catch (error) {
        return jsonResponse(failure(error.message || "invalid addition JSON", 400));
      }
      if (!driverRuntime?.drivers?.[driver]) return jsonResponse(failure(`driver [${driver}] not found`, 404));
      if (!driverRuntime.drivers[driver].test) return jsonResponse(failure(`driver [${driver}] does not expose a test method yet`, 501));
      try {
        if (req.verify?.type === "sms") {
          if (!driverRuntime.drivers[driver].verify) return jsonResponse(failure(`driver [${driver}] does not expose a verify method yet`, 501));
          return jsonResponse(success(await driverRuntime.drivers[driver].verify({
            addition_json: addition,
            driver,
            mount_path: "/",
            settings: state.settings || {},
          }, req.verify)));
        }
        return jsonResponse(success(await driverRuntime.test(driver, addition, req.verify)));
      } catch (error) {
        return jsonResponse(failure(error.message || "driver test failed", 502, verifyDataFromError(error, driver, addition)));
      }
    },
    "GET /api/admin/setting/get": async (request) => {
      const key = queryValue(request, "key");
      const keys = queryValue(request, "keys");
      if (key) return jsonResponse(success(settingItem(key, state.settings[key] || "")));
      return jsonResponse(success(keys.split(",").filter(Boolean).map((item, index) => settingItem(item, state.settings[item] || "", index))));
    },
    "GET /api/admin/setting/list": async (request) => jsonResponse(success(listSettings(request))),
    "POST /api/admin/setting/default": async (request) => jsonResponse(success(listSettings(request, defaultSettings()))),
    "POST /api/admin/setting/save": async (request) => {
      const req = await parseJson(request);
      const items = Array.isArray(req) ? req : [req];
      for (const item of items) {
        if (item && item.key) state.settings[item.key] = String(item.value ?? "");
      }
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/admin/setting/delete": async (request) => {
      const key = queryValue(request, "key") || (await parseJson(request)).key;
      if (key) delete state.settings[key];
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/admin/setting/reset_token": async () => {
      state.settings.token = "siyuan-cloud-token-" + Math.random().toString(36).slice(2);
      await saveState();
      return jsonResponse(success(state.settings.token));
    },
    "POST /api/admin/setting/set_aria2": async (request) => {
      const req = await parseJson(request);
      return saveToolSettings(req, { aria2_uri: "uri", aria2_secret: "secret" }, "siyuan-cloud-aria2-placeholder");
    },
    "POST /api/admin/setting/set_qbit": async (request) => {
      const req = await parseJson(request);
      return saveToolSettings(req, { qbittorrent_url: "url", qbittorrent_seedtime: "seedtime" });
    },
    "POST /api/admin/setting/set_transmission": async (request) => {
      const req = await parseJson(request);
      return saveToolSettings(req, { transmission_uri: "uri", transmission_seedtime: "seedtime" });
    },
    "POST /api/admin/setting/set_115": async (request) => {
      const req = await parseJson(request);
      return saveToolSettings(req, { "115_temp_dir": "temp_dir" });
    },
    "POST /api/admin/setting/set_115_open": async (request) => {
      const req = await parseJson(request);
      return saveToolSettings(req, { "115_open_temp_dir": "temp_dir" });
    },
    "POST /api/admin/setting/set_123_pan": async (request) => {
      const req = await parseJson(request);
      return saveToolSettings(req, { "123_temp_dir": "temp_dir" });
    },
    "POST /api/admin/setting/set_123_open": async (request) => {
      const req = await parseJson(request);
      return saveToolSettings(req, { "123_open_temp_dir": "temp_dir", "123_open_callback_url": "callback_url" });
    },
    "POST /api/admin/setting/set_pikpak": async (request) => {
      const req = await parseJson(request);
      return saveToolSettings(req, { pikpak_temp_dir: "temp_dir" });
    },
    "POST /api/admin/setting/set_thunder": async (request) => {
      const req = await parseJson(request);
      return saveToolSettings(req, { thunder_temp_dir: "temp_dir" });
    },
    "POST /api/admin/setting/set_thunderx": async (request) => {
      const req = await parseJson(request);
      return saveToolSettings(req, { thunderx_temp_dir: "temp_dir" });
    },
    "POST /api/admin/setting/set_thunder_browser": async (request) => {
      const req = await parseJson(request);
      return saveToolSettings(req, { thunder_browser_temp_dir: "temp_dir" });
    },
  };
};
