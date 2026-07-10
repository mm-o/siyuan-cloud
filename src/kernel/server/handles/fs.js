import {
  failure,
  jsonResponse,
  pageResp,
  success,
  successWithMessage,
} from "../common/response.js";
import {
  basename,
  dirname,
  isSafeRelativeName,
  normalizePath,
} from "../../internal/model/path.js";
import {
  canAccessByMeta,
  canReadByMeta,
  canWriteByMeta,
  isHiddenByMeta,
  metaCoversPath,
  metaHeader,
  metaReadme,
  nearestMeta,
} from "../../internal/model/meta.js";
import {
  canAddOfflineDownloadTasks,
  canCopy,
  canMove,
  canRemove,
  canRename,
  canWriteContent,
  isAdminUser,
} from "../../internal/model/user.js";
import { linkFromDriverData } from "../../internal/model/args.js";
import { forwardProxy } from "../../internal/driver/http.js";
import { driverInfoMap } from "../../internal/driver/info.js";
import {
  bytesToBase64 as torrentBytesToBase64,
  DEFAULT_TORRENT_PIECE_SIZE,
  generateTorrentFromChunks,
  generateTorrentBytes,
  parseTorrentBytes,
  torrentBytesFromRequest,
} from "../../internal/fs/torrent.js";

export const createFsHandlers = ({
  client,
  cloneEntryTree,
  createFile,
  currentUser,
  driverRuntime,
  ensureDir,
  getState,
  isWorkspacePath,
  moveEntryTree,
  now,
  page,
  parseJson,
  removeEmptyDirs,
  removeEntry,
  renameEntryInDir,
  saveConfigState,
  saveState,
  searchIndex,
  shareGet,
  shareClientIP,
  shareList,
  siyuanApiJson,
  taskStore,
  toFsGetResp,
  toObjResp,
  workspaceGet,
  workspaceList,
  workspaceReadText,
  workspaceRelPath,
}) => {
  const state = new Proxy({}, {
    get: (_, prop) => getState()[prop],
    set: (_, prop, value) => {
      getState()[prop] = value;
      return true;
    },
  });

  const boolValue = (value, fallback = false) => {
    if (value === undefined || value === null || value === "") return fallback;
    return value === true || value === "true" || value === 1 || value === "1";
  };

  const storageShouldProxy = (storage) => {
    const config = driverInfoMap()[storage?.driver]?.config || {};
    return boolValue(config.only_proxy) || boolValue(storage?.web_proxy, boolValue(config.prefer_proxy));
  };

  const proxyRawUrl = (path) => `/plugin/private/siyuan-cloud/p${normalizePath(path)}`;
  const rawUrlForStorage = (storage, path, linkUrl = "") => storageShouldProxy(storage) ? proxyRawUrl(path) : linkUrl;
  const motrixNextApiUrl = (value) => {
    const apiUrl = String(value || `http://127.0.0.1:29110`).trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^/\s]+/i.test(apiUrl)) throw new Error("Motrix Next API URL must start with http:// or https://");
    return apiUrl;
  };

  const requestMeta = (request) => request?.request || request?.Request || {};
  const requestHeaders = (request) => requestMeta(request)?.headers || requestMeta(request)?.Headers || {};
  const requestHeader = (request, name) => {
    const target = String(name || "").toLowerCase();
    for (const [key, value] of Object.entries(requestHeaders(request))) {
      if (String(key).toLowerCase() !== target) continue;
      return Array.isArray(value) ? String(value[0] || "") : String(value || "");
    }
    return "";
  };
  const requestContentType = (request) =>
    requestHeader(request, "Content-Type")
    || requestMeta(request)?.contentType
    || requestMeta(request)?.ContentType
    || "application/octet-stream";
  const decodePathValue = (value) => {
    const input = String(value || "");
    if (!input) return "";
    try {
      return decodeURIComponent(input);
    } catch (_) {
      return input;
    }
  };
  const requestBodyData = (request) => {
    const body = requestMeta(request)?.body || requestMeta(request)?.Body || {};
    return body.data !== undefined ? body.data : body.Data;
  };
  const firstFormFile = (files) => {
    for (const value of Object.values(files || {})) {
      if (Array.isArray(value) && value[0]) return value[0];
    }
    return null;
  };
  const arrayBufferFromBytes = (value) => {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (Array.isArray(value)) return Uint8Array.from(value.map((item) => Number(item) & 0xff));
    if (value && typeof value === "object" && Array.isArray(value.data)) {
      return Uint8Array.from(value.data.map((item) => Number(item) & 0xff));
    }
    return null;
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
  const overwriteEnabled = (request, req) => {
    const header = requestHeader(request, "Overwrite");
    if (header) return header !== "false";
    if (req.overwrite === undefined || req.overwrite === null || req.overwrite === "") return true;
    return boolValue(req.overwrite, true);
  };
  const uploadTargetExists = async (path) => {
    if (isWorkspacePath(path)) {
      const payload = await siyuanApiJson("/api/file/readDir", { path: workspaceRelPath(dirname(path)) });
      if (payload.code !== 0) return false;
      return (payload.data || []).some((entry) => entry?.name === basename(path));
    }
    const mount = driverRuntime.resolve(state.storages, path);
    if (mount) {
      try {
        await mount.driver.get(mount.storage, mount.relPath, { skipLink: true });
        return true;
      } catch (_) {
        return false;
      }
    }
    return !!state.entries[path];
  };
  const uploadFromRawRequest = async (request, req, fallbackName) => {
    const rawPath = req.path || req.file_path || req.name || decodePathValue(requestHeader(request, "File-Path")) || fallbackName;
    const path = normalizePath(rawPath || fallbackName);
    const mime = req.mime || requestContentType(request);
    const data = requestBodyData(request);
    if (typeof data === "string") {
      return { body: data, bodyEncoding: "text", mime, path, size: data.length };
    }
    const bytes = arrayBufferFromBytes(data);
    if (bytes) {
      return {
        body: bytesToBase64(bytes),
        bodyEncoding: "base64",
        mime,
        path,
        size: bytes.byteLength,
      };
    }
    const content = req.content ?? req.data ?? "";
    const bodyEncoding = String(req.body_encoding || req.bodyEncoding || "").toLowerCase() === "base64" ? "base64" : "text";
    return {
      body: String(content),
      bodyEncoding,
      mime,
      path,
      size: Number(req.size || 0) || (bodyEncoding === "base64" ? Math.floor(String(content).length * 3 / 4) : String(content).length),
    };
  };
  const uploadFromFormRequest = async (request, req) => {
    const file = firstFormFile(req.files);
    const fileData = file?.data ?? file?.Data;
    const bytes = arrayBufferFromBytes(fileData);
    const filename = file?.filename || file?.Filename || req.file_name || req.name || "upload.bin";
    const path = normalizePath(req.path || req.file_path || decodePathValue(requestHeader(request, "File-Path")) || joinPath(req.dir || dirname(req.path || "/"), filename));
    const mime = file?.headers?.["Content-Type"]?.[0]
      || file?.Headers?.["Content-Type"]?.[0]
      || req.mime
      || requestContentType(request);
    if (bytes) {
      return {
        body: bytesToBase64(bytes),
        bodyEncoding: "base64",
        mime,
        path,
        size: bytes.byteLength,
      };
    }
    if (Number(file?.size || file?.Size || 0) > 0) throw new Error("upload file body is empty");
    return {
      body: "",
      bodyEncoding: "text",
      mime,
      path,
      size: Number(file?.size || file?.Size || 0),
    };
  };
  const joinPath = (dir, name) => normalizePath(`${normalizePath(dir || "/").replace(/\/+$/, "")}/${String(name || "").replace(/^\/+/, "")}`);
  const driverPut = async (mount, upload) => {
    await mount.driver.put(mount.storage, mount.relPath, upload.body, upload.mime, {
      bodyEncoding: upload.bodyEncoding,
      size: upload.size,
    });
  };
  const sameStorageMount = (left, right) =>
    !!left
    && !!right
    && (
      (left.storage?.id && right.storage?.id && left.storage.id === right.storage.id)
      || normalizePath(left.storage?.mount_path || "/") === normalizePath(right.storage?.mount_path || "/")
    );
  const torrentNotImplemented = (operation) => ({
    operation,
    reason: "torrent CAS rapid upload and generation are not implemented in the SiYuan kernel JavaScript port yet.",
    upstream_source: "server/handles/torrent.go + pkg/torrent/* + drivers/189pc/torrent.go",
    next: "Port 189/189PC CAS rapid-upload and RangeReader-backed torrent generation before enabling this route.",
  });
  const fsTorrentPlaceholder = (operation, req = {}) => jsonResponse(failure(
    "torrent operations are not implemented in the SiYuan kernel port yet",
    501,
    {
      ...torrentNotImplemented(operation),
      name: req.path || req.file_name || req.name || "torrent",
    },
  ), 501);
  const fsTorrentRequiredError = (field) => jsonResponse(failure(`${field} is required`, 400), 400);
  const fsTorrentValidate = (operation, req = {}) => {
    if ((operation === "parse" || operation === "rapid_upload") && !req.torrent_data)
      return fsTorrentRequiredError("torrent_data");
    if ((operation === "rapid_upload" || operation === "generate") && !req.path)
      return fsTorrentRequiredError("path");
    return null;
  };
  const fsTorrentParse = (req, options = {}) => {
    try {
      return jsonResponse(success(parseTorrentBytes(torrentBytesFromRequest(req, options))));
    } catch (error) {
      return jsonResponse(failure(error.message || "parse torrent failed", 400), 400);
    }
  };
  const fsTorrentUploadParse = (req) => {
    try {
      const bytes = torrentBytesFromRequest(req);
      return jsonResponse(success({
        info: parseTorrentBytes(bytes),
        torrent_data: bytesToBase64(bytes),
      }));
    } catch (error) {
      return jsonResponse(failure(error.message || "parse torrent failed", 400), 400);
    }
  };
  const base64ToBytes = (value) => {
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
    return Uint8Array.from(bytes);
  };
  const textToBytes = (value) => {
    const text = unescape(encodeURIComponent(String(value || "")));
    return Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0)));
  };
  const bytesFromDriverRead = (data) => {
    if (!data || data.link) return null;
    if (String(data.bodyEncoding || data.body_encoding || "").startsWith("base64"))
      return base64ToBytes(data.body || "");
    if (data.body !== undefined) return textToBytes(data.body || "");
    return null;
  };
  const decodeBase64Error = (value) => {
    const input = String(value || "");
    if (!input) return "";
    try {
      return new TextDecoder().decode(base64ToBytes(input)) || input;
    } catch (_) {
      return input;
    }
  };
  const bytesFromDriverLink = async (data) => {
    if (!client || !data?.link) return null;
    const link = linkFromDriverData(data);
    const resp = await forwardProxy(client, link.url, {
      allowErrorStatus: true,
      contentType: "",
      headers: {
        ...(link.header || data.link?.headers || {}),
        Range: "bytes=0-",
      },
      method: link.method || "GET",
      responseEncoding: "base64",
      timeout: 120000,
    });
    if (Number(resp.status || 0) >= 400) throw new Error(`HTTP ${resp.status}: ${String(resp.body || "").slice(0, 200)}`);
    const bytes = base64ToBytes(resp.body || "");
    if (!bytes.byteLength && Number(link.content_length || data.link?.content_length || 0) > 0) throw new Error("driver link returned empty file body");
    return bytes;
  };
  const driverLinkChunks = async (data, size, chunkSize = DEFAULT_TORRENT_PIECE_SIZE) => {
    const chunks = [];
    if (!client || !data?.link) return chunks;
    const link = linkFromDriverData(data);
    const total = Number(size || link.content_length || data.link?.content_length || 0);
    if (!total) {
      const bytes = await bytesFromDriverLink(data);
      if (bytes) chunks.push(bytes);
      return chunks;
    }
    for (let offset = 0; offset < total; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, total) - 1;
      const resp = await forwardProxy(client, link.url, {
        allowErrorStatus: true,
        contentType: "",
        headers: {
          ...(link.header || data.link?.headers || {}),
          Range: `bytes=${offset}-${end}`,
        },
        method: link.method || "GET",
        responseEncoding: "base64",
        timeout: 120000,
      });
      if (Number(resp.status || 0) >= 400) throw new Error(`HTTP ${resp.status}: ${decodeBase64Error(resp.body || "").slice(0, 300)}`);
      const bytes = base64ToBytes(resp.body || "");
      if (!bytes.byteLength && end >= offset) throw new Error("driver link returned empty file body");
      chunks.push(bytes.slice(0, end - offset + 1));
    }
    return chunks;
  };
  const torrentSourceFromPath = async (path) => {
    if (isWorkspacePath(path)) {
      const file = await workspaceReadText(path);
      if (!file.ok) throw new Error(file.text || "not found");
      return { bytes: textToBytes(file.text || ""), name: basename(path), size: String(file.text || "").length };
    }
    const mount = driverRuntime.resolve(state.storages, path);
    if (mount?.driver?.get) {
      const obj = await mount.driver.get(mount.storage, mount.relPath, { skipLink: true });
      if (obj?.is_dir) throw new Error("directories are not supported for torrent generation");
      if (!mount.driver.read) throw new Error("this storage does not expose a readable file body");
      const readData = await mount.driver.read(mount.storage, mount.relPath, {});
      const inlineBytes = bytesFromDriverRead(readData);
      if (inlineBytes) return { bytes: inlineBytes, mount, name: obj?.name || basename(path), size: Number(obj?.size || inlineBytes.byteLength) };
      if (readData?.link) return {
        chunks: await driverLinkChunks(readData, Number(obj?.size || readData.link?.content_length || 0)),
        mount,
        name: obj?.name || basename(path),
        size: Number(obj?.size || readData.link?.content_length || 0),
      };
      const bytes = await bytesFromDriverLink(readData);
      if (!bytes || !bytes.byteLength) throw new Error("this storage does not expose a readable file body");
      return { bytes, mount, name: obj?.name || basename(path), size: Number(obj?.size || bytes.byteLength) };
    }
    const entry = state.entries[path];
    if (!entry || entry.is_dir) throw new Error(entry?.is_dir ? "directories are not supported for torrent generation" : "object not found");
    const bytes = String(entry.body_encoding || "").startsWith("base64")
      ? base64ToBytes(entry.content || "")
      : textToBytes(entry.content || "");
    return { bytes, name: entry.name || basename(path), size: Number(entry.size || bytes.byteLength) };
  };
  const fsTorrentGenerate = async (req) => {
    try {
      const path = normalizePath(req.path || "/");
      const source = await torrentSourceFromPath(path);
      if (source.size > 1024 * 1024 * 1024) return jsonResponse(failure("file too large to generate torrent (max 1GB)", 400), 400);
      if (boolValue(req.with_cas, false) && !["189Cloud", "189CloudPC"].includes(source.mount?.storage?.driver || ""))
        return jsonResponse(failure("CAS torrent generation only supports 189Cloud/189CloudPC storage", 400), 400);
      const generated = source.chunks
        ? generateTorrentFromChunks(source.chunks, {
          name: source.name,
          size: source.size,
          withCas: boolValue(req.with_cas, false),
        })
        : generateTorrentBytes(source.bytes, {
        name: source.name,
        withCas: boolValue(req.with_cas, false),
      });
      return jsonResponse(success({
        file_name: `${source.name}.torrent`,
        info_hash: generated.info_hash,
        size: generated.torrent.byteLength,
        torrent_data: torrentBytesToBase64(generated.torrent),
        with_cas: boolValue(req.with_cas, false),
      }));
    } catch (error) {
      return jsonResponse(failure(error.message || "generate torrent failed", 400), 400);
    }
  };
  const fsTorrentRapidUpload = async (req) => {
    try {
      const bytes = torrentBytesFromRequest(req, { requireBase64: true });
      const info = parseTorrentBytes(bytes);
      if (!info.has_cas) return jsonResponse(failure("torrent does not contain CAS extension information", 400), 400);
      const mount = driverRuntime.resolve(state.storages, normalizePath(req.path || "/"));
      if (!mount) return jsonResponse(failure("target storage does not support CAS rapid upload", 400), 400);
      if (!mount.driver.rapidUploadFromTorrent)
        return jsonResponse(failure("target storage does not expose CAS rapid upload", 501, torrentNotImplemented("rapid_upload")), 501);
      const obj = await mount.driver.rapidUploadFromTorrent(mount.storage, mount.relPath, bytes, {
        overwrite: req.overwrite !== false,
      });
      return jsonResponse(success({
        file_name: obj?.name || info.name,
        file_size: Number(obj?.size || info.total_size || 0),
        message: "rapid upload succeeded",
      }));
    } catch (error) {
      return jsonResponse(failure(error.message || "torrent rapid upload failed", 400), 400);
    }
  };
  const shouldSkipExisting = (req) => boolValue(req.skip_existing, false);
  const shouldMerge = (req) => boolValue(req.merge, false);
  const shouldOverwrite = (req) => boolValue(req.overwrite, false);
  const permissionDenied = () => failure("permission denied", 403);
  const pathWithinBase = (path, basePath) => {
    const target = normalizePath(path);
    const base = normalizePath(basePath || "/");
    return base === "/" || target === base || target.startsWith(`${base}/`);
  };
  const requestUser = (request) => currentUser?.(request);
  const joinUserPath = (user, path) => {
    const target = normalizePath(path || "/");
    if (!user || isAdminUser(user)) return target;
    if (!pathWithinBase(target, user.base_path)) return null;
    return target;
  };
  const readMeta = (path) => nearestMeta(getState(), path);
  const canAccessFs = (user, path, password = "") => {
    const meta = readMeta(path);
    return canAccessByMeta(user, meta, path, password);
  };
  const canReadFs = (user, path) => canReadByMeta(user, readMeta(path), path);
  const canWriteFs = (user, path) => canWriteByMeta(user, readMeta(path), path);
  const writeContentBypass = (path) => {
    const meta = readMeta(path);
    return !!(meta?.write && metaCoversPath(meta.path, path, meta.w_sub));
  };
  const driverTargetIsDir = async (path) => {
    const mount = driverRuntime.resolve(state.storages, path);
    if (!mount) return false;
    try {
      return !!(await mount.driver.get(mount.storage, mount.relPath, { skipLink: true }))?.is_dir;
    } catch (_) {
      return false;
    }
  };
  const driverList = async (mount, relPath, refresh = false) =>
    (await mount.driver.list(mount.storage, relPath, { page: 1, per_page: 100000, refresh }))?.content || [];
  const driverRemoveIfExists = async (mount, relPath) => {
    if (!mount.driver.remove) return;
    try {
      await mount.driver.remove(mount.storage, relPath);
    } catch (_) {
      // OpenList overwrite paths ignore missing destination checks until the driver op itself runs.
    }
  };
  const extensionType = (name, isDir) => {
    if (isDir) return 1;
    const ext = String(name).toLowerCase().split(".").pop() || "";
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"].includes(ext)) return 2;
    if (["mp4", "mkv", "mov", "avi", "webm", "m4v"].includes(ext)) return 3;
    if (["mp3", "flac", "wav", "ogg", "m4a"].includes(ext)) return 4;
    if (["zip", "7z", "rar", "tar", "gz", "bz2"].includes(ext)) return 5;
    if (["pdf", "epub", "txt", "md", "json", "yaml", "yml", "csv", "log"].includes(ext)) return 6;
    return 0;
  };
  const driverObjResp = (item) => ({
    name: item.name || "",
    size: Number(item.size || 0),
    is_dir: !!item.is_dir,
    modified: item.modified || new Date().toISOString(),
    created: item.created || item.modified || new Date().toISOString(),
    sign: item.sign || "",
    thumb: item.thumb || "",
    type: Number(item.type || extensionType(item.name, item.is_dir)),
    hashinfo: item.hashinfo || "",
    hash_info: item.hash_info || {},
  });
  const driverListResp = (data) => {
    const content = (data.content || []).map(driverObjResp);
    return {
      content,
      total: Number(data.total || content.length),
      readme: data.readme || "",
      header: data.header || "",
      write: data.write !== false,
      write_content_bypass: data.write_content_bypass !== false,
      provider: data.provider || "unknown",
      direct_upload_tools: data.direct_upload_tools || [],
    };
  };
  const driverGetResp = (data, rawUrl = "") => ({
    ...driverObjResp(data),
    raw_url: rawUrl || data.raw_url || "",
    readme: data.readme || "",
    header: data.header || "",
    provider: data.provider || "unknown",
    related: (data.related || []).map(driverObjResp),
  });

  const handlers = {
    "ANY /api/fs/list": async (request) => {
      const req = await parseJson(request);
      const path = normalizePath(req.path);
      const sharing = await shareList({ ...req, client_ip: shareClientIP?.(request), path });
      if (sharing?.error) return jsonResponse(sharing.error);
      if (sharing?.data) return jsonResponse(success(sharing.data));
      const user = requestUser(request);
      if (!joinUserPath(user, path) || !canAccessFs(user, path, req.password || req.pwd)) return jsonResponse(permissionDenied());
      if (isWorkspacePath(path)) {
        const result = await workspaceList(path, req);
        if (result.error) return jsonResponse(result.error);
        return jsonResponse(success(result.data));
      }
      const mount = driverRuntime.resolve(state.storages, path);
      if (mount) {
        try {
          const data = await mount.driver.list(mount.storage, mount.relPath, req);
          return jsonResponse(success(driverListResp(data)));
        } catch (error) {
          return jsonResponse(failure(error.message || "driver list failed", 502, {
            driver: mount.storage.driver,
            mount_path: mount.storage.mount_path,
          }));
        }
      }
      const entry = state.entries[path];
      if (!entry || !entry.is_dir) return jsonResponse(failure("directory not found", 404));
      const meta = nearestMeta(getState(), path);
      const canWriteAtPath = canWriteFs(user, path);
      const children = entry.children
        .map((childPath) => state.entries[childPath])
        .filter(Boolean)
        .filter((item) => !isHiddenByMeta(meta, item.path, item.name))
        .map(toObjResp);
      if (path === "/") {
        for (const mountEntry of driverRuntime.mountEntries(state.storages, now)) {
          if (!children.some((item) => item.name === mountEntry.name)) children.unshift(toObjResp(mountEntry));
        }
      }
      const content = page(children, req);
      return jsonResponse(success({
        content,
        total: children.length,
        readme: metaReadme(meta, path),
        header: metaHeader(meta, path),
        write: canWriteAtPath,
        write_content_bypass: writeContentBypass(path),
        provider: "siyuan-storage",
        direct_upload_tools: [],
      }));
    },
    "ANY /api/fs/get": async (request) => {
      const req = await parseJson(request);
      const path = normalizePath(req.path);
      const sharing = await shareGet({ ...req, client_ip: shareClientIP?.(request), path });
      if (sharing?.error) return jsonResponse(sharing.error);
      if (sharing?.data) return jsonResponse(success(sharing.data));
      const user = requestUser(request);
      if (!joinUserPath(user, path) || !canAccessFs(user, path, req.password || req.pwd)) return jsonResponse(permissionDenied());
      if (isWorkspacePath(path)) {
        const result = await workspaceGet(path);
        if (result.error) return jsonResponse(result.error);
        return jsonResponse(success(result.data));
      }
      const mount = driverRuntime.resolve(state.storages, path);
      if (mount) {
        try {
          const shouldProxy = storageShouldProxy(mount.storage);
          const data = await mount.driver.get(mount.storage, mount.relPath, { skipLink: shouldProxy });
          const rawUrl = data && !data.is_dir && shouldProxy && mount.storage.driver !== "SiYuanWorkspace"
            ? rawUrlForStorage(mount.storage, path)
            : data.raw_url || "";
          return jsonResponse(success(driverGetResp(data, rawUrl)));
        } catch (error) {
          return jsonResponse(failure(error.message || "driver get failed", 502, {
            driver: mount.storage.driver,
            mount_path: mount.storage.mount_path,
          }));
        }
      }
      const entry = state.entries[path];
      if (!entry) return jsonResponse(failure("object not found", 404));
      const meta = nearestMeta(getState(), path);
      return jsonResponse(success({
        ...toFsGetResp(entry, path),
        readme: metaReadme(meta, path),
        header: metaHeader(meta, path),
      }));
    },
    "ANY /api/fs/dirs": async (request) => {
      const req = await parseJson(request);
      const path = normalizePath(req.path);
      const user = requestUser(request);
      if (!joinUserPath(user, path) || !canAccessFs(user, path, req.password || req.pwd)) return jsonResponse(permissionDenied());
      if (isWorkspacePath(path)) {
        const result = await workspaceList(path, req);
        if (result.error) return jsonResponse(result.error);
        return jsonResponse(success(result.data.content.filter((item) => item.is_dir).map((item) => ({
          name: item.name,
          modified: item.modified,
        }))));
      }
      const mount = driverRuntime.resolve(state.storages, path);
      if (mount) {
        try {
          const data = await mount.driver.list(mount.storage, mount.relPath, req);
          return jsonResponse(success((data.content || [])
            .filter((item) => item.is_dir)
            .map((item) => ({
              name: item.name,
              modified: item.modified || new Date().toISOString(),
            }))));
        } catch (error) {
          return jsonResponse(failure(error.message || "driver dirs failed", 502, {
            driver: mount.storage.driver,
            mount_path: mount.storage.mount_path,
          }));
        }
      }
      const entry = state.entries[path];
      if (!entry || !entry.is_dir) return jsonResponse(failure("directory not found", 404));
      const dirs = entry.children
        .map((childPath) => state.entries[childPath])
        .filter((item) => item && item.is_dir)
        .map((item) => ({ name: item.name, modified: item.modified }));
      return jsonResponse(success(dirs));
    },
    "ANY /api/fs/search": async (request) => {
      const req = await parseJson(request);
      const parent = normalizePath(req.parent || req.path || "/");
      const user = requestUser(request);
      if (!joinUserPath(user, parent)) return jsonResponse(permissionDenied());
      const pageIndex = Number(req.page || 0);
      const perPage = Number(req.per_page || req.perPage || 0);
      if (!Number.isFinite(pageIndex) || pageIndex < 1) return jsonResponse(failure("page can't < 1", 400));
      if (!Number.isFinite(perPage) || perPage < 1) return jsonResponse(failure("per_page can't < 1", 400));
      const result = searchIndex.search({
        keywords: req.keywords || req.keyword || "",
        page: pageIndex,
        parent,
        per_page: perPage,
        scope: req.scope || 0,
      });
      const content = result.content.filter((node) => {
        const itemPath = normalizePath(`${node.parent}/${node.name}`);
        return pathWithinBase(itemPath, user?.base_path || "/") && canAccessFs(user, itemPath, req.password || req.pwd);
      });
      return jsonResponse(success(pageResp(content.map((node) => ({
        parent: node.parent,
        name: node.name,
        is_dir: node.is_dir,
        size: node.size,
        type: extensionType(node.name, node.is_dir),
      })), result.total)));
    },
    "POST /api/fs/mkdir": async (request) => {
      const req = await parseJson(request);
      const path = normalizePath(req.path || [req.parent, req.name].filter(Boolean).join("/"));
      const user = requestUser(request);
      const parent = dirname(path);
      if (!joinUserPath(user, path) || (!canWriteContent(user) && !writeContentBypass(parent)) || !canWriteFs(user, parent)) {
        return jsonResponse(permissionDenied());
      }
      const mount = driverRuntime.resolve(state.storages, path);
      if (mount) {
        try {
          await mount.driver.mkdir(mount.storage, mount.relPath);
          return jsonResponse(success());
        } catch (error) {
          return jsonResponse(failure(error.message || "driver mkdir failed", 502));
        }
      }
      ensureDir(dirname(path));
      ensureDir(path);
      await saveState();
      return jsonResponse(success());
    },
    "PUT /api/fs/put": async (request) => {
      const req = await parseJson(request);
      const upload = await uploadFromRawRequest(request, req, "/untitled.txt");
      const path = upload.path;
      const user = requestUser(request);
      const parent = dirname(path);
      if (!joinUserPath(user, path) || (!canWriteContent(user) && !writeContentBypass(parent)) || !canWriteFs(user, parent)) {
        return jsonResponse(permissionDenied());
      }
      if (!overwriteEnabled(request, req) && await uploadTargetExists(path)) return jsonResponse(failure("file exists", 403));
      const mount = driverRuntime.resolve(state.storages, path);
      if (mount) {
        try {
          await driverPut({ ...mount, relPath: mount.relPath }, upload);
          return jsonResponse(success({ path }));
        } catch (error) {
          return jsonResponse(failure(error.message || "driver put failed", 502));
        }
      }
      if (isWorkspacePath(path)) {
        return jsonResponse(failure("workspace upload is blocked until /api/file/putFile multipart bridging is proven in the kernel plugin runtime", 501));
      }
      createFile(path, upload.body, upload.mime, {
        bodyEncoding: upload.bodyEncoding,
        size: upload.size,
      });
      await saveState();
      return jsonResponse(success({ path }));
    },
    "PUT /api/fs/form": async (request) => {
      const req = await parseJson(request);
      const upload = await uploadFromFormRequest(request, req);
      const path = upload.path;
      const user = requestUser(request);
      const parent = dirname(path);
      if (!joinUserPath(user, path) || (!canWriteContent(user) && !writeContentBypass(parent)) || !canWriteFs(user, parent)) {
        return jsonResponse(permissionDenied());
      }
      if (!overwriteEnabled(request, req) && await uploadTargetExists(path)) return jsonResponse(failure("file exists", 403));
      const mount = driverRuntime.resolve(state.storages, path);
      if (mount) {
        try {
          await driverPut({ ...mount, relPath: mount.relPath }, upload);
          return jsonResponse(success({ path }));
        } catch (error) {
          return jsonResponse(failure(error.message || "driver put failed", 502));
        }
      }
      if (isWorkspacePath(path)) {
        return jsonResponse(failure("workspace upload is blocked until /api/file/putFile multipart bridging is proven in the kernel plugin runtime", 501));
      }
      createFile(path, upload.body, upload.mime, {
        bodyEncoding: upload.bodyEncoding,
        size: upload.size,
      });
      await saveState();
      return jsonResponse(success({ path }));
    },
    "POST /api/fs/remove": async (request) => {
      const req = await parseJson(request);
      const names = Array.isArray(req.names) ? req.names : [];
      const dir = normalizePath(req.dir || req.path || "/");
      if (!names.length) return jsonResponse(failure("Empty file names", 400));
      const user = requestUser(request);
      if (!canRemove(user) || !joinUserPath(user, dir) || !canWriteFs(user, dir)) return jsonResponse(permissionDenied());
      let storageRemoved = false;
      if (isWorkspacePath(dir)) {
        for (const name of names) {
          const payload = await siyuanApiJson("/api/file/removeFile", { path: workspaceRelPath(normalizePath(dir + "/" + name)) });
          if (payload.code !== 0 && payload.code !== 404) return jsonResponse(failure(payload.msg || "removeFile failed", payload.code || 500));
        }
        return jsonResponse(success());
      }
      const mount = driverRuntime.resolve(state.storages, dir);
      if (mount) {
        try {
          for (const name of names) {
            await mount.driver.remove(mount.storage, normalizePath(mount.relPath + "/" + name));
          }
          return jsonResponse(success());
        } catch (error) {
          return jsonResponse(failure(error.message || "driver remove failed", 502));
        }
      }
      for (const name of names) {
        const path = normalizePath(dir + "/" + name);
        const storage = state.storages.find((item) => normalizePath(item.mount_path || "/") === path);
        if (storage) {
          state.storages = state.storages.filter((item) => item !== storage);
          storageRemoved = true;
        } else {
          removeEntry(path);
        }
      }
      await (storageRemoved ? saveConfigState?.() : saveState());
      return jsonResponse(success());
    },
    "POST /api/fs/rename": async (request) => {
      const req = await parseJson(request);
      const oldPath = normalizePath(req.path);
      const newName = String(req.name || "").trim();
      const user = requestUser(request);
      const parent = dirname(oldPath);
      if (!canRename(user) || !joinUserPath(user, oldPath) || !canWriteFs(user, parent)) return jsonResponse(permissionDenied());
      if (!isSafeRelativeName(newName)) return jsonResponse(failure("relative path is not allowed", 403));
      if (oldPath === "/") return jsonResponse(failure("rename root folder is not allowed", 500));
      if (!boolValue(req.overwrite, false)) {
        const dstPath = normalizePath(dirname(oldPath) + "/" + newName);
        if (dstPath !== oldPath && await uploadTargetExists(dstPath)) {
          return jsonResponse(failure(`file [${newName}] exists`, 403));
        }
      }
      const mount = driverRuntime.resolve(state.storages, oldPath);
      if (mount) {
        if (mount.relPath === "/") return jsonResponse(failure("rename root folder is not allowed", 500));
        try {
          await mount.driver.rename(mount.storage, mount.relPath, newName);
          return jsonResponse(success());
        } catch (error) {
          return jsonResponse(failure(error.message || "driver rename failed", 502));
        }
      }
      if (isWorkspacePath(oldPath)) {
        if (normalizePath(workspaceRelPath(oldPath)) === "/") return jsonResponse(failure("rename root folder is not allowed", 500));
        const newPath = normalizePath(dirname(oldPath) + "/" + newName);
        const payload = await siyuanApiJson("/api/file/renameFile", {
          path: workspaceRelPath(oldPath),
          newPath: workspaceRelPath(newPath),
        });
        if (payload.code !== 0) return jsonResponse(failure(payload.msg || "renameFile failed", payload.code || 500));
        return jsonResponse(success());
      }
      const entry = state.entries[oldPath];
      if (!entry) return jsonResponse(failure("object not found", 404));
      try {
        renameEntryInDir(dirname(oldPath), entry.name, newName, { overwrite: req.overwrite });
      } catch (error) {
        return jsonResponse(failure(error.message, error.message.includes("exists") ? 403 : 400));
      }
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/fs/move": async (request) => {
      const req = await parseJson(request);
      const creator = currentUser?.(request);
      const names = Array.isArray(req.names) ? req.names : [];
      if (!names.length) return jsonResponse(failure("Empty file names", 400));
      const srcDir = normalizePath(req.src_dir);
      const dstDir = normalizePath(req.dst_dir);
      if (!canMove(creator) || !joinUserPath(creator, srcDir) || !joinUserPath(creator, dstDir) || !canWriteFs(creator, srcDir) || !canWriteFs(creator, dstDir)) {
        return jsonResponse(permissionDenied());
      }
      const srcMount = driverRuntime.resolve(state.storages, srcDir);
      const dstMount = driverRuntime.resolve(state.storages, dstDir);
      if (srcMount || dstMount) {
        if (!srcMount || !dstMount || !sameStorageMount(srcMount, dstMount) || !srcMount.driver.move) {
          return jsonResponse(failure("driver move across mount boundaries is not implemented in the SiYuan kernel port yet", 501));
        }
        for (const name of names) {
          const srcPath = normalizePath(srcDir + "/" + name);
          const dstPath = normalizePath(dstDir + "/" + basename(srcPath));
          if (!shouldOverwrite(req) && await uploadTargetExists(dstPath)) {
            if (!shouldSkipExisting(req)) return jsonResponse(failure(`file [${name}] exists`, 403));
            continue;
          }
          await srcMount.driver.move(srcMount.storage, normalizePath(srcMount.relPath + "/" + name), dstMount.relPath);
        }
        const task = await taskStore.addTask("move", {
          creator,
          name: `move ${names.length} item(s)`,
          status: "Move operations completed immediately",
        });
        return jsonResponse(success({ message: "Move operations completed immediately", tasks: [task] }));
      }
      ensureDir(dstDir);
      for (const name of names) {
        const srcPath = normalizePath(srcDir + "/" + name);
        const dstPath = normalizePath(dstDir + "/" + basename(srcPath));
        if (!state.entries[srcPath]) continue;
        if (!shouldOverwrite(req) && state.entries[dstPath]) {
          if (!shouldSkipExisting(req)) return jsonResponse(failure(`file [${name}] exists`, 403));
          continue;
        }
        if (state.entries[dstPath]) removeEntry(dstPath);
        moveEntryTree(srcPath, dstPath);
      }
      const task = await taskStore.addTask("move", {
        creator,
        name: `move ${names.length} item(s)`,
        status: "Move operations completed immediately",
      });
      return jsonResponse(success({ message: "Move operations completed immediately", tasks: [task] }));
    },
    "POST /api/fs/copy": async (request) => {
      const req = await parseJson(request);
      const creator = currentUser?.(request);
      const names = Array.isArray(req.names) ? req.names : [];
      if (!names.length) return jsonResponse(failure("Empty file names", 400));
      const srcDir = normalizePath(req.src_dir);
      const dstDir = normalizePath(req.dst_dir);
      if (!canCopy(creator) || !joinUserPath(creator, srcDir) || !joinUserPath(creator, dstDir) || !canReadFs(creator, srcDir) || !canWriteFs(creator, dstDir)) {
        return jsonResponse(permissionDenied());
      }
      const srcMount = driverRuntime.resolve(state.storages, srcDir);
      const dstMount = driverRuntime.resolve(state.storages, dstDir);
      if (srcMount || dstMount) {
        if (!srcMount || !dstMount || !sameStorageMount(srcMount, dstMount) || !srcMount.driver.copy) {
          return jsonResponse(failure("driver copy across mount boundaries is not implemented in the SiYuan kernel port yet", 501));
        }
        for (const name of names) {
          const srcPath = normalizePath(srcDir + "/" + name);
          const dstPath = normalizePath(dstDir + "/" + basename(srcPath));
          if (!shouldOverwrite(req) && await uploadTargetExists(dstPath)) {
            if (!shouldSkipExisting(req)) return jsonResponse(failure(`file [${name}] exists`, 403));
            if (!shouldMerge(req) || !await driverTargetIsDir(dstPath)) continue;
          }
          await srcMount.driver.copy(srcMount.storage, normalizePath(srcMount.relPath + "/" + name), dstMount.relPath);
        }
        const task = await taskStore.addTask("copy", {
          creator,
          name: `copy ${names.length} item(s)`,
          status: "Copy operations completed immediately",
        });
        return jsonResponse(success({ message: "Copy operations completed immediately", tasks: [task] }));
      }
      ensureDir(dstDir);
      for (const name of names) {
        const srcPath = normalizePath(srcDir + "/" + name);
        const dstPath = normalizePath(dstDir + "/" + basename(srcPath));
        if (!state.entries[srcPath]) continue;
        if (!shouldOverwrite(req) && state.entries[dstPath]) {
          if (!shouldSkipExisting(req)) return jsonResponse(failure(`file [${name}] exists`, 403));
          if (!shouldMerge(req) || !state.entries[dstPath].is_dir) continue;
        }
        if (state.entries[dstPath] && !shouldMerge(req)) removeEntry(dstPath);
        cloneEntryTree(srcPath, dstPath);
      }
      const task = await taskStore.addTask("copy", {
        creator,
        name: `copy ${names.length} item(s)`,
        status: "Copy operations completed immediately",
      });
      return jsonResponse(success({ message: "Copy operations completed immediately", tasks: [task] }));
    },
    "POST /api/fs/batch_rename": async (request) => {
      const req = await parseJson(request);
      const srcDir = normalizePath(req.src_dir || "/");
      const renameObjects = Array.isArray(req.rename_objects) ? req.rename_objects : [];
      const user = requestUser(request);
      if (!canRename(user) || !joinUserPath(user, srcDir) || !canWriteFs(user, srcDir)) return jsonResponse(permissionDenied());
      if (isWorkspacePath(srcDir)) {
        for (const item of renameObjects) {
          const srcName = String(item.src_name || "");
          const newName = String(item.new_name || "");
          if (!srcName || !newName) continue;
          if (!isSafeRelativeName(newName)) return jsonResponse(failure("relative path is not allowed", 403));
          const srcPath = normalizePath(srcDir + "/" + srcName);
          const newPath = normalizePath(srcDir + "/" + newName);
          const payload = await siyuanApiJson("/api/file/renameFile", {
            path: workspaceRelPath(srcPath),
            newPath: workspaceRelPath(newPath),
          });
          if (payload.code !== 0) return jsonResponse(failure(payload.msg || "renameFile failed", payload.code || 500));
        }
        return jsonResponse(success());
      }
      const mount = driverRuntime.resolve(state.storages, srcDir);
      if (mount) {
        if (!mount.driver.rename) return jsonResponse(failure("not implement", 500));
        for (const item of renameObjects) {
          const srcName = String(item.src_name || "");
          const newName = String(item.new_name || "");
          if (!srcName || !newName) continue;
          if (!isSafeRelativeName(newName)) return jsonResponse(failure("relative path is not allowed", 403));
          try {
            await mount.driver.rename(mount.storage, normalizePath(mount.relPath + "/" + srcName), newName);
          } catch (error) {
            return jsonResponse(failure(error.message || "driver batch rename failed", 502, {
              driver: mount.storage.driver,
              mount_path: mount.storage.mount_path,
            }));
          }
        }
        return jsonResponse(success());
      }
      for (const item of renameObjects) {
        const srcName = String(item.src_name || "");
        const newName = String(item.new_name || "");
        if (!srcName || !newName) continue;
        try {
          renameEntryInDir(srcDir, srcName, newName, { overwrite: !!req.overwrite });
        } catch (error) {
          return jsonResponse(failure(error.message, error.message.includes("exists") ? 403 : 400));
        }
      }
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/fs/regex_rename": async (request) => {
      const req = await parseJson(request);
      const srcDir = normalizePath(req.src_dir || "/");
      const user = requestUser(request);
      if (!canRename(user) || !joinUserPath(user, srcDir) || !canWriteFs(user, srcDir)) return jsonResponse(permissionDenied());
      let pattern;
      try {
        pattern = new RegExp(String(req.src_name_regex || ""));
      } catch (error) {
        return jsonResponse(failure(error.message, 400));
      }
      const replacement = String(req.new_name_regex || "");
      if (isWorkspacePath(srcDir)) {
        const result = await workspaceList(srcDir, { page: 1, per_page: 100000 });
        if (result.error) return jsonResponse(result.error);
        for (const file of result.data.content || []) {
          if (!pattern.test(file.name)) continue;
          pattern.lastIndex = 0;
          const newName = file.name.replace(pattern, replacement);
          if (!isSafeRelativeName(newName)) return jsonResponse(failure("relative path is not allowed", 403));
          const payload = await siyuanApiJson("/api/file/renameFile", {
            path: workspaceRelPath(normalizePath(srcDir + "/" + file.name)),
            newPath: workspaceRelPath(normalizePath(srcDir + "/" + newName)),
          });
          if (payload.code !== 0) return jsonResponse(failure(payload.msg || "renameFile failed", payload.code || 500));
        }
        return jsonResponse(success());
      }
      const mount = driverRuntime.resolve(state.storages, srcDir);
      if (mount) {
        if (!mount.driver.list || !mount.driver.rename) return jsonResponse(failure("not implement", 500));
        let data;
        try {
          data = await mount.driver.list(mount.storage, mount.relPath, { page: 1, per_page: 100000 });
        } catch (error) {
          return jsonResponse(failure(error.message || "driver list failed", 502, {
            driver: mount.storage.driver,
            mount_path: mount.storage.mount_path,
          }));
        }
        for (const file of data.content || []) {
          pattern.lastIndex = 0;
          if (!pattern.test(file.name)) continue;
          pattern.lastIndex = 0;
          const newName = file.name.replace(pattern, replacement);
          if (!isSafeRelativeName(newName)) return jsonResponse(failure("relative path is not allowed", 403));
          try {
            await mount.driver.rename(mount.storage, normalizePath(mount.relPath + "/" + file.name), newName);
          } catch (error) {
            return jsonResponse(failure(error.message || "driver regex rename failed", 502, {
              driver: mount.storage.driver,
              mount_path: mount.storage.mount_path,
            }));
          }
        }
        return jsonResponse(success());
      }
      const dir = state.entries[srcDir];
      if (!dir || !dir.is_dir) return jsonResponse(failure("directory not found", 404));
      for (const childPath of [...(dir.children || [])]) {
        const entry = state.entries[childPath];
        if (!entry || !pattern.test(entry.name)) continue;
        pattern.lastIndex = 0;
        const newName = entry.name.replace(pattern, replacement);
        try {
          renameEntryInDir(srcDir, entry.name, newName, { overwrite: !!req.overwrite });
        } catch (error) {
          return jsonResponse(failure(error.message, error.message.includes("exists") ? 403 : 400));
        }
      }
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/fs/recursive_move": async (request) => {
      const req = await parseJson(request);
      const srcDir = normalizePath(req.src_dir || "/");
      const dstDir = normalizePath(req.dst_dir || "/");
      const user = requestUser(request);
      if (!canMove(user) || !joinUserPath(user, srcDir) || !joinUserPath(user, dstDir) || !canWriteFs(user, srcDir) || !canWriteFs(user, dstDir)) {
        return jsonResponse(permissionDenied());
      }
      const conflictPolicy = String(req.conflict_policy || "skip").toLowerCase();
      if (isWorkspacePath(srcDir) || isWorkspacePath(dstDir)) {
        return jsonResponse(failure("recursive move for /@workspace is not available until workspace upload/move is completed", 501));
      }
      const srcMount = driverRuntime.resolve(state.storages, srcDir);
      const dstMount = driverRuntime.resolve(state.storages, dstDir);
      if (srcMount || dstMount) {
        if (!sameStorageMount(srcMount, dstMount)) {
          return jsonResponse(failure("driver recursive move across mount boundaries is not implemented in the SiYuan kernel port yet", 501));
        }
        if (!srcMount.driver.list || !srcMount.driver.move) return jsonResponse(failure("not implement", 500));
        try {
          const existingNames = [];
          if (conflictPolicy !== "overwrite") {
            existingNames.push(...(await driverList(dstMount, dstMount.relPath)).map((item) => item.name));
          }
          const queue = [{ abs: srcDir, rel: srcMount.relPath }];
          const movingFiles = [];
          while (queue.length) {
            const current = queue.shift();
            for (const item of await driverList(srcMount, current.rel, current.abs !== srcDir)) {
              const absPath = normalizePath(current.abs + "/" + item.name);
              const relPath = normalizePath(current.rel + "/" + item.name);
              if (item.is_dir) {
                queue.push({ abs: absPath, rel: relPath });
                continue;
              }
              if (current.abs === dstDir) continue;
              if (existingNames.includes(item.name)) {
                if (conflictPolicy === "cancel") return jsonResponse(failure(`file [${item.name}] exists`, 403));
                if (conflictPolicy === "skip") continue;
              } else if (conflictPolicy !== "overwrite") {
                existingNames.push(item.name);
              }
              movingFiles.push({ name: item.name, rel: relPath });
            }
          }
          for (const file of movingFiles) {
            if (conflictPolicy === "overwrite") await driverRemoveIfExists(dstMount, normalizePath(dstMount.relPath + "/" + file.name));
            await srcMount.driver.move(srcMount.storage, file.rel, dstMount.relPath);
          }
          return jsonResponse(successWithMessage(`Successfully moved ${movingFiles.length} ${movingFiles.length === 1 ? "file" : "files"}`));
        } catch (error) {
          return jsonResponse(failure(error.message || "driver recursive move failed", 502, {
            driver: srcMount.storage.driver,
            mount_path: srcMount.storage.mount_path,
          }));
        }
      }
      const src = state.entries[srcDir];
      if (!src || !src.is_dir) return jsonResponse(failure("source directory not found", 404));
      ensureDir(dstDir);
      const files = Object.values(state.entries)
        .filter((entry) => entry.path !== srcDir && entry.path.startsWith(srcDir + "/") && !entry.is_dir)
        .sort((a, b) => a.path.localeCompare(b.path));
      let count = 0;
      for (const file of files) {
        const dstPath = normalizePath(dstDir + "/" + file.name);
        if (dirname(file.path) === dstDir) continue;
        if (state.entries[dstPath]) {
          if (conflictPolicy === "cancel") return jsonResponse(failure(`file [${file.name}] exists`, 403));
          if (conflictPolicy === "skip") continue;
          removeEntry(dstPath);
        }
        moveEntryTree(file.path, dstPath);
        count += 1;
      }
      await saveState();
      return jsonResponse(successWithMessage(`Successfully moved ${count} ${count === 1 ? "file" : "files"}`));
    },
    "POST /api/fs/remove_empty_directory": async (request) => {
      const req = await parseJson(request);
      const srcDir = normalizePath(req.src_dir || "/");
      const user = requestUser(request);
      if (!canRemove(user) || !joinUserPath(user, srcDir) || !canWriteFs(user, srcDir)) return jsonResponse(permissionDenied());
      const mount = driverRuntime.resolve(state.storages, srcDir);
      if (mount) {
        if (!mount.driver.list || !mount.driver.remove) return jsonResponse(failure("not implement", 500));
        try {
          const removeEmpty = async (relPath) => {
            const content = await driverList(mount, relPath, true);
            let hasNonDir = content.some((item) => !item.is_dir);
            for (const item of content.filter((entry) => entry.is_dir)) {
              const childRel = normalizePath(relPath + "/" + item.name);
              const removed = await removeEmpty(childRel);
              if (!removed) hasNonDir = true;
            }
            if (hasNonDir) return false;
            if (relPath === mount.relPath) return false;
            await mount.driver.remove(mount.storage, relPath);
            return true;
          };
          for (const item of (await driverList(mount, mount.relPath)).filter((entry) => entry.is_dir)) {
            await removeEmpty(normalizePath(mount.relPath + "/" + item.name));
          }
          return jsonResponse(success());
        } catch (error) {
          return jsonResponse(failure(error.message || "driver remove empty directory failed", 502, {
            driver: mount.storage.driver,
            mount_path: mount.storage.mount_path,
          }));
        }
      }
      removeEmptyDirs(srcDir);
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/fs/link": async (request) => {
      const req = await parseJson(request);
      const path = normalizePath(req.path);
      if (isWorkspacePath(path)) {
        const result = await workspaceGet(path);
        if (result.error) return jsonResponse(result.error);
        return jsonResponse(success({ url: "/plugin/private/siyuan-cloud/d" + path }));
      }
      const mount = driverRuntime.resolve(state.storages, path);
      if (mount && (mount.driver.link || mount.driver.read)) {
        try {
          const readOptions = {
            requestHeaders: requestHeaders(request),
            userAgent: requestHeader(request, "User-Agent"),
          };
          const obj = await mount.driver.get?.(mount.storage, mount.relPath, { skipLink: true });
          const data = mount.driver.link
            ? await mount.driver.link(mount.storage, mount.relPath, readOptions)
            : await mount.driver.read(mount.storage, mount.relPath, readOptions);
          const link = linkFromDriverData(data);
          const contentLength = Number(link.content_length || obj?.size || 0);
          return jsonResponse(success({
            url: link.url,
            header: link.header,
            method: link.method,
            content_length: contentLength,
            raw_url: rawUrlForStorage(mount.storage, path, link.url),
            provider: mount.storage.driver,
          }));
        } catch (error) {
          return jsonResponse(failure(error.message || "driver link failed", 502, {
            driver: mount.storage.driver,
            mount_path: mount.storage.mount_path,
          }));
        }
      }
      if (!state.entries[path]) return jsonResponse(failure("object not found", 404));
      return jsonResponse(success({ url: "/plugin/private/siyuan-cloud/d" + path }));
    },
    "POST /api/fs/motrix_next/add": async (request) => {
      const req = await parseJson(request);
      try {
        const apiUrl = motrixNextApiUrl(req.api_url || req.apiUrl);
        const payload = req.payload || {};
        const resp = await forwardProxy(client, `${apiUrl}/add`, {
          allowErrorStatus: true,
          body: payload,
          headers: req.api_secret || req.apiSecret ? { Authorization: `Bearer ${req.api_secret || req.apiSecret}` } : {},
          method: "POST",
          timeout: 10000,
        });
        if (Number(resp.status) >= 200 && Number(resp.status) < 300) return jsonResponse(success(resp.body || ""));
        return jsonResponse(failure(String(resp.body || `HTTP ${resp.status}`), Number(resp.status) || 502), Number(resp.status) || 502);
      } catch (error) {
        return jsonResponse(failure(error.message || "Motrix Next is unavailable", 502), 502);
      }
    },
    "POST /api/fs/add_offline_download": async (request) => {
      const req = await parseJson(request);
      const creator = currentUser?.(request);
      if (!canAddOfflineDownloadTasks(creator)) return jsonResponse(permissionDenied());
      const urls = (Array.isArray(req.urls) ? req.urls : [req.url]).map((url) => String(url || "").trim()).filter(Boolean);
      const tasks = [];
      for (const url of urls) {
        tasks.push(await taskStore.addTask("offline_download", {
          creator,
          delete_policy: req.delete_policy || "",
          dst_dir_path: normalizePath(req.path || "/"),
          error: "offline download is not implemented in the SiYuan kernel port yet",
          name: url,
          status: "not implemented",
          tool: req.tool || "",
          url,
        }));
      }
      return jsonResponse(failure(
        "offline download is not implemented in the SiYuan kernel port yet",
        501,
        { tasks },
      ), 501);
    },
    "POST /api/fs/get_direct_upload_info": async (request) => {
      const req = await parseJson(request);
      const path = normalizePath(req.path || req.file_path || "/");
      if (!overwriteEnabled(request, req) && await uploadTargetExists(path)) return jsonResponse(failure("file exists", 403));
      const mount = driverRuntime.resolve(state.storages, path);
      if (mount?.driver?.getDirectUploadInfo) {
        try {
          const data = await mount.driver.getDirectUploadInfo(mount.storage, mount.relPath, req);
          return jsonResponse(success(data));
        } catch (error) {
          return jsonResponse(failure(error.message || "get direct upload info failed", 502));
        }
      }
      return jsonResponse(success(null));
    },
    "ANY /api/fs/other": async (request) => {
      const req = await parseJson(request);
      const path = normalizePath(req.path || "/");
      const mount = driverRuntime.resolve(state.storages, path);
      if (!mount) return jsonResponse(failure("not implement", 500));
      if (!mount.driver.other) return jsonResponse(failure("not implement", 500));
      try {
        const data = await mount.driver.other(mount.storage, mount.relPath, {
          data: req.data,
          method: req.method || "",
        });
        return jsonResponse(success(data));
      } catch (error) {
        return jsonResponse(failure(error.message || "not implement", 500));
      }
    },
  };
  handlers["POST /api/fs/torrent/parse"] = async (request) => {
    const req = await parseJson(request);
    return fsTorrentValidate("parse", req) || fsTorrentParse(req, { requireBase64: true });
  };
  handlers["POST /api/fs/torrent/upload_parse"] = async (request) => {
    const req = await parseJson(request);
    return fsTorrentUploadParse(req);
  };
  handlers["POST /api/fs/torrent/rapid_upload"] = async (request) => {
    const req = await parseJson(request);
    const user = requestUser(request);
    const path = normalizePath(req.path || "/");
    if (req.path && (!joinUserPath(user, path) || !canWriteFs(user, path))) return jsonResponse(permissionDenied());
    return fsTorrentValidate("rapid_upload", req) || fsTorrentRapidUpload(req);
  };
  handlers["POST /api/fs/torrent/generate"] = async (request) => {
    const req = await parseJson(request);
    const user = requestUser(request);
    const path = normalizePath(req.path || "/");
    if (req.path && (!joinUserPath(user, path) || !canReadFs(user, path))) return jsonResponse(permissionDenied());
    return fsTorrentValidate("generate", req) || fsTorrentGenerate(req);
  };
  return handlers;
};



