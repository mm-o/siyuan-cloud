import {
  archiveKind,
  archiveNotImplemented,
  canReadArchive,
  entryBytes,
  extractArchiveEntriesAsync,
  extractArchiveEntryAsync,
  extractZipArchiveEntryReaderAsync,
  parseArchive,
  parseZipArchiveAsync,
  sharingArchiveNotImplemented,
} from "../../internal/fs/archive.js";
import { forwardProxy } from "../../internal/driver/http.js";
import { linkFromDriverData } from "../../internal/model/args.js";
import {
  basename,
  dirname,
  normalizePath,
} from "../../internal/model/path.js";
import {
  canAccessByMeta,
  canWriteByMeta,
  nearestMeta,
} from "../../internal/model/meta.js";
import {
  canDecompress,
  canReadArchives,
  isAdminUser,
} from "../../internal/model/user.js";
import {
  countShareAccess,
  shareClientIP,
  sharePathInfo,
} from "./share.js";
import {
  failure,
  jsonResponse,
  pageResp,
  rawResponse,
  success,
  textResponse,
} from "../common/response.js";

const parseArchiveRequest = async (request, parseJson) => {
  if (request.method === "GET" || request.method === "HEAD")
    return Object.fromEntries(new URL(request.url).searchParams.entries());
  return parseJson(request);
};

const isSharingArchivePath = (path) => typeof path === "string" && path.startsWith("/@s");
const requestArchivePass = (req = {}) => req.archive_pass || req.archivePass || req.pass || "";

const rawArchiveUrl = (path) => `/plugin/private/siyuan-cloud/ae${normalizePath(path)}`;
const rawShareArchiveUrl = (path, pwd = "") =>
  `/plugin/private/siyuan-cloud/sad${normalizePath(path)}${pwd ? `?pwd=${encodeURIComponent(pwd)}` : ""}`;

const joinPath = (dir, name) => normalizePath(`${normalizePath(dir || "/").replace(/\/+$/, "")}/${String(name || "").replace(/^\/+/, "")}`);
const pathWithinBase = (path, basePath) => {
  const target = normalizePath(path);
  const base = normalizePath(basePath || "/");
  return base === "/" || target === base || target.startsWith(`${base}/`);
};
const canUsePath = (user, path) => !user || isAdminUser(user) || pathWithinBase(path, user.base_path);
const canAccessArchivePath = (state, user, path, password = "") =>
  canUsePath(user, path) && canAccessByMeta(user, nearestMeta(state, path), path, password);
const canWriteArchivePath = (state, user, path) =>
  canUsePath(user, path) && canWriteByMeta(user, nearestMeta(state, path), path);

const relativeArchivePath = (archivePath, innerPath) => {
  const inner = String(innerPath || "").replace(/^\/+|\/+$/g, "");
  const path = String(archivePath || "");
  if (!inner) return path;
  if (path === inner) return basename(path);
  return path.startsWith(`${inner}/`) ? path.slice(inner.length + 1) : path;
};

const mimeType = (name) => {
  const ext = String(name || "").toLowerCase().split(".").pop() || "";
  const types = {
    css: "text/css; charset=utf-8",
    csv: "text/csv; charset=utf-8",
    html: "text/html; charset=utf-8",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    js: "application/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    png: "image/png",
    svg: "image/svg+xml",
    txt: "text/plain; charset=utf-8",
    webp: "image/webp",
  };
  return types[ext] || "application/octet-stream";
};

const archiveMountedNotImplemented = (operation, mount, error = "") => ({
  ...archiveNotImplemented(operation),
  reason: "Archive preview for mounted driver files requires a readable archive byte stream; this driver path is not wired yet.",
  error,
  storage: {
    driver: mount?.storage?.driver || "",
    mount_path: mount?.storage?.mount_path || "",
  },
});

const bytesFromDriverRead = (data) => {
  if (!data || data.link) return null;
  if (String(data.bodyEncoding || data.body_encoding || "").startsWith("base64")) {
    return base64EntryBytes(data.body || "");
  }
  if (data.body !== undefined) {
    return entryBytes({
      content: data.body || "",
      body_encoding: "text",
      is_dir: false,
    });
  }
  return null;
};

const base64EntryBytes = (content) => entryBytes({
  content,
  body_encoding: "base64",
  is_dir: false,
});

const driverLink = (data) => {
  const link = linkFromDriverData(data);
  return {
    ...link,
    headers: link.header || data.link?.headers || {},
    size: Number(link.content_length || link.contentLength || data.link?.content_length || data.link?.contentLength || 0),
  };
};

const fetchDriverLink = async (client, link, headers) => {
  const resp = await forwardProxy(client, link.url, {
    allowErrorStatus: true,
    contentType: "",
    headers,
    method: link.method || "GET",
    responseEncoding: "base64",
    timeout: 120000,
  });
  if (Number(resp.status || 0) >= 400) throw new Error(`HTTP ${resp.status}: ${decodeBase64Error(resp.body || "").slice(0, 300)}`);
  return resp;
};

const bytesFromDriverLink = async (client, data) => {
  if (!client || !data?.link) return null;
  const link = driverLink(data);
  const resp = await fetchDriverLink(client, link, link.headers);
  return base64EntryBytes(resp.body || "");
};

const driverLinkReader = (client, data) => {
  if (!client || !data?.link) return null;
  const link = driverLink(data);
  return {
    size: link.size,
    async rangeRead(start = 0, end) {
      const offset = Math.max(0, Number(start || 0));
      const boundedEnd = end === undefined || end === null ? null : Math.max(offset, Number(end || 0));
      const resp = await fetchDriverLink(client, link, {
        ...link.headers,
        Range: `bytes=${offset}-`,
      });
      let bytes = base64EntryBytes(resp.body || "");
      if (Number(resp.status || 0) === 200 && offset > 0) bytes = bytes.slice(offset);
      return {
        bytes: boundedEnd === null ? bytes : bytes.slice(0, boundedEnd - offset + 1),
        headers: resp.headers || {},
        status: resp.status,
      };
    },
  };
};

const archiveSourceFromDriverRead = async (client, path, readData) => {
  const bytes = bytesFromDriverRead(readData);
  if (bytes) return { bytes, archive: parseArchive(bytes, path) };
  if (archiveKind(path) === "zip") {
    const reader = driverLinkReader(client, readData);
    if (reader) return { reader, archive: await parseZipArchiveAsync(reader) };
  }
  const linkedBytes = await bytesFromDriverLink(client, readData);
  return linkedBytes ? { bytes: linkedBytes, archive: parseArchive(linkedBytes, path) } : {};
};

const decodeBase64Error = (value) => {
  const input = String(value || "");
  if (!input) return "";
  try {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const clean = input.replace(/[\r\n\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const bytes = [];
    for (let i = 0; i < clean.length; i += 4) {
      const a = chars.indexOf(clean[i]);
      const b = chars.indexOf(clean[i + 1]);
      const c = clean[i + 2] === "=" ? -1 : chars.indexOf(clean[i + 2]);
      const d = clean[i + 3] === "=" ? -1 : chars.indexOf(clean[i + 3]);
      if (a < 0 || b < 0) return input;
      bytes.push((a << 2) | (b >> 4));
      if (c >= 0) bytes.push(((b & 15) << 4) | (c >> 2));
      if (d >= 0) bytes.push(((c & 3) << 6) | d);
    }
    return new TextDecoder().decode(Uint8Array.from(bytes)) || input;
  } catch (_) {
    return input;
  }
};

const bytesToBase64 = (bytes) => {
  if (!bytes || !bytes.length) return "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = hasB ? bytes[index + 1] : 0;
    const c = hasC ? bytes[index + 2] : 0;
    output += chars[a >> 2];
    output += chars[((a & 3) << 4) | (b >> 4)];
    output += hasB ? chars[((b & 15) << 2) | (c >> 6)] : "=";
    output += hasC ? chars[c & 63] : "=";
  }
  return output;
};

const loadArchive = async ({ client, driverRuntime, getState, operation, req }) => {
  const path = normalizePath(req.path || "/");
  const entry = getState().entries[path];
  if (!canReadArchive(path)) {
    return {
      error: failure(
        "archive preview is not implemented in the SiYuan kernel port yet",
        501,
        archiveNotImplemented(operation),
      ),
      status: 501,
    };
  }
  if (entry && !entry.is_dir) {
    const bytes = entryBytes(entry);
    return {
      path,
      bytes,
      archive: parseArchive(bytes, path),
    };
  }
  const mount = driverRuntime?.resolve(getState().storages, path);
  if (mount) {
    let lastError = "";
    if (mount.driver?.read) {
      try {
        const readData = await mount.driver.read(mount.storage, mount.relPath, {});
        const source = await archiveSourceFromDriverRead(client, path, readData);
        if (source.bytes || source.reader) return { path, ...source };
      } catch (error) {
        lastError = error?.message || String(error);
        // Fall through to the structured mounted-driver placeholder.
      }
    }
    return {
      error: failure(
        "archive preview for mounted driver files is not implemented in the SiYuan kernel port yet",
        501,
        archiveMountedNotImplemented(operation, mount, lastError),
      ),
      status: 501,
    };
  }
  return {
    error: failure("object not found", 404),
    status: 404,
  };
};

const loadShareArchive = async ({ client, driverRuntime, getState, operation, request, req, saveState }) => {
  const sharePath = normalizePath(String(req.path || "").replace(/^\/@s/, ""));
  const info = sharePathInfo({ path: sharePath, password: req.password || req.pwd, state: getState() });
  if (!info) {
    return {
      error: failure("the share does not exist", 500, sharingArchiveNotImplemented(operation)),
      status: 500,
    };
  }
  await countShareAccess({ info, ip: shareClientIP(request), saveState });
  const loaded = await loadArchive({
    client,
    driverRuntime,
    getState,
    operation,
    req: { ...req, path: info.targetPath },
  });
  return {
    ...loaded,
    shareInfo: info,
    sharePath,
  };
};

export const createArchiveHandlers = ({
  client,
  createFile,
  currentUser,
  driverRuntime,
  ensureDir,
  getState,
  page,
  parseJson,
  saveState,
  taskStore,
}) => ({
  "ANY /api/fs/archive/meta": async (request) => {
    const req = await parseArchiveRequest(request, parseJson);
    if (isSharingArchivePath(req.path)) {
      const loaded = await loadShareArchive({ client, driverRuntime, getState, operation: "share_meta", request, req, saveState });
      if (loaded.error) return jsonResponse(loaded.error, loaded.status);
      return jsonResponse(success({
        comment: loaded.archive.comment,
        encrypted: loaded.archive.encrypted,
        content: loaded.archive.tree,
        raw_url: rawShareArchiveUrl(loaded.sharePath, loaded.shareInfo?.normalizedShare?.pwd || ""),
        sign: "",
      }));
    }
    const user = currentUser?.(request);
    const path = normalizePath(req.path || "/");
    if (!canReadArchives(user) || !canAccessArchivePath(getState(), user, path, req.password || req.pwd)) {
      return jsonResponse(failure("permission denied", 403));
    }
    const loaded = await loadArchive({ client, driverRuntime, getState, operation: "meta", req });
    if (loaded.error) return jsonResponse(loaded.error, loaded.status);
    return jsonResponse(success({
      comment: loaded.archive.comment,
      encrypted: loaded.archive.encrypted,
      content: loaded.archive.tree,
      raw_url: rawArchiveUrl(loaded.path),
      sign: "",
    }));
  },
  "ANY /api/fs/archive/list": async (request) => {
    const req = await parseArchiveRequest(request, parseJson);
    if (isSharingArchivePath(req.path)) {
      const loaded = await loadShareArchive({ client, driverRuntime, getState, operation: "share_list", request, req, saveState });
      if (loaded.error) return jsonResponse(loaded.error, loaded.status);
      const items = loaded.archive.list(req.inner_path || "/");
      return jsonResponse(success(pageResp(page(items, req), items.length)));
    }
    const user = currentUser?.(request);
    const path = normalizePath(req.path || "/");
    if (!canReadArchives(user) || !canAccessArchivePath(getState(), user, path, req.password || req.pwd)) {
      return jsonResponse(failure("permission denied", 403));
    }
    const loaded = await loadArchive({ client, driverRuntime, getState, operation: "list", req });
    if (loaded.error) return jsonResponse(loaded.error, loaded.status);
    const items = loaded.archive.list(req.inner_path || "/");
    return jsonResponse(success(pageResp(page(items, req), items.length)));
  },
  "POST /api/fs/archive/decompress": async (request) => {
    const req = await parseJson(request);
    const creator = currentUser?.(request);
    const names = Array.isArray(req.name) ? req.name : Array.isArray(req.names) ? req.names : [];
    const srcPaths = names.length
      ? names.map((name) => joinPath(req.src_dir || dirname(req.src_path || req.path || "/"), name))
      : [normalizePath(req.src_path || req.path || joinPath(req.src_dir || "/", req.name || ""))];
    const dstDir = normalizePath(req.dst_dir || req.dst_path || "/");
    if (!canDecompress(creator) || srcPaths.some((srcPath) => !canUsePath(creator, srcPath)) || !canWriteArchivePath(getState(), creator, dstDir)) {
      return jsonResponse(failure("permission denied", 403));
    }
    const dstMount = driverRuntime?.resolve(getState().storages, dstDir);
    if (dstMount && !dstMount.driver?.put)
      return jsonResponse(failure("driver put is not implemented", 501, archiveNotImplemented("decompress_upload")), 501);
    const tasks = [];
    try {
      for (const srcPath of srcPaths) {
        const loaded = await loadArchive({ client, driverRuntime, getState, operation: "decompress", req: { ...req, path: srcPath } });
        if (loaded.error) return jsonResponse(loaded.error, loaded.status);
        const base = basename(srcPath).replace(/\.[^.]+$/, "") || basename(srcPath);
        const targetRoot = req.put_into_new_dir ? joinPath(dstDir, base) : dstDir;
        ensureDir(targetRoot);
        const bytes = loaded.bytes || (getState().entries[srcPath] && entryBytes(getState().entries[srcPath]));
        const entries = await extractArchiveEntriesAsync(bytes, srcPath, {
          archive_pass: requestArchivePass(req),
          innerPath: req.inner_path || "/",
        });
        for (const item of entries) {
          const relative = relativeArchivePath(item.entry.archive_path, req.inner_path);
          const outPath = joinPath(targetRoot, relative || item.entry.name);
          const body = bytesToBase64(item.bytes);
          if (dstMount) {
            const outMount = driverRuntime.resolve(getState().storages, outPath);
            if (!outMount || outMount.storage !== dstMount.storage) throw new Error("cross-storage archive decompress is not supported");
            await outMount.driver.put(outMount.storage, outMount.relPath, body, mimeType(item.entry.name), {
              bodyEncoding: "base64",
              overwrite: !!req.overwrite,
              size: item.bytes.byteLength,
            });
          } else {
            if (!req.overwrite && getState().entries[outPath]) throw new Error(`file [${basename(outPath)}] exists`);
            createFile(outPath, body, mimeType(item.entry.name), {
              bodyEncoding: "base64",
              size: item.bytes.byteLength,
            });
          }
        }
        tasks.push(await taskStore.addTask(dstMount ? "decompress_upload" : "decompress", {
          creator,
          name: `decompress ${srcPath} to ${targetRoot}`,
          status: "completed",
          totalBytes: entries.reduce((sum, item) => sum + Number(item.bytes.byteLength || 0), 0),
        }));
      }
      await saveState();
      return jsonResponse(success({ task: tasks }));
    } catch (error) {
      const message = error?.message || "archive decompress failed";
      const status = /encrypted archive entry|wrong archive password|not implemented/i.test(message) ? 501 : 500;
      const task = await taskStore.addTask("decompress", {
        creator,
        error: message,
        name: srcPaths.join(", "),
        status: "failed",
      });
      return jsonResponse(failure(message, status, { task }), status);
    }
  },
});

export const createArchiveDownloadResponse = ({ client, driverRuntime, getState }) => async ({ archivePath, download, innerPath, pass }) => {
  const path = normalizePath(archivePath || "/");
  if (!canReadArchive(path)) return textResponse("archive download is not implemented in the SiYuan kernel port yet", 501);
  const entry = getState().entries[path];
  let bytes = null;
  let reader = null;
  let archive = null;
  if (entry && !entry.is_dir) {
    bytes = entryBytes(entry);
  } else {
    const mount = driverRuntime?.resolve(getState().storages, path);
    let lastError = "";
    if (mount?.driver?.read) {
      try {
        const readData = await mount.driver.read(mount.storage, mount.relPath, {});
        ({ bytes = null, reader = null, archive = null } = await archiveSourceFromDriverRead(client, path, readData));
      } catch (error) {
        lastError = error?.message || String(error);
        bytes = null;
        reader = null;
        archive = null;
      }
    }
    if (!bytes && !reader && mount) return textResponse(lastError || "archive download for mounted driver files is not implemented in the SiYuan kernel port yet", 501);
  }
  if (!bytes && !reader) return textResponse("object not found", 404);
  try {
    const extracted = reader
      ? await extractZipArchiveEntryReaderAsync(reader, innerPath || "/", { archive, pass })
      : await extractArchiveEntryAsync(bytes, path, innerPath || "/", { pass });
    return rawResponse(
      extracted.bytes,
      200,
      mimeType(extracted.entry.name),
      download ? {
        "Content-Disposition": [`attachment; filename="${encodeURIComponent(extracted.entry.name)}"`],
      } : {},
    );
  } catch (error) {
    const message = error?.message || "archive download is not implemented in the SiYuan kernel port yet";
    const status = /not found/.test(message) ? 404 : 501;
    return textResponse(message, status);
  }
};
