import { basename } from "../../internal/model/path.js";
import { proxyResponse } from "./response.js";

const ORIGIN_IGNORE_HEADERS = new Set([
  "authorization",
  "cookie",
  "connection",
  "host",
  "proxy-authorization",
  "proxy-connection",
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const connectionHeaders = (headers = {}) => {
  const result = new Set();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() !== "connection") continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      for (const part of String(item || "").split(",")) {
        const name = part.trim().toLowerCase();
        if (name) result.add(name);
      }
    }
  }
  return result;
};

const headerValues = (value) => Array.isArray(value) ? value.map(String) : [String(value)];

const setHeader = (headers, key, value) => {
  const lower = String(key).toLowerCase();
  for (const existing of Object.keys(headers)) {
    if (existing.toLowerCase() === lower) delete headers[existing];
  }
  headers[key] = headerValues(value);
};

export const processHeader = (origin = {}, override = {}) => {
  const result = {};
  const originConnectionHeaders = connectionHeaders(origin);
  for (const [key, value] of Object.entries(origin || {})) {
    const lower = String(key).toLowerCase();
    if (ORIGIN_IGNORE_HEADERS.has(lower) || originConnectionHeaders.has(lower)) continue;
    setHeader(result, key, value);
  }
  const overrideConnectionHeaders = connectionHeaders(override);
  for (const [key, value] of Object.entries(override || {})) {
    if (value === undefined || value === null || value === "") continue;
    const lower = String(key).toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || overrideConnectionHeaders.has(lower)) continue;
    setHeader(result, key, value);
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
