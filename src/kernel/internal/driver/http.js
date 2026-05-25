const encodePayload = (payload) => {
  if (payload === undefined || payload === null) return "";
  return typeof payload === "string" ? payload : JSON.stringify(payload);
};

const base64UrlEncode = (value) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const input = unescape(encodeURIComponent(String(value || "")));
  let output = "";
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = input.charCodeAt(i + 1);
    const c = input.charCodeAt(i + 2);
    output += chars[a >> 2];
    output += chars[((a & 3) << 4) | (Number.isNaN(b) ? 0 : b >> 4)];
    output += Number.isNaN(b) ? "=" : chars[((b & 15) << 2) | (Number.isNaN(c) ? 0 : c >> 6)];
    output += Number.isNaN(c) ? "=" : chars[c & 63];
  }
  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const proxyUrl = (url, headers = {}) => {
  const record = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (value === undefined || value === null || value === "") continue;
    record[key] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  const query = new URLSearchParams({ u: base64UrlEncode(url) });
  if (Object.keys(record).length) query.set("h", base64UrlEncode(JSON.stringify(record)));
  return `/api/network/proxy?${query.toString()}`;
};

const proxyPayload = (body, contentType) => {
  if (body === undefined || body === null) return { payload: "", payloadEncoding: "text" };
  if (typeof body !== "string" && String(contentType || "").includes("application/json")) {
    return { payload: body, payloadEncoding: "json" };
  }
  return { payload: encodePayload(body), payloadEncoding: "text" };
};

export const forwardProxy = async (client, url, {
  body,
  allowErrorStatus = false,
  contentType = "application/json",
  headers = {},
  method = "GET",
  responseEncoding = "text",
  timeout = 30000,
} = {}) => {
  const encoded = proxyPayload(body, contentType);
  const headerPairs = Object.entries(headers)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({ [key]: String(value) }));
  const response = await client.fetch("/api/network/forwardProxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      method,
      headers: headerPairs,
      contentType,
      payload: encoded.payload,
      payloadEncoding: encoded.payloadEncoding,
      responseEncoding,
      timeout,
    }),
  });
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(payload.msg || "forwardProxy failed");
  const data = payload.data || {};
  if (!allowErrorStatus && data.status >= 400) throw new Error(`HTTP ${data.status}: ${String(data.body || "").slice(0, 300)}`);
  return data;
};

export const remoteJson = async (client, url, options) => {
  const data = await forwardProxy(client, url, options);
  try {
    return JSON.parse(data.body || "{}");
  } catch (error) {
    throw new Error(`invalid JSON response from ${url}: ${error.message}`);
  }
};

export const basicAuth = (username, password) => {
  if (!username && !password) return "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const input = unescape(encodeURIComponent(`${username || ""}:${password || ""}`));
  let output = "";
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = input.charCodeAt(i + 1);
    const c = input.charCodeAt(i + 2);
    output += chars[a >> 2];
    output += chars[((a & 3) << 4) | (Number.isNaN(b) ? 0 : b >> 4)];
    output += Number.isNaN(b) ? "=" : chars[((b & 15) << 2) | (Number.isNaN(c) ? 0 : c >> 6)];
    output += Number.isNaN(c) ? "=" : chars[c & 63];
  }
  return `Basic ${output}`;
};

export const joinUrl = (base, path) => {
  const trimmed = String(base || "").replace(/\/+$/, "");
  const encoded = String(path || "/")
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return encoded ? `${trimmed}/${encoded}` : `${trimmed}/`;
};
