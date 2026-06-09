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
  const forcePathStyle = addition.force_path_style !== false;
  const path = forcePathStyle ? normalizePath(`/${bucket}/${key}`) : normalizePath(`/${key}`);
  const base = forcePathStyle ? endpoint : endpoint.replace("://", `://${bucket}.`);
  return `${joinUrl(base, path)}${query ? `?${query}` : ""}`;
};

const directUploadUrl = (addition, key = "") => {
  const url = new URL(s3Url(addition, key));
  const directHost = addition.direct_upload_host || addition.DirectUploadHost || "";
  if (directHost) {
    const split = String(directHost).split("://");
    if (split.length === 2 && ["http", "https"].includes(split[0])) {
      url.protocol = `${split[0]}:`;
      url.host = split[1];
    } else {
      url.host = directHost;
    }
  }
  return url.toString();
};

const amzDate = (date) => date.toISOString().replace(/[:-]|\.\d{3}/g, "");
const dateStamp = (date) => amzDate(date).slice(0, 8);
const encodeRfc3986 = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const presignPutObject = (addition, key) => {
  const now = new Date();
  const amz = amzDate(now);
  const date = dateStamp(now);
  const region = addition.region || "us-east-1";
  const scope = `${date}/${region}/s3/aws4_request`;
  const url = new URL(directUploadUrl(addition, key));
  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${addition.access_key_id}/${scope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(Number(addition.sign_url_expire || 4) * 3600),
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

const signedRequest = (client, addition, method, key, {
  body = "",
  contentType = "application/octet-stream",
  headers: extraHeaders = {},
  payloadEncoding,
  query = "",
  signingBody,
  responseEncoding = "text",
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
    region: addition.region || "us-east-1",
    secretAccessKey: addition.secret_access_key,
    sessionToken: addition.session_token || "",
    url,
  });
  return forwardProxy(client, url, {
    body,
    contentType,
    headers,
    method,
    payloadEncoding,
    responseEncoding,
    timeout: Number(addition.timeout || 60000),
  });
};

const parseListObjects = (xml, relPath, addition) => {
  const placeholder = addition.placeholder || ".siyuan-cloud";
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
    .filter((item) => item.name && item.name !== placeholder);
  return [...dirs, ...files];
};

export const createS3Driver = ({ client }) => ({
  async list(storage, relPath, req) {
    const addition = storage.addition_json;
    const prefix = keyFor(relPath, true);
    const version = addition.list_object_version === "v2" ? "list-type=2&" : "";
    const data = await signedRequest(client, addition, "GET", "", {
      contentType: "",
      query: `${version}prefix=${encodeURIComponent(prefix)}&delimiter=%2F`,
    });
    const content = parseListObjects(data.body, relPath, addition);
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
    const data = await signedRequest(client, addition, "HEAD", keyFor(relPath), { contentType: "" });
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
  async read(storage, relPath) {
    return signedRequest(client, storage.addition_json, "GET", keyFor(relPath), { contentType: "", responseEncoding: "base64" });
  },
  async mkdir(storage, relPath) {
    const addition = storage.addition_json;
    const name = addition.placeholder || ".siyuan-cloud";
    await signedRequest(client, addition, "PUT", keyFor(normalizePath(relPath + "/" + name)), { body: "" });
  },
  async move(storage, relPath, dstRelPath) {
    const addition = storage.addition_json;
    const src = `${addition.bucket}/${keyFor(relPath)}`;
    const dst = normalizePath(dstRelPath + "/" + basename(relPath)).replace(/^\/+/, "");
    await signedRequest(client, addition, "PUT", dst, {
      contentType: "",
      headers: { "x-amz-copy-source": `/${encodeURIComponent(src).replace(/%2F/g, "/")}` },
    });
    await signedRequest(client, addition, "DELETE", keyFor(relPath), { contentType: "" });
  },
  async copy(storage, relPath, dstRelPath) {
    const addition = storage.addition_json;
    const src = `${addition.bucket}/${keyFor(relPath)}`;
    const dst = normalizePath(dstRelPath + "/" + basename(relPath)).replace(/^\/+/, "");
    await signedRequest(client, addition, "PUT", dst, {
      contentType: "",
      headers: { "x-amz-copy-source": `/${encodeURIComponent(src).replace(/%2F/g, "/")}` },
    });
  },
  async remove(storage, relPath) {
    await signedRequest(client, storage.addition_json, "DELETE", keyFor(relPath), { contentType: "" });
  },
  async rename(storage, relPath, newName) {
    const addition = storage.addition_json;
    const src = `${addition.bucket}/${keyFor(relPath)}`;
    const dst = normalizePath(dirname(relPath) + "/" + newName).replace(/^\/+/, "");
    await signedRequest(client, addition, "PUT", dst, {
      contentType: "",
      headers: { "x-amz-copy-source": `/${encodeURIComponent(src).replace(/%2F/g, "/")}` },
    });
    await signedRequest(client, addition, "DELETE", keyFor(relPath), { contentType: "" });
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
