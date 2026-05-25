import { basename, dirname, normalizePath } from "../model/path.js";
import {
  basicAuth,
  forwardProxy,
  joinUrl,
} from "./http.js";

const davHeaders = (addition, extra = {}) => ({
  Authorization: basicAuth(addition.username, addition.password),
  ...extra,
});

const stripTags = (value) => String(value || "").replace(/<[^>]+>/g, "").trim();
const hrefText = (xml) => stripTags(xml.match(/<[^:>]*:?href[^>]*>[\s\S]*?<\/[^:>]*:?href>/i)?.[0] || "");
const tagText = (xml, name) => stripTags(xml.match(new RegExp(`<[^:>]*:?${name}[^>]*>[\\s\\S]*?<\\/[^:>]*:?${name}>`, "i"))?.[0] || "");
const isCollection = (xml) => /<[^:>]*:?collection\b/i.test(xml);

const parseDavDate = (raw) => {
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const parsePropfind = (xml, relPath) => {
  const responses = String(xml || "").match(/<[^:>]*:?response\b[\s\S]*?<\/[^:>]*:?response>/gi) || [];
  const current = normalizePath(relPath || "/");
  return responses
    .map((chunk) => {
      const href = decodeURIComponent(hrefText(chunk));
      const name = tagText(chunk, "displayname") || basename(href.replace(/\/+$/, ""));
      const path = normalizePath(current + "/" + name);
      return {
        name,
        path,
        is_dir: isCollection(chunk),
        size: Number(tagText(chunk, "getcontentlength") || 0),
        modified: parseDavDate(tagText(chunk, "getlastmodified")),
        created: parseDavDate(tagText(chunk, "creationdate")),
      };
    })
    .filter((item) => item.name && normalizePath(item.path) !== current);
};

export const createWebDavDriver = ({ client }) => {
  const request = (storage, relPath, options = {}) => {
    const addition = storage.addition_json;
    return forwardProxy(client, joinUrl(addition.address, normalizePath((addition.root_folder_path || "/") + "/" + relPath)), {
      ...options,
      headers: davHeaders(addition, options.headers || {}),
      timeout: Number(addition.timeout || 30000),
    });
  };

  return {
    async list(storage, relPath) {
      const data = await request(storage, relPath, {
        body: "<?xml version=\"1.0\"?><propfind xmlns=\"DAV:\"><allprop/></propfind>",
        contentType: "application/xml",
        headers: { Depth: "1" },
        method: "PROPFIND",
      });
      const content = parsePropfind(data.body, relPath);
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
      const head = await request(storage, relPath, { method: "HEAD" });
      return {
        name: basename(relPath),
        path: relPath,
        is_dir: false,
        size: Number(head.headers?.["Content-Length"] || head.headers?.["content-length"] || 0),
        modified: new Date().toISOString(),
        created: new Date().toISOString(),
        raw_url: `/plugin/private/siyuan-cloud/d${normalizePath(storage.mount_path + "/" + relPath)}`,
        provider: "WebDav",
        related: [],
      };
    },
    async read(storage, relPath) {
      return request(storage, relPath, { method: "GET", responseEncoding: "base64" });
    },
    async mkdir(storage, relPath) {
      await request(storage, relPath, { method: "MKCOL" });
    },
    async remove(storage, relPath) {
      await request(storage, relPath, { method: "DELETE" });
    },
    async rename(storage, relPath, newName) {
      const addition = storage.addition_json;
      await request(storage, relPath, {
        headers: { Destination: joinUrl(addition.address, normalizePath((addition.root_folder_path || "/") + "/" + dirname(relPath) + "/" + newName)) },
        method: "MOVE",
      });
    },
    async put(storage, relPath, content, mime) {
      await request(storage, relPath, {
        body: content || "",
        contentType: mime || "application/octet-stream",
        method: "PUT",
      });
    },
  };
};
