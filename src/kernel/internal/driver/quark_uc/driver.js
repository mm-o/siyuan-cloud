import { normalizePath } from "../../model/path.js";
import {
  basenameOf,
  boolValue,
  createStorageCache,
  dirnameOf,
  parseTime,
  persistAddition,
} from "../common.js";
import { forwardProxy, remoteJsonWithMeta } from "../http.js";

const configs = {
  Quark: {
    api: "https://drive.quark.cn/1/clouddrive",
    pr: "ucpro",
    referer: "https://pan.quark.cn",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch",
  },
  UC: {
    api: "https://pc-api.uc.cn/1/clouddrive",
    pr: "UCBrowser",
    referer: "https://drive.uc.cn",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) uc-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch",
  },
};

const checkQuark = (payload) => {
  if (Number(payload?.status || 0) >= 400 || Number(payload?.code || 0) !== 0) {
    throw new Error(payload?.message || "quark request failed");
  }
  return payload;
};

const cookieHeader = (addition) => addition.cookie || addition.Cookie || "";

const headerValues = (headers = {}, name) => {
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === name.toLowerCase()) return Array.isArray(value) ? value : [value];
  }
  return [];
};

const setCookie = (cookie, name, value) => {
  const parts = String(cookie || "").split(";").map((item) => item.trim()).filter(Boolean);
  const prefix = `${name}=`;
  const next = `${name}=${value}`;
  const index = parts.findIndex((item) => item.startsWith(prefix));
  if (index >= 0) parts[index] = next;
  else parts.push(next);
  return parts.join("; ");
};

const rememberQuarkCookies = async (storage, headers) => {
  let cookie = cookieHeader(storage.addition_json);
  const before = cookie;
  for (const item of headerValues(headers, "set-cookie")) {
    const pair = String(item || "").split(";")[0];
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const name = pair.slice(0, index);
    if (name !== "__puus" && !(storage.driver === "Quark" && boolValue(storage.addition_json.use_transcoding_address) && name === "__pus")) continue;
    cookie = setCookie(cookie, name, pair.slice(index + 1));
  }
  if (cookie && cookie !== before) {
    storage.addition_json.cookie = cookie;
    await persistAddition(storage);
  }
};

const confFor = (storage) => configs[storage.driver] || configs.Quark;
const cache = createStorageCache();

const requestQuark = async (client, storage, pathname, {
  body,
  method = "GET",
  query = {},
  userAgent,
} = {}) => {
  const conf = confFor(storage);
  const target = new URL(`${conf.api}${pathname}`);
  target.searchParams.set("pr", conf.pr);
  target.searchParams.set("fr", "pc");
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  }
  const { json, meta } = await remoteJsonWithMeta(client, target.toString(), {
    allowErrorStatus: true,
    body,
    headers: {
      Accept: "application/json, text/plain, */*",
      Cookie: cookieHeader(storage.addition_json),
      Referer: conf.referer,
      "User-Agent": userAgent || conf.ua,
    },
    method,
  });
  await rememberQuarkCookies(storage, meta?.headers);
  return checkQuark(json);
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
const hexToBytes = (value) => {
  const clean = String(value || "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

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

const httpTime = () => new Date().toUTCString();
const OSS_USER_AGENT = "aliyun-sdk-js/6.6.1 Chrome 98.0.4758.80 on Windows 10 64-bit";

const timeFromMs = (value) => parseTime(Number(value || 0));

const fileToObj = (file, relPath) => {
  const isDir = !file.file;
  return {
    name: file.file_name || basenameOf(relPath),
    is_dir: isDir,
    size: Number(file.size || 0),
    modified: timeFromMs(file.updated_at || file.l_updated_at),
    created: timeFromMs(file.created_at || file.l_created_at),
    sign: "",
    thumb: file.thumbnail || "",
    type: isDir ? 1 : 0,
    hashinfo: "",
    hash_info: {},
    id: file.fid || "",
    file,
  };
};

const listByParent = async (client, storage, parentId) => {
  const cacheKey = parentId || storage.addition_json.root_folder_id || "0";
  return cache.list(storage, cacheKey, async () => {
  const addition = storage.addition_json;
  const result = [];
  const size = 100;
  let page = 1;
  for (;;) {
    const query = {
      pdir_fid: parentId || addition.root_folder_id || "0",
      _size: size,
      _fetch_total: "1",
      fetch_all_file: "1",
      fetch_risk_file_name: "1",
      _page: page,
    };
    if ((addition.order_by || "none") !== "none") {
      query._sort = `file_type:asc,${addition.order_by}:${addition.order_direction || "asc"}`;
    }
    const resp = await requestQuark(client, storage, "/file/sort", { method: "GET", query });
    const list = resp?.data?.list || [];
    for (const file of list) {
      if (!boolValue(addition.only_list_video_file) || !file.file || Number(file.category || 0) === 1) {
        result.push({ ...file, file_name: decodeHtml(file.file_name || "") });
      }
    }
    if (page * size >= Number(resp?.metadata?._total || list.length)) break;
    page += 1;
  }
  return result;
  });
};

const decodeHtml = (value) => String(value || "")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"")
  .replace(/&#39;/g, "'");

const resolveFile = async (client, storage, relPath) => {
  const clean = normalizePath(relPath || "/");
  return cache.file(storage, clean, async () => {
  const rootId = storage.addition_json.root_folder_id || storage.addition_json.RootFolderID || "0";
  if (clean === "/") {
    return {
      fid: rootId,
      file_name: "root",
      file: false,
      path: "/",
    };
  }
  let parentId = rootId;
  let current = null;
  for (const part of clean.split("/").filter(Boolean)) {
    const files = await listByParent(client, storage, parentId);
    current = files.find((item) => item.file_name === part);
    if (!current) throw new Error(`object not found: ${clean}`);
    parentId = current.fid;
  }
  return current;
  });
};

const downloadLink = async (client, storage, file) => {
  return cache.link(storage, `${storage.driver || "Quark"}:${file.fid}:${boolValue(storage.addition_json.use_transcoding_address)}`, async () => {
  const conf = confFor(storage);
  if (
    boolValue(storage.addition_json.use_transcoding_address)
    && storage.driver === "Quark"
    && Number(file.category || 0) === 1
    && Number(file.size || 0) > 0
  ) {
    const resp = await requestQuark(client, storage, "/file/v2/play/project", {
      body: {
        fid: file.fid,
        resolutions: "low,normal,high,super,2k,4k",
        supports: "fmp4_av,m3u8,dolby_vision",
      },
      method: "POST",
      userAgent: conf.ua,
    });
    for (const info of resp?.data?.video_list || []) {
      if (info?.video_info?.url) {
        return {
          header: {},
          url: info.video_info.url,
          content_length: Number(info.video_info.size || file.size || 0),
        };
      }
    }
  }

  const resp = await requestQuark(client, storage, "/file/download", {
    body: { fids: [file.fid] },
    method: "POST",
    userAgent: conf.ua,
  });
  const url = resp?.data?.[0]?.download_url || "";
  if (!url) throw new Error("get download url failed");
  return {
    header: {
      Cookie: cookieHeader(storage.addition_json),
      Referer: conf.referer,
      "User-Agent": conf.ua,
    },
    url,
    content_length: Number(file.size || 0),
  };
  });
};

const manageFile = async (client, storage, pathname, body) => {
  await requestQuark(client, storage, pathname, { body, method: "POST" });
  cache.clear(storage);
};

const memberInfo = async (client, storage) => requestQuark(client, storage, "/member", {
  method: "GET",
  query: {
    fetch_subscribe: "false",
    _ch: "home",
    fetch_identity: "false",
  },
});

const uploadHost = (preData) => `https://${preData.bucket}.${String(preData.upload_url || "").slice(7)}/${preData.obj_key}`;

const upPre = async (client, storage, relPath, parentId, bytes, mime) => {
  const now = Date.now();
  return requestQuark(client, storage, "/file/upload/pre", {
    body: {
      ccp_hash_update: true,
      dir_name: "",
      file_name: basenameOf(relPath),
      format_type: mime || "application/octet-stream",
      l_created_at: now,
      l_updated_at: now,
      pdir_fid: parentId,
      size: bytes.length,
    },
    method: "POST",
  });
};

const upHash = async (client, storage, md5, sha1, taskId) => {
  const resp = await requestQuark(client, storage, "/file/update/hash", {
    body: {
      md5,
      sha1,
      task_id: taskId,
    },
    method: "POST",
  });
  return Boolean(resp?.data?.finish);
};

const upPart = async (client, storage, pre, mime, partNumber, bytes) => {
  const data = pre?.data || {};
  const timeStr = httpTime();
  const auth = await requestQuark(client, storage, "/file/upload/auth", {
    body: {
      auth_info: data.auth_info,
      auth_meta: `PUT\n\n${mime}\n${timeStr}\nx-oss-date:${timeStr}\nx-oss-user-agent:${OSS_USER_AGENT}\n/${data.bucket}/${data.obj_key}?partNumber=${partNumber}&uploadId=${data.upload_id}`,
      task_id: data.task_id,
    },
    method: "POST",
  });
  const target = new URL(uploadHost(data));
  target.searchParams.set("partNumber", String(partNumber));
  target.searchParams.set("uploadId", data.upload_id);
  const resp = await forwardProxy(client, target.toString(), {
    allowErrorStatus: true,
    body: bytesToBase64(bytes),
    contentType: mime,
    headers: {
      Authorization: auth?.data?.auth_key || "",
      "Content-Type": mime,
      Referer: "https://pan.quark.cn/",
      "x-oss-date": timeStr,
      "x-oss-user-agent": OSS_USER_AGENT,
    },
    method: "PUT",
    payloadEncoding: "base64",
    responseEncoding: "text",
    timeout: 120000,
  });
  if (Number(resp.status || 0) !== 200) throw new Error(`up status: ${resp.status}, error: ${resp.body || ""}`);
  return resp.headers?.Etag || resp.headers?.ETag || resp.headers?.etag || "";
};

const upCommit = async (client, storage, pre, etags) => {
  const data = pre?.data || {};
  const timeStr = httpTime();
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<CompleteMultipartUpload>\n${etags.map((etag, index) => `<Part>\n<PartNumber>${index + 1}</PartNumber>\n<ETag>${etag}</ETag>\n</Part>\n`).join("")}</CompleteMultipartUpload>`;
  const contentMd5 = bytesToBase64(hexToBytes(md5Hex(body)));
  const callbackBase64 = bytesToBase64(utf8Bytes(JSON.stringify(data.callback || {})));
  const auth = await requestQuark(client, storage, "/file/upload/auth", {
    body: {
      auth_info: data.auth_info,
      auth_meta: `POST\n${contentMd5}\napplication/xml\n${timeStr}\nx-oss-callback:${callbackBase64}\nx-oss-date:${timeStr}\nx-oss-user-agent:${OSS_USER_AGENT}\n/${data.bucket}/${data.obj_key}?uploadId=${data.upload_id}`,
      task_id: data.task_id,
    },
    method: "POST",
  });
  const target = new URL(uploadHost(data));
  target.searchParams.set("uploadId", data.upload_id);
  const resp = await forwardProxy(client, target.toString(), {
    allowErrorStatus: true,
    body,
    contentType: "application/xml",
    headers: {
      Authorization: auth?.data?.auth_key || "",
      "Content-MD5": contentMd5,
      "Content-Type": "application/xml",
      Referer: "https://pan.quark.cn/",
      "x-oss-callback": callbackBase64,
      "x-oss-date": timeStr,
      "x-oss-user-agent": OSS_USER_AGENT,
    },
    method: "POST",
    responseEncoding: "text",
    timeout: 120000,
  });
  if (Number(resp.status || 0) !== 200) throw new Error(`up status: ${resp.status}, error: ${resp.body || ""}`);
};

const upFinish = async (client, storage, pre) => {
  const data = pre?.data || {};
  await requestQuark(client, storage, "/file/upload/finish", {
    body: {
      obj_key: data.obj_key,
      task_id: data.task_id,
    },
    method: "POST",
  });
  cache.clear(storage);
};

export const createQuarkDriver = ({ client }) => ({
  async test(storage) {
    await requestQuark(client, storage, "/config");
    if (storage.addition_json.AdditionVersion !== 2 && storage.addition_json.addition_version !== 2) {
      storage.addition_json.addition_version = 2;
      await persistAddition(storage);
    }
    return { addition: storage.addition_json };
  },

  async list(storage, relPath) {
    const parent = await resolveFile(client, storage, relPath);
    const content = (await listByParent(client, storage, parent.fid))
      .map((file) => fileToObj(file, normalizePath(relPath + "/" + file.file_name)));
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider: storage.driver || "Quark",
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
    if (!file.file) throw new Error("not file");
    const link = await downloadLink(client, storage, file);
    const header = { ...link.header, ...(options.proxyHeaders || options.headers || {}) };
    return {
      link: {
        url: link.url,
        header,
        content_length: link.content_length,
        concurrency: 3,
        part_size: 10 * 1024 * 1024,
      },
    };
  },

  async mkdir(storage, relPath) {
    const parent = await resolveFile(client, storage, dirnameOf(relPath));
    await manageFile(client, storage, "/file", {
      dir_init_lock: false,
      dir_path: "",
      file_name: basenameOf(relPath),
      pdir_fid: parent.fid,
    });
  },

  async move(storage, relPath, dstRelPath) {
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await manageFile(client, storage, "/file/move", {
      action_type: 1,
      exclude_fids: [],
      filelist: [file.fid],
      to_pdir_fid: dst.fid,
    });
  },

  async remove(storage, relPath) {
    const file = await resolveFile(client, storage, relPath);
    await manageFile(client, storage, "/file/delete", {
      action_type: 1,
      exclude_fids: [],
      filelist: [file.fid],
    });
  },

  async rename(storage, relPath, newName) {
    const file = await resolveFile(client, storage, relPath);
    await manageFile(client, storage, "/file/rename", {
      fid: file.fid,
      file_name: newName,
    });
  },

  async copy() {
    throw new Error("Quark copy is not supported by the OpenList driver");
  },

  async details(storage) {
    const resp = await memberInfo(client, storage);
    const total = Number(resp?.data?.total_capacity || resp?.data?.totalCapacity || 0);
    const used = Number(resp?.data?.use_capacity || resp?.data?.useCapacity || 0);
    return {
      total_space: total,
      used_space: used,
      free_space: Math.max(0, total - used),
    };
  },

  async put(storage, relPath, content, mime, options = {}) {
    const parent = await resolveFile(client, storage, dirnameOf(relPath));
    const bytes = uploadBytes(content, options);
    const uploadMime = mime || "application/octet-stream";
    const pre = await upPre(client, storage, relPath, parent.fid, bytes, uploadMime);
    if (await upHash(client, storage, md5Hex(bytes), sha1Hex(bytes), pre?.data?.task_id || "")) {
      cache.clear(storage);
      return;
    }
    const partSize = Number(pre?.metadata?.part_size || bytes.length || 1);
    const etags = [];
    for (let offset = 0, partNumber = 1; offset < bytes.length; offset += partSize, partNumber += 1) {
      const chunk = bytes.slice(offset, Math.min(offset + partSize, bytes.length));
      const etag = await upPart(client, storage, pre, uploadMime, partNumber, chunk);
      if (etag === "finish") {
        cache.clear(storage);
        return;
      }
      etags.push(etag);
    }
    await upCommit(client, storage, pre, etags);
    await upFinish(client, storage, pre);
  },
});
