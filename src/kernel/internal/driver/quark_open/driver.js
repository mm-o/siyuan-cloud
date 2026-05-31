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
import { remoteJson } from "../http.js";

const API = "https://open-api-drive.quark.cn";
const UA = "go-resty/3.0.0-beta.1 (https://resty.dev)";
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

const requestQuarkOpen = async (client, storage, pathname, {
  body,
  method = "GET",
  retry = true,
} = {}) => {
  const addition = storage.addition_json;
  const sign = generateReqSign(method, pathname, addition.sign_key);
  const target = new URL(`${API}${pathname}`);
  target.searchParams.set("req_id", sign.req_id);
  target.searchParams.set("access_token", addition.access_token || "");
  const resp = await remoteJson(client, target.toString(), {
    allowErrorStatus: true,
    body,
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": UA,
      "x-pan-client-id": addition.app_id || "",
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
      Cookie: `x_pan_client_id=${storage.addition_json.app_id || ""}; x_pan_access_token=${storage.addition_json.access_token || ""}`,
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

  async put() {
    throw new Error("QuarkOpen upload is not implemented in the SiYuan kernel port yet");
  },
});
