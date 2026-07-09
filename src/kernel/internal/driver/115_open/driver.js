import { normalizePath } from "../../model/path.js";
import {
  basenameOf,
  createStorageCache,
  dirnameOf,
  numberValue,
  parseTime,
  persistAddition,
  rawDownloadUrl,
  userAgentFromOptions,
} from "../common.js";
import { remoteJson } from "../http.js";

const API = "https://proapi.115.com";
const AUTH_API = "https://passportapi.115.com";
const UA = "Mozilla/5.0 (Macintosh; Apple macOS 26_1_0) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/142.0.0.0 OpenList/425.6.30";
const MAX_PAGE_SIZE = 1150;
const cache = createStorageCache();
const limiterState = new WeakMap();
const refreshPromises = new WeakMap();

const formBody = (data) => new URLSearchParams(Object.entries(data)
  .filter(([, value]) => value !== undefined && value !== null && value !== "")
  .map(([key, value]) => [key, String(value)])).toString();

const additionValue = (addition, lowerName, upperName, fallback = "") => {
  const value = addition?.[lowerName] ?? addition?.[upperName];
  return value === undefined || value === null || value === "" ? fallback : value;
};

const rootId = (addition) => additionValue(addition, "root_folder_id", "RootFolderID", "0");
const pageSize = (addition) => Math.min(MAX_PAGE_SIZE, Math.max(1, numberValue(additionValue(addition, "page_size", "PageSize", 200), 200)));
const orderBy = (addition) => additionValue(addition, "order_by", "OrderBy", "");
const orderDirection = (addition) => additionValue(addition, "order_direction", "OrderDirection", "");
const accessToken = (addition) => additionValue(addition, "access_token", "AccessToken", "");
const refreshTokenValue = (addition) => additionValue(addition, "refresh_token", "RefreshToken", "");
const limitRate = (addition) => Math.max(0, Number(additionValue(addition, "limit_rate", "LimitRate", 1)) || 0);

const check115Open = (payload, fallback = "115 Open request failed") => {
  const code = Number(payload?.code ?? 0);
  if (payload?.state === false || (payload?.state === 0 && code !== 0) || code >= 40000000 || payload?.error) {
    throw new Error(payload?.message || payload?.msg || payload?.error || `${fallback}: ${code}`);
  }
  return payload;
};

const unwrapData = (payload) => {
  const checked = check115Open(payload);
  return Object.hasOwn(checked || {}, "data") ? checked.data : checked;
};

const doRefreshToken = async (client, storage, previousRefreshToken = "") => {
  const addition = storage.addition_json;
  if (previousRefreshToken && refreshTokenValue(addition) && refreshTokenValue(addition) !== previousRefreshToken) {
    return accessToken(addition);
  }
  const refreshToken = refreshTokenValue(addition);
  if (!refreshToken) throw new Error("empty refresh_token");
  const resp = unwrapData(await remoteJson(client, `${AUTH_API}/open/refreshToken`, {
    body: formBody({ refresh_token: refreshToken }),
    contentType: "application/x-www-form-urlencoded",
    method: "POST",
  }));
  if (!resp?.access_token || !resp?.refresh_token) throw new Error("115 Open refresh token returned empty token");
  addition.access_token = resp.access_token;
  addition.refresh_token = resp.refresh_token;
  await persistAddition(storage);
  return resp.access_token;
};

const refreshToken = async (client, storage, previousRefreshToken = "") => {
  const existing = refreshPromises.get(storage);
  if (existing) return existing;
  const promise = doRefreshToken(client, storage, previousRefreshToken)
    .finally(() => refreshPromises.delete(storage));
  refreshPromises.set(storage, promise);
  return promise;
};

const request115Open = async (client, storage, pathname, {
  body,
  method = "GET",
  query = {},
  retry = true,
  userAgent = UA,
} = {}) => {
  const target = new URL(`${API}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  }
  const tokenBeforeRequest = accessToken(storage.addition_json);
  const refreshTokenBeforeRequest = refreshTokenValue(storage.addition_json);
  const payload = await remoteJson(client, target.toString(), {
    allowErrorStatus: true,
    body: body ? formBody(body) : undefined,
    contentType: body ? "application/x-www-form-urlencoded" : "application/json;charset=UTF-8",
    headers: {
      Authorization: tokenBeforeRequest ? `Bearer ${tokenBeforeRequest}` : "",
      "User-Agent": userAgent,
    },
    method,
  });
  const code = Number(payload?.code ?? 0);
  if (retry && (code === 99 || String(code).startsWith("401"))) {
    await refreshToken(client, storage, refreshTokenBeforeRequest);
    return request115Open(client, storage, pathname, { body, method, query, retry: false, userAgent });
  }
  return unwrapData(payload);
};

const waitLimit = async (storage) => {
  const rate = limitRate(storage.addition_json);
  if (rate <= 0) return;
  const interval = 1000 / rate;
  const now = Date.now();
  const previous = limiterState.get(storage) || 0;
  const wait = Math.max(0, previous - now);
  limiterState.set(storage, Math.max(now, previous) + interval);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
};

const isDir = (file) => String(file.fc ?? file.file_category) === "0";

const fileIdOf = (file) => String(file.fid || file.file_id || "");
const fileNameOf = (file) => String(file.fn || file.file_name || "");

const fileToObj = (file, relPath, storage) => {
  const dir = isDir(file);
  return {
    name: fileNameOf(file) || basenameOf(relPath),
    path: normalizePath(relPath),
    is_dir: dir,
    size: Number(file.fs || file.file_size || file.size || 0),
    modified: parseTime(file.upt || file.user_utime || file.utime),
    created: parseTime(file.uppt || file.user_ptime || file.ptime),
    thumb: file.thumb || file.thumbnail || "",
    sign: "",
    type: dir ? 1 : 0,
    hashinfo: file.sha1 || "",
    hash_info: file.sha1 ? { sha1: file.sha1 } : {},
    id: fileIdOf(file),
    pid: String(file.pid || file.parent_id || ""),
    pick_code: file.pc || file.pick_code || "",
    raw_url: dir ? "" : rawDownloadUrl(storage, relPath),
    provider: "115 Open",
    file,
  };
};

const listByParent = async (client, storage, parentId) => {
  const id = parentId || rootId(storage.addition_json);
  return cache.list(storage, id, async () => {
    const addition = storage.addition_json;
    const limit = pageSize(addition);
    const content = [];
    for (let offset = 0; ; offset += limit) {
      await waitLimit(storage);
      const resp = await request115Open(client, storage, "/open/ufile/files", {
        query: {
          asc: orderDirection(addition) === "asc" ? "1" : "0",
          cid: id,
          custom_order: "0",
          cur: "0",
          limit,
          o: orderBy(addition),
          offset,
          show_dir: "1",
          star: "0",
          stdir: "0",
        },
      });
      const list = Array.isArray(resp) ? resp : (resp?.data || []);
      content.push(...list);
      const count = Number(resp?.count ?? content.length);
      if (content.length >= count || list.length === 0) break;
    }
    return content;
  });
};

const getFolderByPath = async (client, storage, relPath) => {
  const resp = await request115Open(client, storage, "/open/folder/get_info", {
    body: { path: normalizePath(relPath || "/") },
    method: "POST",
  });
  const item = Array.isArray(resp) ? resp[0] : resp;
  if (!item?.file_id) throw new Error(`object not found: ${relPath}`);
  return {
    fid: item.file_id,
    fn: item.file_name || basenameOf(relPath),
    fc: item.file_category || "0",
    pc: item.pick_code || "",
    sha1: item.sha1 || "",
    pid: item.paths?.[0]?.file_id || "",
    upt: item.utime || item.open_time || 0,
    uppt: item.ptime || item.open_time || 0,
  };
};

const resolveFile = async (client, storage, relPath) => {
  const clean = normalizePath(relPath || "/");
  return cache.file(storage, clean, async () => {
    if (clean === "/") {
      return {
        fid: rootId(storage.addition_json),
        fn: "root",
        fc: "0",
        pid: "",
      };
    }
    let parentId = rootId(storage.addition_json);
    let current = null;
    for (const part of clean.split("/").filter(Boolean)) {
      const files = await listByParent(client, storage, parentId);
      current = files.find((item) => fileNameOf(item) === part);
      if (!current) return getFolderByPath(client, storage, clean);
      parentId = fileIdOf(current);
    }
    return current;
  });
};

const linkFor = async (client, storage, file, userAgent) => {
  const pc = file.pc || file.pick_code;
  const resp = await request115Open(client, storage, "/open/ufile/downurl", {
    body: { pick_code: pc },
    method: "POST",
    userAgent,
  });
  const id = fileIdOf(file);
  const info = resp?.[id] || Object.values(resp || {})[0];
  if (!info?.url?.url) throw new Error("115 Open download url is empty");
  return {
    url: info.url.url,
    header: { "User-Agent": userAgent },
    content_length: Number(info.file_size || file.fs || file.file_size || 0),
  };
};

const manage = async (client, storage, pathname, body) => {
  await waitLimit(storage);
  await request115Open(client, storage, pathname, { body, method: "POST" });
  cache.clear(storage);
};

export const create115OpenDriver = ({ client }) => ({
  async test(storage) {
    const user = await request115Open(client, storage, "/open/user/info");
    return { user, addition: storage.addition_json };
  },

  async list(storage, relPath) {
    const dir = await resolveFile(client, storage, relPath);
    const content = (await listByParent(client, storage, fileIdOf(dir)))
      .map((file) => fileToObj(file, normalizePath(relPath + "/" + fileNameOf(file)), storage));
    return {
      content,
      direct_upload_tools: [],
      header: "",
      provider: "115 Open",
      readme: "",
      total: content.length,
      write: true,
    };
  },

  async get(storage, relPath) {
    await waitLimit(storage);
    const file = await resolveFile(client, storage, relPath);
    return {
      ...fileToObj(file, relPath, storage),
      readme: "",
      header: "",
      related: [],
    };
  },

  async read(storage, relPath, options = {}) {
    await waitLimit(storage);
    const file = await resolveFile(client, storage, relPath);
    if (isDir(file)) throw new Error("not file");
    const userAgent = userAgentFromOptions(options, UA);
    return { link: await linkFor(client, storage, file, userAgent) };
  },

  async mkdir(storage, relPath) {
    const parent = await resolveFile(client, storage, dirnameOf(relPath));
    await manage(client, storage, "/open/folder/add", {
      pid: fileIdOf(parent),
      file_name: basenameOf(relPath),
    });
  },

  async move(storage, relPath, dstRelPath) {
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await manage(client, storage, "/open/ufile/move", {
      file_ids: fileIdOf(file),
      to_cid: fileIdOf(dst),
    });
  },

  async copy(storage, relPath, dstRelPath) {
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await manage(client, storage, "/open/ufile/copy", {
      pid: fileIdOf(dst),
      file_id: fileIdOf(file),
      no_dupli: "1",
    });
  },

  async remove(storage, relPath) {
    const file = await resolveFile(client, storage, relPath);
    await manage(client, storage, "/open/ufile/delete", {
      file_ids: fileIdOf(file),
      parent_id: file.pid || "",
    });
  },

  async rename(storage, relPath, newName) {
    const file = await resolveFile(client, storage, relPath);
    await manage(client, storage, "/open/ufile/update", {
      file_id: fileIdOf(file),
      file_name: newName,
    });
  },

  async put() {
    throw new Error("115 Open upload is not implemented in the SiYuan kernel port yet");
  },

  async offlineDownload(storage, uris, dstRelPath = "/") {
    const dst = await resolveFile(client, storage, dstRelPath);
    const resp = await request115Open(client, storage, "/open/offline/add_task_urls", {
      body: {
        urls: (uris || []).join("\n"),
        wp_path_id: fileIdOf(dst),
      },
      method: "POST",
    });
    return (Array.isArray(resp) ? resp : [])
      .filter((item) => item?.state && item?.info_hash)
      .map((item) => item.info_hash);
  },

  async details(storage) {
    const user = await request115Open(client, storage, "/open/user/info");
    const space = user?.rt_space_info || user?.space_info || {};
    const total = Number(space.all_total?.size || 0);
    const used = Number(space.all_use?.size || 0);
    return {
      total_space: total,
      used_space: used,
      free_space: Math.max(0, total - used),
    };
  },
});
