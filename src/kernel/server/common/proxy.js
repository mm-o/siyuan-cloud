import { basename } from "../../internal/model/path.js";
import { proxyResponse } from "./response.js";

const PROXY_IGNORE_HEADERS = [
  "authorization",
  "connection",
  "host",
  "proxy-authorization",
  "proxy-connection",
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

export const processHeader = (origin = {}, override = {}) => {
  const result = {};
  for (const [key, value] of Object.entries(origin || {})) {
    if (PROXY_IGNORE_HEADERS.includes(String(key).toLowerCase())) continue;
    result[key] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  for (const [key, value] of Object.entries(override || {})) {
    if (value === undefined || value === null || value === "") continue;
    result[key] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  return result;
};

export const requestHeader = (request) => {
  const requestMeta = request?.request || request?.Request || {};
  return requestMeta.headers || requestMeta.Headers || {};
};

export const proxy = (_ctx, link, file, _proxyRange) => {
  return proxyResponse(link.url, processHeader(file?.request_header || {}, link.header), link.method || "GET");
};

export const proxyReadOptions = (request) => {
  return {
    headers: {},
    proxyHeaders: {},
    requestHeaders: requestHeader(request),
  };
};

export const shouldProxy = (storage, config = {}, filename = "") => {
  if (config.only_proxy || config.no_link_url || storage?.web_proxy) return true;
  const ext = String(basename(filename || "")).split(".").pop().toLowerCase();
  return ["mp4", "mkv", "mov", "avi", "webm", "m4v", "mp3", "flac", "wav", "ogg", "m4a"].includes(ext);
};
