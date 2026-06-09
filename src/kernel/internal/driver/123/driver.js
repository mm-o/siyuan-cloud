import { basename, dirname, normalizePath } from "../../model/path.js";
import {
  forwardProxy,
  remoteJson,
} from "../http.js";
import { signAwsV4 } from "../aws4.js";

const API = "https://www.123pan.com/api";
const B_API = "https://www.123pan.com/b/api";
const LOGIN_API = "https://login.123pan.com/api";
const SIGN_IN = LOGIN_API + "/user/sign_in";
const USER_INFO = B_API + "/user/info";
const FILE_LIST = B_API + "/file/list/new";
const DOWNLOAD_INFO = B_API + "/file/download_info";
const MKDIR = B_API + "/file/upload_request";
const UPLOAD_REQUEST = B_API + "/file/upload_request";
const UPLOAD_COMPLETE = B_API + "/file/upload_complete";
const S3_PRE_SIGNED_URLS = B_API + "/file/s3_repare_upload_parts_batch";
const S3_AUTH = B_API + "/file/s3_upload_object/auth";
const UPLOAD_COMPLETE_V2 = B_API + "/file/upload_complete/v2";
const MOVE = B_API + "/file/mod_pid";
const RENAME = B_API + "/file/rename";
const TRASH = B_API + "/file/trash";
const UPLOAD_CHUNK_SIZE = 16 * 1024 * 1024;

const crcTable = (() => {
  const table = [];
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (value) => {
  let crc = 0xffffffff;
  const input = unescape(encodeURIComponent(String(value || "")));
  for (let i = 0; i < input.length; i += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ input.charCodeAt(i)) & 0xff];
  }
  return ((crc ^ 0xffffffff) >>> 0).toString();
};

const pad = (value) => String(value).padStart(2, "0");

const signPath = (path, os = "web", version = "3") => {
  const table = ["a", "d", "e", "f", "g", "h", "l", "m", "y", "i", "j", "n", "o", "p", "k", "q", "r", "s", "t", "u", "b", "c", "v", "w", "s", "z"];
  const random = String(Math.round(1e7 * Math.random()));
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const nowStr = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  const encodedTime = nowStr.split("").map((char) => table[Number(char)]).join("");
  const timeSign = crc32(encodedTime);
  const data = [timestamp, random, path, os, version, timeSign].join("|");
  const dataSign = crc32(data);
  return [timeSign, [timestamp, random, dataSign].join("-")];
};

const signedApi = (rawUrl) => {
  const url = new URL(rawUrl);
  const [key, value] = signPath(url.pathname, "web", "3");
  url.searchParams.append(key, value);
  return url.toString();
};

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
const cleanUsername = (value) => String(value || "").trim().replace(/[\s-]/g, "");

const decodeBase64 = (value) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const char of String(value || "")) {
    if (char === "=") break;
    const index = chars.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(escape(output));
  } catch (_) {
    return output;
  }
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
      let f;
      let g;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const tmp = d;
      const word = view.getUint32(offset + g * 4, true);
      d = c;
      c = b;
      b = (b + leftRotate((a + f + k[i] + word) >>> 0, s[i])) >>> 0;
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

const uploadBytes = (content, options = {}) => options.bodyEncoding === "base64"
  ? base64ToBytes(content || "")
  : utf8Bytes(content || "");

const platform = (addition) => addition.platform || addition.Platform || "web";

const headersFor = (addition, token = addition.access_token || addition.AccessToken || "") => ({
  origin: "https://www.123pan.com",
  referer: "https://www.123pan.com/",
  authorization: token ? `Bearer ${token}` : "",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) siyuan-cloud-client",
  platform: platform(addition),
  "app-version": "3",
});

const check123 = (payload) => {
  const code = Number(payload?.code ?? 0);
  if (code !== 0) throw new Error(payload?.message || `123Pan code ${code}`);
  return payload;
};

const login = async (client, addition) => {
  const username = addition.username || addition.Username || "";
  const passport = cleanUsername(username);
  const password = addition.password || addition.Password || "";
  const body = isEmail(username)
    ? { mail: String(username).trim(), password, type: 2 }
    : { passport, password, remember: true };
  const payload = await remoteJson(client, SIGN_IN, {
    body,
    headers: {
      origin: "https://www.123pan.com",
      referer: "https://www.123pan.com/",
      "user-agent": "Dart/2.19(dart:io)-siyuan-cloud",
      platform: "web",
      "app-version": "3",
    },
    method: "POST",
  });
  if (Number(payload?.code) !== 200) throw new Error(payload?.message || "123Pan login failed");
  addition.access_token = payload?.data?.token || "";
  return addition.access_token;
};

const request123 = async (client, storage, url, {
  body,
  method = "GET",
  query,
  retry = true,
} = {}) => {
  const addition = storage.addition_json;
  if (!addition.access_token && !addition.AccessToken) await login(client, addition);
  const api = new URL(url);
  for (const [key, value] of Object.entries(query || {})) api.searchParams.set(key, String(value));
  const payload = await remoteJson(client, signedApi(api.toString()), {
    allowErrorStatus: true,
    body,
    headers: headersFor(addition),
    method,
  });
  if (Number(payload?.code) === 401 && retry) {
    await login(client, addition);
    return request123(client, storage, url, { body, method, query, retry: false });
  }
  return check123(payload);
};

const parseTime = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const idOf = (file) => String(file?.FileId ?? file?.fileId ?? file?.id ?? "");

const fileNameOf = (file) => file?.FileName || file?.fileName || file?.name || "";

const isDir = (file) => Number(file?.Type ?? file?.type ?? 0) === 1;

const thumbOf = (file) => {
  const raw = file?.DownloadUrl || file?.downloadUrl || "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/_24_24$/, "") + "_70_70";
    url.searchParams.set("w", "70");
    url.searchParams.set("h", "70");
    if (!url.searchParams.has("type")) url.searchParams.set("type", basename(fileNameOf(file)).replace(/^\./, ""));
    if (!url.searchParams.has("trade_key")) url.searchParams.set("trade_key", "123pan-thumbnail");
    return url.toString();
  } catch (_) {
    return "";
  }
};

const objFromFile = (file, relPath, storage) => {
  const dir = isDir(file);
  return {
    name: fileNameOf(file),
    path: normalizePath(relPath),
    is_dir: dir,
    size: Number(file?.Size ?? file?.size ?? 0),
    modified: parseTime(file?.UpdateAt || file?.updateAt),
    created: parseTime(file?.UpdateAt || file?.updateAt),
    sign: "",
    thumb: thumbOf(file),
    type: dir ? 1 : 0,
    hashinfo: file?.Etag || file?.etag || "",
    hash_info: file?.Etag || file?.etag ? { md5: file?.Etag || file?.etag } : {},
    id: idOf(file),
    raw_url: dir ? "" : `/plugin/private/siyuan-cloud/d${normalizePath(storage.mount_path + "/" + relPath)}`,
    provider: "123Pan",
    file,
  };
};

const rootId = (addition) => String(addition.root_folder_id || addition.RootFolderID || "0");

const listByParentId = async (client, storage, parentId, parentName) => {
  let page = 1;
  let total = 0;
  const result = [];
  for (;;) {
    const payload = await request123(client, storage, FILE_LIST, {
      method: "GET",
      query: {
        driveId: "0",
        limit: "100",
        next: "0",
        orderBy: "file_id",
        orderDirection: "desc",
        parentFileId: parentId,
        trashed: "false",
        SearchData: "",
        Page: page,
        OnlyLookAbnormalFile: "0",
        event: "homeListFile",
        operateType: "4",
        inDirectSpace: "false",
      },
    });
    const data = payload.data || {};
    const list = data.InfoList || data.infoList || [];
    result.push(...list);
    total = Number(data.Total || data.total || total);
    page += 1;
    if (!list.length || String(data.Next ?? data.next) === "-1") break;
  }
  if (total && result.length !== total) {
    // Keep OpenList's warning behavior as data metadata rather than throwing.
    result.warning = `incorrect file count from remote at ${parentName}: expected ${total}, got ${result.length}`;
  }
  return result;
};

const resolveFile = async (client, storage, relPath) => {
  const current = normalizePath(relPath || "/");
  if (current === "/") return { id: rootId(storage.addition_json), name: "root", path: "/", isRoot: true };
  let parentId = rootId(storage.addition_json);
  let parentPath = "/";
  let found = null;
  for (const part of current.split("/").filter(Boolean)) {
    const files = await listByParentId(client, storage, parentId, parentPath);
    found = files.find((file) => fileNameOf(file) === part);
    if (!found) throw new Error(`object not found: ${current}`);
    parentId = idOf(found);
    parentPath = normalizePath(parentPath + "/" + part);
  }
  return { file: found, id: idOf(found), name: fileNameOf(found), path: current };
};

const downloadUrlFor = async (client, storage, file) => {
  const payload = await request123(client, storage, DOWNLOAD_INFO, {
    body: {
      driveId: 0,
      etag: file?.Etag || file?.etag || "",
      fileId: Number(idOf(file)),
      fileName: fileNameOf(file),
      s3keyFlag: file?.S3KeyFlag || file?.s3KeyFlag || "",
      size: Number(file?.Size ?? file?.size ?? 0),
      type: Number(file?.Type ?? file?.type ?? 0),
    },
    method: "POST",
  });
  const raw = payload?.data?.DownloadUrl || payload?.data?.downloadUrl || "";
  if (!raw) throw new Error("get download url failed");
  let referer = "https://www.123pan.com/";
  try {
    const original = new URL(raw);
    referer = `${original.protocol}//${original.host}/`;
  } catch (_) {
    // Keep the web referer fallback used by the upstream request flow.
  }
  let candidate = raw;
  try {
    const url = new URL(raw);
    const params = url.searchParams.get("params");
    candidate = params ? decodeBase64(params) : url.toString();
  } catch (_) {
    candidate = raw;
  }
  try {
    const resolved = await forwardProxy(client, candidate, {
      allowErrorStatus: true,
      contentType: "application/json",
      headers: { Referer: "https://www.123pan.com/" },
      method: "GET",
      responseEncoding: "text",
    });
    const data = JSON.parse(resolved.body || "{}");
    return {
      url: data?.data?.redirect_url || data?.data?.redirectUrl || candidate,
      referer,
    };
  } catch (_) {
    return { url: candidate, referer };
  }
};

const linkFor = async (client, storage, file) => {
  const { url, referer } = await downloadUrlFor(client, storage, file);
  return {
    link: {
      url,
      header: {
        Referer: [referer],
      },
      content_length: Number(file?.Size ?? file?.size ?? 0),
    },
  };
};

const uploadReqData = (data = {}) => data.data || data.Data || {};
const uploadField = (data, name) => data?.[name] ?? data?.[name.charAt(0).toLowerCase() + name.slice(1)] ?? "";

const getS3UploadUrls = async (client, storage, upReq, start, end, multipart) => {
  const data = uploadReqData(upReq);
  const payload = await request123(client, storage, multipart ? S3_PRE_SIGNED_URLS : S3_AUTH, {
    body: {
      StorageNode: uploadField(data, "StorageNode"),
      bucket: uploadField(data, "Bucket"),
      key: uploadField(data, "Key"),
      partNumberEnd: end,
      partNumberStart: start,
      uploadId: uploadField(data, "UploadId"),
    },
    method: "POST",
  });
  return uploadReqData(payload).presignedUrls || uploadReqData(payload).PreSignedUrls || {};
};

const completeS3V2 = (client, storage, upReq, size, isMultipart) => {
  const data = uploadReqData(upReq);
  return request123(client, storage, UPLOAD_COMPLETE_V2, {
    body: {
      StorageNode: uploadField(data, "StorageNode"),
      bucket: uploadField(data, "Bucket"),
      fileId: uploadField(data, "FileId"),
      fileSize: size,
      isMultipart,
      key: uploadField(data, "Key"),
      uploadId: uploadField(data, "UploadId"),
    },
    method: "POST",
  });
};

const putPresignedChunks = async (client, storage, upReq, bytes) => {
  const chunkCount = Math.max(1, Math.ceil(bytes.length / UPLOAD_CHUNK_SIZE));
  const multipart = chunkCount > 1;
  const batchSize = multipart ? 10 : 1;
  for (let index = 1; index <= chunkCount; index += batchSize) {
    const start = index;
    const end = Math.min(index + batchSize, chunkCount + 1);
    const urls = await getS3UploadUrls(client, storage, upReq, start, end, multipart);
    for (let cur = start; cur < end; cur += 1) {
      const offset = (cur - 1) * UPLOAD_CHUNK_SIZE;
      const chunk = bytes.slice(offset, Math.min(offset + UPLOAD_CHUNK_SIZE, bytes.length));
      const url = urls[String(cur)];
      if (!url) throw new Error(`upload url is empty for 123Pan chunk ${cur}`);
      await forwardProxy(client, url, {
        body: bytesToBase64(chunk),
        contentType: "application/octet-stream",
        headers: { "Content-Length": String(chunk.length) },
        method: "PUT",
        payloadEncoding: "base64",
        responseEncoding: "text",
        timeout: 120000,
      });
    }
  }
  await completeS3V2(client, storage, upReq, bytes.length, multipart);
};

const putAwsS3 = async (client, upReq, bytes, mime) => {
  const data = uploadReqData(upReq);
  const endpoint = String(uploadField(data, "EndPoint")).replace(/\/+$/, "");
  const bucket = uploadField(data, "Bucket");
  const key = uploadField(data, "Key");
  const url = `${endpoint}/${encodeURIComponent(bucket)}/${String(key).split("/").map(encodeURIComponent).join("/")}`;
  const body = bytesToBase64(bytes);
  const headers = signAwsV4({
    accessKeyId: uploadField(data, "AccessKeyId"),
    body: bytes,
    headers: {
      "content-type": mime || "application/octet-stream",
    },
    method: "PUT",
    region: "123pan",
    secretAccessKey: uploadField(data, "SecretAccessKey"),
    sessionToken: uploadField(data, "SessionToken"),
    url,
  });
  await forwardProxy(client, url, {
    body,
    contentType: mime || "application/octet-stream",
    headers,
    method: "PUT",
    payloadEncoding: "base64",
    responseEncoding: "text",
    timeout: 120000,
  });
};

export const create123PanDriver = ({ client }) => ({
  async list(storage, relPath) {
    const target = await resolveFile(client, storage, relPath);
    const files = await listByParentId(client, storage, target.id, target.name);
    const content = files.map((file) => objFromFile(file, normalizePath(relPath + "/" + fileNameOf(file)), storage));
    return {
      content,
      total: content.length,
      readme: "",
      header: files.warning || "",
      write: true,
      provider: "123Pan",
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
        provider: "123Pan",
        related: [],
      };
    }
    const obj = objFromFile(target.file, relPath, storage);
    if (!obj.is_dir && !options.skipLink) {
      obj.raw_url = (await linkFor(client, storage, target.file)).link.url;
    }
    return {
      ...obj,
      readme: "",
      header: "",
      related: [],
    };
  },

  async read(storage, relPath) {
    const target = await resolveFile(client, storage, relPath);
    if (target.isRoot || isDir(target.file)) throw new Error("not file");
    return linkFor(client, storage, target.file);
  },

  async mkdir(storage, relPath) {
    const parent = await resolveFile(client, storage, dirname(relPath));
    await request123(client, storage, MKDIR, {
      body: {
        driveId: 0,
        etag: "",
        fileName: basename(relPath),
        parentFileId: parent.id,
        size: 0,
        type: 1,
      },
      method: "POST",
    });
  },

  async remove(storage, relPath) {
    const target = await resolveFile(client, storage, relPath);
    if (target.isRoot) throw new Error("root cannot be removed");
    await request123(client, storage, TRASH, {
      body: {
        driveId: 0,
        operation: true,
        fileTrashInfoList: [target.file],
      },
      method: "POST",
    });
  },

  async rename(storage, relPath, newName) {
    const target = await resolveFile(client, storage, relPath);
    if (target.isRoot) throw new Error("root cannot be renamed");
    await request123(client, storage, RENAME, {
      body: {
        driveId: 0,
        fileId: Number(target.id),
        fileName: newName,
      },
      method: "POST",
    });
  },

  async move(storage, relPath, dstRelPath) {
    const target = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await request123(client, storage, MOVE, {
      body: {
        fileIdList: [{ FileId: target.id }],
        parentFileId: dst.id,
      },
      method: "POST",
    });
  },

  async put(storage, relPath, content, mime, options = {}) {
    const parent = await resolveFile(client, storage, dirname(relPath));
    const bytes = uploadBytes(content, options);
    const uploadReq = await request123(client, storage, UPLOAD_REQUEST, {
      body: {
        driveId: 0,
        duplicate: 2,
        etag: md5Hex(bytes).toLowerCase(),
        fileName: basename(relPath),
        parentFileId: parent.id,
        size: Number(options.size ?? bytes.length),
        type: 0,
      },
      method: "POST",
    });
    const data = uploadReqData(uploadReq);
    if (uploadField(data, "Reuse") || !uploadField(data, "Key")) return;
    if (uploadField(data, "AccessKeyId") && uploadField(data, "SecretAccessKey") && uploadField(data, "SessionToken")) {
      await putAwsS3(client, uploadReq, bytes, mime);
      await request123(client, storage, UPLOAD_COMPLETE, {
        body: { fileId: uploadField(data, "FileId") },
        method: "POST",
      });
      return;
    }
    await putPresignedChunks(client, storage, uploadReq, bytes);
  },

  async test(storage) {
    const payload = await request123(client, storage, USER_INFO, {
      method: "GET",
    });
    const data = payload.data || {};
    return {
      ok: true,
      addition: storage.addition_json,
      user: {
        uid: data.UID || data.uid || 0,
        nickname: data.Nickname || data.nickname || "",
        space_used: data.SpaceUsed || data.spaceUsed || 0,
        space_permanent: data.SpacePermanent || data.spacePermanent || 0,
        space_temp: data.SpaceTemp || data.spaceTemp || 0,
        file_count: data.FileCount || data.fileCount || 0,
      },
    };
  },
});
