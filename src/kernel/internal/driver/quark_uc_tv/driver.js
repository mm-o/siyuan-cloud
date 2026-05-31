import { normalizePath } from "../../model/path.js";
import {
  basenameOf,
  boolValue,
  createStorageCache,
  parseTime,
  persistAddition,
} from "../common.js";
import { sha256Hex } from "../aws4.js";
import { remoteJson } from "../http.js";

const UserAgent = "Mozilla/5.0 (Linux; U; Android 13; zh-cn; M2004J7AC Build/UKQ1.231108.001) AppleWebKit/533.1 (KHTML, like Gecko) Mobile Safari/533.1";
const DeviceBrand = "Xiaomi";
const Platform = "tv";
const DeviceName = "M2004J7AC";
const DeviceModel = "M2004J7AC";
const BuildDevice = "M2004J7AC";
const BuildProduct = "M2004J7AC";
const DeviceGpu = "Adreno (TM) 550";
const ActivityRect = "{}";
const accessTokenCache = new Map();
const cache = createStorageCache();

const configs = {
  QuarkTV: {
    api: "https://open-api-drive.quark.cn",
    clientID: "d3194e61504e493eb6222857bccfed94",
    signKey: "kw2dvtd7p4t3pjl2d9ed9yc8yej8kw2d",
    appVer: "1.8.2.2",
    channel: "GENERAL",
    codeApi: "http://api.extscreen.com/quarkdrive",
  },
  UCTV: {
    api: "https://open-api-drive.uc.cn",
    clientID: "5acf882d27b74502b7040b0c65519aa7",
    signKey: "l3srvtd7p42l0d0x1u8d7yc8ye9kki4d",
    appVer: "1.7.2.2",
    channel: "UCTVOFFICIALWEB",
    codeApi: "http://api.extscreen.com/ucdrive",
  },
};

const confFor = (storage) => configs[storage.driver] || configs.QuarkTV;
const storageKey = (storage) => `${storage.driver || "QuarkTV"}:${storage.id || storage.mount_path || ""}`;
const accessTokenFor = (storage) => accessTokenCache.get(storageKey(storage)) || storage.addition_json.access_token || "";

const checkQuarkTV = (payload) => {
  if (Number(payload?.status || 0) >= 400 || Number(payload?.errno || 0) !== 0) {
    throw new Error(payload?.error_info || payload?.message || "quark tv request failed");
  }
  return payload;
};

const ensureDeviceID = async (storage) => {
  if (!storage.addition_json.device_id) {
    storage.addition_json.device_id = sha256Hex(String(Date.now())).slice(0, 32);
    await persistAddition(storage);
  }
  return storage.addition_json.device_id;
};

const generateReqSign = async (storage, method, pathname, signKey) => {
  const timestamp = String(Date.now());
  const deviceID = await ensureDeviceID(storage);
  return {
    req_id: sha256Hex(`${deviceID}${timestamp}`).slice(0, 32),
    tm: timestamp,
    token: sha256Hex(`${method.toUpperCase()}&${pathname}&${timestamp}&${signKey || ""}`),
  };
};

const commonQuery = (storage, conf, sign) => ({
  req_id: sign.req_id,
  access_token: accessTokenFor(storage),
  app_ver: conf.appVer,
  device_id: storage.addition_json.device_id || "",
  device_brand: DeviceBrand,
  platform: Platform,
  device_name: DeviceName,
  device_model: DeviceModel,
  build_device: BuildDevice,
  build_product: BuildProduct,
  device_gpu: DeviceGpu,
  activity_rect: ActivityRect,
  channel: conf.channel,
});

const refreshTokenByTV = async (client, storage, code, isRefresh) => {
  const conf = confFor(storage);
  const sign = await generateReqSign(storage, "POST", "/token", conf.signKey);
  const body = {
    ...commonQuery(storage, conf, sign),
  };
  delete body.access_token;
  if (isRefresh) body.refresh_token = code;
  else body.code = code;
  const resp = await remoteJson(client, `${conf.codeApi}/token`, {
    body,
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (Number(resp?.code || 0) !== 200) throw new Error(resp?.message || "refresh token failed");
  const data = resp?.data || {};
  if (!data.refresh_token) throw new Error("refresh token is empty");
  storage.addition_json.refresh_token = data.refresh_token;
  accessTokenCache.set(storageKey(storage), data.access_token || "");
  await persistAddition(storage);
};

const requestQuarkTV = async (client, storage, pathname, {
  method = "GET",
  query = {},
  retry = true,
} = {}) => {
  const conf = confFor(storage);
  const sign = await generateReqSign(storage, method, pathname, conf.signKey);
  const target = new URL(`${conf.api}${pathname}`);
  const mergedQuery = {
    ...commonQuery(storage, conf, sign),
    ...query,
  };
  for (const [key, value] of Object.entries(mergedQuery)) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  }
  const resp = await remoteJson(client, target.toString(), {
    allowErrorStatus: true,
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": UserAgent,
      "x-pan-client-id": conf.clientID,
      "x-pan-tm": sign.tm,
      "x-pan-token": sign.token,
    },
    method,
  });
  const errInfo = String(resp?.error_info || "").toLowerCase();
  const maybeTokenInvalid = (
    Number(resp?.status || 0) === -1 && [10001, 11001].includes(Number(resp?.errno || 0))
  ) || (errInfo && (errInfo.includes("access token") || errInfo.includes("access_token") || errInfo.includes("token")));
  if (maybeTokenInvalid && retry) {
    await refreshTokenByTV(client, storage, storage.addition_json.refresh_token, true);
    return requestQuarkTV(client, storage, pathname, { method, query, retry: false });
  }
  return checkQuarkTV(resp);
};

const getLoginCode = async (client, storage) => {
  const conf = confFor(storage);
  const resp = await requestQuarkTV(client, storage, "/oauth/authorize", {
    method: "GET",
    query: {
      auth_type: "code",
      client_id: conf.clientID,
      scope: "netdisk",
      qrcode: "1",
      qr_width: "460",
      qr_height: "460",
    },
  });
  if (resp?.query_token) {
    storage.addition_json.query_token = resp.query_token;
    await persistAddition(storage);
  }
  return resp?.qr_data || "";
};

const getCode = async (client, storage) => {
  const conf = confFor(storage);
  const resp = await requestQuarkTV(client, storage, "/oauth/code", {
    method: "GET",
    query: {
      client_id: conf.clientID,
      scope: "netdisk",
      query_token: storage.addition_json.query_token || "",
    },
  });
  return resp?.code || "";
};

const ensureLogin = async (client, storage) => {
  await ensureDeviceID(storage);
  if (!storage.addition_json.refresh_token) {
    if (!storage.addition_json.query_token) {
      const qrData = await getLoginCode(client, storage);
      throw new Error(`need verify: \n<body>\n        <img src="data:image/jpeg;base64,${qrData}"/>\n    </body>`);
    }
    const code = await getCode(client, storage);
    await refreshTokenByTV(client, storage, code, false);
  }
  if (!accessTokenFor(storage)) {
    await refreshTokenByTV(client, storage, storage.addition_json.refresh_token, true);
  }
  await requestQuarkTV(client, storage, "/user", {
    method: "GET",
    query: { method: "user_info" },
  });
};

const timeFromMs = (value) => parseTime(Number(value || 0));

const fileNameOf = (file) => file.filename || file.file_name || file.name || "";

const isDir = (file) => Number(file.isdir || 0) === 1 || String(file.file_type) === "0";

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
  const pageSize = 100;
  let pageIndex = 0;
  const desc = (addition.order_direction || "desc") === "asc" ? "0" : "1";
  const orderBy = (addition.order_by || "updated_at") === "file_name" ? "1" : "3";
  for (;;) {
    const resp = await requestQuarkTV(client, storage, "/file", {
      method: "GET",
      query: {
        method: "list",
        parent_fid: parentId || addition.root_folder_id || "0",
        order_by: orderBy,
        desc,
        category: "",
        source: "",
        ex_source: "",
        list_all: "0",
        page_size: pageSize,
        page_index: pageIndex,
      },
    });
    const data = resp?.data || {};
    result.push(...(data.files || []));
    if (result.length >= Number(data.total_count || result.length) || (data.files || []).length < pageSize) break;
    pageIndex += 1;
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
      isdir: 1,
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

const getTranscodingLink = async (client, storage, file) => {
  const resp = await requestQuarkTV(client, storage, "/file", {
    method: "GET",
    query: {
      method: "streaming",
      group_by: "source",
      fid: file.fid,
      resolution: "low,normal,high,super,2k,4k",
      support: "dolby_vision",
    },
  });
  for (const info of resp?.data?.video_info || []) {
    if (info?.url) {
      return {
        header: {},
        url: info.url,
        content_length: Number(info.size || file.size || 0),
      };
    }
  }
  throw new Error("no link found");
};

const getDownloadLink = async (client, storage, file) => {
  const resp = await requestQuarkTV(client, storage, "/file", {
    method: "GET",
    query: {
      method: "download",
      group_by: "source",
      fid: file.fid,
      resolution: "low,normal,high,super,2k,4k",
      support: "dolby_vision",
    },
  });
  const url = resp?.data?.download_url || "";
  if (!url) throw new Error("get download url failed");
  return {
    header: {},
    url,
    content_length: Number(resp?.data?.size || file.size || 0),
  };
};

const downloadLink = async (client, storage, file) => {
  return cache.link(storage, `${file.fid || ""}:${storage.addition_json.link_method || "download"}`, async () => {
  if (
    (storage.addition_json.link_method || "download") === "streaming"
    && Number(file.category || 0) === 1
    && Number(file.size || 0) > 0
  ) {
    return getTranscodingLink(client, storage, file);
  }
  return getDownloadLink(client, storage, file);
  });
};

export const createQuarkUCTVDriver = ({ client }) => ({
  async test(storage) {
    await ensureLogin(client, storage);
    return { addition: storage.addition_json };
  },

  async list(storage, relPath) {
    await ensureLogin(client, storage);
    const parent = await resolveFile(client, storage, relPath);
    const content = (await listByParent(client, storage, parent.fid))
      .map((file) => fileToObj(file, normalizePath(relPath + "/" + fileNameOf(file))));
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: false,
      provider: storage.driver || "QuarkTV",
      direct_upload_tools: [],
    };
  },

  async get(storage, relPath, options = {}) {
    await ensureLogin(client, storage);
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
    await ensureLogin(client, storage);
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

  async mkdir() {
    throw new Error("QuarkTV mkdir is not implemented by the OpenList driver");
  },

  async move() {
    throw new Error("QuarkTV move is not implemented by the OpenList driver");
  },

  async remove() {
    throw new Error("QuarkTV remove is not implemented by the OpenList driver");
  },

  async rename() {
    throw new Error("QuarkTV rename is not implemented by the OpenList driver");
  },

  async copy() {
    throw new Error("QuarkTV copy is not implemented by the OpenList driver");
  },

  async put() {
    throw new Error("QuarkTV upload is not implemented by the OpenList driver");
  },
});
