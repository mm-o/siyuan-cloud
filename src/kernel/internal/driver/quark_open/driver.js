import { normalizePath } from "../../model/path.js";
import {
  basenameOf,
  boolValue,
  createStorageCache,
  dirnameOf,
  parseTime,
  persistAddition,
} from "../common.js";
import { sha256Hex } from "../aws4.js";
import {
  forwardProxy,
  remoteJson,
} from "../http.js";

const API = "https://open-api-drive.quark.cn";
const UA = "go-resty/3.0.0-beta.1 (https://resty.dev)";
const DEFAULT_APP_ID = "93b14d40cbef4e5d91945ec93d26fe8f";
const DEFAULT_SIGN_KEY = "6d27122d2d7b41598a1dbb9b5f605e00";
const cache = createStorageCache();

const randomHex = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");

const reqId = () => `${randomHex()}-${randomHex().slice(0, 4)}-${randomHex().slice(0, 4)}-${randomHex().slice(0, 4)}-${randomHex()}${randomHex().slice(0, 4)}`;

const checkQuarkOpen = (payload) => {
  if (Number(payload?.status || 0) >= 400 || Number(payload?.errno || 0) !== 0) {
    throw new Error(payload?.error_info || payload?.message || "quark open request failed");
  }
  return payload;
};

const generateReqSign = (method, pathname, signKey) => {
  const timestamp = String(Date.now());
  return {
    req_id: reqId(),
    tm: timestamp,
    token: sha256Hex(`${method.toUpperCase()}&${pathname}&${timestamp}&${signKey || ""}`),
  };
};

const refreshTokenOnline = async (client, storage) => {
  const addition = storage.addition_json;
  if (!boolValue(addition.use_online_api, true)) {
    throw new Error("local refresh token logic is not implemented yet, please use online API or contact the developer");
  }
  const target = new URL(addition.api_url_address || "https://api.oplist.org/quarkyun/renewapi");
  target.searchParams.set("refresh_ui", addition.refresh_token || "");
  target.searchParams.set("server_use", "true");
  target.searchParams.set("driver_txt", "quarkyun_oa");
  const resp = await remoteJson(client, target.toString(), { method: "GET" });
  if (!resp?.refresh_token || !resp?.access_token) {
    throw new Error(resp?.text || "empty token returned from official API, a wrong refresh token may have been used");
  }
  addition.refresh_token = resp.refresh_token;
  addition.access_token = resp.access_token;
  if (resp.app_id) addition.app_id = resp.app_id;
  if (resp.sign_key) addition.sign_key = resp.sign_key;
  await persistAddition(storage);
};

const ensureAccessToken = async (client, storage) => {
  if (!storage.addition_json.access_token) await refreshTokenOnline(client, storage);
};

const ensurePublicParams = (storage) => {
  if (!(storage.addition_json.app_id || DEFAULT_APP_ID) || !(storage.addition_json.sign_key || DEFAULT_SIGN_KEY)) {
    throw new Error("QuarkOpen public parameters are missing: app_id and sign_key are required unless the online API returns them");
  }
};

const requestQuarkOpen = async (client, storage, pathname, {
  body,
  manualSign,
  method = "GET",
  retry = true,
} = {}) => {
  const addition = storage.addition_json;
  if (!addition.access_token && retry) await ensureAccessToken(client, storage);
  ensurePublicParams(storage);
  const appId = addition.app_id || DEFAULT_APP_ID;
  const signKey = addition.sign_key || DEFAULT_SIGN_KEY;
  const sign = manualSign || generateReqSign(method, pathname, signKey);
  const target = new URL(`${API}${pathname}`);
  target.searchParams.set("req_id", sign.req_id);
  target.searchParams.set("access_token", addition.access_token || "");
  const resp = await remoteJson(client, target.toString(), {
    allowErrorStatus: true,
    body,
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": UA,
      "x-pan-client-id": appId,
      "x-pan-tm": sign.tm,
      "x-pan-token": sign.token,
    },
    method,
  });
  const tokenExpired = Number(resp?.status || 0) === -1
    && (Number(resp?.errno || 0) === 11001 || (Number(resp?.errno || 0) === 14001 && String(resp?.error_info || "").includes("access_token")));
  if (tokenExpired && retry) {
    await refreshTokenOnline(client, storage);
    return requestQuarkOpen(client, storage, pathname, { body, method, retry: false });
  }
  return checkQuarkOpen(resp);
};

const rememberUserId = async (storage, user = {}) => {
  const userId = user.user_id || user.userId || user.UserID || user.userid || "";
  if (userId && storage.addition_json.user_id !== userId) {
    storage.addition_json.user_id = userId;
    await persistAddition(storage);
  }
  return storage.addition_json.user_id || userId;
};

const ensureUserId = async (client, storage) => {
  if (storage.addition_json.user_id) return storage.addition_json.user_id;
  const resp = await requestQuarkOpen(client, storage, "/open/v1/user/info", { method: "GET" });
  const userId = await rememberUserId(storage, resp?.data || {});
  if (!userId) throw new Error("failed to get user ID");
  return userId;
};

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
      if (i < 20) { f = (b & c) | ((~b) & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
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

const proofCode = (seed, bytes) => {
  if (!bytes.length) return "";
  const start = Number(BigInt(`0x${md5Hex(seed).slice(0, 16)}`) % BigInt(bytes.length));
  return bytesToBase64(bytes.slice(start, Math.min(start + 8, bytes.length)));
};

const partInfoList = (size, partSize) => {
  const parts = [];
  for (let left = size, part = 1; left > 0; part += 1) {
    const current = Math.min(partSize, left);
    parts.push({ part_number: part, part_size: current });
    left -= current;
  }
  return parts;
};

const timeFromMs = (value) => parseTime(Number(value || 0));

const fileNameOf = (file) => file.filename || file.file_name || file.name || "";

const isDir = (file) => String(file.file_type) === "0";

const fileToObj = (file, relPath) => {
  const dir = isDir(file);
  return {
    name: fileNameOf(file) || basenameOf(relPath),
    is_dir: dir,
    size: Number(file.size || 0),
    modified: timeFromMs(file.updated_at),
    created: timeFromMs(file.created_at),
    sign: "",
    thumb: file.thumbnail_url || "",
    type: dir ? 1 : 0,
    hashinfo: file.content_hash || "",
    hash_info: file.content_hash ? { sha1: file.content_hash } : {},
    id: file.fid || "",
    file,
  };
};

const listByParent = async (client, storage, parentId) => {
  const cacheKey = parentId || storage.addition_json.root_folder_id || "0";
  return cache.list(storage, cacheKey, async () => {
  const addition = storage.addition_json;
  const result = [];
  let queryCursor = null;
  for (;;) {
    const reqBody = {
      parent_fid: parentId || addition.root_folder_id || "0",
      size: 100,
      sort: "file_name:asc",
    };
    if ((addition.order_by || "none") !== "none") {
      reqBody.sort = `${addition.order_by}:${addition.order_direction || "asc"}`;
    }
    if (queryCursor?.token) reqBody.query_cursor = queryCursor;
    const resp = await requestQuarkOpen(client, storage, "/open/v1/file/list", {
      body: reqBody,
      method: "POST",
    });
    const data = resp?.data || {};
    result.push(...(data.file_list || []));
    if (data.last_page) break;
    queryCursor = data.next_query_cursor || null;
    if (!queryCursor?.token) break;
  }
  return result;
  });
};

const resolveFile = async (client, storage, relPath) => {
  const clean = normalizePath(relPath || "/");
  return cache.file(storage, clean, async () => {
  const rootId = storage.addition_json.root_folder_id || storage.addition_json.RootFolderID || "0";
  if (clean === "/") {
    return {
      fid: rootId,
      filename: "root",
      file_type: "0",
      path: "/",
    };
  }
  let parentId = rootId;
  let current = null;
  for (const part of clean.split("/").filter(Boolean)) {
    const files = await listByParent(client, storage, parentId);
    current = files.find((item) => fileNameOf(item) === part);
    if (!current) throw new Error(`object not found: ${clean}`);
    parentId = current.fid;
  }
  return current;
  });
};

const downloadLink = async (client, storage, file) => {
  return cache.link(storage, file.fid || "", async () => {
  const resp = await requestQuarkOpen(client, storage, "/open/v1/file/get_download_url", {
    body: { fid: file.fid },
    method: "POST",
  });
  const url = resp?.data?.download_url || "";
  if (!url) throw new Error("get download url failed");
  return {
    header: {
      Cookie: `x_pan_client_id=${storage.addition_json.app_id || DEFAULT_APP_ID}; x_pan_access_token=${storage.addition_json.access_token || ""}`,
    },
    url,
    content_length: Number(file.size || 0),
  };
  });
};

const manageFile = async (client, storage, pathname, body) => {
  await requestQuarkOpen(client, storage, pathname, { body, method: "POST" });
  cache.clear(storage);
};

export const createQuarkOpenDriver = ({ client }) => ({
  async test(storage) {
    const resp = await requestQuarkOpen(client, storage, "/open/v1/user/info", { method: "GET" });
    const userId = await rememberUserId(storage, resp?.data || {});
    if (!userId) throw new Error("failed to get user ID");
    return { user: resp?.data || {}, addition: storage.addition_json };
  },

  async list(storage, relPath) {
    const parent = await resolveFile(client, storage, relPath);
    const content = (await listByParent(client, storage, parent.fid))
      .map((file) => fileToObj(file, normalizePath(relPath + "/" + fileNameOf(file))));
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider: storage.driver || "QuarkOpen",
      direct_upload_tools: [],
    };
  },

  async get(storage, relPath, options = {}) {
    const file = await resolveFile(client, storage, relPath);
    const obj = fileToObj(file, relPath);
    if (!obj.is_dir && !options.skipLink) {
      const link = await downloadLink(client, storage, file);
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
    const file = await resolveFile(client, storage, relPath);
    if (isDir(file)) throw new Error("not file");
    const link = await downloadLink(client, storage, file);
    return {
      link: {
        url: link.url,
        header: { ...link.header, ...(options.proxyHeaders || options.headers || {}) },
        content_length: link.content_length,
        concurrency: 3,
        part_size: 10 * 1024 * 1024,
      },
    };
  },

  async mkdir(storage, relPath) {
    const parent = await resolveFile(client, storage, dirnameOf(relPath));
    await manageFile(client, storage, "/open/v1/dir", {
      dir_path: basenameOf(relPath),
      pdir_fid: parent.fid,
    });
  },

  async move(storage, relPath, dstRelPath) {
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await manageFile(client, storage, "/open/v1/file/move", {
      action_type: 1,
      fid_list: [file.fid],
      to_pdir_fid: dst.fid,
    });
  },

  async remove(storage, relPath) {
    const file = await resolveFile(client, storage, relPath);
    await manageFile(client, storage, "/open/v1/file/delete", {
      action_type: 1,
      fid_list: [file.fid],
    });
  },

  async rename(storage, relPath, newName) {
    const file = await resolveFile(client, storage, relPath);
    await manageFile(client, storage, "/open/v1/file/rename", {
      conflict_mode: "REUSE",
      fid: file.fid,
      file_name: newName,
    });
  },

  async copy() {
    throw new Error("QuarkOpen copy is not supported by the OpenList driver");
  },

  async put(storage, relPath, content, mime, options = {}) {
    const parent = await resolveFile(client, storage, dirnameOf(relPath));
    const bytes = uploadBytes(content, options);
    const prePath = "/open/v1/file/upload_pre";
    const preSign = generateReqSign("POST", prePath, storage.addition_json.sign_key || DEFAULT_SIGN_KEY);
    const proofSeed1 = md5Hex(`${await ensureUserId(client, storage)}${preSign.token}`);
    const proofSeed2 = md5Hex(String(bytes.length));
    const pre = await requestQuarkOpen(client, storage, prePath, {
      body: {
        file_name: basenameOf(relPath),
        size: bytes.length,
        format_type: mime || "application/octet-stream",
        md5: md5Hex(bytes),
        sha1: sha1Hex(bytes),
        l_created_at: Date.now(),
        l_updated_at: Date.now(),
        pdir_fid: parent.fid,
        same_path_reuse: true,
        proof_version: "v1",
        proof_seed1: proofSeed1,
        proof_seed2: proofSeed2,
        proof_code1: proofCode(proofSeed1, bytes),
        proof_code2: proofCode(proofSeed2, bytes),
      },
      manualSign: preSign,
      method: "POST",
    });
    const preData = pre?.data || {};
    if (preData.finish) {
      cache.clear(storage);
      return;
    }
    const partSize = Number(preData.part_size || bytes.length || 1);
    const parts = partInfoList(bytes.length, partSize);
    const uploadInfo = await requestQuarkOpen(client, storage, "/open/v1/file/get_upload_urls", {
      body: {
        task_id: preData.task_id,
        part_info_list: parts,
      },
      method: "POST",
    });
    const uploadData = uploadInfo?.data || {};
    const etags = [];
    for (let index = 0; index < (uploadData.upload_urls || []).length; index += 1) {
      const part = parts[index];
      const start = (part.part_number - 1) * partSize;
      const chunk = bytes.slice(start, Math.min(start + part.part_size, bytes.length));
      const uploadUrl = uploadData.upload_urls[index];
      const resp = await forwardProxy(client, uploadUrl.upload_url, {
        allowErrorStatus: true,
        body: bytesToBase64(chunk),
        contentType: "application/octet-stream",
        headers: {
          Authorization: uploadUrl.signature_info?.signature || "",
          "X-Oss-Date": uploadData.common_headers?.["X-Oss-Date"] || "",
          "X-Oss-Content-Sha256": uploadData.common_headers?.["X-Oss-Content-Sha256"] || "",
          "Accept-Encoding": "gzip",
          "User-Agent": "Go-http-client/1.1",
        },
        method: "PUT",
        payloadEncoding: "base64",
        responseEncoding: "text",
        timeout: 120000,
      });
      if (Number(resp.status || 0) !== 200) throw new Error(`up status: ${resp.status}`);
      etags.push(resp.headers?.Etag || resp.headers?.ETag || resp.headers?.etag || "");
    }
    const finishParts = parts.map((part, index) => ({
      part_number: part.part_number,
      part_size: part.part_size,
      etag: etags[index],
    }));
    const finish = await requestQuarkOpen(client, storage, "/open/v1/file/upload_finish", {
      body: {
        task_id: preData.task_id,
        part_info_list: finishParts,
      },
      method: "POST",
    });
    if (finish?.data?.finish !== true) throw new Error(`upload finish failed, task_id: ${preData.task_id}`);
    cache.clear(storage);
  },
});
