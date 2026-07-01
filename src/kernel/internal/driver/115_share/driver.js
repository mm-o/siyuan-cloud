import { normalizePath } from "../../model/path.js";
import {
  basenameOf,
  createStorageCache,
  numberValue,
  parseTime,
  persistAddition,
  rawDownloadUrl,
} from "../common.js";
import { remoteJsonWithMeta } from "../http.js";
import { clearQrKeys, runQrLogin } from "../qr.js";

const API_LOGIN_CHECK = "https://passportapi.115.com/app/1.0/web/1.0/check/sso";
const API_QRCODE_TOKEN = "https://qrcodeapi.115.com/api/1.0/web/1.0/token";
const API_QRCODE_STATUS = "https://qrcodeapi.115.com/get/status/";
const API_QRCODE_LOGIN = "https://passportapi.115.com/app/1.0/%s/1.0/login/qrcode";
const API_SHARE_SNAP = "https://115cdn.com/webapi/share/snap";
const API_SHARE_DOWNLOAD = "https://115cdn.com/webapi/share/downurl";
const UA = "Mozilla/5.0 115Browser/35.6.0.3";
const UA_NT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const QR_KEYS = ["qrcode_sign", "QRCodeSign", "qrcode_time", "QRCodeTime", "qrcode_content", "QRCodeContent", "qrcode_cookie", "QRCodeCookie"];
const cache = createStorageCache();
const limiterState = new WeakMap();

const additionValue = (addition, lowerName, upperName, fallback = "") => {
  const value = addition?.[lowerName] ?? addition?.[upperName];
  return value === undefined || value === null || value === "" ? fallback : value;
};

const qrSource = (addition) => {
  return String(additionValue(addition, "qrcode_source", "QRCodeSource", "web") || "web").trim();
};

const formBody = (data) => Object.entries(data)
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

const rootId = (addition) => additionValue(addition, "root_folder_id", "RootFolderID", "0");
const cookieHeader = (addition) => additionValue(addition, "cookie", "Cookie");
const qrCookieHeader = (addition) => additionValue(addition, "qrcode_cookie", "QRCodeCookie");
const pageSize = (addition) => Math.max(1, numberValue(additionValue(addition, "page_size", "PageSize", 1000), 1000));
const limitRate = (addition) => Math.max(0, Number(additionValue(addition, "limit_rate", "LimitRate", 2)) || 0);
const shareCode = (addition) => additionValue(addition, "share_code", "ShareCode");
const receiveCode = (addition) => additionValue(addition, "receive_code", "ReceiveCode");

const shareReferer = (addition) => `https://115cdn.com/s/${shareCode(addition)}?password=${receiveCode(addition)}&`;

const check115 = (payload, fallback = "115 Share request failed") => {
  const code = Number(payload?.errno ?? payload?.errNo ?? payload?.code ?? 0);
  if (payload?.state === false || code !== 0 || payload?.error) {
    throw new Error(payload?.msg || payload?.message || payload?.error || `${fallback}: ${code}`);
  }
  return payload;
};

const requestHeaders = (storage, extra = {}) => ({
  Cookie: cookieHeader(storage.addition_json),
  "User-Agent": UA_NT,
  ...extra,
});

const requestQrHeaders = (storage, extra = {}) => ({
  Cookie: mergeCookies(cookieHeader(storage.addition_json), qrCookieHeader(storage.addition_json)),
  "User-Agent": UA_NT,
  ...extra,
});

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
  const form = body ? formBody(body) : undefined;
  const request = {
    body: form,
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
  await persistAddition(storage);
  return true;
};

const ensureLogin = async (client, storage) => {
  if (!cookieHeader(storage.addition_json)) await loginByQrToken(client, storage);
  if (!cookieHeader(storage.addition_json)) throw new Error("missing cookie or qrcode account");
  await requestJson(client, storage, API_SHARE_SNAP, {
    headers: { referer: shareReferer(storage.addition_json) },
    query: {
      share_code: shareCode(storage.addition_json),
      receive_code: receiveCode(storage.addition_json),
      cid: rootId(storage.addition_json),
      limit: 1,
      asc: 0,
      offset: 0,
      format: "json",
    },
  });
  return requestJson(client, storage, API_LOGIN_CHECK, {
    query: { _: Date.now() },
  });
};

const isDir = (item) => Number(item?.is_file ?? item?.isFile ?? 0) === 0;
const itemId = (item) => String(isDir(item) ? (item.cid || item.category_id || item.categoryID) : (item.fid || item.file_id || item.fileID));
const itemName = (item) => String(item.n || item.file_name || item.fileName || item.name || "");

const fileToObj = (item, relPath, storage) => {
  const dir = isDir(item);
  return {
    name: itemName(item) || basenameOf(relPath),
    path: normalizePath(relPath),
    is_dir: dir,
    size: Number(item.s || item.size || 0),
    modified: parseTime(item.t || item.update_time || item.updateTime),
    created: parseTime(item.t || item.update_time || item.updateTime),
    thumb: item.u || item.thumb_url || item.thumbURL || "",
    sign: "",
    type: dir ? 1 : 0,
    hashinfo: item.sha || item.sha1 || "",
    hash_info: (item.sha || item.sha1) ? { sha1: item.sha || item.sha1 } : {},
    id: itemId(item),
    raw_url: dir ? "" : rawDownloadUrl(storage, relPath),
    provider: "115 Share",
    file: item,
  };
};

const listByParent = async (client, storage, parentId) => {
  const id = parentId || rootId(storage.addition_json);
  return cache.list(storage, id, async () => {
    await waitLimit(storage);
    const addition = storage.addition_json;
    const limit = pageSize(addition);
    const result = [];
    for (let offset = 0; ; offset += limit) {
      const resp = await requestJson(client, storage, API_SHARE_SNAP, {
        headers: { referer: shareReferer(addition), "User-Agent": UA_NT },
        query: {
          share_code: shareCode(addition),
          receive_code: receiveCode(addition),
          cid: id,
          limit,
          asc: 0,
          offset,
          format: "json",
        },
      });
      const data = resp.data || {};
      const list = data.list || [];
      result.push(...list);
      if (result.length >= Number(data.count || result.length) || list.length === 0) break;
    }
    return result;
  });
};

const resolveFile = async (client, storage, relPath) => {
  const clean = normalizePath(relPath || "/");
  return cache.file(storage, clean, async () => {
    if (clean === "/") {
      return {
        cid: rootId(storage.addition_json),
        n: "root",
        is_file: 0,
      };
    }
    let parentId = rootId(storage.addition_json);
    let current = null;
    for (const part of clean.split("/").filter(Boolean)) {
      const files = await listByParent(client, storage, parentId);
      current = files.find((item) => itemName(item) === part);
      if (!current) throw new Error(`object not found: ${clean}`);
      parentId = itemId(current);
    }
    return current;
  });
};

export const create115ShareDriver = ({ client }) => ({
  async test(storage, verify) {
    let data;
    if (verify?.type === "qrcode" || (!cookieHeader(storage.addition_json) && !additionValue(storage.addition_json, "qrcode_token", "QRCodeToken"))) {
      data = await run115QrLogin(client, storage);
    } else {
      data = await ensureLogin(client, storage);
    }
    return {
      addition: storage.addition_json,
      message: data?.data?.user_id ? `115 user ${data.data.user_id}` : "115 share login ok",
      user: data?.data || {},
    };
  },

  async list(storage, relPath) {
    await ensureLogin(client, storage);
    const dir = await resolveFile(client, storage, relPath);
    const content = (await listByParent(client, storage, itemId(dir)))
      .map((file) => fileToObj(file, normalizePath(relPath + "/" + itemName(file)), storage));
    return {
      content,
      direct_upload_tools: [],
      header: "",
      provider: "115 Share",
      readme: "",
      total: content.length,
      write: false,
    };
  },

  async get(storage, relPath) {
    await ensureLogin(client, storage);
    const file = await resolveFile(client, storage, relPath);
    return {
      ...fileToObj(file, relPath, storage),
      readme: "",
      header: "",
      related: [],
    };
  },

  async read(storage, relPath, options = {}) {
    await ensureLogin(client, storage);
    await waitLimit(storage);
    const file = await resolveFile(client, storage, relPath);
    if (isDir(file)) throw new Error("not file");
    const userAgent = options.userAgent || options.headers?.["User-Agent"] || UA;
    const resp = await requestJson(client, storage, API_SHARE_DOWNLOAD, {
      headers: { referer: shareReferer(storage.addition_json), "User-Agent": userAgent },
      query: {
        share_code: shareCode(storage.addition_json),
        receive_code: receiveCode(storage.addition_json),
        file_id: itemId(file),
        dl: 1,
      },
    });
    const info = resp.data || {};
    if (!info?.url?.url) throw new Error("115 Share download url is empty");
    return {
      link: {
        url: info.url.url,
        header: { "User-Agent": userAgent },
        content_length: Number(info.fs || info.file_size || file.s || file.size || 0),
      },
    };
  },

  async mkdir() {
    throw new Error("115 Share mkdir is not supported by the OpenList driver");
  },

  async move() {
    throw new Error("115 Share move is not supported by the OpenList driver");
  },

  async copy() {
    throw new Error("115 Share copy is not supported by the OpenList driver");
  },

  async remove() {
    throw new Error("115 Share remove is not supported by the OpenList driver");
  },

  async rename() {
    throw new Error("115 Share rename is not supported by the OpenList driver");
  },

  async put() {
    throw new Error("115 Share upload is not supported by the OpenList driver");
  },
});
