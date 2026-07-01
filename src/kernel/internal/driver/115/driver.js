import { basename, normalizePath } from "../../model/path.js";
import { rawDownloadUrl } from "../common.js";
import { remoteJsonWithMeta } from "../http.js";
import { clearQrKeys, runQrLogin } from "../qr.js";
import { decode115, encode115, generateKey } from "./m115.js";

const API_LOGIN_CHECK = "https://passportapi.115.com/app/1.0/web/1.0/check/sso";
const API_FILE_LIST = "https://webapi.115.com/files";
const API_DIR_ADD = "https://webapi.115.com/files/add";
const API_FILE_DELETE = "https://webapi.115.com/rb/delete";
const API_FILE_MOVE = "https://webapi.115.com/files/move";
const API_FILE_COPY = "https://webapi.115.com/files/copy";
const API_FILE_RENAME = "https://webapi.115.com/files/batch_rename";
const API_FILE_INDEX_INFO = "https://webapi.115.com/files/index_info";
const API_FILE_INFO = "https://webapi.115.com/files/get_info";
const API_DOWNLOAD_URL = "https://proapi.115.com/app/chrome/downurl";
const API_QRCODE_TOKEN = "https://qrcodeapi.115.com/api/1.0/web/1.0/token";
const API_QRCODE_STATUS = "https://qrcodeapi.115.com/get/status/";
const API_QRCODE_LOGIN = "https://passportapi.115.com/app/1.0/%s/1.0/login/qrcode";
const UA = "Mozilla/5.0 115Browser/35.6.0.3";
const MAX_PAGE_SIZE = 1150;
const QR_KEYS = ["qrcode_sign", "QRCodeSign", "qrcode_time", "QRCodeTime", "qrcode_content", "QRCodeContent", "qrcode_cookie", "QRCodeCookie"];
const DOWNLOAD_CACHE_TTL = 5 * 60 * 1000;
const downloadInfoCache = new WeakMap();
const limiterState = new WeakMap();

const additionValue = (addition, lowerName, upperName, fallback = "") => {
  const value = addition?.[lowerName] ?? addition?.[upperName];
  return value === undefined || value === null || value === "" ? fallback : value;
};

const qrSource = (addition) => {
  return String(additionValue(addition, "qrcode_source", "QRCodeSource", "web") || "web").trim();
};

const cookieHeader = (addition) => additionValue(addition, "cookie", "Cookie");
const qrCookieHeader = (addition) => additionValue(addition, "qrcode_cookie", "QRCodeCookie");
const rootId = (addition) => additionValue(addition, "root_folder_id", "RootFolderID", "0");
const pageSize = (addition) => Math.min(MAX_PAGE_SIZE, Math.max(1, Number(additionValue(addition, "page_size", "PageSize", 1000)) || 1000));
const limitRate = (addition) => Math.max(0, Number(additionValue(addition, "limit_rate", "LimitRate", 2)) || 0);

const toForm = (data) => Object.entries(data)
  .filter(([, value]) => value !== undefined && value !== null)
  .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  .join("&");

const setCookieValues = (headers) => {
  const pairs = Object.entries(headers || {});
  const entry = pairs.find(([key]) => key.toLowerCase() === "set-cookie");
  if (!entry) return [];
  return Array.isArray(entry[1]) ? entry[1] : [entry[1]];
};

const mergeCookies = (...values) => {
  const map = new Map();
  for (const value of values) {
    for (const part of String(value || "").split(";")) {
      const trimmed = part.trim();
      const index = trimmed.indexOf("=");
      if (index > 0) map.set(trimmed.slice(0, index), trimmed.slice(index + 1));
    }
  }
  return [...map.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
};

const storeQrCookies = (addition, headers) => {
  const cookies = setCookieValues(headers).map((cookie) => String(cookie).split(";")[0]).filter(Boolean);
  if (!cookies.length) return;
  addition.qrcode_cookie = mergeCookies(qrCookieHeader(addition), cookies.join("; "));
};

const requestHeaders = (storage, extra = {}) => ({
  Cookie: cookieHeader(storage.addition_json),
  "User-Agent": UA,
  ...extra,
});

const requestQrHeaders = (storage, extra = {}) => ({
  Cookie: mergeCookies(cookieHeader(storage.addition_json), qrCookieHeader(storage.addition_json)),
  "User-Agent": UA,
  ...extra,
});

const buildDownloadHeaders = (headers, responseHeaders) => {
  const result = { ...(headers || {}) };
  const cookies = [
    result.Cookie || result.cookie || "",
    ...setCookieValues(responseHeaders).map((cookie) => String(cookie).split(";")[0]),
  ].filter(Boolean);
  if (cookies.length) result.Cookie = mergeCookies(...cookies);
  return result;
};

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
  qrCookies = false,
} = {}) => {
  const target = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  }
  const formBody = body ? toForm(body) : undefined;
  const request = {
    body: formBody,
    contentType: body ? "application/x-www-form-urlencoded" : "application/json;charset=UTF-8",
    headers: (qrCookies ? requestQrHeaders : requestHeaders)(storage, headers),
    method,
  };
  const result = await remoteJsonWithMeta(client, target.toString(), request);
  storeQrCookies(storage.addition_json, result.meta?.headers);
  return check115(result.json);
};

const requestQrStatus = async (client, storage, query) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const target = `${API_QRCODE_STATUS}?${params.toString()}`;
  const request = {
    contentType: "application/json;charset=UTF-8",
    headers: requestQrHeaders(storage),
    method: "GET",
  };
  const result = await remoteJsonWithMeta(client, target, request);
  const payload = result.json;
  storeQrCookies(storage.addition_json, result.meta?.headers);
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

const textValue = (...values) => {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return "";
};

const fileIdOf = (item) => textValue(item?.fid, item?.file_id, item?.fileID, item?.FileID);
const dirIdOf = (item) => textValue(item?.cid, item?.category_id, item?.categoryID, item?.CategoryID);
const nameOf = (item) => textValue(item?.n, item?.name, item?.Name);
const pickCodeOf = (item) => textValue(item?.pc, item?.pick_code, item?.pickcode, item?.pickCode, item?.PickCode);
const isDirInfo = (item) => !fileIdOf(item);
const fileToObj = (item, relPath, storage) => {
  const isDir = isDirInfo(item);
  const id = String(isDir ? dirIdOf(item) : fileIdOf(item));
  return {
    name: String(nameOf(item)),
    path: normalizePath(relPath),
    is_dir: isDir,
    size: Number(item.s || item.size || item.Size || 0),
    modified: parse115Time(item.t || item.update_time || item.UpdateTime),
    created: parse115Time(item.tp || item.create_time || item.CreateTime),
    thumb: item.u || item.thumb_url || item.ThumbURL || "",
    sign: "",
    type: isDir ? 1 : 0,
    hashinfo: item.sha || item.sha1 || item.Sha1 || "",
    hash_info: (item.sha || item.sha1 || item.Sha1) ? { sha1: item.sha || item.sha1 || item.Sha1 } : {},
    id,
    pick_code: pickCodeOf(item),
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
  const target = items.find((item) => String(nameOf(item)) === name);
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
    parentId = String(isDirInfo(item) ? dirIdOf(item) : fileIdOf(item));
  }
  return item;
};

const getFileById = async (client, storage, id) => {
  const data = await requestJson(client, storage, API_FILE_INFO, {
    query: { file_id: id },
  });
  return Array.isArray(data.data) ? (data.data[0] || null) : (data.data || null);
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

const qrStatus = (payload) => {
  const data = payload?.data || payload || {};
  const raw = data.status ?? data.code ?? data.state ?? data.msg ?? data.message;
  const text = String(raw ?? data.msg ?? data.message ?? "").toLowerCase();
  const numeric = typeof raw === "boolean" ? NaN : Number(raw);
  const message = data.msg || data.message || "";
  if (numeric === 2) return { message, raw: payload, status: "success" };
  if (numeric === 1 || /scan|scanned|success|confirm|allowed|confirmed|qrcode_scan_confirmed/.test(text)) return { message, raw: payload, status: "scanned" };
  if (numeric === -1 || /expire|expired|timeout|time out/.test(text)) return { message: message || "115 QR code expired", status: "expired" };
  if (numeric === -2 || /cancel|canceled|cancelled/.test(text)) return { message: message || "115 QR code canceled", status: "canceled" };
  return { message, raw: payload, status: "waiting" };
};

const startQrLogin = async (client, storage) => {
  const addition = storage.addition_json;
  addition.qrcode_source = qrSource(addition);
  const data = await requestJson(client, storage, API_QRCODE_TOKEN);
  const session = data.data || {};
  if (!session.uid || !session.sign || !session.time) throw new Error("115 QR token response is empty");
  addition.qrcode_token = session.uid;
  addition.qrcode_sign = session.sign;
  addition.qrcode_time = session.time;
  addition.qrcode_content = session.qrcode || "";
  addition.cookie = "";
  return {
    message: "115 QR login pending",
    status: "waiting",
    verify: { qr_text: session.qrcode || "" },
  };
};

const pollQrLogin = async (client, storage) => {
  const addition = storage.addition_json;
  const status = await requestQrStatus(client, storage, {
    uid: additionValue(addition, "qrcode_token", "QRCodeToken"),
    time: additionValue(addition, "qrcode_time", "QRCodeTime"),
    sign: additionValue(addition, "qrcode_sign", "QRCodeSign"),
    _: Date.now(),
  });
  const state = qrStatus(status);
  return { message: state.message || "115 QR login pending", raw: status, status: state.status };
};

const run115QrLogin = (client, storage) => runQrLogin({
  addition: storage.addition_json,
  clear: () => clearQrKeys(storage.addition_json, QR_KEYS),
  confirm: async () => {
    await loginByQrToken(client, storage);
    return ensureLogin(client, storage);
  },
  hasSession: (addition) => Boolean(
    additionValue(addition, "qrcode_token", "QRCodeToken")
    && additionValue(addition, "qrcode_sign", "QRCodeSign")
    && additionValue(addition, "qrcode_time", "QRCodeTime"),
  ),
  pendingVerify: () => ({ qr_text: additionValue(storage.addition_json, "qrcode_content", "QRCodeContent") }),
  poll: () => pollQrLogin(client, storage),
  start: () => startQrLogin(client, storage),
});

const loginByQrToken = async (client, storage) => {
  const addition = storage.addition_json;
  const token = additionValue(addition, "qrcode_token", "QRCodeToken");
  if (!token) return false;
  const source = qrSource(addition);
  addition.qrcode_source = source;
  const data = await requestJson(client, storage, API_QRCODE_LOGIN.replace("%s", encodeURIComponent(source)), {
    body: { account: token, app: source },
    method: "POST",
    qrCookies: true,
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

const requestDownloadInfo = async (client, storage, file, userAgent) => {
  const pickcode = pickCodeOf(file);
  if (!pickcode) throw new Error("115 pickcode is empty");
  const cacheKey = `${pickcode}\n${userAgent}\n${cookieHeader(storage.addition_json)}`;
  const cached = downloadInfoCache.get(storage)?.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.info;
  const key = generateKey();
  const data = encode115(JSON.stringify({ pickcode }), key);
  const headers = requestHeaders(storage, { "User-Agent": userAgent });
  const downurl = `${API_DOWNLOAD_URL}?t=${Math.floor(Date.now() / 1000)}`;
  const body = toForm({ data });
  const result = await remoteJsonWithMeta(client, downurl, {
    body,
    contentType: "application/x-www-form-urlencoded",
    headers,
    method: "POST",
  });
  const resp = check115(result.json);
  const decoded = JSON.parse(decode115(String(resp.data || ""), key) || "{}");
  const info = Object.values(decoded)[0];
  if (!info?.url?.url) throw new Error("115 download url is empty");
  const resolved = {
    ...info,
    header: buildDownloadHeaders(headers, result.meta?.headers),
  };
  let cache = downloadInfoCache.get(storage);
  if (!cache) {
    cache = new Map();
    downloadInfoCache.set(storage, cache);
  }
  cache.set(cacheKey, { expires: Date.now() + DOWNLOAD_CACHE_TTL, info: resolved });
  return resolved;
};

export const create115Driver = ({ client }) => ({
  async test(storage, verify) {
    let data;
    if (verify?.type === "qrcode" || (!cookieHeader(storage.addition_json) && !additionValue(storage.addition_json, "qrcode_token", "QRCodeToken"))) {
      data = await run115QrLogin(client, storage);
    } else {
      data = await ensureLogin(client, storage);
    }
    return {
      addition: storage.addition_json,
      message: data?.data?.user_id ? `115 user ${data.data.user_id}` : "115 login ok",
      user: data?.data || {},
    };
  },

  async list(storage, relPath) {
    await waitLimit(storage);
    await ensureLogin(client, storage);
    const dir = await resolveFile(client, storage, relPath);
    const dirId = String(dirIdOf(dir) || fileIdOf(dir) || rootId(storage.addition_json));
    const content = (await listById(client, storage, dirId))
      .map((item) => fileToObj(item, normalizePath(relPath + "/" + String(nameOf(item))), storage));
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
    if (!obj.pick_code && obj.id) {
      const detailed = await getFileById(client, storage, obj.id);
      Object.assign(obj, fileToObj({ ...item, ...(detailed || {}) }, relPath, storage));
    }
    const userAgent = options.userAgent || UA;
    const info = await requestDownloadInfo(client, storage, obj, userAgent);
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
