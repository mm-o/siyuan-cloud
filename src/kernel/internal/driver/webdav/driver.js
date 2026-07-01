import { basename, dirname, normalizePath } from "../../model/path.js";
import {
  basicAuth,
  forwardProxy,
  joinUrl,
} from "../http.js";

const propfindBody = `<d:propfind xmlns:d='DAV:'>
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:getetag/>
    <d:getlastmodified/>
  </d:prop>
</d:propfind>`;

const fixSlash = (path) => String(path || "/").endsWith("/") ? String(path || "/") : `${path}/`;
const join = (path0, path1) => `${String(path0 || "").replace(/\/+$/, "")}/${String(path1 || "").replace(/^\/+/, "")}`;
const rootPath = (storage) => storage.addition_json.root_folder_path || "/";
const fullPath = (storage, path) => normalizePath(join(rootPath(storage), path));
const requestUrl = (storage, path) => joinUrl(storage.addition_json.address, path);

const requestHeaders = (addition, headers = {}) => ({
  Authorization: basicAuth(addition.username, addition.password),
  ...headers,
});

const request = (client, storage, path, options = {}) =>
  forwardProxy(client, requestUrl(storage, path), {
    ...options,
    headers: requestHeaders(storage.addition_json, options.headers || {}),
    timeout: Number(storage.addition_json.timeout || 30000),
  });

const propfind = (client, storage, path, self) =>
  request(client, storage, path, {
    body: propfindBody,
    contentType: "application/xml;charset=UTF-8",
    headers: {
      Accept: "application/xml,text/xml",
      "Accept-Charset": "utf-8",
      "Accept-Encoding": "",
      Depth: self ? "0" : "1",
    },
    method: "PROPFIND",
  });

const stripTags = (value) => String(value || "").replace(/<[^>]+>/g, "").trim();
const tagText = (xml, name) => stripTags(xml.match(new RegExp(`<[^:>]*:?${name}[^>]*>[\\s\\S]*?<\\/[^:>]*:?${name}>`, "i"))?.[0] || "");
const hrefText = (xml) => stripTags(xml.match(/<[^:>]*:?href[^>]*>[\s\S]*?<\/[^:>]*:?href>/i)?.[0] || "");
const isCollection = (xml) => /<[^:>]*:?collection\b/i.test(xml);

const pathUnescape = (value) => {
  const raw = String(value || "");
  try {
    return decodeURIComponent(new URL(raw, "http://webdav.local").pathname);
  } catch (_) {
    try {
      return decodeURIComponent(raw.split(/[?#]/)[0]);
    } catch (_) {
      return raw.split(/[?#]/)[0];
    }
  }
};

const parseModified = (value, fallback = new Date().toISOString()) => {
  const date = value ? new Date(value) : new Date(fallback);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};

const responses = (xml) => String(xml || "").match(/<[^:>]*:?response\b[\s\S]*?<\/[^:>]*:?response>/gi) || [];

const readDir = async (client, storage, path) => {
  const dirPath = fixSlash(fullPath(storage, path));
  const data = await propfind(client, storage, dirPath, false);
  let skipSelf = true;
  return responses(data.body).flatMap((chunk) => {
    const collection = isCollection(chunk);
    if (skipSelf) {
      skipSelf = false;
      if (collection) return [];
      throw new Error("405");
    }
    const hrefName = basename(pathUnescape(hrefText(chunk)).replace(/\/+$/, ""));
    const name = hrefName || tagText(chunk, "displayname");
    if (!name) return [];
    return [{
      name,
      path: normalizePath(join(path, name)),
      is_dir: collection,
      size: collection ? 0 : Number(tagText(chunk, "getcontentlength") || 0),
      modified: parseModified(tagText(chunk, "getlastmodified")),
    }];
  });
};

const stat = async (client, storage, path) => {
  const data = await propfind(client, storage, fullPath(storage, path), true);
  const chunk = responses(data.body)[0];
  if (!chunk) throw new Error("object not found");
  const collection = isCollection(chunk);
  return {
    name: tagText(chunk, "displayname") || basename(path),
    path,
    is_dir: collection,
    size: collection ? 0 : Number(tagText(chunk, "getcontentlength") || 0),
    modified: collection ? new Date(0).toISOString() : parseModified(tagText(chunk, "getlastmodified"), new Date(0).toISOString()),
  };
};

const link = (storage, path) => ({
  url: requestUrl(storage, fullPath(storage, path)),
  header: requestHeaders(storage.addition_json),
});

const mkdirAll = async (client, storage, path) => {
  await request(client, storage, fixSlash(fullPath(storage, path)), { method: "MKCOL" });
};

const copyMove = (client, storage, method, oldPath, newPath) =>
  request(client, storage, fullPath(storage, oldPath), {
    headers: {
      Destination: requestUrl(storage, fullPath(storage, newPath)),
      Overwrite: "T",
    },
    method,
  });

const renamePath = (client, storage, oldPath, newPath) => copyMove(client, storage, "MOVE", oldPath, newPath);
const copyPath = (client, storage, oldPath, newPath) => copyMove(client, storage, "COPY", oldPath, newPath);

const removeAll = async (client, storage, path) => {
  await request(client, storage, fullPath(storage, path), { method: "DELETE" });
};

const writeStream = (client, storage, path, content, mime, options = {}) => {
  const body = content || "";
  return request(client, storage, fullPath(storage, path), {
    body,
    contentType: mime || "application/octet-stream",
    headers: {
      "Content-Length": String(options.size || (options.bodyEncoding === "base64" ? 0 : String(body).length)),
      "Content-Type": mime || "application/octet-stream",
    },
    method: "PUT",
    payloadEncoding: options.bodyEncoding === "base64" ? "base64" : undefined,
  });
};

export const createWebDavDriver = ({ client }) => ({
  async list(storage, relPath) {
    const content = await readDir(client, storage, relPath);
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider: "WebDav",
      direct_upload_tools: [],
    };
  },
  async get(storage, relPath) {
    const info = await stat(client, storage, relPath);
    return {
      ...info,
      provider: "WebDav",
      related: [],
    };
  },
  async read(storage, relPath) {
    return { link: link(storage, relPath) };
  },
  async mkdir(storage, relPath) {
    await mkdirAll(client, storage, relPath);
  },
  async move(storage, relPath, dstRelPath) {
    await renamePath(client, storage, relPath, normalizePath(join(dstRelPath, basename(relPath))));
  },
  async copy(storage, relPath, dstRelPath) {
    await copyPath(client, storage, relPath, normalizePath(join(dstRelPath, basename(relPath))));
  },
  async remove(storage, relPath) {
    await removeAll(client, storage, relPath);
  },
  async rename(storage, relPath, newName) {
    await renamePath(client, storage, relPath, normalizePath(join(dirname(relPath), newName)));
  },
  async put(storage, relPath, content, mime, options = {}) {
    await writeStream(client, storage, relPath, content, mime, options);
  },
});
