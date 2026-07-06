import { basename, dirname, normalizePath } from "../../model/path.js";
import { forwardProxy, joinUrl } from "../http.js";
import { hmacSha256, sha256Hex, signAwsV4 } from "../aws4.js";

const tagText = (xml, name) => String(xml || "").match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "";
const decodeXml = (value) => String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const keyFor = (path, dir = false) => {
  const key = normalizePath(path).replace(/^\/+/, "");
  return key && dir ? `${key}/` : key;
};
const boolValue = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true" || value === 1 || value === "1";
};
const defaultRegion = "openlist";
const signExpireSeconds = (addition) => String(Number(addition.sign_url_expire || 4) * 3600);
const placeholderName = (addition) => addition.placeholder || ".siyuan-cloud";
const headerValue = (headers = {}, name) => {
  const target = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  return "";
};

const base64ToBytes = (value) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(value || "").replace(/[\r\n\s]/g, "");
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
  return Uint8Array.from(bytes);
};

const s3Url = (addition, key = "", query = "") => {
  const endpoint = String(addition.endpoint || "").replace(/\/+$/, "");
  const bucket = addition.bucket;
  const forcePathStyle = boolValue(addition.force_path_style || addition.ForcePathStyle, false);
  const path = forcePathStyle ? normalizePath(`/${bucket}/${key}`) : normalizePath(`/${key}`);
  const base = forcePathStyle ? endpoint : endpoint.replace("://", `://${bucket}.`);
  return `${joinUrl(base, path)}${query ? `?${query}` : ""}`;
};

const rewriteHost = (url, host) => {
  const target = new URL(url);
  const customHost = String(host || "");
  if (!customHost) return target;
  const split = customHost.split("://");
  if (split.length === 2 && ["http", "https"].includes(split[0])) {
    target.protocol = `${split[0]}:`;
    target.host = split[1];
  } else {
    target.host = customHost;
  }
  return target;
};

const removeBucketFromPath = (url, addition) => {
  if (!boolValue(addition.remove_bucket || addition.RemoveBucket, false)) return url.toString();
  const bucketPrefix = `/${addition.bucket}`;
  if (url.pathname === bucketPrefix) url.pathname = "/";
  else if (url.pathname.startsWith(`${bucketPrefix}/`)) url.pathname = url.pathname.slice(bucketPrefix.length) || "/";
  return url.toString();
};

const directUploadUrl = (addition, key = "") => {
  const url = rewriteHost(s3Url(addition, key), addition.direct_upload_host || addition.DirectUploadHost || "");
  return url.toString();
};

const amzDate = (date) => date.toISOString().replace(/[:-]|\.\d{3}/g, "");
const dateStamp = (date) => amzDate(date).slice(0, 8);
const encodeRfc3986 = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const presignPutObject = (addition, key) => {
  const now = new Date();
  const amz = amzDate(now);
  const date = dateStamp(now);
  const region = addition.region || defaultRegion;
  const scope = `${date}/${region}/s3/aws4_request`;
  const url = new URL(directUploadUrl(addition, key));
  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${addition.access_key_id}/${scope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": signExpireSeconds(addition),
    "X-Amz-SignedHeaders": "host",
  };
  if (addition.session_token) params["X-Amz-Security-Token"] = addition.session_token;
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const query = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join("&");
  const canonicalRequest = [
    "PUT",
    url.pathname || "/",
    query,
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const kDate = hmacSha256(`AWS4${addition.secret_access_key}`, date);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  url.searchParams.set("X-Amz-Signature", hex(hmacSha256(kSigning, stringToSign)));
  return url.toString();
};

const presignGetObject = (addition, key, { customHost = "", disposition = "" } = {}) => {
  const now = new Date();
  const amz = amzDate(now);
  const date = dateStamp(now);
  const region = addition.region || defaultRegion;
  const scope = `${date}/${region}/s3/aws4_request`;
  const url = rewriteHost(s3Url(addition, key), customHost);
  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${addition.access_key_id}/${scope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": signExpireSeconds(addition),
    "X-Amz-SignedHeaders": "host",
  };
  if (addition.session_token) params["X-Amz-Security-Token"] = addition.session_token;
  if (disposition) params["response-content-disposition"] = disposition;
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const query = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join("&");
  const canonicalRequest = [
    "GET",
    url.pathname || "/",
    query,
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const kDate = hmacSha256(`AWS4${addition.secret_access_key}`, date);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  url.searchParams.set("X-Amz-Signature", hex(hmacSha256(kSigning, stringToSign)));
  return removeBucketFromPath(url, addition);
};

const contentDisposition = (addition, fileName) => {
  const encoded = encodeRfc3986(fileName || "");
  if (boolValue(addition.add_filename_to_disposition || addition.AddFilenameToDisposition, false)) {
    return `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`;
  }
  return `attachment; filename*=UTF-8''${encoded}`;
};

const signedRequest = (client, addition, method, key, {
  body = "",
  contentType = "application/octet-stream",
  headers: extraHeaders = {},
  payloadEncoding,
  query = "",
  signingBody,
  responseEncoding = "text",
  allowErrorStatus = false,
} = {}) => {
  const url = s3Url(addition, key, query);
  const headers = signAwsV4({
    accessKeyId: addition.access_key_id,
    body: signingBody === undefined ? body : signingBody,
    headers: {
      ...(contentType ? { "content-type": contentType } : {}),
      ...extraHeaders,
    },
    method,
    region: addition.region || defaultRegion,
    secretAccessKey: addition.secret_access_key,
    sessionToken: addition.session_token || "",
    url,
  });
  return forwardProxy(client, url, {
    allowErrorStatus,
    body,
    contentType,
    headers,
    method,
    payloadEncoding,
    responseEncoding,
    timeout: Number(addition.timeout || 60000),
  });
};

const signedGetLink = (addition, key, fileName) => {
  const customHost = addition.custom_host || addition.CustomHost || "";
  if (customHost) {
    const unsigned = rewriteHost(s3Url(addition, key), customHost);
    if (!boolValue(addition.enable_custom_host_presign || addition.EnableCustomHostPresign, false))
      return { url: removeBucketFromPath(unsigned, addition), header: {} };
    return { url: presignGetObject(addition, key, { customHost }), header: {} };
  }
  return {
    url: presignGetObject(addition, key, { disposition: contentDisposition(addition, fileName) }),
    header: {},
  };
};

const listQuery = ({ continuationToken = "", marker = "", prefix, startAfter = "", version }) => {
  const params = new URLSearchParams();
  if (version === "v2") params.set("list-type", "2");
  params.set("prefix", prefix);
  params.set("delimiter", "/");
  if (version === "v2" && continuationToken) params.set("continuation-token", continuationToken);
  if (version === "v2" && startAfter) params.set("start-after", startAfter);
  if (version !== "v2" && marker) params.set("marker", marker);
  return params.toString();
};

const listState = (xml) => ({
  contents: String(xml || "").match(/<Contents>[\s\S]*?<\/Contents>/gi) || [],
  isTruncated: tagText(xml, "IsTruncated").toLowerCase() === "true",
  nextContinuationToken: decodeXml(tagText(xml, "NextContinuationToken")),
  nextMarker: decodeXml(tagText(xml, "NextMarker")),
});

const listKeys = async (client, addition, prefix, { maxKeys = 0 } = {}) => {
  const version = addition.list_object_version === "v2" ? "v2" : "v1";
  const keys = [];
  let continuationToken = "";
  let marker = "";
  let startAfter = "";
  for (;;) {
    const params = new URLSearchParams();
    if (version === "v2") params.set("list-type", "2");
    params.set("prefix", prefix);
    if (version === "v2" && continuationToken) params.set("continuation-token", continuationToken);
    if (version === "v2" && startAfter) params.set("start-after", startAfter);
    if (version !== "v2" && marker) params.set("marker", marker);
    if (maxKeys) params.set("max-keys", String(maxKeys));
    const data = await signedRequest(client, addition, "GET", "", {
      contentType: "",
      query: params.toString(),
    });
    const state = listState(data.body);
    keys.push(...state.contents.map((chunk) => decodeXml(tagText(chunk, "Key"))).filter(Boolean));
    if (maxKeys && keys.length >= maxKeys) return keys.slice(0, maxKeys);
    if (!state.isTruncated) break;
    if (version === "v2") {
      continuationToken = state.nextContinuationToken;
      if (continuationToken) continue;
      const last = state.contents.at(-1);
      if (!last) break;
      startAfter = decodeXml(tagText(last, "Key"));
      if (!startAfter) break;
      continue;
    }
    marker = state.nextMarker;
    if (!marker) {
      const last = state.contents.at(-1);
      marker = last ? decodeXml(tagText(last, "Key")) : "";
    }
    if (!marker) break;
  }
  return keys;
};

const parseListObjects = (xml, relPath, addition) => {
  const placeholder = placeholderName(addition);
  const dirs = (String(xml || "").match(/<CommonPrefixes>[\s\S]*?<\/CommonPrefixes>/gi) || [])
    .map((chunk) => decodeXml(tagText(chunk, "Prefix")).replace(/\/+$/, ""))
    .map((prefix) => basename(prefix))
    .filter(Boolean)
    .map((name) => ({
      name,
      path: normalizePath(relPath + "/" + name),
      is_dir: true,
      size: 0,
      modified: new Date().toISOString(),
      created: new Date().toISOString(),
    }));
  const files = (String(xml || "").match(/<Contents>[\s\S]*?<\/Contents>/gi) || [])
    .map((chunk) => {
      const key = decodeXml(tagText(chunk, "Key"));
      if (key.endsWith("/")) return null;
      const name = basename(key);
      return {
        name,
        path: normalizePath(relPath + "/" + name),
        is_dir: false,
        size: Number(tagText(chunk, "Size") || 0),
        modified: new Date(tagText(chunk, "LastModified") || Date.now()).toISOString(),
        created: new Date(tagText(chunk, "LastModified") || Date.now()).toISOString(),
      };
    })
    .filter((item) => item?.name && item.name !== placeholder && item.name !== addition.placeholder);
  return [...dirs, ...files];
};

const copyFile = async (client, addition, srcRelPath, dstKey) => {
  const src = `${addition.bucket}/${keyFor(srcRelPath)}`;
  await signedRequest(client, addition, "PUT", dstKey, {
    contentType: "",
    headers: { "x-amz-copy-source": `/${encodeURIComponent(src).replace(/%2F/g, "/")}` },
  });
};

const copyPath = async (client, addition, relPath, dstRelPath, dstName = basename(relPath)) => {
  const srcPrefix = keyFor(relPath, true);
  const dstPath = normalizePath(dstRelPath + "/" + dstName);
  const dstBase = keyFor(dstPath, true);
  const keys = await listKeys(client, addition, srcPrefix, { maxKeys: 1 });
  if (!keys.length) {
    await copyFile(client, addition, relPath, keyFor(dstPath));
    return;
  }
  const allKeys = await listKeys(client, addition, srcPrefix);
  for (const key of allKeys) {
    await copyFile(client, addition, key, `${dstBase}${key.slice(srcPrefix.length)}`);
  }
};

const removePath = async (client, addition, relPath) => {
  const prefix = keyFor(relPath, true);
  const keys = await listKeys(client, addition, prefix, { maxKeys: 1 });
  if (!keys.length) {
    await signedRequest(client, addition, "DELETE", keyFor(relPath), { contentType: "" });
    return;
  }
  for (const key of await listKeys(client, addition, prefix)) {
    await signedRequest(client, addition, "DELETE", key, { contentType: "" });
  }
  await signedRequest(client, addition, "DELETE", keyFor(normalizePath(relPath + "/" + placeholderName(addition))), { contentType: "" });
  if (addition.placeholder) {
    await signedRequest(client, addition, "DELETE", keyFor(normalizePath(relPath + "/" + addition.placeholder)), { contentType: "" });
  }
};

export const createS3Driver = ({ client }) => ({
  async list(storage, relPath, req) {
    const addition = storage.addition_json;
    const prefix = keyFor(relPath, true);
    const version = addition.list_object_version === "v2" ? "v2" : "v1";
    const content = [];
    let continuationToken = "";
    let marker = "";
    let startAfter = "";
    for (;;) {
      const data = await signedRequest(client, addition, "GET", "", {
        contentType: "",
        query: listQuery({ continuationToken, marker, prefix, startAfter, version }),
      });
      content.push(...parseListObjects(data.body, relPath, addition));
      const state = listState(data.body);
      if (!state.isTruncated) break;
      if (version === "v2") {
        continuationToken = state.nextContinuationToken;
        if (continuationToken) continue;
        const last = state.contents.at(-1);
        if (!last) break;
        startAfter = decodeXml(tagText(last, "Key"));
        if (!startAfter) break;
        continue;
      }
      marker = state.nextMarker;
      if (!marker) {
        const last = state.contents.at(-1);
        marker = last ? decodeXml(tagText(last, "Key")) : "";
      }
      if (!marker) break;
    }
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider: "S3",
      direct_upload_tools: addition.enable_direct_upload ? ["HttpDirect"] : [],
    };
  },
  async get(storage, relPath) {
    const addition = storage.addition_json;
    const data = await signedRequest(client, addition, "HEAD", keyFor(relPath), {
      allowErrorStatus: true,
      contentType: "",
    });
    if (Number(data.status || 0) === 404) {
      const prefix = keyFor(relPath, true);
      const version = addition.list_object_version === "v2" ? "v2" : "v1";
      const listed = await signedRequest(client, addition, "GET", "", {
        contentType: "",
        query: `${listQuery({ prefix, version })}&max-keys=1`,
      });
      if (parseListObjects(listed.body, relPath, addition).length || listState(listed.body).contents.length) {
        return {
          name: basename(relPath),
          path: relPath,
          is_dir: true,
          size: 0,
          modified: new Date().toISOString(),
          created: new Date().toISOString(),
          raw_url: "",
          provider: "S3",
          related: [],
        };
      }
    }
    if (Number(data.status || 0) >= 400) throw new Error(`HTTP ${data.status}: object not found`);
    return {
      name: basename(relPath),
      path: relPath,
      is_dir: false,
      size: Number(data.headers?.["Content-Length"] || data.headers?.["content-length"] || 0),
      modified: new Date(data.headers?.["Last-Modified"] || data.headers?.["last-modified"] || Date.now()).toISOString(),
      created: new Date().toISOString(),
      raw_url: `/plugin/private/siyuan-cloud/d${normalizePath(storage.mount_path + "/" + relPath)}`,
      provider: "S3",
      related: [],
    };
  },
  async link(storage, relPath) {
    const addition = storage.addition_json;
    const link = signedGetLink(addition, keyFor(relPath), basename(relPath));
    return {
      link: {
        url: link.url,
        header: link.header,
        method: "GET",
      },
    };
  },
  async read(storage, relPath, options = {}) {
    const range = headerValue(options.requestHeaders, "Range");
    return signedRequest(client, storage.addition_json, "GET", keyFor(relPath), {
      contentType: "",
      headers: range ? { Range: range } : {},
      responseEncoding: "base64",
    });
  },
  async mkdir(storage, relPath) {
    const addition = storage.addition_json;
    const name = placeholderName(addition);
    await signedRequest(client, addition, "PUT", keyFor(normalizePath(relPath + "/" + name)), { body: "" });
  },
  async move(storage, relPath, dstRelPath) {
    const addition = storage.addition_json;
    await copyPath(client, addition, relPath, dstRelPath);
    await removePath(client, addition, relPath);
  },
  async copy(storage, relPath, dstRelPath) {
    const addition = storage.addition_json;
    await copyPath(client, addition, relPath, dstRelPath);
  },
  async remove(storage, relPath) {
    await removePath(client, storage.addition_json, relPath);
  },
  async rename(storage, relPath, newName) {
    const addition = storage.addition_json;
    await copyPath(client, addition, relPath, dirname(relPath), newName);
    await removePath(client, addition, relPath);
  },
  async put(storage, relPath, content, mime, options = {}) {
    const signingBody = options.bodyEncoding === "base64" ? base64ToBytes(content || "") : (content || "");
    await signedRequest(client, storage.addition_json, "PUT", keyFor(relPath), {
      body: content || "",
      contentType: mime || "application/octet-stream",
      payloadEncoding: options.bodyEncoding === "base64" ? "base64" : undefined,
      signingBody,
    });
  },
  async getDirectUploadInfo(storage, relPath) {
    const addition = storage.addition_json;
    if (!addition.enable_direct_upload) throw new Error("direct upload is not implemented for this storage");
    return {
      upload_url: presignPutObject(addition, keyFor(relPath)),
      method: "PUT",
    };
  },
});
