import { OPENLIST_VERSION } from "../../internal/conf/const.js"

export const success = (data) => ({
  code: 200,
  message: "success",
  data: data === undefined ? null : data,
})

export const successWithMessage = (message, data) => ({
  code: 200,
  message: message || "success",
  data: data === undefined ? null : data,
})

export const failure = (message, code, data) => ({
  code: code || 500,
  message: message || "error",
  data: data === undefined ? null : data,
})

export const jsonResponse = (payload, statusCode) => ({
  statusCode: statusCode || 200,
  headers: {
    "Content-Type": ["application/json; charset=utf-8"],
    "X-SiYuan-OpenList-Port": [OPENLIST_VERSION],
  },
  body: {
    data: {
      type: "JSON",
      data: payload,
    },
  },
})

export const textResponse = (text, statusCode, contentType) => ({
  statusCode: statusCode || 200,
  headers: {
    "Content-Type": [contentType || "text/plain; charset=utf-8"],
    "X-SiYuan-OpenList-Port": [OPENLIST_VERSION],
  },
  body: {
    string: {
      format: "%s",
      values: [text],
    },
  },
})

export const rawResponse = (data, statusCode, contentType, extraHeaders = {}) => ({
  statusCode: statusCode || 200,
  headers: {
    "Content-Type": [contentType || "application/octet-stream"],
    "X-SiYuan-OpenList-Port": [OPENLIST_VERSION],
    ...extraHeaders,
  },
  body: {
    raw: {
      contentType: contentType || "application/octet-stream",
      data,
    },
  },
})

export const redirectResponse = (location, statusCode = 302) => ({
  statusCode,
  headers: {
    Location: [location],
    "X-SiYuan-OpenList-Port": [OPENLIST_VERSION],
  },
  body: {
    redirect: {
      location,
    },
  },
})

export const proxyResponse = (url, headers = {}, method = "GET") => {
  const normalizedHeaders = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (value === undefined || value === null || value === "") continue;
    normalizedHeaders[key] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  return {
    statusCode: 200,
    headers: {
      "X-SiYuan-OpenList-Port": [OPENLIST_VERSION],
    },
    body: {
      proxy: {
        url,
        method,
        headers: normalizedHeaders,
      },
    },
  };
}

export const base64ToArrayBuffer = (value) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(value || "").replace(/[\r\n\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = clean[i + 2] === "=" ? -1 : chars.indexOf(clean[i + 2]);
    const d = clean[i + 3] === "=" ? -1 : chars.indexOf(clean[i + 3]);
    if (a < 0 || b < 0) continue;
    bytes.push((a << 2) | (b >> 4));
    if (c >= 0) bytes.push(((b & 15) << 4) | (c >> 2));
    if (d >= 0) bytes.push(((c & 3) << 6) | d);
  }
  return new Uint8Array(bytes).buffer;
}

export const pageResp = (content, total) => ({
  content,
  total: total === undefined ? content.length : total,
})
