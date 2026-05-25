import { basename, dirname, normalizePath } from "../model/path.js";
import {
  forwardProxy,
  remoteJson,
} from "./http.js";

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
  const root = normalizePath(addition.root_folder_path || addition.RootFolderPath || "/");
  return normalizePath(root + "/" + normalizePath(relPath || "/"));
};

const metaUrl = (addition, relPath) => {
  const host = hostFor(addition);
  const path = encodePath(rootedPath(addition, relPath));
  const isSharepoint = boolValue(addition.is_sharepoint || addition.IsSharepoint);
  const siteId = addition.site_id || addition.SiteId || "";
  if (isSharepoint) {
    if (path === "/") return `${host.api}/v1.0/sites/${encodeURIComponent(siteId)}/drive/root`;
    return `${host.api}/v1.0/sites/${encodeURIComponent(siteId)}/drive/root:${path}:`;
  }
  if (path === "/") return `${host.api}/v1.0/me/drive/root`;
  return `${host.api}/v1.0/me/drive/root:${path}:`;
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
  });
  if (resp?.error?.code === "InvalidAuthenticationToken" && retry) {
    await refreshToken(client, storage);
    return requestGraph(client, storage, url, { body, contentType, method, retry: false });
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
  if (!addition.custom_host || !rawUrl) return rawUrl || "";
  try {
    const url = new URL(rawUrl);
    url.host = addition.custom_host;
    return url.toString();
  } catch (_) {
    return rawUrl || "";
  }
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
      direct_upload_tools: boolValue(storage.addition_json.enable_direct_upload) ? ["HttpDirect"] : [],
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
    return forwardProxy(client, url, { method: "GET", contentType: "application/octet-stream", responseEncoding: "base64" });
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

  async remove(storage, relPath) {
    await requestGraph(client, storage, metaUrl(storage.addition_json, relPath), { method: "DELETE" });
  },

  async rename(storage, relPath, newName) {
    await requestGraph(client, storage, metaUrl(storage.addition_json, relPath), {
      body: {
        name: newName,
      },
      method: "PATCH",
    });
  },

  async put(storage, relPath, content, mime) {
    await requestGraph(client, storage, `${metaUrl(storage.addition_json, relPath)}/content`, {
      body: content || "",
      contentType: mime || "application/octet-stream",
      method: "PUT",
    });
  },
});
