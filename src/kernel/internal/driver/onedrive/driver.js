import { basename, dirname, normalizePath } from "../../model/path.js";
import {
  forwardProxy,
  remoteJson,
} from "../http.js";

const hosts = {
  global: {
    oauth: "https://login.microsoftonline.com",
    api: "https://graph.microsoft.com",
  },
  cn: {
    oauth: "https://login.chinacloudapi.cn",
    api: "https://microsoftgraph.chinacloudapi.cn",
  },
  us: {
    oauth: "https://login.microsoftonline.us",
    api: "https://graph.microsoft.us",
  },
  de: {
    oauth: "https://login.microsoftonline.de",
    api: "https://graph.microsoft.de",
  },
};

const hostFor = (addition) => hosts[addition.region || addition.Region || "global"] || hosts.global;

const additionValue = (addition, lowerName, upperName, fallback = "") => {
  const value = addition?.[lowerName] ?? addition?.[upperName];
  return value === undefined || value === null || value === "" ? fallback : value;
};

const boolValue = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true";
};

const encodePath = (path) => {
  const clean = normalizePath(path || "/");
  if (clean === "/") return "/";
  return "/" + clean.split("/").filter(Boolean).map(encodeURIComponent).join("/");
};

const rootedPath = (addition, relPath) => {
  const root = normalizePath(additionValue(addition, "root_folder_path", "RootFolderPath", "/"));
  return normalizePath(root + "/" + normalizePath(relPath || "/"));
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

const uploadBytes = (content, options = {}) => options.bodyEncoding === "base64"
  ? base64ToBytes(content || "")
  : utf8Bytes(content || "");

const metaUrl = (addition, relPath) => {
  const host = hostFor(addition);
  const path = encodePath(rootedPath(addition, relPath));
  const isSharepoint = boolValue(additionValue(addition, "is_sharepoint", "IsSharepoint"));
  const siteId = additionValue(addition, "site_id", "SiteId");
  if (isSharepoint) {
    if (path === "/") return `${host.api}/v1.0/sites/${encodeURIComponent(siteId)}/drive/root`;
    return `${host.api}/v1.0/sites/${encodeURIComponent(siteId)}/drive/root:${path}:`;
  }
  if (path === "/") return `${host.api}/v1.0/me/drive/root`;
  return `${host.api}/v1.0/me/drive/root:${path}:`;
};

const chunkSizeOf = (addition) => Math.max(1, Number(addition.chunk_size || addition.ChunkSize || 5)) * 1024 * 1024;

const metadataFromOptions = (options = {}) => {
  const fileSystemInfo = {};
  const modified = options.mtime || options.modified;
  const created = options.ctime || options.created;
  if (modified) fileSystemInfo.lastModifiedDateTime = new Date(modified).toISOString();
  if (created) fileSystemInfo.createdDateTime = new Date(created).toISOString();
  return { fileSystemInfo };
};

const updateMetadata = async (client, storage, relPath, options = {}) => {
  const metadata = metadataFromOptions(options);
  if (!Object.keys(metadata.fileSystemInfo).length) return;
  await requestGraph(client, storage, metaUrl(storage.addition_json, relPath), {
    body: metadata,
    method: "PATCH",
  });
};

const createUploadSession = async (client, storage, relPath, metadata) => {
  const payload = await requestGraph(client, storage, `${metaUrl(storage.addition_json, relPath)}/createUploadSession`, {
    body: { item: metadata },
    method: "POST",
  });
  const uploadUrl = payload?.uploadUrl || "";
  if (!uploadUrl) throw new Error("failed to get upload URL from response");
  return uploadUrl;
};

const uploadSessionBytes = async (client, uploadUrl, bytes, chunkSize) => {
  for (let start = 0; start < bytes.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, bytes.length);
    const chunk = bytes.slice(start, end);
    await forwardProxy(client, uploadUrl, {
      allowErrorStatus: false,
      body: bytesToBase64(chunk),
      contentType: "application/octet-stream",
      headers: {
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${end - 1}/${bytes.length}`,
      },
      method: "PUT",
      payloadEncoding: "base64",
      responseEncoding: "text",
      timeout: 30000,
    });
  }
};

const tokenUrl = (addition) => `${hostFor(addition).oauth}/common/oauth2/v2.0/token`;

const graphHeaders = (addition) => ({
  Authorization: `Bearer ${addition.access_token || addition.AccessToken || ""}`,
});

const checkGraph = (payload) => {
  if (payload?.error?.message) throw new Error(payload.error.message);
  if (payload?.error_description) throw new Error(payload.error_description);
  return payload;
};

const saveDriverStorage = async (storage) => {
  if (storage?.saveDriverStorage) await storage.saveDriverStorage(storage.addition_json);
};

const refreshToken = async (client, storage) => {
  const addition = storage.addition_json || storage;
  const useOnlineApi = boolValue(addition.use_online_api ?? addition.UseOnlineAPI, true);
  const apiAddress = addition.api_url_address || addition.APIAddress || "https://api.oplist.org/onedrive/renewapi";
  const refreshTokenValue = addition.refresh_token || addition.RefreshToken || "";
  if (useOnlineApi && apiAddress) {
    const url = new URL(apiAddress);
    url.searchParams.set("refresh_ui", refreshTokenValue);
    url.searchParams.set("server_use", "true");
    url.searchParams.set("driver_txt", "onedrive_pr");
    const resp = checkGraph(await remoteJson(client, url.toString(), { method: "GET" }));
    if (!resp.refresh_token || !resp.access_token) {
      throw new Error(resp.text || "empty token returned from official API, a wrong refresh token may have been used");
    }
    addition.refresh_token = resp.refresh_token;
    addition.access_token = resp.access_token;
    await saveDriverStorage(storage);
    return addition.access_token;
  }

  const clientId = addition.client_id || addition.ClientID || "";
  const clientSecret = addition.client_secret || addition.ClientSecret || "";
  if (!clientId || !clientSecret) throw new Error("empty ClientID or ClientSecret");
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: addition.redirect_uri || addition.RedirectUri || "https://api.oplist.org/onedrive/callback",
    refresh_token: refreshTokenValue,
  });
  const resp = checkGraph(await remoteJson(client, tokenUrl(addition), {
    body: form.toString(),
    contentType: "application/x-www-form-urlencoded",
    method: "POST",
  }));
  if (!resp.refresh_token || !resp.access_token) throw new Error("empty token returned from Microsoft Graph");
  addition.refresh_token = resp.refresh_token;
  addition.access_token = resp.access_token;
  await saveDriverStorage(storage);
  return addition.access_token;
};

const requestGraph = async (client, storage, url, {
  body,
  contentType = "application/json",
  method = "GET",
  payloadEncoding,
  retry = true,
} = {}) => {
  const addition = storage.addition_json;
  if (!addition.access_token && !addition.AccessToken) await refreshToken(client, storage);
  const resp = await remoteJson(client, url, {
    allowErrorStatus: true,
    body,
    contentType,
    headers: graphHeaders(addition),
    method,
    payloadEncoding,
  });
  if (resp?.error?.code === "InvalidAuthenticationToken" && retry) {
    await refreshToken(client, storage);
    return requestGraph(client, storage, url, { body, contentType, method, payloadEncoding, retry: false });
  }
  return checkGraph(resp);
};

const fileTime = (file) => {
  const raw = file?.fileSystemInfo?.lastModifiedDateTime || file?.lastModifiedDateTime || file?.createdDateTime;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const fileToObj = (file, relPath, storage) => {
  const isDir = !file.file;
  return {
    name: file.name || basename(relPath),
    path: normalizePath(relPath),
    is_dir: isDir,
    size: Number(file.size || 0),
    modified: fileTime(file),
    created: file?.fileSystemInfo?.createdDateTime || fileTime(file),
    thumb: file?.thumbnails?.[0]?.medium?.url || "",
    sign: "",
    type: isDir ? 1 : 0,
    hashinfo: "",
    hash_info: {},
    id: file.id || "",
    raw_url: isDir ? "" : `/plugin/private/siyuan-cloud/d${normalizePath(storage.mount_path + "/" + relPath)}`,
    provider: "Onedrive",
  };
};

const customDownloadUrl = (addition, rawUrl) => {
  const customHost = additionValue(addition, "custom_host", "CustomHost");
  if (!customHost || !rawUrl) return rawUrl || "";
  try {
    const url = new URL(rawUrl);
    url.host = customHost;
    return url.toString();
  } catch (_) {
    return rawUrl || "";
  }
};

const driveUrl = (addition) => {
  const host = hostFor(addition);
  if (boolValue(additionValue(addition, "is_sharepoint", "IsSharepoint"))) {
    return `${host.api}/v1.0/sites/${encodeURIComponent(additionValue(addition, "site_id", "SiteId"))}/drive`;
  }
  return `${host.api}/v1.0/me/drive`;
};

export const createOneDriveDriver = ({ client }) => ({
  async list(storage, relPath) {
    const content = [];
    let next = `${metaUrl(storage.addition_json, relPath)}/children?$top=1000&$expand=thumbnails($select=medium)&$select=id,name,size,fileSystemInfo,content.downloadUrl,file,parentReference`;
    while (next) {
      const data = await requestGraph(client, storage, next);
      for (const file of data.value || []) {
        content.push(fileToObj(file, normalizePath(relPath + "/" + file.name), storage));
      }
      next = data["@odata.nextLink"] || "";
    }
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider: "Onedrive",
      direct_upload_tools: boolValue(additionValue(storage.addition_json, "enable_direct_upload", "EnableDirectUpload")) ? ["HttpDirect"] : [],
    };
  },

  async get(storage, relPath) {
    const file = await requestGraph(client, storage, metaUrl(storage.addition_json, relPath));
    const url = customDownloadUrl(storage.addition_json, file["@microsoft.graph.downloadUrl"]);
    return {
      ...fileToObj(file, relPath, storage),
      raw_url: file.file ? url : "",
      url,
      readme: "",
      header: "",
      related: [],
    };
  },

  async read(storage, relPath) {
    const file = await requestGraph(client, storage, metaUrl(storage.addition_json, relPath));
    if (!file.file) throw new Error("not file");
    const url = customDownloadUrl(storage.addition_json, file["@microsoft.graph.downloadUrl"]);
    if (!url) throw new Error("get download url failed");
    return {
      link: {
        url,
        header: {},
        content_length: Number(file.size || 0),
      },
    };
  },

  async mkdir(storage, relPath) {
    await requestGraph(client, storage, `${metaUrl(storage.addition_json, dirname(relPath))}/children`, {
      body: {
        name: basename(relPath),
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      },
      method: "POST",
    });
  },

  async move(storage, relPath, dstRelPath) {
    const dst = await requestGraph(client, storage, metaUrl(storage.addition_json, dstRelPath));
    await requestGraph(client, storage, metaUrl(storage.addition_json, relPath), {
      body: {
        parentReference: {
          id: dst.id,
        },
        name: basename(relPath),
      },
      method: "PATCH",
    });
  },

  async copy(storage, relPath, dstRelPath) {
    const dst = await requestGraph(client, storage, metaUrl(storage.addition_json, dstRelPath));
    await requestGraph(client, storage, `${metaUrl(storage.addition_json, relPath)}/copy`, {
      body: {
        parentReference: {
          driveId: dst.parentReference?.driveId || dst.driveId,
          id: dst.id,
        },
        name: basename(relPath),
      },
      method: "POST",
    });
  },

  async remove(storage, relPath) {
    await requestGraph(client, storage, metaUrl(storage.addition_json, relPath), { method: "DELETE" });
  },

  async rename(storage, relPath, newName) {
    const file = await requestGraph(client, storage, metaUrl(storage.addition_json, relPath));
    await requestGraph(client, storage, metaUrl(storage.addition_json, relPath), {
      body: {
        parentReference: {
          id: file.parentReference?.id || "root",
        },
        name: newName,
      },
      method: "PATCH",
    });
  },

  async put(storage, relPath, content, mime, options = {}) {
    const bytes = uploadBytes(content, options);
    if (bytes.length <= 4 * 1024 * 1024) {
      await requestGraph(client, storage, `${metaUrl(storage.addition_json, relPath)}/content`, {
        body: content || "",
        contentType: mime || "application/octet-stream",
        method: "PUT",
        payloadEncoding: options.bodyEncoding === "base64" ? "base64" : undefined,
      });
      await updateMetadata(client, storage, relPath, options);
      return;
    }
    const uploadUrl = await createUploadSession(client, storage, relPath, metadataFromOptions(options));
    await uploadSessionBytes(client, uploadUrl, bytes, chunkSizeOf(storage.addition_json));
  },

  async getDirectUploadInfo(storage, relPath) {
    if (!boolValue(additionValue(storage.addition_json, "enable_direct_upload", "EnableDirectUpload"), false)) {
      throw new Error("direct upload is not implemented for this storage");
    }
    const uploadUrl = await createUploadSession(client, storage, relPath, {
      "@microsoft.graph.conflictBehavior": "rename",
    });
    return {
      upload_url: uploadUrl,
      uploadUrl,
      chunk_size: chunkSizeOf(storage.addition_json),
      chunkSize: chunkSizeOf(storage.addition_json),
      method: "PUT",
    };
  },

  async details(storage) {
    if (boolValue(additionValue(storage.addition_json, "disable_disk_usage", "DisableDiskUsage"))) {
      throw new Error("storage details are disabled");
    }
    const drive = await requestGraph(client, storage, driveUrl(storage.addition_json), { retry: false });
    const total = Number(drive?.quota?.total || 0);
    const used = Number(drive?.quota?.used || 0);
    return {
      total_space: total,
      used_space: used,
      free_space: Math.max(0, total - used),
    };
  },
});
