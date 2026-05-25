import {
  dirname,
  normalizePath,
} from "../internal/model/path.js";
import { textResponse } from "./common/response.js";

const DEFAULT_BUCKET = "siyuan-cloud";

const escapeXml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const xmlResponse = (xml, statusCode = 200) => textResponse(xml, statusCode, "application/xml; charset=utf-8");

const s3PathParts = (path) => {
  const clean = path.replace(/^\/s3\/?/, "").replace(/^\/+/, "");
  const [bucket, ...objectParts] = clean.split("/").filter(Boolean);
  return {
    bucket: bucket || "",
    object: objectParts.join("/"),
  };
};

const requestBodyText = async (requestMeta) => {
  const body = requestMeta.body || requestMeta.Body || {};
  if (body.data !== undefined && body.data !== null) {
    if (typeof body.data === "string") return body.data;
    if (typeof body.data.text === "function") return body.data.text();
    if (body.data instanceof ArrayBuffer) return String.fromCharCode(...new Uint8Array(body.data));
    if (typeof body.data === "object") return JSON.stringify(body.data);
  }
  if (body.string && Array.isArray(body.string.values)) return body.string.values.join("");
  return "";
};

const headerValue = (requestMeta, name) => {
  const headers = requestMeta.headers || requestMeta.Headers || {};
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() !== lower) continue;
    if (Array.isArray(value)) return value[0] || "";
    return String(value || "");
  }
  return "";
};

const objectPath = (object) => normalizePath("/" + object);

const listBucketsXml = () => xmlResponse([
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">`,
  `<Owner><ID>siyuan-cloud</ID><DisplayName>Siyuan Cloud</DisplayName></Owner>`,
  `<Buckets><Bucket><Name>${DEFAULT_BUCKET}</Name><CreationDate>${new Date().toISOString()}</CreationDate></Bucket></Buckets>`,
  `</ListAllMyBucketsResult>`,
].join(""));

const errorXml = (code, message, statusCode) => xmlResponse([
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<Error><Code>${escapeXml(code)}</Code><Message>${escapeXml(message)}</Message></Error>`,
].join(""), statusCode);

export const createS3Server = ({
  cloneEntryTree,
  createFile,
  ensureDir,
  getState,
  removeEntry,
  requestPath,
  saveState,
}) => {
  const listBucketXml = (bucket, options) => {
    const state = getState();
    const normalizedPrefix = String(options.prefix || "").replace(/^\/+/, "");
    const delimiter = options.delimiter || "";
    const maxKeys = Math.max(1, Number(options.maxKeys || 1000));
    const allObjects = Object.values(state.entries)
      .filter((entry) => entry.path !== "/" && !entry.is_dir)
      .map((entry) => ({
        key: entry.path.replace(/^\//, ""),
        entry,
      }))
      .filter((item) => !normalizedPrefix || item.key.startsWith(normalizedPrefix))
      .sort((a, b) => a.key.localeCompare(b.key));
    const commonPrefixes = new Set();
    const contents = [];
    for (const item of allObjects) {
      const rest = item.key.slice(normalizedPrefix.length);
      if (delimiter && rest.includes(delimiter)) {
        commonPrefixes.add(normalizedPrefix + rest.slice(0, rest.indexOf(delimiter) + delimiter.length));
        continue;
      }
      contents.push(item);
    }
    const contentXml = contents
      .slice(0, maxKeys)
      .map(({ key, entry }) => [
        `<Contents>`,
        `<Key>${escapeXml(key)}</Key>`,
        `<LastModified>${escapeXml(entry.modified || new Date().toISOString())}</LastModified>`,
        `<ETag>"${escapeXml(String(entry.size || 0))}"</ETag>`,
        `<Size>${Number(entry.size || 0)}</Size>`,
        `<StorageClass>STANDARD</StorageClass>`,
        `</Contents>`,
      ].join(""))
      .join("");
    const prefixXml = [...commonPrefixes]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, maxKeys)
      .map((prefix) => `<CommonPrefixes><Prefix>${escapeXml(prefix)}</Prefix></CommonPrefixes>`)
      .join("");
    return xmlResponse([
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">`,
      `<Name>${escapeXml(bucket)}</Name>`,
      `<Prefix>${escapeXml(normalizedPrefix)}</Prefix>`,
      `<Delimiter>${escapeXml(delimiter)}</Delimiter>`,
      `<Marker></Marker><MaxKeys>${maxKeys}</MaxKeys><IsTruncated>false</IsTruncated>`,
      contentXml,
      prefixXml,
      `</ListBucketResult>`,
    ].join(""));
  };

  const objectResponse = (entry, headOnly = false) => {
    const response = textResponse(headOnly ? "" : entry.content || "", 200, entry.mime || "application/octet-stream");
    response.headers["Content-Length"] = [String(entry.size || 0)];
    response.headers.ETag = [`"${entry.size || 0}"`];
    response.headers["Last-Modified"] = [new Date(entry.modified || Date.now()).toUTCString()];
    return response;
  };

  const copySource = (requestMeta) => {
    const raw = decodeURIComponent(headerValue(requestMeta, "x-amz-copy-source").replace(/^\/+/, ""));
    if (!raw) return null;
    const [bucket, ...objectParts] = raw.split("/");
    if (bucket !== DEFAULT_BUCKET) return null;
    return objectPath(objectParts.join("/"));
  };

  const copyResultXml = () => xmlResponse([
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<CopyObjectResult>`,
    `<LastModified>${new Date().toISOString()}</LastModified>`,
    `<ETag>"0"</ETag>`,
    `</CopyObjectResult>`,
  ].join(""));

  const multiDeleteXml = (objects) => xmlResponse([
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">`,
    ...objects.map((key) => `<Deleted><Key>${escapeXml(key)}</Key></Deleted>`),
    `</DeleteResult>`,
  ].join(""));

  const parseDeleteObjects = async (requestMeta) => {
    const text = await requestBodyText(requestMeta);
    return [...text.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1]);
  };

  const ensureMultipartState = () => {
    const state = getState();
    state.s3_multipart_uploads = state.s3_multipart_uploads || {};
    return state.s3_multipart_uploads;
  };

  const initiateMultipartXml = (bucket, object, uploadId) => xmlResponse([
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">`,
    `<Bucket>${escapeXml(bucket)}</Bucket><Key>${escapeXml(object)}</Key><UploadId>${escapeXml(uploadId)}</UploadId>`,
    `</InitiateMultipartUploadResult>`,
  ].join(""));

  const completeMultipartXml = (bucket, object, entry) => xmlResponse([
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">`,
    `<Location>/s3/${escapeXml(bucket)}/${escapeXml(object)}</Location>`,
    `<Bucket>${escapeXml(bucket)}</Bucket><Key>${escapeXml(object)}</Key><ETag>"${escapeXml(String(entry?.size || 0))}"</ETag>`,
    `</CompleteMultipartUploadResult>`,
  ].join(""));

  const listMultipartXml = (bucket, object, uploadId, upload) => xmlResponse([
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">`,
    `<Bucket>${escapeXml(bucket)}</Bucket><Key>${escapeXml(object)}</Key><UploadId>${escapeXml(uploadId)}</UploadId>`,
    ...Object.entries(upload?.parts || {})
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([partNumber, part]) => `<Part><PartNumber>${Number(partNumber)}</PartNumber><ETag>"${part.size}"</ETag><Size>${part.size}</Size></Part>`),
    `</ListPartsResult>`,
  ].join(""));

  const listMultipartUploadsXml = (bucket, uploads, options = {}) => {
    const prefix = String(options.prefix || "").replace(/^\/+/, "");
    const uploadXml = Object.entries(uploads)
      .filter(([, upload]) => upload.bucket === bucket && (!prefix || upload.object.startsWith(prefix)))
      .sort(([, a], [, b]) => String(a.object).localeCompare(String(b.object)))
      .map(([uploadId, upload]) => [
        `<Upload>`,
        `<Key>${escapeXml(upload.object)}</Key>`,
        `<UploadId>${escapeXml(uploadId)}</UploadId>`,
        `<Initiator><ID>siyuan-cloud</ID><DisplayName>Siyuan Cloud</DisplayName></Initiator>`,
        `<Owner><ID>siyuan-cloud</ID><DisplayName>Siyuan Cloud</DisplayName></Owner>`,
        `<StorageClass>STANDARD</StorageClass>`,
        `<Initiated>${escapeXml(upload.started || new Date().toISOString())}</Initiated>`,
        `</Upload>`,
      ].join(""))
      .join("");
    return xmlResponse([
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">`,
      `<Bucket>${escapeXml(bucket)}</Bucket>`,
      `<KeyMarker></KeyMarker><UploadIdMarker></UploadIdMarker>`,
      `<NextKeyMarker></NextKeyMarker><NextUploadIdMarker></NextUploadIdMarker>`,
      `<Prefix>${escapeXml(prefix)}</Prefix><Delimiter></Delimiter>`,
      `<MaxUploads>1000</MaxUploads><IsTruncated>false</IsTruncated>`,
      uploadXml,
      `</ListMultipartUploadsResult>`,
    ].join(""));
  };

  return async (request) => {
    const requestMeta = request.request || request.Request || {};
    const method = String(requestMeta.method || requestMeta.Method || "GET").toUpperCase();
    const path = requestPath(request);
    const { bucket, object } = s3PathParts(path);

    if (method === "OPTIONS") {
      const response = textResponse("", 204);
      response.headers.Allow = ["OPTIONS, GET, HEAD, PUT, DELETE"];
      return response;
    }

    if (!bucket) {
      if (method === "GET" || method === "HEAD") return listBucketsXml();
      return errorXml("MethodNotAllowed", "method not allowed", 405);
    }
    if (bucket !== DEFAULT_BUCKET) return errorXml("NoSuchBucket", "bucket does not exist", 404);

    if (!object) {
      if (method === "POST") {
        const requestUrl = request.url || request.URL || {};
        const query = requestUrl.query || requestUrl.Query || "";
        if (new URLSearchParams(query).has("delete")) {
          const objects = await parseDeleteObjects(requestMeta);
          for (const key of objects) removeEntry(objectPath(key));
          await saveState();
          return multiDeleteXml(objects);
        }
      }
      if (method === "GET" || method === "HEAD") {
        const requestUrl = request.url || request.URL || {};
        const query = requestUrl.query || requestUrl.Query || "";
        const params = new URLSearchParams(query);
        if (params.has("uploads")) {
          return listMultipartUploadsXml(bucket, ensureMultipartState(), {
            prefix: params.get("prefix") || "",
          });
        }
        return listBucketXml(bucket, {
          delimiter: params.get("delimiter") || "",
          maxKeys: params.get("max-keys") || params.get("maxKeys") || 1000,
          prefix: params.get("prefix") || "",
        });
      }
      if (method === "PUT") return textResponse("", 200);
      if (method === "DELETE") return textResponse("", 204);
      return errorXml("MethodNotAllowed", "method not allowed", 405);
    }

    const fsPath = objectPath(object);
    const state = getState();
    const entry = state.entries[fsPath];
    const requestUrl = request.url || request.URL || {};
    const query = requestUrl.query || requestUrl.Query || "";
    const params = new URLSearchParams(query);

    if (method === "GET" || method === "HEAD") {
      if (params.has("uploadId")) {
        const uploadId = params.get("uploadId");
        const upload = ensureMultipartState()[uploadId];
        if (!upload) return errorXml("NoSuchUpload", "multipart upload does not exist", 404);
        return listMultipartXml(bucket, object, params.get("uploadId"), upload);
      }
      if (!entry || entry.is_dir) return errorXml("NoSuchKey", "object does not exist", 404);
      return objectResponse(entry, method === "HEAD");
    }
    if (method === "POST" && params.has("uploads")) {
      const uploadId = `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      ensureMultipartState()[uploadId] = { bucket, object, parts: {}, started: new Date().toISOString() };
      await saveState();
      return initiateMultipartXml(bucket, object, uploadId);
    }
    if (method === "POST" && params.has("uploadId")) {
      const uploadId = params.get("uploadId");
      const uploads = ensureMultipartState();
      const upload = uploads[uploadId];
      if (!upload) return errorXml("NoSuchUpload", "multipart upload does not exist", 404);
      const content = Object.entries(upload.parts || {})
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, part]) => part.content || "")
        .join("");
      ensureDir(dirname(fsPath));
      createFile(fsPath, content, "application/octet-stream");
      delete uploads[uploadId];
      await saveState();
      return completeMultipartXml(bucket, object, getState().entries[fsPath]);
    }
    if (method === "PUT") {
      if (params.has("uploadId") && params.has("partNumber")) {
        const upload = ensureMultipartState()[params.get("uploadId")];
        if (!upload) return errorXml("NoSuchUpload", "multipart upload does not exist", 404);
        const content = await requestBodyText(requestMeta);
        upload.parts[String(params.get("partNumber"))] = {
          content,
          size: content.length,
        };
        await saveState();
        const response = textResponse("", 200);
        response.headers.ETag = [`"${content.length}"`];
        return response;
      }
      const srcPath = copySource(requestMeta);
      if (srcPath) {
        if (!state.entries[srcPath]) return errorXml("NoSuchKey", "copy source does not exist", 404);
        ensureDir(dirname(fsPath));
        cloneEntryTree(srcPath, fsPath);
        await saveState();
        return copyResultXml();
      }
      const isDir = object.endsWith("/");
      if (isDir) {
        ensureDir(fsPath);
      } else {
        ensureDir(dirname(fsPath));
        createFile(fsPath, await requestBodyText(requestMeta), headerValue(requestMeta, "Content-Type") || "application/octet-stream");
      }
      await saveState();
      const response = textResponse("", 200);
      response.headers.ETag = [`"${getState().entries[fsPath]?.size || 0}"`];
      return response;
    }
    if (method === "DELETE") {
      if (params.has("uploadId")) {
        const uploadId = params.get("uploadId");
        const uploads = ensureMultipartState();
        if (!uploads[uploadId]) return errorXml("NoSuchUpload", "multipart upload does not exist", 404);
        delete uploads[uploadId];
        await saveState();
        return textResponse("", 204);
      }
      removeEntry(fsPath);
      await saveState();
      return textResponse("", 204);
    }

    return errorXml("MethodNotAllowed", "method not allowed", 405);
  };
};
