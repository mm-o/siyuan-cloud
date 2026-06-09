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
  isHiddenByMeta,
  metaHeader,
  metaReadme,
  nearestMeta,
} from "../../internal/model/meta.js";
import { linkFromDriverData } from "../../internal/model/args.js";
import { driverInfoMap } from "../../internal/driver/info.js";

export const createFsHandlers = ({
  cloneEntryTree,
  createFile,
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
    return {
      body: String(content),
      bodyEncoding: "text",
      mime,
      path,
      size: String(content).length,
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
    reason: "torrent parsing and CAS rapid upload are not implemented in the SiYuan kernel JavaScript port yet.",
    upstream_source: "server/handles/torrent.go + pkg/torrent/* + drivers/189pc/torrent.go",
    next: "Port a JavaScript bencode/torrent reader and 189/189PC CAS rapid-upload flow before enabling this route.",
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
    if ((operation === "parse" || operation === "upload_parse" || operation === "rapid_upload") && !req.torrent_data)
      return fsTorrentRequiredError("torrent_data");
    if ((operation === "rapid_upload" || operation === "generate") && !req.path)
      return fsTorrentRequiredError("path");
    return null;
  };
  const shouldSkipExisting = (req) => boolValue(req.skip_existing, false);
  const shouldMerge = (req) => boolValue(req.merge, false);
  const shouldOverwrite = (req) => boolValue(req.overwrite, false);
  const driverTargetIsDir = async (path) => {
    const mount = driverRuntime.resolve(state.storages, path);
    if (!mount) return false;
    try {
      return !!(await mount.driver.get(mount.storage, mount.relPath, { skipLink: true }))?.is_dir;
    } catch (_) {
      return false;
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
      const children = entry.children
        .map((childPath) => state.entries[childPath])
        .filter(Boolean)
        .filter((item) => !isHiddenByMeta(meta, item.path, item.name))
        .map(toObjResp);
      if (path === "/") {
        children.unshift(toObjResp({
          name: "@workspace",
          is_dir: true,
          size: 0,
          modified: now(),
          created: now(),
        }));
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
        write: true,
        write_content_bypass: true,
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
          let rawUrl = data.raw_url || "";
          if (data && !data.is_dir && shouldProxy) {
            rawUrl = rawUrlForStorage(mount.storage, path);
          }
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
      return jsonResponse(success(pageResp(result.content.map((node) => ({
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
        const storage = state.storages.find((item) => Number(item.id) !== 1 && normalizePath(item.mount_path || "/") === path);
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
      const names = Array.isArray(req.names) ? req.names : [];
      if (!names.length) return jsonResponse(failure("Empty file names", 400));
      const srcDir = normalizePath(req.src_dir);
      const dstDir = normalizePath(req.dst_dir);
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
        name: `move ${names.length} item(s)`,
        status: "Move operations completed immediately",
      });
      return jsonResponse(success({ message: "Move operations completed immediately", tasks: [task] }));
    },
    "POST /api/fs/copy": async (request) => {
      const req = await parseJson(request);
      const names = Array.isArray(req.names) ? req.names : [];
      if (!names.length) return jsonResponse(failure("Empty file names", 400));
      const srcDir = normalizePath(req.src_dir);
      const dstDir = normalizePath(req.dst_dir);
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
        name: `copy ${names.length} item(s)`,
        status: "Copy operations completed immediately",
      });
      return jsonResponse(success({ message: "Copy operations completed immediately", tasks: [task] }));
    },
    "POST /api/fs/batch_rename": async (request) => {
      const req = await parseJson(request);
      const srcDir = normalizePath(req.src_dir || "/");
      const renameObjects = Array.isArray(req.rename_objects) ? req.rename_objects : [];
      if (isWorkspacePath(srcDir)) {
        for (const item of renameObjects) {
          const srcName = String(item.src_name || "").trim();
          const newName = String(item.new_name || "").trim();
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
      for (const item of renameObjects) {
        const srcName = String(item.src_name || "").trim();
        const newName = String(item.new_name || "").trim();
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
      const conflictPolicy = String(req.conflict_policy || "skip").toLowerCase();
      if (isWorkspacePath(srcDir) || isWorkspacePath(dstDir)) {
        return jsonResponse(failure("recursive move for /@workspace is not available until workspace upload/move is completed", 501));
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
      removeEmptyDirs(normalizePath(req.src_dir || "/"));
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
      if (mount && mount.driver.read) {
        try {
          const data = await mount.driver.read(mount.storage, mount.relPath, {});
          const link = linkFromDriverData(data);
          return jsonResponse(success({
            url: link.url,
            header: link.header,
            method: link.method,
            content_length: link.content_length,
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
    "POST /api/fs/add_offline_download": async (request) => {
      const req = await parseJson(request);
      const urls = (Array.isArray(req.urls) ? req.urls : [req.url]).map((url) => String(url || "").trim()).filter(Boolean);
      const tasks = [];
      for (const url of urls) {
        tasks.push(await taskStore.addTask("offline_download", {
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
    "ANY /api/fs/other": async () => jsonResponse(success(null)),
  };
  for (const operation of ["parse", "upload_parse", "rapid_upload", "generate"]) {
    handlers[`POST /api/fs/torrent/${operation}`] = async (request) => {
      const req = await parseJson(request);
      return fsTorrentValidate(operation, req) || fsTorrentPlaceholder(operation, req);
    };
  }
  return handlers;
};



