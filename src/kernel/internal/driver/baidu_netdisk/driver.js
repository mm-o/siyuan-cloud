import { basename, dirname, normalizePath } from "../../model/path.js";
import {
  forwardProxy,
  remoteJson,
} from "../http.js";

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

const DEFAULT_UPLOAD_API = "https://d.pcs.baidu.com";
const DEFAULT_SLICE_SIZE = 4 * 1024 * 1024;
const VIP_SLICE_SIZE = 16 * 1024 * 1024;
const SVIP_SLICE_SIZE = 32 * 1024 * 1024;
const MAX_SLICE_NUM = 2048;
const SLICE_STEP = 1024 * 1024;
const SLICE_MD5_SIZE = 256 * 1024;

const base64ToBytes = (value) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(value || "").replace(/[\r\n\s]/g, "");
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = clean[i + 2] === "=" ? -1 : chars.indexOf(clean[i + 2]);
    const d = clean[i + 3] === "=" ? -1 : chars.indexOf(clean[i + 3]);
    if (a < 0 || b < 0) continue;
    out.push((a << 2) | (b >> 4));
    if (c >= 0) out.push(((b & 15) << 4) | (c >> 2));
    if (d >= 0) out.push(((c & 3) << 6) | d);
  }
  return Uint8Array.from(out);
};

const bytesToBase64 = (bytes) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += chars[a >> 2];
    out += chars[((a & 3) << 4) | ((b || 0) >> 4)];
    out += i + 1 < bytes.length ? chars[((b & 15) << 2) | ((c || 0) >> 6)] : "=";
    out += i + 2 < bytes.length ? chars[c & 63] : "=";
  }
  return out;
};

const utf8Bytes = (value) => {
  const text = unescape(encodeURIComponent(String(value || "")));
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i);
  return out;
};

const uploadBytes = (content, options = {}) => options.bodyEncoding === "base64"
  ? base64ToBytes(content || "")
  : utf8Bytes(content || "");

const leftRotate = (value, amount) => (value << amount) | (value >>> (32 - amount));
const md5Hex = (input) => {
  const source = input instanceof Uint8Array ? input : utf8Bytes(input);
  const bitLen = source.length * 8;
  const paddedLen = (((source.length + 9 + 63) >> 6) << 6);
  const bytes = new Uint8Array(paddedLen);
  bytes.set(source);
  bytes[source.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const k = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    let a = a0; let b = b0; let c = c0; let d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f; let g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const tmp = d;
      d = c;
      c = b;
      b = (b + leftRotate((a + f + k[i] + view.getUint32(offset + g * 4, true)) >>> 0, s[i])) >>> 0;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0]
    .map((value) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]
      .map((byte) => byte.toString(16).padStart(2, "0")).join(""))
    .join("");
};

const joinTime = (form, ctime, mtime) => {
  if (!mtime || !ctime) return;
  form.local_mtime = String(mtime);
  form.local_ctime = String(ctime);
};

const getSliceSize = (storage, filesize) => {
  const addition = storage.addition_json || {};
  const vipType = Number(addition.vip_type || addition.VipType || 0);
  const custom = Number(addition.custom_upload_part_size || addition.CustomUploadPartSize || 0);
  if (vipType === 0) return DEFAULT_SLICE_SIZE;
  if (custom) {
    if (custom < DEFAULT_SLICE_SIZE) return DEFAULT_SLICE_SIZE;
    if (vipType === 1 && custom > VIP_SLICE_SIZE) return VIP_SLICE_SIZE;
    if (vipType === 2 && custom > SVIP_SLICE_SIZE) return SVIP_SLICE_SIZE;
    return custom;
  }
  const maxSliceSize = vipType === 1 ? VIP_SLICE_SIZE : SVIP_SLICE_SIZE;
  if (boolValue(addition.low_bandwith_upload_mode ?? addition.LowBandwithUploadMode, false)) {
    for (let size = DEFAULT_SLICE_SIZE; size <= maxSliceSize; size += SLICE_STEP) {
      if (filesize <= MAX_SLICE_NUM * size) return size;
    }
  }
  return maxSliceSize;
};

const createFile = async (client, storage, path, size, isdir, uploadid, blockList, mtime, ctime) => {
  const form = {
    path,
    size: String(size),
    isdir: String(isdir),
    rtype: "3",
  };
  joinTime(form, ctime, mtime);
  if (uploadid) form.uploadid = uploadid;
  if (blockList) form.block_list = blockList;
  return postForm(client, storage, "/xpan/file", { method: "create" }, form);
};

const precreate = async (client, storage, path, size, blockList, contentMd5, sliceMd5, ctime, mtime) => {
  const form = {
    path,
    size: String(size),
    isdir: "0",
    autoinit: "1",
    rtype: "3",
    block_list: blockList,
  };
  if (contentMd5 && sliceMd5) {
    form["content-md5"] = contentMd5;
    form["slice-md5"] = sliceMd5;
  }
  joinTime(form, ctime, mtime);
  return postForm(client, storage, "/xpan/file", { method: "precreate" }, form);
};

const requestForUploadUrl = async (client, storage, path, uploadid) => {
  const payload = await requestBaidu(client, storage, `${DEFAULT_UPLOAD_API}/rest/2.0/pcs/file`, {
    method: "GET",
    query: {
      method: "locateupload",
      appid: "250528",
      path,
      uploadid,
      upload_version: "2.0",
    },
  });
  const server = payload?.servers?.[0]?.server || payload?.bak_servers?.[0]?.server || "";
  if (!server) throw new Error("upload URL is empty");
  return server;
};

const uploadApiOf = (storage) => {
  const api = storage.addition_json.upload_api || storage.addition_json.UploadAPI || DEFAULT_UPLOAD_API;
  try {
    return new URL(api).toString().replace(/\/+$/, "");
  } catch (_) {
    return DEFAULT_UPLOAD_API;
  }
};

const getUploadUrl = async (client, storage, path, uploadid) => {
  if (!boolValue(storage.addition_json.use_dynamic_upload_api ?? storage.addition_json.UseDynamicUploadAPI, true) || !uploadid) {
    return uploadApiOf(storage);
  }
  try {
    return await requestForUploadUrl(client, storage, path, uploadid);
  } catch (_) {
    return uploadApiOf(storage);
  }
};

const multipartBody = (fieldName, fileName, bytes, boundary) => {
  const head = utf8Bytes(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const tail = utf8Bytes(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return body;
};

const uploadSlice = async (client, storage, uploadUrl, params, fileName, bytes) => {
  const target = new URL(`${uploadUrl.replace(/\/+$/, "")}/rest/2.0/pcs/superfile2`);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
  const boundary = `----siyuan-baidu-${Date.now().toString(16)}`;
  const body = multipartBody("file", fileName, bytes, boundary);
  const resp = await forwardProxy(client, target.toString(), {
    allowErrorStatus: true,
    body: bytesToBase64(body),
    contentType: `multipart/form-data; boundary=${boundary}`,
    method: "POST",
    payloadEncoding: "base64",
    responseEncoding: "text",
    timeout: Number(storage.addition_json.upload_timeout || storage.addition_json.UploadSliceTimeout || 60) * 1000,
  });
  let payload = {};
  try {
    payload = JSON.parse(resp.body || "{}");
  } catch (_) {
    payload = {};
  }
  const lower = String(resp.body || "").toLowerCase();
  if (lower.includes("uploadid") && (lower.includes("invalid") || lower.includes("expired") || lower.includes("not found"))) {
    throw new Error("uploadid expired");
  }
  const errno = Number(payload?.errno || payload?.error_code || 0);
  if (errno) throw new Error(`error uploading to baidu, response=${resp.body || ""}`);
};

const putRapid = async (client, storage, path, bytes, mtime, ctime) => {
  const contentMd5 = md5Hex(bytes);
  const blockList = JSON.stringify([contentMd5]);
  return createFile(client, storage, path, bytes.length, 0, "", blockList, mtime, ctime);
};

const fileNameOf = (file) => file?.server_filename || file?.name || basename(file?.path || "");
const isDir = (file) => Number(file?.isdir || 0) === 1;
const VIDEO_EXTS = new Set(["mp4", "mkv", "avi", "mov", "rmvb", "webm", "flv", "m3u8", "m4v"]);
const AUDIO_EXTS = new Set(["mp3", "flac", "ogg", "m4a", "wav", "opus", "wma"]);
const fileExtOf = (file) => fileNameOf(file).split(".").pop()?.toLowerCase() || "";
const isStreamMediaFile = (file) => [1, 2].includes(Number(file?.category || 0))
  || VIDEO_EXTS.has(fileExtOf(file))
  || AUDIO_EXTS.has(fileExtOf(file));
const effectiveDownloadApi = (storage, file) => {
  const api = storage.addition_json.download_api || "official";
  return api === "crack_video" && !isStreamMediaFile(file) ? "official" : api;
};

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
      redirect: false,
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
  const api = effectiveDownloadApi(storage, file);
  const key = cacheKey(storage, "link", [
    api,
    file.fs_id || file.id || "",
    file.size || "",
    file.server_mtime || file.mtime || "",
  ].join(":"));
  const cached = getCache(key);
  if (cached) return cached;
  let link;
  switch (api) {
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

  async put(storage, relPath, content, mime, options = {}) {
    const bytes = uploadBytes(content, options);
    if (bytes.length < 1) throw new Error("empty files are not allowed by baidu netdisk");
    const path = rootedPath(storage.addition_json, relPath);
    const now = Math.floor(Date.now() / 1000);
    const mtime = Number(options.mtime || options.modified || now);
    const ctime = Number(options.ctime || options.created || now);
    try {
      await putRapid(client, storage, path, bytes, mtime, ctime);
      invalidateStorageCache(storage);
      return;
    } catch (_) {
      // OpenList falls back to precreate when rapid upload is unavailable.
    }

    const sliceSize = getSliceSize(storage, bytes.length);
    const blockList = [];
    for (let offset = 0; offset < bytes.length; offset += sliceSize) {
      blockList.push(md5Hex(bytes.slice(offset, Math.min(offset + sliceSize, bytes.length))));
    }
    const blockListStr = JSON.stringify(blockList);
    const contentMd5 = md5Hex(bytes);
    const sliceMd5 = md5Hex(bytes.slice(0, Math.min(SLICE_MD5_SIZE, bytes.length)));
    const pre = await precreate(client, storage, path, bytes.length, blockListStr, contentMd5, sliceMd5, ctime, mtime);
    if (Number(pre?.return_type || 0) === 2) {
      invalidateStorageCache(storage);
      return;
    }
    const uploadid = pre?.uploadid || "";
    if (!uploadid) throw new Error("baidu precreate missing uploadid");
    const partseqs = Array.isArray(pre?.block_list) && pre.block_list.length
      ? pre.block_list.map((part) => Number(part))
      : blockList.map((_, index) => index);
    const uploadUrl = await getUploadUrl(client, storage, path, uploadid);
    const fileName = basename(path);
    for (const partseq of partseqs) {
      if (partseq < 0) continue;
      const offset = partseq * sliceSize;
      const chunk = bytes.slice(offset, Math.min(offset + sliceSize, bytes.length));
      await uploadSlice(client, storage, uploadUrl, {
        method: "upload",
        access_token: storage.addition_json.access_token || storage.addition_json.AccessToken || "",
        type: "tmpfile",
        path,
        uploadid,
        partseq,
      }, fileName, chunk);
    }
    await createFile(client, storage, path, bytes.length, 0, uploadid, blockListStr, mtime, ctime);
    invalidateStorageCache(storage);
  },
});
