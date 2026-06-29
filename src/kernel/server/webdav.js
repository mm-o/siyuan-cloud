import { normalizePath } from "../internal/model/path.js";
import { textResponse } from "./common/response.js";
import {
  canWebdavManage,
  canWebdavRead,
} from "../internal/model/user.js";

const escapeXml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const webdavPath = (path) => normalizePath(path.replace(/^\/dav\/?/, "/"));

const propResponse = ({ href, item }) => {
  const collection = item.is_dir ? "<D:resourcetype><D:collection/></D:resourcetype>" : "<D:resourcetype/>";
  const length = item.is_dir ? "" : `<D:getcontentlength>${Number(item.size || 0)}</D:getcontentlength>`;
  return [
    "<D:response>",
    `<D:href>${escapeXml(href)}</D:href>`,
    "<D:propstat><D:prop>",
    `<D:displayname>${escapeXml(item.name || "")}</D:displayname>`,
    collection,
    length,
    `<D:getlastmodified>${escapeXml(new Date(item.modified || Date.now()).toUTCString())}</D:getlastmodified>`,
    "</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>",
    "</D:response>",
  ].join("");
};

export const createWebDavServer = ({
  currentUser,
  getState,
  cloneEntryTree,
  createFile,
  ensureDir,
  isWorkspacePath,
  moveEntryTree,
  readFileResponse,
  removeEntry,
  requestPath,
  saveState,
  toObjResp,
  workspaceGet,
  workspaceList,
}) => {
  const listVirtual = (path) => {
    const state = getState();
    const entry = state.entries[path];
    if (!entry || !entry.is_dir) return null;
    const items = entry.children.map((childPath) => state.entries[childPath]).filter(Boolean);
    if (path === "/") {
      items.unshift({
        name: "@workspace",
        is_dir: true,
        size: 0,
        modified: new Date().toISOString(),
        created: new Date().toISOString(),
      });
    }
    return { entry, items };
  };

  const getVirtual = (path) => {
    const state = getState();
    if (path === "/") {
      return { name: "", is_dir: true, size: 0, modified: new Date().toISOString() };
    }
    return state.entries[path] || null;
  };

  const propfind = async (request, path) => {
    const fsPath = webdavPath(path);
    let current;
    let children = [];
    if (isWorkspacePath(fsPath)) {
      const got = await workspaceGet(fsPath);
      if (got.error) return textResponse("", got.error.code || 404);
      current = got.data;
      if (current.is_dir) {
        const listed = await workspaceList(fsPath, { page: 1, per_page: 100000 });
        if (!listed.error) children = listed.data.content || [];
      }
    } else {
      current = getVirtual(fsPath);
      const listed = listVirtual(fsPath);
      if (listed) children = listed.items.map(toObjResp);
    }
    if (!current) return textResponse("", 404);

    const hrefBase = "/dav" + (fsPath === "/" ? "/" : fsPath);
    const responses = [propResponse({ href: hrefBase, item: current })];
    const depth = String(request.headers?.depth || request.headers?.Depth || "1");
    if (current.is_dir && depth !== "0") {
      for (const child of children) {
        responses.push(propResponse({
          href: normalizePath(hrefBase + "/" + child.name) + (child.is_dir ? "/" : ""),
          item: child,
        }));
      }
    }
    return textResponse(`<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${responses.join("")}</D:multistatus>`, 207, "application/xml; charset=utf-8");
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

  const destinationPath = (requestMeta) => {
    const raw = headerValue(requestMeta, "Destination");
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      return webdavPath(parsed.pathname.replace(/^\/plugin\/private\/[^/]+/, ""));
    } catch (_) {
      return webdavPath(raw.replace(/^\/plugin\/private\/[^/]+/, ""));
    }
  };

  const rejectWorkspaceWrite = (fsPath) => {
    if (!isWorkspacePath(fsPath)) return null;
    return textResponse("WebDAV write operations for /@workspace are disabled until SiYuan upload/move support is proven", 501);
  };

  const lockToken = () => `opaquelocktoken:siyuan-cloud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  const lockResponse = (token) => textResponse([
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock>`,
    `<D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope>`,
    `<D:depth>infinity</D:depth><D:timeout>Second-3600</D:timeout>`,
    `<D:locktoken><D:href>${escapeXml(token)}</D:href></D:locktoken>`,
    `</D:activelock></D:lockdiscovery></D:prop>`,
  ].join(""), 200, "application/xml; charset=utf-8");

  return async (request) => {
    const requestMeta = request.request || request.Request || {};
    const method = String(requestMeta.method || requestMeta.Method || "GET").toUpperCase();
    const path = requestPath(request);
    const user = currentUser?.(request);
    if (method === "OPTIONS") {
      return {
        ...textResponse("", 204),
        headers: {
          Allow: ["OPTIONS, GET, HEAD, PROPFIND, MKCOL, PUT, DELETE, COPY, MOVE, LOCK, UNLOCK, PROPPATCH"],
          DAV: ["1, 2"],
        },
      };
    }
    if (!canWebdavRead(user)) return textResponse("Forbidden", 403);
    if (["PUT", "MKCOL", "MOVE", "COPY", "DELETE", "PROPPATCH"].includes(method) && !canWebdavManage(user)) {
      return textResponse("Forbidden", 403);
    }
    if (method === "PROPFIND") return propfind(requestMeta, path);
    if (method === "GET" || method === "HEAD") return readFileResponse(webdavPath(path), request);
    if (method === "MKCOL") {
      const fsPath = webdavPath(path);
      const rejected = rejectWorkspaceWrite(fsPath);
      if (rejected) return rejected;
      ensureDir(fsPath);
      await saveState();
      return textResponse("", 201);
    }
    if (method === "PUT") {
      const fsPath = webdavPath(path);
      const rejected = rejectWorkspaceWrite(fsPath);
      if (rejected) return rejected;
      createFile(fsPath, await requestBodyText(requestMeta), headerValue(requestMeta, "Content-Type"));
      await saveState();
      return textResponse("", 201);
    }
    if (method === "DELETE") {
      const fsPath = webdavPath(path);
      const rejected = rejectWorkspaceWrite(fsPath);
      if (rejected) return rejected;
      removeEntry(fsPath);
      await saveState();
      return textResponse("", 204);
    }
    if (method === "COPY" || method === "MOVE") {
      const srcPath = webdavPath(path);
      const dstPath = destinationPath(requestMeta);
      const rejected = rejectWorkspaceWrite(srcPath) || rejectWorkspaceWrite(dstPath);
      if (rejected) return rejected;
      if (!dstPath) return textResponse("missing Destination header", 400);
      if (method === "COPY") cloneEntryTree(srcPath, dstPath);
      if (method === "MOVE") moveEntryTree(srcPath, dstPath);
      await saveState();
      return textResponse("", 201);
    }
    if (method === "LOCK") {
      const fsPath = webdavPath(path);
      const token = lockToken(fsPath);
      const state = getState();
      state.webdav_locks = state.webdav_locks || {};
      state.webdav_locks[token] = { path: fsPath, created: new Date().toISOString() };
      await saveState();
      const response = lockResponse(token);
      response.headers["Lock-Token"] = [`<${token}>`];
      return response;
    }
    if (method === "UNLOCK") {
      const state = getState();
      const token = headerValue(requestMeta, "Lock-Token").replace(/[<>]/g, "");
      if (state.webdav_locks && token) delete state.webdav_locks[token];
      await saveState();
      return textResponse("", 204);
    }
    if (method === "PROPPATCH") {
      return textResponse(`<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:"/>`, 207, "application/xml; charset=utf-8");
    }
    return textResponse("method not allowed", 405);
  };
};
