import { basename, dirname, normalizePath } from "../model/path.js";
import {
  forwardProxy,
  remoteJson,
} from "./http.js";

const API = "https://pan.baidu.com/rest/2.0";
const OPEN_API = "https://openapi.baidu.com/oauth/2.0/token";
const DEFAULT_RENEW_API = "https://api.oplist.org/baiduyun/renewapi";
const LIST_CACHE_TTL = 5 * 60 * 1000;
const FILE_CACHE_TTL = 5 * 60 * 1000;
const LINK_CACHE_TTL = 10 * 60 * 1000;
const baiduCache = new Map();

const storageKey = (storage) => String(storage?.id || storage?.mount_path || storage?.mount_path_hash || "default");

const cacheKey = (storage, type, key) => `${storageKey(storage)}:${type}:${key}`;

const getCache = (key) => {
  const hit = baiduCache.get(key);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    baiduCache.delete(key);
    return undefined;
  }
  return hit.value;
};

const setCache = (key, value, ttl) => {
  baiduCache.set(key, { expires: Date.now() + ttl, value });
  if (baiduCache.size > 512) {
    for (const cacheKeyValue of baiduCache.keys()) {
      baiduCache.delete(cacheKeyValue);
      if (baiduCache.size <= 384) break;
    }
  }
  return value;
};

const invalidateStorageCache = (storage) => {
  const prefix = `${storageKey(storage)}:`;
  for (const key of baiduCache.keys()) {
    if (key.startsWith(prefix)) baiduCache.delete(key);
  }
};

const boolValue = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true";
};

const rootedPath = (addition, relPath) => {
  const root = normalizePath(addition.root_folder_path || addition.RootFolderPath || "/");
  return normalizePath(root + "/" + normalizePath(relPath || "/"));
};

const baiduTime = (value) => {
  const date = Number(value || 0) ? new Date(Number(value) * 1000) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const checkBaidu = (payload) => {
  const errno = Number(payload?.errno || payload?.error_code || 0);
  if (errno && errno !== 31023) throw new Error(payload?.errmsg || payload?.error_msg || `baidu errno: ${errno}`);
  return payload;
};

const persistAddition = async (storage) => {
  if (storage?.saveDriverStorage) await storage.saveDriverStorage(storage.addition_json);
};

const refreshToken = async (client, storage) => {
  const addition = storage.addition_json || storage;
  const refreshTokenValue = addition.refresh_token || addition.RefreshToken || "";
  if (!refreshTokenValue) throw new Error("empty refresh_token");
  const useOnlineApi = boolValue(addition.use_online_api ?? addition.UseOnlineAPI, true);
  if (useOnlineApi) {
    const url = new URL(addition.api_url_address || addition.APIAddress || DEFAULT_RENEW_API);
    url.searchParams.set("refresh_ui", refreshTokenValue);
    url.searchParams.set("server_use", "true");
    url.searchParams.set("driver_txt", "baiduyun_go");
    const resp = await remoteJson(client, url.toString(), { method: "GET" });
    if (!resp.refresh_token || !resp.access_token) throw new Error(resp.text || "empty token returned from official API");
    addition.access_token = resp.access_token;
    addition.refresh_token = resp.refresh_token;
    await persistAddition(storage);
    return addition;
  }
  if (!addition.client_id || !addition.client_secret) throw new Error("empty ClientID or ClientSecret");
  const url = new URL(OPEN_API);
  url.searchParams.set("grant_type", "refresh_token");
  url.searchParams.set("refresh_token", refreshTokenValue);
  url.searchParams.set("client_id", addition.client_id);
  url.searchParams.set("client_secret", addition.client_secret);
  const resp = await remoteJson(client, url.toString(), { method: "GET" });
  if (resp.error) throw new Error(`${resp.error}: ${resp.error_description || ""}`.trim());
  if (!resp.refresh_token || !resp.access_token) throw new Error("empty token returned from official API");
  addition.access_token = resp.access_token;
  addition.refresh_token = resp.refresh_token;
  await persistAddition(storage);
  return addition;
};

const ensureAccessToken = async (client, storage) => {
  const addition = storage.addition_json || storage;
  if (addition.access_token || addition.AccessToken) return;
  await refreshToken(client, storage);
};

const requestBaidu = async (client, storage, url, {
  allowErrorStatus = false,
  body,
  contentType = "application/json",
  method = "GET",
  query = {},
  retry = true,
} = {}) => {
  const addition = storage.addition_json;
  await ensureAccessToken(client, storage);
  const target = new URL(url);
  target.searchParams.set("access_token", addition.access_token || addition.AccessToken || "");
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  }
  const resp = await remoteJson(client, target.toString(), {
    allowErrorStatus,
    body,
    contentType,
    method,
  });
  const errno = Number(resp?.errno || resp?.error_code || 0);
  if ((errno === 111 || errno === -6) && retry) {
    await refreshToken(client, storage);
    return requestBaidu(client, storage, url, { allowErrorStatus, body, contentType, method, query, retry: false });
  }
  return checkBaidu(resp);
};

const get = (client, storage, pathname, query, retry) => requestBaidu(client, storage, `${API}${pathname}`, { method: "GET", query, retry });

const postForm = (client, storage, pathname, query, form) => requestBaidu(client, storage, `${API}${pathname}`, {
  body: new URLSearchParams(form).toString(),
  contentType: "application/x-www-form-urlencoded",
  method: "POST",
  query,
});

const fileNameOf = (file) => file?.server_filename || file?.name || basename(file?.path || "");
const isDir = (file) => Number(file?.isdir || 0) === 1;

const fileToObj = (file, relPath, storage) => {
  const actualPath = file?.path || rootedPath(storage.addition_json, relPath);
  const dir = isDir(file);
  return {
    name: fileNameOf(file),
    path: normalizePath(relPath),
    is_dir: dir,
    size: Number(file?.size || 0),
    modified: baiduTime(file?.server_mtime || file?.mtime),
    created: baiduTime(file?.server_ctime || file?.ctime),
    sign: "",
    thumb: file?.thumbs?.url3 || "",
    type: dir ? 1 : 0,
    hashinfo: "",
    hash_info: {},
    id: String(file?.fs_id || file?.id || ""),
    raw_url: dir ? "" : `/plugin/private/siyuan-cloud/p${normalizePath(storage.mount_path + "/" + relPath)}`,
    provider: "BaiduNetdisk",
    file: { ...file, path: actualPath },
  };
};

const listFiles = async (client, storage, relPath) => {
  const cleanRelPath = normalizePath(relPath || "/");
  const cached = getCache(cacheKey(storage, "list", cleanRelPath));
  if (cached) return cached;
  const addition = storage.addition_json;
  const dir = rootedPath(addition, cleanRelPath);
  const result = [];
  for (let start = 0; ; start += 1000) {
    const query = {
      method: "list",
      dir,
      web: "web",
      start,
      limit: 1000,
    };
    if (addition.order_by) {
      query.order = addition.order_by;
      if (addition.order_direction === "desc") query.desc = "1";
    }
    const payload = await get(client, storage, "/xpan/file", {
      ...query,
    });
    const list = payload.list || [];
    for (const file of list) {
      if (!boolValue(addition.only_list_video_file) || file.isdir === 1 || file.category === 1) result.push(file);
    }
    if (list.length < 1000) break;
  }
  return setCache(cacheKey(storage, "list", cleanRelPath), result, LIST_CACHE_TTL);
};

const resolveFile = async (client, storage, relPath) => {
  const clean = normalizePath(relPath || "/");
  if (clean === "/") return { isRoot: true, id: "", name: "root", path: "/" };
  const cached = getCache(cacheKey(storage, "file", clean));
  if (cached) return cached;
  const parent = dirname(clean);
  const name = basename(clean);
  const files = await listFiles(client, storage, parent);
  const file = files.find((entry) => fileNameOf(entry) === name);
  if (!file) throw new Error(`object not found: ${clean}`);
  return setCache(cacheKey(storage, "file", clean), { file, id: String(file.fs_id || ""), name: fileNameOf(file), path: clean }, FILE_CACHE_TTL);
};

const headerValue = (headers = {}, name) => {
  const lower = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() !== lower) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  return "";
};

const resolveHeadLocation = async (client, url, headers) => {
  try {
    const resp = await forwardProxy(client, url, {
      allowErrorStatus: true,
      contentType: "application/octet-stream",
      headers,
      method: "HEAD",
      responseEncoding: "text",
      timeout: 30000,
    });
    return headerValue(resp.headers, "Location") || headerValue(resp.headers, "location");
  } catch (_) {
    return "";
  }
};

const linkOfficial = async (client, storage, file) => {
  const payload = await get(client, storage, "/xpan/multimedia", {
    method: "filemetas",
    fsids: `[${file.fs_id || file.id}]`,
    dlink: "1",
  });
  const dlink = payload?.list?.[0]?.dlink || "";
  if (!dlink) throw new Error("get baidu dlink failed");
  const headers = { "User-Agent": "pan.baidu.com" };
  const url = `${dlink}&access_token=${encodeURIComponent(storage.addition_json.access_token || "")}`;
  const location = await resolveHeadLocation(client, url, headers);
  return {
    headers,
    url: location || url,
  };
};

const linkCrack = async (client, storage, file) => {
  const payload = await requestBaidu(client, storage, "https://pan.baidu.com/api/filemetas", {
    method: "GET",
    query: {
      target: `["${file.path}"]`,
      dlink: "1",
      web: "5",
      origin: "dlna",
    },
  });
  const url = payload?.info?.[0]?.dlink || "";
  if (!url) throw new Error("get baidu crack dlink failed");
  return {
    headers: { "User-Agent": storage.addition_json.custom_crack_ua || "netdisk" },
    url,
  };
};

const linkCrackVideo = async (client, storage, file) => {
  const payload = await requestBaidu(client, storage, "https://pan.baidu.com/api/mediainfo", {
    allowErrorStatus: true,
    method: "GET",
    query: {
      type: "VideoURL",
      path: file.path,
      fs_id: file.fs_id || file.id,
      devuid: "0%1",
      clienttype: "1",
      channel: "android_15_25010PN30C_bd-netdisk_1523a",
      nom3u8: "1",
      dlink: "1",
      media: "1",
      origin: "dlna",
    },
  });
  const url = payload?.info?.dlink || payload?.info?.[0]?.dlink || "";
  if (!url) throw new Error("get baidu video dlink failed");
  return {
    headers: { "User-Agent": storage.addition_json.custom_crack_ua || "netdisk" },
    url,
  };
};

const linkFor = async (client, storage, file) => {
  const key = cacheKey(storage, "link", [
    storage.addition_json.download_api || "official",
    file.fs_id || file.id || "",
    file.size || "",
    file.server_mtime || file.mtime || "",
  ].join(":"));
  const cached = getCache(key);
  if (cached) return cached;
  let link;
  switch (storage.addition_json.download_api || "official") {
    case "crack":
      link = await linkCrack(client, storage, file);
      break;
    case "crack_video":
      link = await linkCrackVideo(client, storage, file);
      break;
    default:
      link = await linkOfficial(client, storage, file);
  }
  return setCache(key, link, LINK_CACHE_TTL);
};

const manage = (client, storage, opera, filelist) => postForm(client, storage, "/xpan/file", {
  method: "filemanager",
  opera,
}, {
  async: "0",
  filelist: JSON.stringify(filelist),
  ondup: "fail",
});

export const createBaiduNetdiskDriver = ({ client }) => ({
  async test(storage) {
    await ensureAccessToken(client, storage);
    await get(client, storage, "/xpan/nas", { method: "uinfo" });
    return { addition: storage.addition_json };
  },

  async list(storage, relPath) {
    const content = (await listFiles(client, storage, relPath))
      .map((file) => fileToObj(file, normalizePath(relPath + "/" + fileNameOf(file)), storage));
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider: "BaiduNetdisk",
      direct_upload_tools: [],
    };
  },

  async get(storage, relPath, options = {}) {
    const target = await resolveFile(client, storage, relPath);
    if (target.isRoot) {
      return {
        name: "root",
        path: "/",
        is_dir: true,
        size: 0,
        modified: new Date().toISOString(),
        created: new Date().toISOString(),
        provider: "BaiduNetdisk",
        related: [],
      };
    }
    const obj = fileToObj(target.file, relPath, storage);
    if (!obj.is_dir && !options.skipLink) {
      const link = await linkFor(client, storage, target.file);
      obj.raw_url = link.url;
      obj.url = link.url;
    }
    return {
      ...obj,
      readme: "",
      header: "",
      related: [],
    };
  },

  async read(storage, relPath, options = {}) {
    const target = await resolveFile(client, storage, relPath);
    if (target.isRoot || isDir(target.file)) throw new Error("not file");
    const link = await linkFor(client, storage, target.file);
    if (link.body !== undefined) {
      return {
        body: link.body,
        contentType: link.contentType || "application/vnd.apple.mpegurl",
        headers: link.headers || {},
        media_type: link.media_type || "m3u8",
        status: 200,
      };
    }
    const header = { ...link.headers, ...(options.proxyHeaders || options.headers || {}) };
    return {
      link: {
        url: link.url,
        header,
        content_length: Number(target.file?.size || 0),
      },
      proxy_url: link.url,
      proxy_headers: header,
      proxy_method: "GET",
    };
  },

  async mkdir(storage, relPath) {
    await postForm(client, storage, "/xpan/file", { method: "create" }, {
      path: rootedPath(storage.addition_json, relPath),
      size: "0",
      isdir: "1",
      rtype: "3",
    });
    invalidateStorageCache(storage);
  },

  async remove(storage, relPath) {
    const target = await resolveFile(client, storage, relPath);
    await manage(client, storage, "delete", [target.file.path]);
    invalidateStorageCache(storage);
  },

  async rename(storage, relPath, newName) {
    const target = await resolveFile(client, storage, relPath);
    await manage(client, storage, "rename", [{ path: target.file.path, newname: newName }]);
    invalidateStorageCache(storage);
  },

  async put() {
    throw new Error("BaiduNetdisk upload is not implemented in the SiYuan kernel port yet");
  },
});
