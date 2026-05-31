import { normalizePath } from "../../model/path.js";
import {
  basenameOf,
  boolValue,
  dirnameOf,
  parseTime,
  persistAddition,
  rawDownloadUrl,
} from "../common.js";
import {
  forwardProxy,
  remoteJson,
} from "../http.js";

const API_URL = "https://openapi.alipan.com";
const DEFAULT_RENEW_API = "https://api.oplist.org/alicloud/renewapi";
const CACHE_TTL = 55 * 1000;
const listCache = new Map();
const fileCache = new Map();
const linkCache = new Map();

const storageKey = (storage) => String(storage.id || storage.mount_path || JSON.stringify(storage.addition_json || {}));
const cached = async (map, key, producer, ttl = CACHE_TTL) => {
  const now = Date.now();
  const hit = map.get(key);
  if (hit && hit.expires > now) return hit.value;
  const value = await producer();
  map.set(key, { value, expires: now + ttl });
  return value;
};
const clearStorageCache = (storage) => {
  const prefix = `${storageKey(storage)}:`;
  for (const map of [listCache, fileCache, linkCache]) {
    for (const key of map.keys()) {
      if (key.startsWith(prefix)) map.delete(key);
    }
  }
};

const checkAli = (payload) => {
  if (payload?.code) throw new Error(`${payload.code}:${payload.message || ""}`.replace(/:$/, ""));
  return payload;
};

const driverTxt = (addition) => addition.alipan_type === "alipanTV" ? "alicloud_tv" : "alicloud_qr";

const refreshToken = async (client, storage) => {
  const addition = storage.addition_json || storage;
  const refreshTokenValue = addition.refresh_token || addition.RefreshToken || "";
  if (!refreshTokenValue) throw new Error("empty refresh_token");
  if (boolValue(addition.use_online_api ?? addition.UseOnlineAPI, true) && (addition.api_url_address || DEFAULT_RENEW_API)) {
    const url = new URL(addition.api_url_address || DEFAULT_RENEW_API);
    url.searchParams.set("refresh_ui", refreshTokenValue);
    url.searchParams.set("server_use", "true");
    url.searchParams.set("driver_txt", driverTxt(addition));
    const resp = await remoteJson(client, url.toString(), { method: "GET" });
    if (!resp.refresh_token || !resp.access_token) {
      throw new Error(resp.text || "empty token returned from official API, a wrong refresh token may have been used");
    }
    addition.refresh_token = resp.refresh_token;
    addition.access_token = resp.access_token;
    await persistAddition(storage);
    return addition.access_token;
  }

  const clientId = addition.client_id || addition.ClientID || "";
  const clientSecret = addition.client_secret || addition.ClientSecret || "";
  if (!clientId || !clientSecret) throw new Error("empty ClientID or ClientSecret");
  const resp = checkAli(await remoteJson(client, `${API_URL}/oauth/access_token`, {
    body: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshTokenValue,
    },
    method: "POST",
  }));
  if (!resp.refresh_token || !resp.access_token) throw new Error("empty token returned from alipan");
  addition.refresh_token = resp.refresh_token;
  addition.access_token = resp.access_token;
  await persistAddition(storage);
  return addition.access_token;
};

const ensureToken = async (client, storage) => {
  const addition = storage.addition_json || storage;
  if (addition.access_token || addition.AccessToken) return addition.access_token || addition.AccessToken;
  return refreshToken(client, storage);
};

const requestAli = async (client, storage, uri, {
  body,
  method = "POST",
  retry = true,
} = {}) => {
  const addition = storage.addition_json;
  await ensureToken(client, storage);
  const resp = await remoteJson(client, `${API_URL}${uri}`, {
    allowErrorStatus: true,
    body: body || {},
    headers: {
      Authorization: `Bearer ${addition.access_token || addition.AccessToken || ""}`,
    },
    method,
  });
  if (resp?.code && retry && ["AccessTokenInvalid", "AccessTokenExpired", "I400JD"].includes(resp.code)) {
    await refreshToken(client, storage);
    return requestAli(client, storage, uri, { body, method, retry: false });
  }
  return checkAli(resp);
};

const initDrive = async (client, storage) => {
  const addition = storage.addition_json;
  if (addition.drive_id) return addition.drive_id;
  const resp = await requestAli(client, storage, "/adrive/v1.0/user/getDriveInfo");
  const driveType = addition.drive_type || addition.DriveType || "resource";
  const driveId = resp[`${driveType}_drive_id`] || resp.default_drive_id || resp.resource_drive_id || resp.backup_drive_id;
  if (!driveId) throw new Error("get aliyundrive drive_id failed");
  addition.drive_id = driveId;
  await persistAddition(storage);
  return driveId;
};

const rootFolderId = (addition) => addition.root_folder_id || addition.RootFolderID || "root";

const fileToObj = (file, relPath, storage) => {
  const isDir = file.type === "folder";
  return {
    name: file.name || file.file_name || basenameOf(relPath),
    path: normalizePath(relPath),
    is_dir: isDir,
    size: Number(file.size || 0),
    modified: parseTime(file.updated_at),
    created: parseTime(file.created_at),
    sign: "",
    thumb: file.thumbnail || "",
    type: isDir ? 1 : 0,
    hashinfo: file.content_hash || "",
    hash_info: file.content_hash ? { sha1: file.content_hash } : {},
    id: file.file_id || "",
    raw_url: isDir ? "" : rawDownloadUrl(storage, relPath),
    provider: "AliyundriveOpen",
    file,
  };
};

const listByParent = async (client, storage, parentId) => {
  const cacheKey = `${storageKey(storage)}:list:${parentId}`;
  return cached(listCache, cacheKey, async () => {
  const addition = storage.addition_json;
  const driveId = await initDrive(client, storage);
  const result = [];
  let marker = "";
  do {
    const resp = await requestAli(client, storage, "/adrive/v1.0/openFile/list", {
      body: {
        drive_id: driveId,
        limit: 200,
        marker,
        order_by: addition.order_by || addition.OrderBy || "",
        order_direction: addition.order_direction || addition.OrderDirection || "",
        parent_file_id: parentId,
      },
    });
    result.push(...(resp.items || []));
    marker = resp.next_marker || "";
  } while (marker);
  return result;
  });
};

const resolveFile = async (client, storage, relPath) => {
  const clean = normalizePath(relPath || "/");
  const cacheKey = `${storageKey(storage)}:file:${clean}`;
  return cached(fileCache, cacheKey, async () => {
  if (clean === "/") {
    return {
      file_id: rootFolderId(storage.addition_json),
      name: "root",
      type: "folder",
      path: "/",
    };
  }
  let parentId = rootFolderId(storage.addition_json);
  let current = null;
  const parts = clean.split("/").filter(Boolean);
  for (const part of parts) {
    const files = await listByParent(client, storage, parentId);
    current = files.find((item) => (item.name || item.file_name) === part);
    if (!current) throw new Error(`object not found: ${clean}`);
    parentId = current.file_id;
  }
  return current;
  });
};

const linkFor = async (client, storage, file) => {
  const cacheKey = `${storageKey(storage)}:link:${file.file_id || ""}`;
  return cached(linkCache, cacheKey, async () => {
  const driveId = await initDrive(client, storage);
  const resp = await requestAli(client, storage, "/adrive/v1.0/openFile/getDownloadUrl", {
    body: {
      drive_id: driveId,
      file_id: file.file_id,
      expire_sec: 14400,
    },
  });
  const url = resp.url || resp.streamsUrl?.[storage.addition_json.livp_download_format || "jpeg"] || "";
  if (!url) throw new Error("get download url failed");
  return url;
  });
};

export const createAliyundriveOpenDriver = ({ client }) => ({
  async test(storage) {
    await initDrive(client, storage);
    return { addition: storage.addition_json };
  },

  async list(storage, relPath) {
    const parent = await resolveFile(client, storage, relPath);
    const content = (await listByParent(client, storage, parent.file_id))
      .map((file) => fileToObj(file, normalizePath(relPath + "/" + (file.name || file.file_name)), storage));
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider: "AliyundriveOpen",
      direct_upload_tools: [],
    };
  },

  async get(storage, relPath, options = {}) {
    const file = await resolveFile(client, storage, relPath);
    const obj = fileToObj(file, relPath, storage);
    if (!obj.is_dir && !options.skipLink) {
      const url = await linkFor(client, storage, file);
      obj.raw_url = url;
      obj.url = url;
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
    if (file.type === "folder") throw new Error("not file");
    const url = await linkFor(client, storage, file);
    return {
      link: {
        url,
        header: options.proxyHeaders || options.headers || {},
        content_length: Number(file.size || 0),
      },
    };
  },

  async mkdir(storage, relPath) {
    const driveId = await initDrive(client, storage);
    const parent = await resolveFile(client, storage, dirnameOf(relPath));
    await requestAli(client, storage, "/adrive/v1.0/openFile/create", {
      body: {
        drive_id: driveId,
        parent_file_id: parent.file_id,
        name: basenameOf(relPath),
        type: "folder",
        check_name_mode: "refuse",
      },
    });
    clearStorageCache(storage);
  },

  async move(storage, relPath, dstRelPath) {
    const driveId = await initDrive(client, storage);
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await requestAli(client, storage, "/adrive/v1.0/openFile/move", {
      body: {
        drive_id: driveId,
        file_id: file.file_id,
        to_parent_file_id: dst.file_id,
        check_name_mode: "ignore",
      },
    });
    clearStorageCache(storage);
  },

  async copy(storage, relPath, dstRelPath) {
    const driveId = await initDrive(client, storage);
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await requestAli(client, storage, "/adrive/v1.0/openFile/copy", {
      body: {
        drive_id: driveId,
        file_id: file.file_id,
        to_parent_file_id: dst.file_id,
        auto_rename: false,
      },
    });
    clearStorageCache(storage);
  },

  async remove(storage, relPath) {
    const driveId = await initDrive(client, storage);
    const file = await resolveFile(client, storage, relPath);
    const uri = storage.addition_json.remove_way === "delete"
      ? "/adrive/v1.0/openFile/delete"
      : "/adrive/v1.0/openFile/recyclebin/trash";
    await requestAli(client, storage, uri, {
      body: {
        drive_id: driveId,
        file_id: file.file_id,
      },
    });
    clearStorageCache(storage);
  },

  async rename(storage, relPath, newName) {
    const driveId = await initDrive(client, storage);
    const file = await resolveFile(client, storage, relPath);
    await requestAli(client, storage, "/adrive/v1.0/openFile/update", {
      body: {
        drive_id: driveId,
        file_id: file.file_id,
        name: newName,
      },
    });
    clearStorageCache(storage);
  },

  async put() {
    throw new Error("AliyundriveOpen upload is not implemented in the SiYuan kernel port yet");
  },
});
