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

const API_URL = "https://api.cloud.189.cn";
const TV_APP_KEY = "600100885";
const TV_APP_SIGNATURE_SECRET = "fe5734c74c2f96a38157f420b32dc995";

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
const tvClientSuffix = () => ({
  clientType: "FAMILY_TV",
  version: "6.5.5",
  channelId: "home02",
  clientSn: "unknown",
  model: "PJX110",
  osFamily: "Android",
  osVersion: "35",
  networkAccessMode: "WIFI",
  telecomsOperator: "46011",
});
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

const remote189Json = async (client, url, options) => {
  const data = await forwardProxy(client, url, options);
  return parse189Json(data.body, url);
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

const requestTvAppKeyJson = async (client, url, query = {}) => {
  const target = new URL(url);
  for (const [key, value] of Object.entries({ ...tvClientSuffix(), ...query })) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  }
  const tempTime = timestamp();
  const signText = `AppKey=${TV_APP_KEY}&Operate=GET&RequestURI=${pathOfUrl(url)}&Timestamp=${tempTime}`;
  const resp = await remote189Json(client, target.toString(), {
    allowErrorStatus: true,
    headers: {
      Accept: "application/json;charset=UTF-8",
      AppKey: TV_APP_KEY,
      AppSignature: hmacSha1Hex(TV_APP_SIGNATURE_SECRET, signText),
      Timestamp: String(tempTime),
      "User-Agent": "EcloudTV/6.5.5 (PJX110; unknown; home02) Android/35",
      "X-Request-ID": `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
    method: "GET",
  });
  return checkResp(resp);
};

const jsonWithSignedQuery = async (client, url, {
  addition,
  body,
  isFamily = false,
  method = "GET",
  mode,
  query = {},
  responseEncoding = "text",
} = {}) => {
  const target = new URL(url);
  const suffix = mode === "tv"
    ? tvClientSuffix()
    : {
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
  if (!sessionKey || !sessionSecret) throw new Error(`${mode === "tv" ? "189CloudTV" : "189CloudPC"} requires access_token plus sessionKey/sessionSecret fields. Re-save after upstream login/session migration or import an OpenList-compatible session addition.`);
  const date = httpDate();
  const signText = `SessionKey=${sessionKey}&Operate=${method}&RequestURI=${pathOfUrl(url)}&Date=${date}`;
  const headers = {
    Accept: "application/json;charset=UTF-8",
    Date: date,
    SessionKey: sessionKey,
    Signature: hmacSha1Hex(sessionSecret, signText),
    "User-Agent": mode === "tv" ? "EcloudTV/6.5.5 (PJX110; unknown; home02) Android/35" : "Mozilla/5.0",
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

export const refreshPcSession = async (client, storage) => {
  const addition = storage.addition_json;
  const accessToken = addition.access_token || addition.AccessToken;
  if (!accessToken) throw new Error("189CloudPC access_token is empty; password/qrcode login is not implemented in the SiYuan kernel port yet");
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
  return addition;
};

export const refreshTvSession = async (client, storage) => {
  const addition = storage.addition_json;
  normalize189SessionAddition(addition);
  const accessToken = addition.access_token || addition.AccessToken;
  if (!accessToken) throw new Error("189CloudTV access_token is empty; QR-code login is required");
  const url = `${API_URL}/family/manage/loginFamilyMerge.action`;
  const resp = await requestTvAppKeyJson(client, url, {
    e189AccessToken: accessToken,
  });
  addition.sessionKey = resp.sessionKey;
  addition.sessionSecret = resp.sessionSecret;
  addition.familySessionKey = resp.familySessionKey;
  addition.familySessionSecret = resp.familySessionSecret;
  addition.loginName = resp.loginName;
  if (familyMode(addition) && !familyId(addition)) {
    const familyResp = await jsonWithSignedQuery(client, `${API_URL}/family/manage/getFamilyList.action`, {
      addition,
      isFamily: true,
      mode: "tv",
    });
    const families = Array.isArray(familyResp.familyInfoResp) ? familyResp.familyInfoResp : [];
    const matched = families.find((item) => addition.loginName && String(item.remarkName || "").includes(addition.loginName))
      || families.find((item) => addition.loginName && String(addition.loginName).includes(item.remarkName || "\0"))
      || families[0];
    if (matched?.familyId !== undefined && matched?.familyId !== null) addition.family_id = String(matched.familyId);
  }
  await persistAddition(storage);
  return addition;
};

const loginTvByQrCode = async (client, storage) => {
  const addition = storage.addition_json;
  if (!addition.access_token && !addition.AccessToken) {
    const tempUuid = addition.temp_uuid || addition.TempUuid;
    if (!tempUuid) {
      const resp = await requestTvAppKeyJson(client, `${API_URL}/family/manage/getQrCodeUUID.action`);
      if (!resp.uuid) throw new Error("uuidInfo is empty");
      addition.temp_uuid = resp.uuid;
      await persistAddition(storage);
      throw new Error(`need verify: \n<body>\n    <a href="${resp.uuid}">${resp.uuid}</a>\n</body>`);
    }
    const resp = await requestTvAppKeyJson(client, `${API_URL}/family/manage/qrcodeLoginResult.action`, {
      uuid: tempUuid,
    });
    const accessToken = resp.accessToken || resp.e189AccessToken;
    if (!accessToken) throw new Error("E189AccessToken is empty");
    addition.access_token = accessToken;
    delete addition.AccessToken;
    delete addition.temp_uuid;
    delete addition.TempUuid;
  }
  return refreshTvSession(client, storage);
};

const ensureSession = async (client, storage, mode) => {
  const addition = storage.addition_json;
  if (addition.sessionKey && addition.sessionSecret) return addition;
  return mode === "tv" ? refreshTvSession(client, storage) : refreshPcSession(client, storage);
};

const request189Session = async (client, storage, url, opts = {}) => {
  const addition = await ensureSession(client, storage, opts.mode);
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

const listByParent = async (client, storage, parentId, mode) => {
  const addition = storage.addition_json;
  const isFamily = familyMode(addition);
  const url = `${API_URL}${isFamily ? "/family/file" : ""}/listFiles.action`;
  const result = [];
  const pageSize = mode === "tv" ? 130 : 1000;
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
    const resp = await request189Session(client, storage, url, { isFamily, mode, query });
    const list = resp.fileListAO || {};
    for (const folder of list.folderList || []) result.push({ ...folder, is_dir: true });
    for (const file of list.fileList || []) result.push({ ...file, is_dir: false });
    if (!list.count || (!(list.folderList || []).length && !(list.fileList || []).length)) break;
  }
  return result;
};

const resolveFile = async (client, storage, relPath, mode) => {
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
    const files = await listByParent(client, storage, parentId, mode);
    current = files.find((item) => item.name === part);
    if (!current) throw new Error(`object not found: ${clean}`);
    parentId = String(current.id || "");
  }
  return current;
};

const linkFor = async (client, storage, file, mode) => {
  const addition = storage.addition_json;
  const isFamily = familyMode(addition);
  const url = `${API_URL}${isFamily ? "/family/file" : ""}/getFileDownloadUrl.action`;
  const resp = await request189Session(client, storage, url, {
    isFamily,
    mode,
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

const batchTask = async (client, storage, mode, type, targetFolderId, files, other = {}) => {
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
    mode,
  });
};

export const create189SessionDriver = ({ client, mode, provider }) => ({
  async test(storage) {
    if (mode === "tv") await loginTvByQrCode(client, storage);
    else await refreshPcSession(client, storage);
    await request189Session(client, storage, `${API_URL}/getUserInfo.action`, { mode });
    return { addition: storage.addition_json };
  },

  async list(storage, relPath) {
    const parent = await resolveFile(client, storage, relPath, mode);
    const content = (await listByParent(client, storage, String(parent.id || ""), mode))
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
    const file = await resolveFile(client, storage, relPath, mode);
    const obj = fileToObj(file, relPath, storage, provider);
    if (!obj.is_dir && !options.skipLink) {
      const url = await linkFor(client, storage, file, mode);
      obj.raw_url = url;
      obj.url = url;
    }
    return { ...obj, readme: "", header: "", related: [] };
  },

  async read(storage, relPath, options = {}) {
    const file = await resolveFile(client, storage, relPath, mode);
    if (file.is_dir) throw new Error("not file");
    const url = await linkFor(client, storage, file, mode);
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
    const parent = await resolveFile(client, storage, dirnameOf(relPath), mode);
    await request189Session(client, storage, `${API_URL}${isFamily ? "/family/file" : ""}/createFolder.action`, {
      isFamily,
      method: "POST",
      mode,
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
    const file = await resolveFile(client, storage, relPath, mode);
    const dst = await resolveFile(client, storage, dstRelPath, mode);
    await batchTask(client, storage, mode, "MOVE", String(dst.id || ""), [file], { targetFileName: dst.name || "" });
  },

  async copy(storage, relPath, dstRelPath) {
    const file = await resolveFile(client, storage, relPath, mode);
    const dst = await resolveFile(client, storage, dstRelPath, mode);
    await batchTask(client, storage, mode, "COPY", String(dst.id || ""), [file], { targetFileName: dst.name || "" });
  },

  async remove(storage, relPath) {
    const file = await resolveFile(client, storage, relPath, mode);
    await batchTask(client, storage, mode, "DELETE", "", [file]);
  },

  async rename(storage, relPath, newName) {
    const addition = storage.addition_json;
    const isFamily = familyMode(addition);
    const file = await resolveFile(client, storage, relPath, mode);
    const isDir = !!file.is_dir;
    await request189Session(client, storage, `${API_URL}${isFamily ? "/family/file" : ""}/${isDir ? "renameFolder" : "renameFile"}.action`, {
      isFamily,
      method: isFamily ? "GET" : "POST",
      mode,
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
    const uploadType = mode === "tv" ? "old upload / rapid upload" : "stream / rapid / old upload";
    throw new Error(`${provider} ${uploadType} is not implemented in the SiYuan kernel port yet`);
  },
});
