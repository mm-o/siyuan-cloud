import { normalizePath } from "../../model/path.js";
import {
  basenameOf,
  boolValue,
  dirnameOf,
  parseTime,
  persistAddition,
  rawDownloadUrl,
} from "../common.js";
import {
  forwardProxy,
  remoteJson,
} from "../http.js";

const API_URL = "https://openapi.alipan.com";
const DEFAULT_RENEW_API = "https://api.oplist.org/alicloud/renewapi";
const CACHE_TTL = 55 * 1000;
const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;
const TB = 1024 * GB;
const DEFAULT_UPLOAD_PART_SIZE = 20 * MB;
const listCache = new Map();
const fileCache = new Map();
const linkCache = new Map();

const storageKey = (storage) => String(storage.id || storage.mount_path || JSON.stringify(storage.addition_json || {}));
const cached = async (map, key, producer, ttl = CACHE_TTL) => {
  const now = Date.now();
  const hit = map.get(key);
  if (hit && hit.expires > now) return hit.value;
  const value = await producer();
  map.set(key, { value, expires: now + ttl });
  return value;
};
const clearStorageCache = (storage) => {
  const prefix = `${storageKey(storage)}:`;
  for (const map of [listCache, fileCache, linkCache]) {
    for (const key of map.keys()) {
      if (key.startsWith(prefix)) map.delete(key);
    }
  }
};

const checkAli = (payload) => {
  if (payload?.code) throw new Error(`${payload.code}:${payload.message || ""}`.replace(/:$/, ""));
  return payload;
};

const driverTxt = (addition) => addition.alipan_type === "alipanTV" ? "alicloud_tv" : "alicloud_qr";

const refreshToken = async (client, storage) => {
  const addition = storage.addition_json || storage;
  const refreshTokenValue = addition.refresh_token || addition.RefreshToken || "";
  if (!refreshTokenValue) throw new Error("empty refresh_token");
  if (boolValue(addition.use_online_api ?? addition.UseOnlineAPI, true) && (addition.api_url_address || DEFAULT_RENEW_API)) {
    const url = new URL(addition.api_url_address || DEFAULT_RENEW_API);
    url.searchParams.set("refresh_ui", refreshTokenValue);
    url.searchParams.set("server_use", "true");
    url.searchParams.set("driver_txt", driverTxt(addition));
    const resp = await remoteJson(client, url.toString(), { method: "GET" });
    if (!resp.refresh_token || !resp.access_token) {
      throw new Error(resp.text || "empty token returned from official API, a wrong refresh token may have been used");
    }
    addition.refresh_token = resp.refresh_token;
    addition.access_token = resp.access_token;
    await persistAddition(storage);
    return addition.access_token;
  }

  const clientId = addition.client_id || addition.ClientID || "";
  const clientSecret = addition.client_secret || addition.ClientSecret || "";
  if (!clientId || !clientSecret) throw new Error("empty ClientID or ClientSecret");
  const resp = checkAli(await remoteJson(client, `${API_URL}/oauth/access_token`, {
    body: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshTokenValue,
    },
    method: "POST",
  }));
  if (!resp.refresh_token || !resp.access_token) throw new Error("empty token returned from alipan");
  addition.refresh_token = resp.refresh_token;
  addition.access_token = resp.access_token;
  await persistAddition(storage);
  return addition.access_token;
};

const ensureToken = async (client, storage) => {
  const addition = storage.addition_json || storage;
  if (addition.access_token || addition.AccessToken) return addition.access_token || addition.AccessToken;
  return refreshToken(client, storage);
};

const requestAli = async (client, storage, uri, {
  allowAliError = false,
  body,
  method = "POST",
  retry = true,
} = {}) => {
  const addition = storage.addition_json;
  await ensureToken(client, storage);
  const resp = await remoteJson(client, `${API_URL}${uri}`, {
    allowErrorStatus: true,
    body: body || {},
    headers: {
      Authorization: `Bearer ${addition.access_token || addition.AccessToken || ""}`,
    },
    method,
  });
  if (resp?.code && retry && ["AccessTokenInvalid", "AccessTokenExpired", "I400JD"].includes(resp.code)) {
    await refreshToken(client, storage);
    return requestAli(client, storage, uri, { allowAliError, body, method, retry: false });
  }
  if (allowAliError) return resp;
  return checkAli(resp);
};

const initDrive = async (client, storage) => {
  const addition = storage.addition_json;
  if (addition.drive_id) return addition.drive_id;
  const resp = await requestAli(client, storage, "/adrive/v1.0/user/getDriveInfo");
  const driveType = addition.drive_type || addition.DriveType || "resource";
  const driveId = resp[`${driveType}_drive_id`] || resp.default_drive_id || resp.resource_drive_id || resp.backup_drive_id;
  if (!driveId) throw new Error("get aliyundrive drive_id failed");
  addition.drive_id = driveId;
  await persistAddition(storage);
  return driveId;
};

const rootFolderId = (addition) => addition.root_folder_id || addition.RootFolderID || "root";

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

const hex = (input) => Array.from(input, (b) => b.toString(16).padStart(2, "0")).join("");
const rol = (value, bits) => (value << bits) | (value >>> (32 - bits));

const sha1Bytes = (message) => {
  const msg = message instanceof Uint8Array ? message : utf8Bytes(message);
  const bitLen = msg.length * 8;
  const paddedLen = (((msg.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLen);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLen >>> 0);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000));
  let h0 = 0x67452301; let h1 = 0xefcdab89; let h2 = 0x98badcfe; let h3 = 0x10325476; let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i += 1) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1) >>> 0;
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4;
    for (let i = 0; i < 80; i += 1) {
      let f; let k;
      if (i < 20) {
        f = (b & c) | ((~b) & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rol(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rol(b, 30) >>> 0; b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((value, index) => outView.setUint32(index * 4, value));
  return out;
};

const sha1Hex = (message) => hex(sha1Bytes(message));

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
  let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476;
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
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0]
    .map((value) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]
      .map((byte) => byte.toString(16).padStart(2, "0")).join(""))
    .join("");
};

const proofCode = (accessToken, bytes) => {
  if (!bytes.length) return "";
  const start = Number(BigInt(`0x${md5Hex(accessToken).slice(0, 16)}`) % BigInt(bytes.length));
  return bytesToBase64(bytes.slice(start, Math.min(start + 8, bytes.length)));
};

const makePartInfos = (count) => Array.from({ length: count }, (_, index) => ({ part_number: index + 1 }));
const uploadPartSize = (fileSize) => {
  if (fileSize <= DEFAULT_UPLOAD_PART_SIZE) return DEFAULT_UPLOAD_PART_SIZE;
  if (fileSize > TB) return 5 * GB;
  if (fileSize > 768 * GB) return 109951163;
  if (fileSize > 512 * GB) return 82463373;
  if (fileSize > 384 * GB) return 54975582;
  if (fileSize > 256 * GB) return 41231687;
  if (fileSize > 128 * GB) return 27487791;
  return DEFAULT_UPLOAD_PART_SIZE;
};
const uploadTime = () => new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");

const uploadUrlOf = (storage, url) => boolValue(storage.addition_json.internal_upload ?? storage.addition_json.InternalUpload, false)
  ? String(url || "").replace("https://cn-beijing-data.aliyundrive.net/", "http://ccp-bj29-bj-1592982087.oss-cn-beijing-internal.aliyuncs.com/")
  : url;

const fileToObj = (file, relPath, storage) => {
  const isDir = file.type === "folder";
  return {
    name: file.name || file.file_name || basenameOf(relPath),
    path: normalizePath(relPath),
    is_dir: isDir,
    size: Number(file.size || 0),
    modified: parseTime(file.updated_at),
    created: parseTime(file.created_at),
    sign: "",
    thumb: file.thumbnail || "",
    type: isDir ? 1 : 0,
    hashinfo: file.content_hash || "",
    hash_info: file.content_hash ? { sha1: file.content_hash } : {},
    id: file.file_id || "",
    raw_url: isDir ? "" : rawDownloadUrl(storage, relPath),
    provider: "AliyundriveOpen",
    file,
  };
};

const listByParent = async (client, storage, parentId) => {
  const cacheKey = `${storageKey(storage)}:list:${parentId}`;
  return cached(listCache, cacheKey, async () => {
  const addition = storage.addition_json;
  const driveId = await initDrive(client, storage);
  const result = [];
  let marker = "";
  do {
    const resp = await requestAli(client, storage, "/adrive/v1.0/openFile/list", {
      body: {
        drive_id: driveId,
        limit: 200,
        marker,
        order_by: addition.order_by || addition.OrderBy || "",
        order_direction: addition.order_direction || addition.OrderDirection || "",
        parent_file_id: parentId,
      },
    });
    result.push(...(resp.items || []));
    marker = resp.next_marker || "";
  } while (marker);
  return result;
  });
};

const resolveFile = async (client, storage, relPath) => {
  const clean = normalizePath(relPath || "/");
  const cacheKey = `${storageKey(storage)}:file:${clean}`;
  return cached(fileCache, cacheKey, async () => {
  if (clean === "/") {
    return {
      file_id: rootFolderId(storage.addition_json),
      name: "root",
      type: "folder",
      path: "/",
    };
  }
  let parentId = rootFolderId(storage.addition_json);
  let current = null;
  const parts = clean.split("/").filter(Boolean);
  for (const part of parts) {
    const files = await listByParent(client, storage, parentId);
    current = files.find((item) => (item.name || item.file_name) === part);
    if (!current) throw new Error(`object not found: ${clean}`);
    parentId = current.file_id;
  }
  return current;
  });
};

const linkFor = async (client, storage, file) => {
  const cacheKey = `${storageKey(storage)}:link:${file.file_id || ""}`;
  return cached(linkCache, cacheKey, async () => {
  const driveId = await initDrive(client, storage);
  const resp = await requestAli(client, storage, "/adrive/v1.0/openFile/getDownloadUrl", {
    body: {
      drive_id: driveId,
      file_id: file.file_id,
      expire_sec: 14400,
    },
  });
  const url = resp.url || resp.streamsUrl?.[storage.addition_json.livp_download_format || "jpeg"] || "";
  if (!url) throw new Error("get download url failed");
  return url;
  });
};

export const createAliyundriveOpenDriver = ({ client }) => ({
  async test(storage) {
    await initDrive(client, storage);
    return { addition: storage.addition_json };
  },

  async list(storage, relPath) {
    const parent = await resolveFile(client, storage, relPath);
    const content = (await listByParent(client, storage, parent.file_id))
      .map((file) => fileToObj(file, normalizePath(relPath + "/" + (file.name || file.file_name)), storage));
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider: "AliyundriveOpen",
      direct_upload_tools: [],
    };
  },

  async get(storage, relPath, options = {}) {
    const file = await resolveFile(client, storage, relPath);
    const obj = fileToObj(file, relPath, storage);
    if (!obj.is_dir && !options.skipLink) {
      const url = await linkFor(client, storage, file);
      obj.raw_url = url;
      obj.url = url;
    }
    return {
      ...obj,
      readme: "",
      header: "",
      related: [],
    };
  },

  async read(storage, relPath, options = {}) {
    const file = await resolveFile(client, storage, relPath);
    if (file.type === "folder") throw new Error("not file");
    const url = await linkFor(client, storage, file);
    return {
      link: {
        url,
        header: options.proxyHeaders || options.headers || {},
        content_length: Number(file.size || 0),
      },
    };
  },

  async mkdir(storage, relPath) {
    const driveId = await initDrive(client, storage);
    const parent = await resolveFile(client, storage, dirnameOf(relPath));
    await requestAli(client, storage, "/adrive/v1.0/openFile/create", {
      body: {
        drive_id: driveId,
        parent_file_id: parent.file_id,
        name: basenameOf(relPath),
        type: "folder",
        check_name_mode: "refuse",
      },
    });
    clearStorageCache(storage);
  },

  async move(storage, relPath, dstRelPath) {
    const driveId = await initDrive(client, storage);
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await requestAli(client, storage, "/adrive/v1.0/openFile/move", {
      body: {
        drive_id: driveId,
        file_id: file.file_id,
        to_parent_file_id: dst.file_id,
        check_name_mode: "ignore",
      },
    });
    clearStorageCache(storage);
  },

  async copy(storage, relPath, dstRelPath) {
    const driveId = await initDrive(client, storage);
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await requestAli(client, storage, "/adrive/v1.0/openFile/copy", {
      body: {
        drive_id: driveId,
        file_id: file.file_id,
        to_parent_file_id: dst.file_id,
        auto_rename: false,
      },
    });
    clearStorageCache(storage);
  },

  async remove(storage, relPath) {
    const driveId = await initDrive(client, storage);
    const file = await resolveFile(client, storage, relPath);
    const uri = storage.addition_json.remove_way === "delete"
      ? "/adrive/v1.0/openFile/delete"
      : "/adrive/v1.0/openFile/recyclebin/trash";
    await requestAli(client, storage, uri, {
      body: {
        drive_id: driveId,
        file_id: file.file_id,
      },
    });
    clearStorageCache(storage);
  },

  async rename(storage, relPath, newName) {
    const driveId = await initDrive(client, storage);
    const file = await resolveFile(client, storage, relPath);
    await requestAli(client, storage, "/adrive/v1.0/openFile/update", {
      body: {
        drive_id: driveId,
        file_id: file.file_id,
        name: newName,
      },
    });
    clearStorageCache(storage);
  },

  async other(storage, relPath, req = {}) {
    const driveId = await initDrive(client, storage);
    const file = await resolveFile(client, storage, relPath);
    if (req.method !== "video_preview") throw new Error("not support");
    return requestAli(client, storage, "/adrive/v1.0/openFile/getVideoPreviewPlayInfo", {
      body: {
        drive_id: driveId,
        file_id: file.file_id,
        category: "live_transcoding",
        url_expire_sec: 14400,
      },
    });
  },

  async put(storage, relPath, content, mime, options = {}) {
    const driveId = await initDrive(client, storage);
    const parent = await resolveFile(client, storage, dirnameOf(relPath));
    const bytes = uploadBytes(content, options);
    const size = Number(options.size ?? bytes.length);
    const partSize = uploadPartSize(size);
    const count = Math.ceil(size / partSize);
    const createdAt = uploadTime();
    const rapidUpload = !options.forceStreamUpload
      && bytes.length > 100 * 1024
      && boolValue(storage.addition_json.rapid_upload ?? storage.addition_json.RapidUpload, false);
    const createData = {
      drive_id: driveId,
      parent_file_id: parent.file_id,
      name: basenameOf(relPath),
      type: "file",
      check_name_mode: "ignore",
      local_modified_at: createdAt,
      local_created_at: createdAt,
      part_info_list: makePartInfos(count),
    };
    if (rapidUpload) {
      createData.size = bytes.length;
      createData.pre_hash = sha1Hex(bytes.slice(0, 1024));
    }
    let createResp = await requestAli(client, storage, "/adrive/v1.0/openFile/create", {
      allowAliError: rapidUpload,
      body: createData,
    });
    if (createResp?.code) {
      if (createResp.code !== "PreHashMatched" || !rapidUpload) checkAli(createResp);
      delete createData.pre_hash;
      createData.proof_version = "v1";
      createData.content_hash_name = "sha1";
      createData.content_hash = sha1Hex(bytes);
      createData.proof_code = proofCode(storage.addition_json.access_token || storage.addition_json.AccessToken || "", bytes);
      createResp = await requestAli(client, storage, "/adrive/v1.0/openFile/create", {
        body: createData,
      });
    }
    if (!createResp.rapid_upload) {
      for (let index = 0; index < (createResp.part_info_list || []).length; index += 1) {
        const offset = index * partSize;
        const chunk = bytes.slice(offset, Math.min(offset + partSize, bytes.length));
        const resp = await forwardProxy(client, uploadUrlOf(storage, createResp.part_info_list[index]?.upload_url), {
          allowErrorStatus: true,
          body: bytesToBase64(chunk),
          contentType: mime || "application/octet-stream",
          method: "PUT",
          payloadEncoding: "base64",
          responseEncoding: "text",
          timeout: 120000,
        });
        if (![200, 409].includes(Number(resp.status || 0))) throw new Error(`upload status: ${resp.status}`);
      }
    }
    await requestAli(client, storage, "/adrive/v1.0/openFile/complete", {
      body: {
        drive_id: driveId,
        file_id: createResp.file_id,
        upload_id: createResp.upload_id,
      },
    });
    clearStorageCache(storage);
  },

  async details(storage) {
    const resp = await requestAli(client, storage, "/adrive/v1.0/user/getSpaceInfo");
    const total = Number(resp.personal_space_info?.total_size || 0);
    const used = Number(resp.personal_space_info?.used_size || 0);
    return {
      total_space: total,
      used_space: used,
      free_space: Math.max(0, total - used),
    };
  },
});
