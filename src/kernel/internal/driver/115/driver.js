import { basename, normalizePath } from "../../model/path.js";
import { rawDownloadUrl } from "../common.js";
import { remoteJson } from "../http.js";
import { decode115, encode115, generateKey } from "./m115.js";

const API_LOGIN_CHECK = "https://passportapi.115.com/app/1.0/web/1.0/check/sso";
const API_FILE_LIST = "https://webapi.115.com/files";
const API_DIR_ADD = "https://webapi.115.com/files/add";
const API_FILE_DELETE = "https://webapi.115.com/rb/delete";
const API_FILE_MOVE = "https://webapi.115.com/files/move";
const API_FILE_COPY = "https://webapi.115.com/files/copy";
const API_FILE_RENAME = "https://webapi.115.com/files/batch_rename";
const API_FILE_INDEX_INFO = "https://webapi.115.com/files/index_info";
const API_DOWNLOAD_URL = "https://proapi.115.com/app/chrome/downurl";
const API_QRCODE_LOGIN = "https://passportapi.115.com/app/1.0/%s/1.0/login/qrcode";
const UA = "Mozilla/5.0 115Browser/35.6.0.3";
const MAX_PAGE_SIZE = 1150;
const limiterState = new WeakMap();

const additionValue = (addition, lowerName, upperName, fallback = "") => {
  const value = addition?.[lowerName] ?? addition?.[upperName];
  return value === undefined || value === null || value === "" ? fallback : value;
};

const cookieHeader = (addition) => additionValue(addition, "cookie", "Cookie");
const rootId = (addition) => additionValue(addition, "root_folder_id", "RootFolderID", "0");
const pageSize = (addition) => Math.min(MAX_PAGE_SIZE, Math.max(1, Number(additionValue(addition, "page_size", "PageSize", 1000)) || 1000));
const limitRate = (addition) => Math.max(0, Number(additionValue(addition, "limit_rate", "LimitRate", 2)) || 0);

const toForm = (data) => new URLSearchParams(Object.entries(data)
  .filter(([, value]) => value !== undefined && value !== null)
  .map(([key, value]) => [key, String(value)])).toString();

const requestHeaders = (storage, extra = {}) => ({
  Cookie: cookieHeader(storage.addition_json),
  "User-Agent": UA,
  ...extra,
});

const check115 = (payload, fallback = "115 request failed") => {
  const code = Number(payload?.errno ?? payload?.errNo ?? payload?.code ?? 0);
  if (payload?.state === false || code !== 0 || payload?.error) {
    throw new Error(payload?.msg || payload?.message || payload?.error || `${fallback}: ${code}`);
  }
  return payload;
};

const requestJson = async (client, storage, url, {
  body,
  headers = {},
  method = "GET",
  query = {},
} = {}) => {
  const target = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  }
  const formBody = body ? toForm(body) : undefined;
  const payload = await remoteJson(client, target.toString(), {
    body: formBody,
    contentType: body ? "application/x-www-form-urlencoded" : "application/json;charset=UTF-8",
    headers: requestHeaders(storage, headers),
    method,
    payloadEncoding: body ? "text" : undefined,
  });
  return check115(payload);
};

const parse115Time = (value) => {
  if (!value) return new Date().toISOString();
  if (/^\d+$/.test(String(value))) {
    const date = new Date(Number(value) * 1000);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }
  const date = new Date(String(value).replace(/-/g, "/") + " GMT+0800");
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const isDirInfo = (item) => !item?.fid;

const fileToObj = (item, relPath, storage) => {
  const isDir = isDirInfo(item);
  const id = String(isDir ? item.cid : item.fid);
  return {
    name: String(item.n || item.name || ""),
    path: normalizePath(relPath),
    is_dir: isDir,
    size: Number(item.s || 0),
    modified: parse115Time(item.t),
    created: parse115Time(item.tp),
    thumb: item.u || "",
    sign: "",
    type: isDir ? 1 : 0,
    hashinfo: item.sha || "",
    hash_info: item.sha ? { sha1: item.sha } : {},
    id,
    pick_code: item.pc || item.pick_code || "",
    raw_url: isDir ? "" : rawDownloadUrl(storage, relPath),
    provider: "115 Cloud",
  };
};

const listById = async (client, storage, id) => {
  const addition = storage.addition_json;
  const limit = pageSize(addition);
  const content = [];
  for (let offset = 0; ; offset += limit) {
    const data = await requestJson(client, storage, API_FILE_LIST, {
      query: {
        aid: "1",
        asc: "1",
        cid: id || "0",
        fc_mix: "0",
        format: "json",
        limit,
        natsort: "0",
        o: "user_ptime",
        offset,
        record_open_time: "1",
        show_dir: "1",
        snap: "0",
      },
    });
    content.push(...(data.data || []));
    if (offset + limit >= Number(data.count || content.length)) break;
  }
  return content;
};

const findChild = async (client, storage, parentId, name) => {
  const items = await listById(client, storage, parentId);
  const target = items.find((item) => String(item.n || item.name || "") === name);
  if (!target) throw new Error(`object [${name}] not found`);
  return target;
};

const resolveFile = async (client, storage, relPath) => {
  const clean = normalizePath(relPath || "/");
  if (clean === "/") {
    return {
      cid: rootId(storage.addition_json),
      n: "root",
      t: Math.floor(Date.now() / 1000),
      tp: Math.floor(Date.now() / 1000),
    };
  }
  const parts = clean.split("/").filter(Boolean);
  let parentId = rootId(storage.addition_json);
  let item = null;
  for (const part of parts) {
    item = await findChild(client, storage, parentId, part);
    parentId = String(isDirInfo(item) ? item.cid : item.fid);
  }
  return item;
};

const saveDriverStorage = async (storage) => {
  if (storage?.saveDriverStorage) await storage.saveDriverStorage(storage.addition_json);
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

const loginByQrToken = async (client, storage) => {
  const addition = storage.addition_json;
  const token = additionValue(addition, "qrcode_token", "QRCodeToken");
  if (!token) return false;
  const source = additionValue(addition, "qrcode_source", "QRCodeSource", "web");
  const data = await requestJson(client, storage, API_QRCODE_LOGIN.replace("%s", encodeURIComponent(source)), {
    body: { account: token, app: source },
    method: "POST",
  });
  const credential = data.data?.cookie || {};
  if (!credential.UID || !credential.CID || !credential.SEID) throw new Error("115 QR login returned empty credential");
  addition.cookie = `UID=${credential.UID};CID=${credential.CID};SEID=${credential.SEID};KID=${credential.KID || ""}`;
  addition.qrcode_token = "";
  await saveDriverStorage(storage);
  return true;
};

const ensureLogin = async (client, storage) => {
  if (!cookieHeader(storage.addition_json)) await loginByQrToken(client, storage);
  if (!cookieHeader(storage.addition_json)) throw new Error("missing cookie or qrcode account");
  const data = await requestJson(client, storage, API_LOGIN_CHECK, {
    query: { _: Date.now() },
  });
  return data;
};

const downloadInfo = async (client, storage, file, userAgent = UA) => {
  const key = generateKey();
  const data = encode115(JSON.stringify({ pickcode: file.pick_code || file.pc }), key);
  const resp = await requestJson(client, storage, API_DOWNLOAD_URL, {
    body: { data },
    headers: { "User-Agent": userAgent },
    method: "POST",
    query: { t: Date.now() },
  });
  const decoded = JSON.parse(decode115(String(resp.data || ""), key) || "{}");
  const first = Object.values(decoded)[0];
  if (!first?.url?.url) throw new Error("115 download url is empty");
  return first;
};

export const create115Driver = ({ client }) => ({
  async test(storage) {
    const data = await ensureLogin(client, storage);
    return data?.data?.user_id ? `115 user ${data.data.user_id}` : "115 login ok";
  },

  async list(storage, relPath) {
    await waitLimit(storage);
    await ensureLogin(client, storage);
    const dir = await resolveFile(client, storage, relPath);
    const dirId = String(dir.cid || dir.fid || rootId(storage.addition_json));
    const content = (await listById(client, storage, dirId))
      .map((item) => fileToObj(item, normalizePath(relPath + "/" + String(item.n || item.name || "")), storage));
    return {
      content,
      direct_upload_tools: [],
      header: "",
      provider: "115 Cloud",
      readme: "",
      total: content.length,
      write: true,
    };
  },

  async get(storage, relPath) {
    await waitLimit(storage);
    await ensureLogin(client, storage);
    const item = await resolveFile(client, storage, relPath);
    const obj = fileToObj(item, relPath, storage);
    return {
      ...obj,
      raw_url: obj.is_dir ? "" : rawDownloadUrl(storage, relPath),
      readme: "",
      header: "",
      related: [],
    };
  },

  async read(storage, relPath, options = {}) {
    await waitLimit(storage);
    await ensureLogin(client, storage);
    const item = await resolveFile(client, storage, relPath);
    const obj = fileToObj(item, relPath, storage);
    if (obj.is_dir) throw new Error("not file");
    const info = await downloadInfo(client, storage, obj, options.userAgent || UA);
    return {
      link: {
        url: info.url.url,
        header: info.header || {},
        content_length: Number(info.file_size || obj.size || 0),
      },
    };
  },

  async mkdir(storage, relPath) {
    await waitLimit(storage);
    await ensureLogin(client, storage);
    const parent = await resolveFile(client, storage, normalizePath(relPath).replace(/\/[^/]+$/, "") || "/");
    await requestJson(client, storage, API_DIR_ADD, {
      body: { cname: basename(relPath), pid: parent.cid || parent.fid || rootId(storage.addition_json) },
      method: "POST",
    });
  },

  async move(storage, relPath, dstRelPath) {
    await waitLimit(storage);
    await ensureLogin(client, storage);
    const item = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await requestJson(client, storage, API_FILE_MOVE, {
      body: { "fid[0]": item.fid || item.cid, pid: dst.cid || dst.fid },
      method: "POST",
    });
  },

  async copy(storage, relPath, dstRelPath) {
    await waitLimit(storage);
    await ensureLogin(client, storage);
    const item = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await requestJson(client, storage, API_FILE_COPY, {
      body: { "fid[0]": item.fid || item.cid, pid: dst.cid || dst.fid },
      method: "POST",
    });
  },

  async remove(storage, relPath) {
    await waitLimit(storage);
    await ensureLogin(client, storage);
    const item = await resolveFile(client, storage, relPath);
    await requestJson(client, storage, API_FILE_DELETE, {
      body: { "fid[0]": item.fid || item.cid },
      method: "POST",
    });
  },

  async rename(storage, relPath, newName) {
    await waitLimit(storage);
    await ensureLogin(client, storage);
    const item = await resolveFile(client, storage, relPath);
    const id = item.fid || item.cid;
    await requestJson(client, storage, API_FILE_RENAME, {
      body: { fid: id, file_name: newName, [`files_new_name[${id}]`]: newName },
      method: "POST",
    });
  },

  async put() {
    throw new Error("115 Cloud upload is not implemented in the SiYuan kernel port yet");
  },

  async details(storage) {
    await waitLimit(storage);
    await ensureLogin(client, storage);
    const data = await requestJson(client, storage, API_FILE_INDEX_INFO);
    const total = Number(data.data?.space_info?.all_total?.size || 0);
    const used = Number(data.data?.space_info?.all_use?.size || 0);
    return {
      total_space: total,
      used_space: used,
      free_space: Math.max(0, total - used),
    };
  },
});
