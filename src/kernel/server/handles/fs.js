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
  saveState,
  shareGet,
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

  return {
    "ANY /api/fs/list": async (request) => {
      const req = await parseJson(request);
      const path = normalizePath(req.path);
      const sharing = await shareList({ ...req, path });
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
          return jsonResponse(success(data));
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
      const sharing = await shareGet({ ...req, path });
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
          if (data && !data.is_dir && shouldProxy) {
            data.raw_url = rawUrlForStorage(mount.storage, path);
            data.url = data.raw_url;
          }
          return jsonResponse(success(data));
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
      const keyword = String(req.keywords || req.keyword || "").toLowerCase();
      if (isWorkspacePath(parent)) {
        const result = await workspaceList(parent, req);
        if (result.error) return jsonResponse(result.error);
        const content = result.data.content
          .filter((entry) => !keyword || entry.name.toLowerCase().includes(keyword))
          .map((entry) => ({ parent, ...entry }));
        return jsonResponse(success(pageResp(page(content, req), content.length)));
      }
      const results = Object.values(state.entries)
        .filter((entry) => entry.path !== "/" && entry.path.startsWith(parent) && (!keyword || entry.name.toLowerCase().includes(keyword)))
        .map((entry) => ({ parent: dirname(entry.path), ...toObjResp(entry) }));
      return jsonResponse(success(pageResp(page(results, req), results.length)));
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
        removeEntry(normalizePath(dir + "/" + name));
      }
      await saveState();
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
          if (!req.overwrite && await uploadTargetExists(dstPath) && !req.skip_existing) return jsonResponse(failure(`file [${name}] exists`, 403));
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
        if (!req.overwrite && state.entries[dstPath] && !req.skip_existing) return jsonResponse(failure(`file [${name}] exists`, 403));
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
          if (!req.overwrite && await uploadTargetExists(dstPath) && !req.skip_existing && !req.merge) return jsonResponse(failure(`file [${name}] exists`, 403));
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
        if (!req.overwrite && state.entries[dstPath] && !req.skip_existing && !req.merge) return jsonResponse(failure(`file [${name}] exists`, 403));
        if (state.entries[dstPath] && !req.merge) removeEntry(dstPath);
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
      const task = await taskStore.addTask("offline_download", {
        error: "offline download is not implemented in the SiYuan kernel port yet",
        name: req.url || req.urls?.[0] || "offline download",
        status: "not implemented",
      });
      return jsonResponse(failure(
        "offline download is not implemented in the SiYuan kernel port yet",
        501,
        { task },
      ), 501);
    },
    "POST /api/fs/get_direct_upload_info": async (request) => {
      const req = await parseJson(request);
      const path = normalizePath(req.path || req.file_path || "/");
      if (!overwriteEnabled(request, req) && await uploadTargetExists(path)) return jsonResponse(failure("file exists", 403));
      return jsonResponse(success(null));
    },
    "ANY /api/fs/other": async () => jsonResponse(success(null)),
  };
};



