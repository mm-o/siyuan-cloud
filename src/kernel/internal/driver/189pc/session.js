import { normalizePath } from "../../model/path.js";
import {
  basenameOf,
  dirnameOf,
  parseTime,
  persistAddition,
  rawDownloadUrl,
} from "../common.js";
import {
  forwardProxy,
} from "../http.js";
import {
  clearQrKeys,
  runQrLogin,
} from "../qr.js";

const API_URL = "https://api.cloud.189.cn";
const WEB_URL = "https://cloud.189.cn";
const AUTH_URL = "https://open.e.189.cn";
const PC_APP_ID = "8025431004";
const PC_CLIENT_TYPE = "10020";
const PC_RETURN_URL = "https://m.cloud.189.cn/zhuanti/2020/loginErrorPc/index.html";
const PC_QR_KEYS = [
  "qrcode_uuid",
  "qrcode_encryuuid",
  "qrcode_encodeuuid",
  "qrcode_lt",
  "qrcode_reqid",
  "qrcode_param_id",
  "qrcode_captcha_token",
  "qrcode_cookie",
];
const utf8 = (input) => unescape(encodeURIComponent(String(input)));
const bytes = (input) => {
  if (input instanceof Uint8Array) return input;
  const text = utf8(input);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i);
  return out;
};
const hex = (input) => Array.from(input, (b) => b.toString(16).padStart(2, "0")).join("");
const rol = (value, bits) => (value << bits) | (value >>> (32 - bits));

const sha1Bytes = (message) => {
  const msg = bytes(message);
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

const hmacSha1Hex = (key, message) => {
  let keyBytes = bytes(key);
  if (keyBytes.length > 64) keyBytes = sha1Bytes(keyBytes);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) {
    const b = keyBytes[i] || 0;
    ipad[i] = b ^ 0x36;
    opad[i] = b ^ 0x5c;
  }
  const msg = bytes(message);
  const inner = new Uint8Array(ipad.length + msg.length);
  inner.set(ipad);
  inner.set(msg, ipad.length);
  const outer = new Uint8Array(opad.length + 20);
  outer.set(opad);
  outer.set(sha1Bytes(inner), opad.length);
  return hex(sha1Bytes(outer)).toUpperCase();
};

const pathOfUrl = (url) => new URL(url).pathname || "/";
const httpDate = () => new Date().toUTCString();
const timestamp = () => Date.now();
const randomSuffix = () => `${Math.floor(Math.random() * 100000)}_${Math.floor(Math.random() * 10000000000)}`;
const formatPcQrDate = (date = new Date()) => {
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};
const toDesc = (order) => order === "desc" ? "true" : "false";
const toFamilyOrderBy = (order) => {
  if (order === "filesize") return "2";
  if (order === "lastOpTime") return "3";
  return "1";
};
const familyMode = (addition) => (addition.type || addition.Type || "personal") === "family";
const rootFolderId = (addition, isFamily) => {
  const value = addition.root_folder_id || addition.RootFolderID;
  if (isFamily && value === "-11") return "";
  if (value !== undefined && value !== null && value !== "") return String(value);
  return isFamily ? "" : "-11";
};
const familyId = (addition) => String(addition.family_id || addition.FamilyID || "");

const normalize189SessionAddition = (addition) => {
  if (familyMode(addition) && (addition.root_folder_id || addition.RootFolderID) === "-11") {
    addition.root_folder_id = "";
    delete addition.RootFolderID;
  }
  if (!familyMode(addition) && !(addition.root_folder_id || addition.RootFolderID)) {
    addition.root_folder_id = "-11";
    delete addition.RootFolderID;
  }
};

const checkResp = (payload) => {
  if (!payload || typeof payload !== "object") return payload;
  const resCode = payload.res_code ?? payload.resCode;
  if (resCode !== undefined && resCode !== null && resCode !== "" && Number(resCode) !== 0) {
    throw new Error(payload.res_message || payload.resMessage || `res_code: ${resCode}`);
  }
  if (payload.errorCode) throw new Error(payload.errorMsg || payload.errorCode);
  if (payload.code && payload.code !== "SUCCESS") throw new Error(payload.message || payload.msg || payload.code);
  if (payload.error) throw new Error(payload.message || payload.error);
  return payload;
};

const headerEntries = (headers = {}) => {
  if (Array.isArray(headers)) {
    return headers.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      return Object.entries(item);
    });
  }
  return Object.entries(headers || {});
};

const cookiePairs = (cookie) => String(cookie || "")
  .split(";")
  .map((item) => item.trim())
  .filter(Boolean)
  .filter((item) => item.includes("="));

const mergeCookies = (...cookies) => {
  const merged = new Map();
  for (const cookie of cookies) {
    for (const pair of cookiePairs(cookie)) {
      const index = pair.indexOf("=");
      const key = pair.slice(0, index).trim();
      if (!key) continue;
      merged.set(key, pair.slice(index + 1).trim());
    }
  }
  return Array.from(merged, ([key, value]) => `${key}=${value}`).join("; ");
};

const setCookieToCookie = (headers = {}) => {
  const values = [];
  for (const [key, value] of headerEntries(headers)) {
    if (String(key).toLowerCase() !== "set-cookie") continue;
    if (Array.isArray(value)) values.push(...value.map((item) => String(item || "")));
    else values.push(...String(value || "").split(/,(?=\s*[^;,=\s]+=[^;,]*)/));
  }
  return values
    .map((item) => item.trim().split(";")[0])
    .filter((item) => item.includes("="))
    .join("; ");
};

const rememberPcQrCookies = async (storage, response) => {
  const addition = storage.addition_json || {};
  const setCookie = setCookieToCookie(response?.headers);
  if (!setCookie) return;
  addition.qrcode_cookie = mergeCookies(addition.qrcode_cookie || "", setCookie);
  await persistAddition(storage);
};

const parse189Json = (text, url) => {
  const safe = String(text || "{}").replace(
    /"((?:id|parentId|familyId|fileId|folderId|targetFolderId|uploadFileId|userFileId|operId|srcFileOwnerId|taskId))"\s*:\s*(-?\d{15,})/gi,
    (_, key, value) => `"${key}":"${value}"`,
  );
  try {
    return JSON.parse(safe);
  } catch (error) {
    throw new Error(`invalid JSON response from ${url}: ${error.message}`);
  }
};

const remote189Json = async (client, url, options = {}) => {
  const data = await forwardProxy(client, url, options);
  if (options.rememberPcCookies) await rememberPcQrCookies(options.storage, data);
  return parse189Json(data.body, url);
};

const remote189Text = async (client, storage, url, options = {}) => {
  const data = await forwardProxy(client, url, {
    allowErrorStatus: true,
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Cookie: storage?.addition_json?.qrcode_cookie || "",
      Referer: WEB_URL,
      "User-Agent": "Mozilla/5.0",
      ...(options.headers || {}),
    },
    method: "GET",
    responseEncoding: "text",
    ...options,
  });
  if (storage) await rememberPcQrCookies(storage, data);
  return String(data.body || "");
};

const headerValue = (headers = {}, name) => {
  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  return "";
};

const resolveRedirect = async (client, url) => {
  const resp = await forwardProxy(client, url, {
    allowErrorStatus: true,
    headers: { "User-Agent": "Mozilla/5.0" },
    method: "GET",
    redirect: false,
    responseEncoding: "text",
  });
  return headerValue(resp.headers, "location") || url;
};

const jsonWithSignedQuery = async (client, url, {
  addition,
  body,
  isFamily = false,
  method = "GET",
  query = {},
  responseEncoding = "text",
} = {}) => {
  const target = new URL(url);
  const suffix = {
    clientType: "TELEPC",
    version: "6.2",
    channelId: "web_cloud.189.cn",
    rand: randomSuffix(),
  };
  for (const [key, value] of Object.entries({ ...suffix, ...query })) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  }
  const sessionKey = isFamily ? addition.familySessionKey : addition.sessionKey;
  const sessionSecret = isFamily ? addition.familySessionSecret : addition.sessionSecret;
  if (!sessionKey || !sessionSecret) throw new Error("189CloudPC requires access_token plus sessionKey/sessionSecret fields. Re-save after upstream login/session migration or import an OpenList-compatible session addition.");
  const date = httpDate();
  const signText = `SessionKey=${sessionKey}&Operate=${method}&RequestURI=${pathOfUrl(url)}&Date=${date}`;
  const headers = {
    Accept: "application/json;charset=UTF-8",
    Date: date,
    SessionKey: sessionKey,
    Signature: hmacSha1Hex(sessionSecret, signText),
    "User-Agent": "Mozilla/5.0",
    "X-Request-ID": `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
  const resp = await remote189Json(client, target.toString(), {
    allowErrorStatus: true,
    body,
    contentType: "application/x-www-form-urlencoded",
    headers,
    method,
    responseEncoding,
  });
  return checkResp(resp);
};

const fillPcFamilyId = async (client, storage) => {
  const addition = storage.addition_json;
  normalize189SessionAddition(addition);
  if (!familyMode(addition) || familyId(addition)) return addition;
  const familyResp = await jsonWithSignedQuery(client, `${API_URL}/family/manage/getFamilyList.action`, {
    addition,
    isFamily: true,
  });
  const families = Array.isArray(familyResp.familyInfoResp) ? familyResp.familyInfoResp : [];
  const matched = families.find((item) => addition.loginName && String(item.remarkName || "").includes(addition.loginName))
    || families.find((item) => addition.loginName && String(addition.loginName).includes(item.remarkName || "\0"))
    || families[0];
  if (matched?.familyId !== undefined && matched?.familyId !== null) addition.family_id = String(matched.familyId);
  await persistAddition(storage);
  return addition;
};

const extractPcBaseParams = (html) => {
  const pick = (patterns, name) => {
    for (const pattern of patterns) {
      const match = String(html || "").match(pattern);
      if (match?.[1]) return match[1];
    }
    throw new Error(`189CloudPC login page missing ${name}`);
  };
  return {
    captchaToken: pick([/'captchaToken'\s+value='(.+?)'/i, /captchaToken["']?\s*[:=]\s*["']([^"']+)/i], "captchaToken"),
    lt: pick([/lt\s*=\s*"(.+?)"/i, /["']lt["']\s*[:=]\s*["']([^"']+)/i], "lt"),
    paramId: pick([/paramId\s*=\s*"(.+?)"/i, /["']paramId["']\s*[:=]\s*["']([^"']+)/i], "paramId"),
    reqId: pick([/reqId\s*=\s*"(.+?)"/i, /["']reqId["']\s*[:=]\s*["']([^"']+)/i], "reqId"),
  };
};

const initPcBaseParams = async (client, storage) => {
  const target = new URL(`${WEB_URL}/api/portal/unifyLoginForPC.action`);
  target.searchParams.set("appId", PC_APP_ID);
  target.searchParams.set("clientType", PC_CLIENT_TYPE);
  target.searchParams.set("returnURL", PC_RETURN_URL);
  target.searchParams.set("timeStamp", String(timestamp()));
  storage.addition_json.qrcode_cookie = "";
  return extractPcBaseParams(await remote189Text(client, storage, target.toString()));
};

const savePcSession = async (storage, tokenInfo) => {
  const addition = storage.addition_json;
  normalize189SessionAddition(addition);
  addition.access_token = tokenInfo.accessToken || tokenInfo.AccessToken || tokenInfo.access_token || addition.access_token || "";
  addition.refresh_token = tokenInfo.refreshToken || tokenInfo.RefreshToken || tokenInfo.refresh_token || addition.refresh_token || "";
  addition.sessionKey = tokenInfo.sessionKey || addition.sessionKey || "";
  addition.sessionSecret = tokenInfo.sessionSecret || addition.sessionSecret || "";
  addition.familySessionKey = tokenInfo.familySessionKey || addition.familySessionKey || "";
  addition.familySessionSecret = tokenInfo.familySessionSecret || addition.familySessionSecret || "";
  addition.loginName = tokenInfo.loginName || addition.loginName || "";
  delete addition.AccessToken;
  delete addition.RefreshToken;
  await persistAddition(storage);
  return addition;
};

const getPcSessionByRedirect = async (client, storage, redirectUrl) => {
  if (!redirectUrl) throw new Error("189CloudPC QR login missing redirect URL");
  const target = new URL(`${API_URL}/getSessionForPC.action`);
  for (const [key, value] of Object.entries({
    appId: PC_APP_ID,
    clientType: "TELEPC",
    version: "6.2",
    channelId: "web_cloud.189.cn",
    rand: randomSuffix(),
    redirectURL: redirectUrl,
  })) target.searchParams.set(key, String(value));
  const tokenInfo = checkResp(await remote189Json(client, target.toString(), {
    allowErrorStatus: true,
    headers: {
      Accept: "application/json;charset=UTF-8",
      Cookie: storage.addition_json.qrcode_cookie || "",
      "User-Agent": "Mozilla/5.0",
      "X-Request-ID": `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
    method: "POST",
    rememberPcCookies: true,
    storage,
  }));
  if (Number(tokenInfo.res_code || tokenInfo.resCode || 0) !== 0) throw new Error(tokenInfo.res_message || tokenInfo.resMessage || "189CloudPC getSessionForPC failed");
  await savePcSession(storage, tokenInfo);
  return fillPcFamilyId(client, storage);
};

const startPcQrLogin = async (client, storage) => {
  const addition = storage.addition_json;
  const baseParams = await initPcBaseParams(client, storage);
  const resp = checkResp(await remote189Json(client, `${AUTH_URL}/api/logbox/oauth2/getUUID.do`, {
    allowErrorStatus: true,
    body: formBody({ appId: PC_APP_ID }),
    contentType: "application/x-www-form-urlencoded",
    headers: {
      Accept: "application/json;charset=UTF-8",
      Cookie: addition.qrcode_cookie || "",
      Referer: AUTH_URL,
      "User-Agent": "Mozilla/5.0",
    },
    method: "POST",
    rememberPcCookies: true,
    storage,
  }));
  const uuid = resp.uuid || resp.UUID;
  if (!uuid) throw new Error("189CloudPC QR login response missing uuid");
  addition.qrcode_uuid = uuid;
  addition.qrcode_encryuuid = resp.encryuuid || resp.EncryUUID || "";
  addition.qrcode_encodeuuid = resp.encodeuuid || resp.EncodeUUID || "";
  addition.qrcode_lt = baseParams.lt;
  addition.qrcode_reqid = baseParams.reqId;
  addition.qrcode_param_id = baseParams.paramId;
  addition.qrcode_captcha_token = baseParams.captchaToken;
  addition.access_token = "";
  addition.refresh_token = "";
  await persistAddition(storage);
  return {
    message: "请使用天翼云盘 App 扫码登录，然后再次点击验证/保存。",
    status: "waiting",
    verify: { qr_text: uuid },
  };
};

const pollPcQrLogin = async (client, storage) => {
  const addition = storage.addition_json;
  const now = new Date();
  const state = checkResp(await remote189Json(client, `${AUTH_URL}/api/logbox/oauth2/qrcodeLoginState.do`, {
    allowErrorStatus: true,
    body: formBody({
      appId: PC_APP_ID,
      clientType: PC_CLIENT_TYPE,
      returnUrl: PC_RETURN_URL,
      paramId: addition.qrcode_param_id,
      uuid: addition.qrcode_uuid,
      encryuuid: addition.qrcode_encryuuid,
      date: formatPcQrDate(now),
      timeStamp: String(now.getTime()),
    }),
    contentType: "application/x-www-form-urlencoded",
    headers: {
      Accept: "application/json;charset=UTF-8",
      Cookie: addition.qrcode_cookie || "",
      Referer: AUTH_URL,
      Reqid: addition.qrcode_reqid || "",
      lt: addition.qrcode_lt || "",
      "User-Agent": "Mozilla/5.0",
    },
    method: "POST",
    rememberPcCookies: true,
    storage,
  }));
  const status = Number(state.status);
  if (status === 0) return { message: "189CloudPC QR login confirmed", redirectUrl: state.redirectUrl || state.redirectURL, status: "success" };
  if (status === -11001) return { message: "189CloudPC QR code expired, please refresh it", status: "expired" };
  return {
    message: state.msg || (status === -11002 ? "189CloudPC QR code scanned; confirm login on your phone" : "189CloudPC QR login pending"),
    status: status === -11002 ? "scanned" : "waiting",
  };
};

const runPcQrLogin = (client, storage) => runQrLogin({
  addition: storage.addition_json,
  clear: () => {
    clearQrKeys(storage.addition_json, PC_QR_KEYS);
    return persistAddition(storage);
  },
  confirm: async (state) => {
    await getPcSessionByRedirect(client, storage, state.redirectUrl);
    return storage.addition_json;
  },
  hasSession: (addition) => Boolean(addition.qrcode_uuid),
  pendingVerify: () => ({ qr_text: storage.addition_json.qrcode_uuid || "" }),
  poll: () => pollPcQrLogin(client, storage),
  start: () => startPcQrLogin(client, storage),
});

const loginPcByQrCode = async (client, storage) => (
  storage.addition_json.access_token || storage.addition_json.AccessToken
    ? refreshPcSession(client, storage)
    : runPcQrLogin(client, storage)
);

export const refreshPcSession = async (client, storage) => {
  const addition = storage.addition_json;
  normalize189SessionAddition(addition);
  const accessToken = addition.access_token || addition.AccessToken;
  if (!accessToken) throw new Error("189CloudPC access_token is empty; set login_type=qrcode to scan with the Tianyi Cloud app, or import an existing access_token/session");
  const url = new URL(`${API_URL}/getSessionForPC.action`);
  url.searchParams.set("clientType", "TELEPC");
  url.searchParams.set("version", "6.2");
  url.searchParams.set("channelId", "web_cloud.189.cn");
  url.searchParams.set("rand", randomSuffix());
  url.searchParams.set("appId", "8025431004");
  url.searchParams.set("accessToken", accessToken);
  const resp = checkResp(await remote189Json(client, url.toString(), {
    allowErrorStatus: true,
    headers: { "X-Request-ID": `${Date.now()}-${Math.random().toString(16).slice(2)}` },
    method: "GET",
  }));
  addition.sessionKey = resp.sessionKey;
  addition.sessionSecret = resp.sessionSecret;
  addition.familySessionKey = resp.familySessionKey;
  addition.familySessionSecret = resp.familySessionSecret;
  addition.loginName = resp.loginName;
  await persistAddition(storage);
  return fillPcFamilyId(client, storage);
};

const ensureSession = async (client, storage) => {
  const addition = storage.addition_json;
  if (addition.sessionKey && addition.sessionSecret) return addition;
  return refreshPcSession(client, storage);
};

const request189Session = async (client, storage, url, opts = {}) => {
  const addition = await ensureSession(client, storage);
  return jsonWithSignedQuery(client, url, { ...opts, addition });
};

const fileToObj = (file, relPath, storage, provider) => {
  const isDir = !!file.is_dir;
  return {
    name: file.name || basenameOf(relPath),
    path: normalizePath(relPath),
    is_dir: isDir,
    size: Number(file.size || 0),
    modified: parseTime(file.lastOpTime || file.createDate),
    created: parseTime(file.createDate || file.lastOpTime),
    sign: "",
    thumb: file.icon?.smallUrl || file.smallUrl || "",
    type: isDir ? 1 : 0,
    hashinfo: file.md5 || file.Md5 || "",
    hash_info: file.md5 ? { md5: file.md5 } : {},
    id: String(file.id || ""),
    raw_url: isDir ? "" : rawDownloadUrl(storage, relPath),
    provider,
    file: { ...file, is_dir: isDir },
  };
};

const listByParent = async (client, storage, parentId) => {
  const addition = storage.addition_json;
  const isFamily = familyMode(addition);
  const url = `${API_URL}${isFamily ? "/family/file" : ""}/listFiles.action`;
  const result = [];
  const pageSize = 1000;
  for (let pageNum = 1;; pageNum += 1) {
    const query = {
      folderId: parentId,
      fileType: "0",
      mediaAttr: "0",
      iconOption: "5",
      pageNum,
      pageSize,
      recursive: isFamily ? undefined : "0",
      orderBy: isFamily ? toFamilyOrderBy(addition.order_by || addition.OrderBy || "filename") : (addition.order_by || addition.OrderBy || "filename"),
      descending: toDesc(addition.order_direction || addition.OrderDirection || "asc"),
      familyId: isFamily ? familyId(addition) : undefined,
    };
    const resp = await request189Session(client, storage, url, { isFamily, query });
    const list = resp.fileListAO || {};
    for (const folder of list.folderList || []) result.push({ ...folder, is_dir: true });
    for (const file of list.fileList || []) result.push({ ...file, is_dir: false });
    if (!list.count || (!(list.folderList || []).length && !(list.fileList || []).length)) break;
  }
  return result;
};

const resolveFile = async (client, storage, relPath) => {
  const addition = storage.addition_json;
  const isFamily = familyMode(addition);
  const clean = normalizePath(relPath || "/");
  if (clean === "/") {
    return {
      id: rootFolderId(addition, isFamily),
      name: "root",
      is_dir: true,
      path: "/",
    };
  }
  let parentId = rootFolderId(addition, isFamily);
  let current = null;
  for (const part of clean.split("/").filter(Boolean)) {
    const files = await listByParent(client, storage, parentId);
    current = files.find((item) => item.name === part);
    if (!current) throw new Error(`object not found: ${clean}`);
    parentId = String(current.id || "");
  }
  return current;
};

const linkFor = async (client, storage, file) => {
  const addition = storage.addition_json;
  const isFamily = familyMode(addition);
  const url = `${API_URL}${isFamily ? "/family/file" : ""}/getFileDownloadUrl.action`;
  const resp = await request189Session(client, storage, url, {
    isFamily,
    query: {
      fileId: file.id,
      familyId: isFamily ? familyId(addition) : undefined,
      dt: isFamily ? undefined : "3",
      flag: isFamily ? undefined : "1",
    },
  });
  let downloadUrl = resp.fileDownloadUrl || resp.downloadUrl || "";
  if (!downloadUrl) throw new Error("get download url failed");
  if (downloadUrl.startsWith("//")) downloadUrl = "https:" + downloadUrl;
  downloadUrl = downloadUrl.replace(/&amp;/g, "&").replace(/^http:\/\//, "https://");
  return (await resolveRedirect(client, downloadUrl)).replace(/^http:\/\//, "https://");
};

const formBody = (data) => new URLSearchParams(
  Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]),
).toString();

const batchTask = async (client, storage, type, targetFolderId, files, other = {}) => {
  const addition = storage.addition_json;
  const isFamily = familyMode(addition);
  const taskInfos = files.map((file) => ({
    fileId: String(file.id || ""),
    fileName: file.name || "",
    isFolder: file.is_dir ? 1 : 0,
  }));
  await request189Session(client, storage, `${API_URL}/batch/createBatchTask.action`, {
    body: formBody({
      type,
      targetFolderId,
      familyId: isFamily ? familyId(addition) : undefined,
      taskInfos,
      ...other,
    }),
    isFamily,
    method: "POST",
  });
};

export const create189SessionDriver = ({ client, provider }) => ({
  async test(storage) {
    if ((storage.addition_json.login_type || storage.addition_json.LoginType) === "qrcode") await loginPcByQrCode(client, storage);
    else await refreshPcSession(client, storage);
    await request189Session(client, storage, `${API_URL}/getUserInfo.action`);
    return { addition: storage.addition_json };
  },

  async list(storage, relPath) {
    const parent = await resolveFile(client, storage, relPath);
    const content = (await listByParent(client, storage, String(parent.id || "")))
      .map((file) => fileToObj(file, normalizePath(relPath + "/" + file.name), storage, provider));
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider,
      direct_upload_tools: [],
    };
  },

  async get(storage, relPath, options = {}) {
    const file = await resolveFile(client, storage, relPath);
    const obj = fileToObj(file, relPath, storage, provider);
    if (!obj.is_dir && !options.skipLink) {
      const url = await linkFor(client, storage, file);
      obj.raw_url = url;
      obj.url = url;
    }
    return { ...obj, readme: "", header: "", related: [] };
  },

  async read(storage, relPath, options = {}) {
    const file = await resolveFile(client, storage, relPath);
    if (file.is_dir) throw new Error("not file");
    const url = await linkFor(client, storage, file);
    return {
      link: {
        url,
        header: { "User-Agent": "Mozilla/5.0", ...(options.proxyHeaders || options.headers || {}) },
        content_length: Number(file.size || 0),
      },
    };
  },

  async mkdir(storage, relPath) {
    const addition = storage.addition_json;
    const isFamily = familyMode(addition);
    const parent = await resolveFile(client, storage, dirnameOf(relPath));
    await request189Session(client, storage, `${API_URL}${isFamily ? "/family/file" : ""}/createFolder.action`, {
      isFamily,
      method: "POST",
      query: {
        familyId: isFamily ? familyId(addition) : undefined,
        parentId: isFamily ? String(parent.id || "") : undefined,
        parentFolderId: isFamily ? undefined : String(parent.id || ""),
        folderName: basenameOf(relPath),
        relativePath: "",
      },
    });
  },

  async move(storage, relPath, dstRelPath) {
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await batchTask(client, storage, "MOVE", String(dst.id || ""), [file], { targetFileName: dst.name || "" });
  },

  async copy(storage, relPath, dstRelPath) {
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await batchTask(client, storage, "COPY", String(dst.id || ""), [file], { targetFileName: dst.name || "" });
  },

  async remove(storage, relPath) {
    const file = await resolveFile(client, storage, relPath);
    await batchTask(client, storage, "DELETE", "", [file]);
  },

  async rename(storage, relPath, newName) {
    const addition = storage.addition_json;
    const isFamily = familyMode(addition);
    const file = await resolveFile(client, storage, relPath);
    const isDir = !!file.is_dir;
    await request189Session(client, storage, `${API_URL}${isFamily ? "/family/file" : ""}/${isDir ? "renameFolder" : "renameFile"}.action`, {
      isFamily,
      method: isFamily ? "GET" : "POST",
      query: {
        familyId: isFamily ? familyId(addition) : undefined,
        folderId: isDir ? String(file.id || "") : undefined,
        fileId: isDir ? undefined : String(file.id || ""),
        destFolderName: isDir ? newName : undefined,
        destFileName: isDir ? undefined : newName,
      },
    });
  },

  async put() {
    throw new Error(`${provider} stream / rapid / old upload is not implemented in the SiYuan kernel port yet`);
  },
});
