import { basename, dirname, normalizePath } from "../../model/path.js";
import {
  forwardProxy,
  remoteJson,
} from "../http.js";

const API = "https://www.123pan.com/api";
const B_API = "https://www.123pan.com/b/api";
const LOGIN_API = "https://login.123pan.com/api";
const SIGN_IN = LOGIN_API + "/user/sign_in";
const USER_INFO = B_API + "/user/info";
const FILE_LIST = B_API + "/file/list/new";
const DOWNLOAD_INFO = B_API + "/file/download_info";
const MKDIR = B_API + "/file/upload_request";
const MOVE = B_API + "/file/mod_pid";
const RENAME = B_API + "/file/rename";
const TRASH = B_API + "/file/trash";

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
    return data?.data?.redirect_url || data?.data?.redirectUrl || candidate;
  } catch (_) {
    return candidate;
  }
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

  async get(storage, relPath) {
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
    if (!obj.is_dir) {
      obj.raw_url = await downloadUrlFor(client, storage, target.file);
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
    const url = await downloadUrlFor(client, storage, target.file);
    return forwardProxy(client, url, {
      headers: {
        Referer: `${new URL(url).protocol}//${new URL(url).host}/`,
      },
      method: "GET",
      responseEncoding: "base64",
    });
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

  async put() {
    throw new Error("123Pan upload is not implemented in the SiYuan kernel port yet; OpenList upload_request/S3 upload_complete flow is the next migration step.");
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
