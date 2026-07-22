import { OPENLIST_VERSION } from "./internal/conf/const.js";
import {
  base64ToArrayBuffer,
  failure,
  jsonResponse,
  pageResp,
  rawResponse,
  redirectResponse,
  success,
  successWithMessage,
  textResponse,
} from "./server/common/response.js";
import {
  basename,
  dirname,
  isSafeRelativeName,
  normalizePath,
} from "./internal/model/path.js";
import { linkFromDriverData } from "./internal/model/args.js";
import {
  SETTING_FLAG,
  SETTING_GROUP,
} from "./internal/model/setting.js";
import {
  parseAuthToken,
  tokenFingerprint,
} from "./internal/auth/token.js";
import {
  accountFromSiyuanConf,
  defaultGuestUser,
  normalizeUser,
  syncDefaultUserWithSiyuan,
  USER_ROLE,
} from "./internal/model/user.js";
import {
  driverInfoMap,
  driverNames,
} from "./internal/driver/info.js";
import { createDriverRuntime } from "./internal/driver/registry.js";
import {
  defaultSettings,
  settingMeta,
} from "./internal/bootstrap/data/settings.js";
import { defaultState } from "./internal/bootstrap/data/state.js";
import { createVirtualFs } from "./internal/fs/virtual.js";
import { createWorkspaceAdapter } from "./internal/fs/workspace.js";
import { createTaskStore } from "./internal/task/manager.js";
import {
  createSearchIndex,
  ensureSearchState,
} from "./internal/search/index.js";
import {
  loadConfigState,
  loadState as loadStoredState,
  saveState as saveStoredState,
} from "./internal/state.js";
import { createTaskHandlers } from "./server/handles/task.js";
import { createFsHandlers } from "./server/handles/fs.js";
import { createAdminHandlers } from "./server/handles/admin.js";
import { createAuthHandlers } from "./server/handles/auth.js";
import { createCompatHandlers } from "./server/handles/compat.js";
import { createIndexHandlers } from "./server/handles/index.js";
import { createMetaHandlers } from "./server/handles/meta.js";
import { createMessageHandlers } from "./server/handles/message.js";
import { createScanHandlers } from "./server/handles/scan.js";
import { createSecurityHandlers } from "./server/handles/security.js";
import {
  createArchiveDownloadResponse,
  createArchiveHandlers,
} from "./server/handles/archive.js";
import { createPublicHandlers } from "./server/handles/public.js";
import {
  createStatusHandlers,
  createStatusPayload,
} from "./server/handles/status.js";
import {
  createShareHandlers,
  createShareReader,
  shareClientIP,
} from "./server/handles/share.js";
import {
  proxy,
  proxyReadOptions,
  shouldProxy,
} from "./server/common/proxy.js";
import { createRouter } from "./server/router.js";
import { createS3Server } from "./server/s3.js";
import { createWebDavServer } from "./server/webdav.js";

(function () {
  const now = () => new Date().toISOString();

  let state = defaultState(now);
  const {
    cloneEntryTree,
    createFile,
    ensureDir,
    moveEntryTree,
    removeEmptyDirs,
    removeEntry,
    renameEntryInDir,
  } = createVirtualFs({
    getState: () => state,
    now,
  });

  const warn = (...args) => siyuan.logger.warn("[siyuan-cloud]", ...args);
  const requestAuthContext = { cookie: "" };
  const originalFetch = siyuan.client.fetch.bind(siyuan.client);
  const client = { fetch: (path, init = {}) => originalFetch(path, { ...init, headers: requestAuthContext.cookie ? { ...(init.headers || {}), Cookie: requestAuthContext.cookie } : init.headers }) };

  const pick = (value, lowerName, upperName) => {
    if (!value) return undefined;
    if (value[lowerName] !== undefined) return value[lowerName];
    if (value[upperName] !== undefined) return value[upperName];
    return undefined;
  };

  const extensionType = (name, isDir) => {
    if (isDir) return 1;
    const ext = String(name).toLowerCase().split(".").pop() || "";
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"].includes(ext)) return 2;
    if (["mp4", "mkv", "mov", "avi", "webm", "m4v"].includes(ext)) return 3;
    if (["mp3", "flac", "wav", "ogg", "m4a"].includes(ext)) return 4;
    if (["zip", "7z", "rar", "tar", "gz", "bz2"].includes(ext)) return 5;
    if (["pdf", "epub", "txt", "md", "json", "yaml", "yml", "csv", "log"].includes(ext)) return 6;
    return 0;
  };

  const toObjResp = (entry) => ({
    name: entry.name,
    size: entry.size || 0,
    is_dir: !!entry.is_dir,
    modified: entry.modified,
    created: entry.created || entry.modified,
    sign: "",
    thumb: "",
    type: extensionType(entry.name, entry.is_dir),
    hashinfo: "",
    hash_info: {},
  });

  const toFsGetResp = (entry, path) => ({
    ...toObjResp(entry),
    raw_url: entry.is_dir ? "" : "/plugin/private/siyuan-cloud/d" + normalizePath(path),
    readme: "",
    header: "",
    provider: "siyuan-storage",
    related: relatedEntries(path, entry).map(toObjResp),
  });

  const page = (items, req) => {
    const pageIndex = Math.max(1, Number(req.page || req.Page || 1));
    const perPage = Math.max(1, Number(req.per_page || req.perPage || req.PerPage || items.length || 1));
    const start = (pageIndex - 1) * perPage;
    return items.slice(start, start + perPage);
  };

  const {
    isWorkspacePath,
    siyuanApiJson,
    workspaceGet,
    workspaceList,
    workspacePublicUrl,
    workspaceReadText,
    workspaceRelPath,
  } = createWorkspaceAdapter({
    client,
    extensionType,
    failure,
    now,
    page,
    toObjResp,
  });
  const relatedEntries = (path, entry) => {
    if (!entry || entry.is_dir) return [];
    const parent = state.entries[dirname(path)];
    if (!parent || !parent.children) return [];
    const stem = entry.name.replace(/\.[^.]+$/, "");
    return parent.children
      .map((childPath) => state.entries[childPath])
      .filter((item) => item && !item.is_dir && item.name !== entry.name && item.name.startsWith(stem));
  };

  const parseJson = async (request) => {
    const requestMeta = pick(request, "request", "Request");
    const body = pick(requestMeta, "body", "Body");
    if (!body) return {};
    if (body.data !== undefined && body.data !== null) {
      if (typeof body.data === "object") {
        if (typeof body.data.json === "function") {
          try {
            return await body.data.json();
          } catch (_) {
            // Fall through to text parsing.
          }
        }
        if (typeof body.data.text === "function") {
          const text = await body.data.text();
          if (!text || !String(text).trim()) return {};
          try {
            return JSON.parse(text);
          } catch (_) {
            return { content: text };
          }
        }
        return body.data;
      }
      if (typeof body.data === "string" && body.data.trim()) {
        try {
          return JSON.parse(body.data);
        } catch (_) {
          return { content: body.data };
        }
      }
    }
    if (body.form && typeof body.form === "object") {
      const values = body.form.values || body.form.Value || {};
      const files = body.form.files || body.form.File || {};
      const flattened = {};
      for (const key of Object.keys(values)) {
        const value = values[key];
        flattened[key] = Array.isArray(value) && value.length === 1 ? value[0] : value;
      }
      flattened.files = files;
      return flattened;
    }
    if (body.string && Array.isArray(body.string.values)) return { content: body.string.values.join("") };
    return {};
  };

  const queryValue = (request, key) => {
    const url = pick(request, "url", "URL");
    const queryMap = pick(url, "query", "Query");
    if (queryMap && typeof queryMap === "object") {
      const value = queryMap[key];
      return Array.isArray(value) ? String(value[0] || "") : String(value || "");
    }
    const query = queryMap || pick(url, "rawQuery", "RawQuery") || pick(url, "search", "Search") || "";
    const params = new URLSearchParams(query);
    return params.get(key) || "";
  };

  const decodePath = (path) => {
    try {
      return decodeURIComponent(path);
    } catch (_) {
      return path;
    }
  };

  const requestPath = (request) => {
    const context = pick(request, "context", "Context");
    const url = pick(request, "url", "URL");
    const fromContext = pick(context, "path", "Path");
    const fromUrl = pick(url, "path", "Path");
    const raw = fromContext || fromUrl || "/";
    return decodePath(raw.replace(/^\/plugin\/private\/[^/]+/, "") || "/");
  };

  const requestHeaders = (request) => {
    const meta = pick(request, "request", "Request");
    return pick(meta, "headers", "Headers") || {};
  };

  const requestHeader = (request, name) => {
    const target = String(name || "").toLowerCase();
    for (const [key, value] of Object.entries(requestHeaders(request))) {
      if (String(key).toLowerCase() !== target) continue;
      return Array.isArray(value) ? String(value[0] || "") : String(value || "");
    }
    return "";
  };

  const adminUser = () => state.users.find((item) => Number(item.role) === USER_ROLE.ADMIN) || state.users[0];
  const guestUser = () => state.users.find((item) => Number(item.role) === USER_ROLE.GUEST) || defaultGuestUser();
  const currentUser = (request, options = {}) => {
    const token = (
      requestHeader(request, "X-Siyuan-Cloud-Authorization")
      || requestHeader(request, "Authorization")
      || queryValue(request, "siyuan_cloud_token")
    ).replace(/^Bearer\s+/i, "");
    const context = (user, auth = "token") => {
      const normalized = normalizeUser(user || defaultGuestUser(), Math.max(0, Number(user?.id || 2) - 1));
      return { auth, error: null, user: normalized };
    };
    if (token && token === String(state.settings?.token || "")) return context(adminUser(), "admin_token");
    if (token.startsWith("siyuan-cloud-port:")) {
      const id = Number(token.slice("siyuan-cloud-port:".length));
      const user = state.users.find((item) => Number(item.id) === id);
      if (user?.disabled && !options.allowDisabledGuest) return { auth: "legacy_token", error: "Current user is disabled, replace please", user: normalizeUser(user) };
      return context(user || defaultGuestUser(), "legacy_token");
    }
    if (!token) {
      const guest = guestUser();
      if (guest.disabled && !options.allowDisabledGuest) return { auth: "guest", error: "Guest user is disabled, login please", user: normalizeUser(guest, 1) };
      return context(guest, "guest");
    }
    try {
      const claims = parseAuthToken(token, state.settings?.token || "siyuan-cloud-token");
      const user = state.users.find((item) => item.username === claims.username);
      if (!user) return { auth: "jwt", error: "user not found", user: normalizeUser(defaultGuestUser(), 1) };
      if ((user.logout_tokens || []).includes(tokenFingerprint(token))) return { auth: "jwt", error: "Token has been logged out, login please", user: normalizeUser(user) };
      if (Number(claims.pwd_ts || 0) !== Number(user.pwd_ts || 0)) return { auth: "jwt", error: "Password has been changed, login please", user: normalizeUser(user) };
      if (user.disabled) return { auth: "jwt", error: "Current user is disabled, replace please", user: normalizeUser(user) };
      return context(user, "jwt");
    } catch (error) {
      return { auth: "jwt", error: error?.message || "couldn't handle this token", user: normalizeUser(defaultGuestUser(), 1) };
    }
  };
  const requestUser = (request, options) => currentUser(request, options).user;
  const requireCurrentUser = (request, options = {}) => {
    const ctx = currentUser(request, options);
    return ctx.error ? { error: failure(ctx.error, 401), user: ctx.user, auth: ctx.auth } : ctx;
  };
  const requireAdmin = (request) => {
    const ctx = requireCurrentUser(request);
    if (ctx.error) return ctx;
    return Number(ctx.user.role) !== USER_ROLE.ADMIN ? { ...ctx, error: failure("You are not an admin", 403) } : ctx;
  };

  const rawForwardHeaders = (headers = {}) => {
    const result = {};
    for (const [key, value] of Object.entries(headers || {})) {
      const normalized = String(key).toLowerCase();
      if (["accept-ranges", "content-range", "content-length", "etag", "last-modified", "cache-control"].includes(normalized)) {
        result[key] = Array.isArray(value) ? value.map(String) : [String(value)];
      }
    }
    return result;
  };

  const fileMime = (path) => {
    const ext = String(path || "").split(".").pop().toLowerCase();
    const types = {
      mp4: "video/mp4",
      m4v: "video/mp4",
      webm: "video/webm",
      mkv: "video/x-matroska",
      mov: "video/quicktime",
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      flac: "audio/flac",
      wav: "audio/wav",
      ogg: "audio/ogg",
    };
    return types[ext] || "application/octet-stream";
  };

  const downloadDisposition = (path) => {
    const name = encodeURIComponent(basename(path) || "download");
    return `attachment; filename="${name}"; filename*=UTF-8''${name}`;
  };

  const withDownloadDisposition = (response, filePath, enabled) => {
    if (!enabled) return response;
    response.headers = {
      ...(response.headers || {}),
      "Content-Disposition": [downloadDisposition(filePath)],
    };
    return response;
  };

  const saveState = async (domains) => {
    await saveStoredState(siyuan.storage, state, domains);
  };
  const saveConfigState = async () => saveState("config");
  const saveRuntimeState = async () => saveState("runtime");
  const saveSearchState = async () => saveState("search");

  const saveStorageAddition = async (storage, addition) => {
    const target = state.storages.find((item) => item.id === storage.id)
      || state.storages.find((item) => item.mount_path === storage.mount_path);
    if (!target) return;
    target.addition = JSON.stringify(addition || {});
    target.modified = now();
    await saveConfigState();
  };

  const driverRuntime = createDriverRuntime({
    client,
    getSettings: () => state.settings,
    saveStorageAddition,
    workspaceGet,
    workspaceList,
    workspacePublicUrl,
    workspaceReadText,
  });
  const searchFs = {
    async get(path) {
      const normalized = normalizePath(path);
      if (normalized === "/") return { name: "", is_dir: true, size: 0 };
      if (isWorkspacePath(normalized)) {
        const result = await workspaceGet(normalized);
        if (result.error) return null;
        return result.data;
      }
      const mount = driverRuntime.resolve(state.storages, normalized);
      if (mount) {
        return mount.driver.get(mount.storage, mount.relPath, { skipLink: true });
      }
      const entry = state.entries[normalized];
      if (entry) return toObjResp(entry);
      const mountName = normalized === "/" ? "" : normalized.split("/").filter(Boolean)[0];
      if (
        normalized !== "/"
        && state.storages.some((storage) => !storage.disabled && normalizePath(storage.mount_path || "/").split("/").filter(Boolean)[0] === mountName)
      ) {
        return { name: basename(normalized), is_dir: true, size: 0 };
      }
      return null;
    },
    async list(path) {
      const normalized = normalizePath(path);
      if (isWorkspacePath(normalized)) {
        const result = await workspaceList(normalized, { page: 1, per_page: 100000 });
        if (result.error) return [];
        return result.data.content || [];
      }
      const mount = driverRuntime.resolve(state.storages, normalized);
      if (mount) {
        const data = await mount.driver.list(mount.storage, mount.relPath, { page: 1, per_page: 100000 });
        return data.content || [];
      }
      const entry = state.entries[normalized];
      const children = entry?.is_dir
        ? (entry.children || []).map((childPath) => state.entries[childPath]).filter(Boolean).map(toObjResp)
        : [];
      if (normalized === "/") {
        for (const mountEntry of driverRuntime.mountEntries(state.storages, now)) {
          if (!children.some((item) => item.name === mountEntry.name)) children.unshift(toObjResp(mountEntry));
        }
      }
      return children;
    },
  };
  const searchIndex = createSearchIndex({
    getObj: searchFs.get,
    getState: () => state,
    isIndexDisabled: (path) => {
      const normalized = normalizePath(path);
      return state.storages.some((storage) => {
        const mountPath = normalizePath(storage.mount_path || "/");
        return !!storage.disable_index && normalized !== "/" && (normalized === mountPath || normalized.startsWith(`${mountPath}/`));
      });
    },
    listObjs: searchFs.list,
    now,
    saveState: saveSearchState,
  });

  const loadState = async () => {
    const loaded = await loadStoredState({ now, storage: siyuan.storage });
    state = loaded.state;
    let userChanged = false;
    try {
      const conf = await siyuanApiJson("/api/system/getConf", {});
      userChanged = syncDefaultUserWithSiyuan(state, accountFromSiyuanConf(conf?.data?.conf || conf?.data || conf));
    } catch (error) {
      warn("failed to sync SiYuan account user", error?.message || String(error));
    }
    if (loaded.shouldSave) {
      await saveState();
    } else if (userChanged) {
      await saveConfigState();
    }
    ensureDir("/");
    ensureSearchState(state);
  };
  const reloadConfigState = async () => {
    const config = await loadConfigState({ storage: siyuan.storage });
    if (!config) return false;
    Object.assign(state, config);
    ensureDir("/");
    ensureSearchState(state);
    return true;
  };

  const settingItem = (key, value, index) => {
    const meta = settingMeta[key] || {};
    return {
      key,
      value: String(value ?? ""),
      help: meta.help || "",
      type: meta.type || "string",
      options: meta.options || "",
      group: meta.group ?? SETTING_GROUP.SINGLE,
      flag: meta.flag ?? SETTING_FLAG.PUBLIC,
      index: index || 0,
    };
  };

  const requestedGroups = (request) => {
    const raw = queryValue(request, "groups") || queryValue(request, "group");
    if (!raw) return null;
    const groups = raw
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
    return groups.length ? groups : null;
  };

  const listSettings = (request, source) => {
    const groups = request ? requestedGroups(request) : null;
    return Object.entries(source || state.settings)
      .map(([key, value], index) => settingItem(key, value, index))
      .filter((item) => !groups || groups.includes(item.group));
  };

  const publicSettings = () => {
    const result = {};
    for (const [key, value] of Object.entries(state.settings)) {
      const item = settingItem(key, value, 0);
      if (item.flag !== SETTING_FLAG.PRIVATE) result[key] = item.value;
    }
    result.version = OPENLIST_VERSION;
    return result;
  };

  const saveToolSettings = async (req, keyMap, responseValue) => {
    for (const [settingKey, reqKey] of Object.entries(keyMap)) {
      state.settings[settingKey] = String(req[reqKey] ?? "");
    }
    await saveConfigState();
    return jsonResponse(success(responseValue === undefined ? "ok" : responseValue));
  };

  const pageSlice = (items, request) => {
    const pageIndex = Math.max(1, Number(queryValue(request, "page") || 1));
    const perPage = Math.max(1, Number(queryValue(request, "per_page") || queryValue(request, "perPage") || items.length || 1));
    const start = (pageIndex - 1) * perPage;
    return pageResp(items.slice(start, start + perPage), items.length);
  };

  const storageResp = (storage) => ({
    ...storage,
    mount_details: storage.mount_details || {
      total_space: 0,
      used_space: 0,
      free_space: 0,
    },
  });

  const { shareGet, shareList } = createShareReader({
    driverRuntime,
    getState: () => state,
    isWorkspacePath,
    page,
    saveState: saveConfigState,
    toFsGetResp,
    toObjResp,
    workspaceGet,
    workspaceList,
  });

  const taskStore = createTaskStore({
    getState: () => state,
    now,
    saveState: saveRuntimeState,
  });

  const shareDownloadShouldProxy = (mount, filePath) => {
    const config = driverInfoMap()[mount?.storage?.driver]?.config || {};
    return shouldProxy(mount?.storage, config, basename(filePath));
  };

  const readFileResponse = async (filePath, request, readOptions = {}) => {
    const asDownload = readOptions.shareDownload || readOptions.directDownload;
    if (isWorkspacePath(filePath)) {
      const file = await workspaceReadText(filePath);
      if (!file.ok) return textResponse(file.text || "not found", file.status || 404);
      return withDownloadDisposition(textResponse(file.text, 200, file.contentType), filePath, asDownload);
    }
    const mount = driverRuntime.resolve(state.storages, filePath);
    if (mount && mount.driver.read) {
      try {
        const options = proxyReadOptions(request, filePath);
        if (asDownload && mount.driver.link && !shareDownloadShouldProxy(mount, filePath)) {
          const data = await mount.driver.link(mount.storage, mount.relPath, options);
          return redirectResponse(linkFromDriverData(data).url);
        }
        const data = await mount.driver.read(mount.storage, mount.relPath, options);
        if (data.redirect) return redirectResponse(data.redirect);
        if (data.link) {
          const link = linkFromDriverData(data);
          if ((readOptions.shareDownload || readOptions.directDownload) && !shareDownloadShouldProxy(mount, filePath)) return redirectResponse(link.url);
          return withDownloadDisposition(proxy(null, link, { request_header: options.requestHeaders }, !!mount.storage.proxy_range), filePath, asDownload);
        }
        if (String(data.bodyEncoding || "").startsWith("base64")) {
          const headers = rawForwardHeaders(data.headers);
          if (!headers["Accept-Ranges"] && !headers["accept-ranges"]) headers["Accept-Ranges"] = ["bytes"];
          return withDownloadDisposition(rawResponse(
            base64ToArrayBuffer(data.body || ""),
            data.status || 200,
            data.contentType || fileMime(filePath),
            headers,
          ), filePath, asDownload);
        }
        return withDownloadDisposition(textResponse(data.body || "", data.status || 200, data.contentType || "application/octet-stream"), filePath, asDownload);
      } catch (error) {
        return textResponse(error.message || "driver read failed", 502);
      }
    }
    const entry = state.entries[filePath];
    if (!entry || entry.is_dir) return textResponse("not found", 404);
    if (String(entry.body_encoding || "").startsWith("base64")) {
      return withDownloadDisposition(rawResponse(
        base64ToArrayBuffer(entry.content || ""),
        200,
        entry.mime || "application/octet-stream",
      ), filePath, asDownload);
    }
    return withDownloadDisposition(textResponse(entry.content || "", 200, entry.mime || "application/octet-stream"), filePath, asDownload);
  };

  const handleWebDav = createWebDavServer({
    cloneEntryTree,
    createFile,
    currentUser: requestUser,
    ensureDir,
    getState: () => state,
    isWorkspacePath,
    moveEntryTree,
    readFileResponse,
    removeEntry,
    requestPath,
    saveState: saveRuntimeState,
    toObjResp,
    workspaceGet,
    workspaceList,
  });
  const handleS3 = createS3Server({
    cloneEntryTree,
    createFile,
    currentUser: requestUser,
    ensureDir,
    getState: () => state,
    removeEntry,
    requestPath,
    saveState: saveRuntimeState,
  });
  const archiveDownloadResponse = createArchiveDownloadResponse({
    client,
    driverRuntime,
    getState: () => state,
  });

  let handlers = {};
  handlers = {
    ...createStatusHandlers({
      client,
      getState: () => state,
      handlersRef: () => handlers,
    }),
    ...createTaskHandlers({
      currentUser: requestUser,
      parseJson,
      queryValue,
      saveState: saveRuntimeState,
      taskStore,
    }),
    ...createAuthHandlers({
      currentUser,
      getState: () => state,
      parseJson,
      saveState: saveConfigState,
    }),
    ...createCompatHandlers({
      getState: () => state,
      parseJson,
      saveState: saveConfigState,
    }),
    ...createMetaHandlers({
      getState: () => state,
      pageSlice,
      parseJson,
      queryValue,
      requireAdmin,
      saveState: saveConfigState,
    }),
    ...createMessageHandlers({
      getState: () => state,
      now,
      parseJson,
      requireAdmin,
      saveState: saveRuntimeState,
    }),
    ...createIndexHandlers({
      currentUser: requestUser,
      parseJson,
      requireAdmin,
      searchIndex,
      taskStore,
    }),
    ...createScanHandlers({
      getState: () => state,
      now,
      requireAdmin,
      saveState: saveRuntimeState,
    }),
    ...createSecurityHandlers({
      currentUser,
      getState: () => state,
      now,
      parseJson,
      queryValue,
      requireAdmin,
      saveState: saveConfigState,
    }),
    ...createPublicHandlers({
      getState: () => state,
      handlersRef: () => handlers,
      settingItem,
    }),
    ...createAdminHandlers({
      driverRuntime,
      getState: () => state,
      isWorkspacePath,
      listSettings,
      now,
      pageSlice,
      parseJson,
      queryValue,
      reloadConfigState,
      requireAdmin,
      saveState: saveConfigState,
      saveToolSettings,
      settingItem,
      storageResp,
      workspaceGet,
    }),
    ...createFsHandlers({
      client,
      cloneEntryTree,
      createFile,
      currentUser: requestUser,
      driverRuntime,
      ensureDir,
      getState: () => state,
      isWorkspacePath,
      moveEntryTree,
      now,
      page,
      parseJson,
      removeEmptyDirs,
      removeEntry,
      renameEntryInDir,
      saveConfigState,
      saveState: saveRuntimeState,
      searchIndex,
      shareGet,
      shareClientIP,
      shareList,
      siyuanApiJson,
      taskStore,
      toFsGetResp,
      toObjResp,
      workspaceGet,
      workspaceList,
      workspaceReadText,
      workspaceRelPath,
    }),
    ...createArchiveHandlers({
      client,
      createFile,
      currentUser: requestUser,
      driverRuntime,
      ensureDir,
      getState: () => state,
      page,
      parseJson,
      saveState: saveRuntimeState,
      taskStore,
    }),
    ...createShareHandlers({
      currentUser: requestUser,
      driverRuntime,
      getState: () => state,
      isWorkspacePath,
      now,
      page,
      parseJson,
      queryValue,
      saveState: saveConfigState,
      workspaceGet,
    }),
  };

  const route = createRouter({
    archiveDownloadResponse,
    getState: () => state,
    handleS3,
    handleWebDav,
    handlers,
    isWorkspacePath,
    pick,
    queryValue,
    readFileResponse,
    requestPath,
    saveState: saveConfigState,
    warn,
    workspaceReadText,
  });

  siyuan.plugin.lifecycle.onload = async () => {
    await loadState();
    await siyuan.rpc.bind("siyuan-cloud.status", async () => createStatusPayload({
      client,
      getState: () => state,
      handlersRef: () => handlers,
    }), "Return Siyuan Cloud compatibility runtime status.");
  };

  siyuan.plugin.lifecycle.onunload = async () => {
    await saveState(["config", "runtime", "search"]);
    await log("kernel plugin unloaded");
  };

  siyuan.server.private.http.handler = async (request) => {
    const previousCookie = requestAuthContext.cookie;
    requestAuthContext.cookie = Object.entries(pick(pick(request, "request", "Request"), "cookies", "Cookies") || {}).flatMap(([key, values]) => (Array.isArray(values) ? values : [values]).map((value) => `${key}=${value}`)).join("; ") || requestHeader(request, "Cookie");
    try {
      return await route(request);
    } finally {
      requestAuthContext.cookie = previousCookie;
    }
  };
})();
