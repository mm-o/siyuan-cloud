import {
  failure,
  jsonResponse,
  pageResp,
  success,
} from "../common/response.js";
import {
  basename,
  normalizePath,
} from "../../internal/model/path.js";

const randomShareId = () => Math.random().toString(36).slice(2, 10);
const validSharingID = /^[\w\u4e00-\u9fff-]+$/u;

const shareIdOf = (share) => String(share?.id || "");
const sharePwdOf = (share) => String(share?.pwd ?? "");
const shareFilesOf = (share) => Array.isArray(share?.files) ? share.files.map(normalizePath).filter(Boolean) : [];
const accessCache = new Map();
const accessCountDelay = 30 * 60 * 1000;

export const normalizeShare = (share = {}, now) => {
  const files = shareFilesOf(share);
  const id = shareIdOf(share) || randomShareId();
  return {
    id,
    files,
    expires: share.expires || null,
    pwd: sharePwdOf(share),
    accessed: Number(share.accessed || 0),
    max_accessed: Number(share.max_accessed || 0),
    disabled: !!share.disabled,
    remark: share.remark || "",
    readme: share.readme || "",
    header: share.header || "",
    order_by: share.order_by || "",
    order_direction: share.order_direction || "",
    extract_folder: share.extract_folder || "",
    creator: share.creator || share.creator_name || "admin",
    creator_role: Number(share.creator_role ?? 2),
    created: share.created || now?.() || "",
    modified: share.modified || now?.() || "",
  };
};

export const shareResp = (share) => {
  const normalized = normalizeShare(share);
  return {
    ...normalized,
  };
};

export const validShare = (share, password) => {
  const normalized = normalizeShare(share);
  if (!share || share.disabled) return false;
  if (normalized.max_accessed > 0 && normalized.accessed >= normalized.max_accessed) return false;
  if (normalized.pwd && normalized.pwd !== password) return false;
  if (normalized.expires && !Number.isNaN(Date.parse(normalized.expires)) && Date.parse(normalized.expires) < Date.now()) return false;
  return true;
};

export const shareNeedsPassword = ({ path, password, state }) => {
  const normalized = normalizePath(path);
  const [sid] = normalized.replace(/^\/+/, "").split("/");
  if (!sid) return null;
  const source = state.sharings.find((item) => shareIdOf(item) === sid);
  if (!source) return null;
  const share = normalizeShare(source);
  if (source.disabled) return null;
  if (share.max_accessed > 0 && share.accessed >= share.max_accessed) return null;
  if (share.expires && !Number.isNaN(Date.parse(share.expires)) && Date.parse(share.expires) < Date.now()) return null;
  if (!share.pwd || share.pwd === password) return null;
  return { sid, share: source, normalizedShare: share };
};

export const sharePathInfo = ({ path, password, state }) => {
  const normalized = normalizePath(path);
  const [sid, ...innerParts] = normalized.replace(/^\/+/, "").split("/");
  if (!sid) return null;
  const source = state.sharings.find((item) => shareIdOf(item) === sid);
  if (!validShare(source, password)) return null;
  const share = normalizeShare(source);
  const inner = normalizePath("/" + innerParts.join("/"));
  if (share.files.length === 1 || inner !== "/") {
    const base = share.files.length === 1 ? share.files[0] : share.files.find((file) => basename(file) === inner.replace(/^\/+/, "").split("/")[0]);
    if (!base) return null;
    const rest = share.files.length === 1 ? inner : normalizePath("/" + inner.replace(/^\/+/, "").split("/").slice(1).join("/"));
    const targetPath = rest === "/" ? normalizePath(base) : normalizePath(`${base}/${rest.replace(/^\/+/, "")}`);
    return { inner, share: source, normalizedShare: share, targetPath };
  }
  return { inner, share: source, normalizedShare: share, targetPath: "/" };
};

const validateSharingID = (id) => {
  if (!id) return "";
  if ([...String(id)].length > 64) throw new Error("share id must be at most 64 characters");
  if (!validSharingID.test(String(id))) throw new Error("share id can only contain letters, numbers, underscores, hyphens, and CJK characters");
  return String(id);
};

export const shareClientIP = (request) => {
  const meta = request?.request || request?.Request || {};
  const headers = meta.headers || meta.Headers || {};
  for (const name of ["X-Forwarded-For", "x-forwarded-for", "X-Real-IP", "x-real-ip"]) {
    const value = headers[name];
    const ip = Array.isArray(value) ? value[0] : value;
    if (ip) return String(ip).split(",")[0].trim();
  }
  return "127.0.0.1";
};

export const countShareAccess = async ({ info, ip, saveState }) => {
  if (!info?.share) return;
  const key = `${shareIdOf(info.share)}:${ip || "127.0.0.1"}`;
  const expires = accessCache.get(key);
  if (expires && expires > Date.now()) return;
  accessCache.set(key, Date.now() + accessCountDelay);
  info.share.accessed = Number(info.share.accessed || 0) + 1;
  await saveState?.();
};

export const createShareReader = ({
  driverRuntime,
  getState,
  isWorkspacePath,
  page,
  toFsGetResp,
  toObjResp,
  workspaceGet,
  workspaceList,
  saveState,
}) => {
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
      write: false,
      write_content_bypass: false,
      provider: data.provider || "unknown",
      direct_upload_tools: data.direct_upload_tools || [],
    };
  };
  const objForPath = async (state, path) => {
    if (isWorkspacePath(path)) {
      const result = await workspaceGet(path);
      return result.error ? null : result.data;
    }
    const mount = driverRuntime?.resolve(state.storages, path);
    if (mount) {
      try {
        return driverObjResp(await mount.driver.get(mount.storage, mount.relPath, { skipLink: true }));
      } catch (_) {
        return null;
      }
    }
    const entry = state.entries[path];
    return entry ? toObjResp(entry) : null;
  };

  const shareList = async (req) => {
    const state = getState();
    const info = sharePathInfo({ path: req.path, password: req.password || req.pwd, state });
    if (!info) return null;
    await countShareAccess({ info, ip: req.client_ip, saveState });
    if (info.normalizedShare.files.length > 1 && info.inner === "/") {
      const content = [];
      for (const file of info.normalizedShare.files) {
        const obj = await objForPath(state, file);
        if (obj) content.push({ ...obj, name: basename(file) });
      }
      return {
        data: {
          content: page(content, req),
          total: content.length,
          readme: info.normalizedShare.readme || "",
          header: info.normalizedShare.header || "",
          write: false,
          write_content_bypass: false,
          provider: "unknown",
          direct_upload_tools: [],
        },
      };
    }
    if (isWorkspacePath(info.targetPath)) {
      const result = await workspaceList(info.targetPath, req);
      if (result.error) return { error: result.error };
      return {
        data: {
          ...result.data,
          readme: info.normalizedShare.readme || "",
          header: info.normalizedShare.header || "",
          write: false,
        },
      };
    }
    const mount = driverRuntime?.resolve(state.storages, info.targetPath);
    if (mount) {
      try {
        const data = await mount.driver.list(mount.storage, mount.relPath, req);
        return {
          data: {
            ...driverListResp(data),
            readme: info.normalizedShare.readme || data.readme || "",
            header: info.normalizedShare.header || data.header || "",
          },
        };
      } catch (error) {
        return { error: failure(error.message || "driver list failed", 502) };
      }
    }
    const entry = state.entries[info.targetPath];
    if (!entry) return { error: failure("object not found", 404) };
    const children = entry.is_dir
      ? (entry.children || []).map((childPath) => state.entries[childPath]).filter(Boolean).map(toObjResp)
      : [toObjResp(entry)];
    return {
      data: {
        content: page(children, req),
        total: children.length,
        readme: info.normalizedShare.readme || "",
        header: info.normalizedShare.header || "",
        write: false,
        write_content_bypass: false,
        provider: "unknown",
        direct_upload_tools: [],
      },
    };
  };

  const shareGet = async (req) => {
    const state = getState();
    const info = sharePathInfo({ path: req.path, password: req.password || req.pwd, state });
    if (!info) return null;
    await countShareAccess({ info, ip: req.client_ip, saveState });
    if (info.normalizedShare.files.length > 1 && info.inner === "/") {
      return {
        data: {
          name: shareIdOf(info.share),
          size: 0,
          is_dir: true,
          modified: "",
          created: "",
          sign: "",
          thumb: "",
          type: 1,
          raw_url: "",
          readme: info.normalizedShare.readme || "",
          header: info.normalizedShare.header || "",
          provider: "unknown",
          related: [],
        },
      };
    }
    if (isWorkspacePath(info.targetPath)) {
      const result = await workspaceGet(info.targetPath);
      if (result.error) return { error: result.error };
      return {
        data: {
          ...result.data,
          raw_url: result.data.is_dir ? "" : `/plugin/private/siyuan-cloud/sd/${shareIdOf(info.share)}${info.inner}${info.normalizedShare.pwd ? `?pwd=${info.normalizedShare.pwd}` : ""}`,
          readme: info.normalizedShare.readme || "",
          header: info.normalizedShare.header || "",
          provider: "unknown",
        },
      };
    }
    const mount = driverRuntime?.resolve(state.storages, info.targetPath);
    if (mount) {
      try {
        const data = await mount.driver.get(mount.storage, mount.relPath, { skipLink: true });
        return {
          data: {
            ...driverObjResp(data),
            raw_url: data.is_dir ? "" : `/plugin/private/siyuan-cloud/sd/${shareIdOf(info.share)}${info.inner}${info.normalizedShare.pwd ? `?pwd=${info.normalizedShare.pwd}` : ""}`,
            readme: info.normalizedShare.readme || "",
            header: info.normalizedShare.header || "",
            provider: data.provider || mount.storage.driver || "unknown",
            related: [],
          },
        };
      } catch (error) {
        return { error: failure(error.message || "driver get failed", 502) };
      }
    }
    const entry = state.entries[info.targetPath];
    if (!entry) return { error: failure("object not found", 404) };
    return {
      data: {
        ...toFsGetResp(entry, info.targetPath),
        raw_url: entry.is_dir ? "" : `/plugin/private/siyuan-cloud/sd/${shareIdOf(info.share)}${info.inner}${info.normalizedShare.pwd ? `?pwd=${info.normalizedShare.pwd}` : ""}`,
        readme: info.normalizedShare.readme || "",
        header: info.normalizedShare.header || "",
        provider: "unknown",
      },
    };
  };

  return { shareGet, shareList };
};

export const createShareHandlers = ({
  driverRuntime,
  getState,
  isWorkspacePath,
  now,
  page,
  parseJson,
  queryValue,
  saveState,
  workspaceGet,
}) => ({
  "ANY /api/share/list": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    state.sharings = state.sharings.map((share) => normalizeShare(share, now));
    const content = page(state.sharings.map(shareResp), req);
    return jsonResponse(success(pageResp(content, state.sharings.length)));
  },
  "GET /api/share/get": async (request) => {
    const state = getState();
    const id = queryValue(request, "id");
    const share = state.sharings.find((item) => shareIdOf(item) === id);
    if (!share) return jsonResponse(failure("sharing not found", 404));
    return jsonResponse(success(shareResp(share)));
  },
  "POST /api/share/create": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    let customId = "";
    try {
      customId = validateSharingID(req.id || "");
    } catch (error) {
      return jsonResponse(failure(error.message, 400));
    }
    const files = (Array.isArray(req.files) ? req.files : []).map(normalizePath).filter(Boolean);
    if (!files.length) return jsonResponse(failure("must add at least 1 object", 400));
    const id = customId || randomShareId();
    if (state.sharings.some((item) => shareIdOf(item) === id)) return jsonResponse(failure("UNIQUE constraint failed: sharings.id", 500));
    const share = normalizeShare({
      id,
      files,
      pwd: req.pwd ?? "",
      expires: req.expires || "",
      accessed: req.accessed || 0,
      max_accessed: req.max_accessed || 0,
      disabled: !!req.disabled,
      remark: req.remark || "",
      readme: req.readme || "",
      header: req.header || "",
      order_by: req.order_by || "",
      order_direction: req.order_direction || "",
      extract_folder: req.extract_folder || "",
      created: now(),
      modified: now(),
    }, now);
    state.sharings.push(share);
    await saveState();
    return jsonResponse(success(shareResp(share)));
  },
  "POST /api/share/update": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const share = state.sharings.find((item) => shareIdOf(item) === String(req.id || ""));
    if (!share) return jsonResponse(failure("sharing not found", 404));
    const files = Array.isArray(req.files) && req.files.length ? req.files.map(normalizePath) : shareFilesOf(share);
    if (!files.length) return jsonResponse(failure("must add at least 1 object", 400));
    Object.assign(share, {
      files,
      pwd: req.pwd ?? sharePwdOf(share),
      expires: req.expires ?? share.expires,
      accessed: Number(req.accessed ?? share.accessed ?? 0),
      max_accessed: Number(req.max_accessed ?? share.max_accessed ?? 0),
      disabled: req.disabled ?? share.disabled,
      remark: req.remark ?? share.remark,
      readme: req.readme ?? share.readme,
      header: req.header ?? share.header,
      order_by: req.order_by ?? share.order_by,
      order_direction: req.order_direction ?? share.order_direction,
      extract_folder: req.extract_folder ?? share.extract_folder,
      modified: now(),
    });
    if (req.new_id && req.new_id !== shareIdOf(share)) {
      let candidateId = "";
      try {
        candidateId = validateSharingID(req.new_id);
      } catch (error) {
        return jsonResponse(failure(error.message, 400));
      }
      if (state.sharings.some((item) => item !== share && shareIdOf(item) === candidateId)) {
        return jsonResponse(failure("UNIQUE constraint failed: sharings.id", 500));
      }
      share.id = candidateId;
    }
    await saveState();
    return jsonResponse(success(shareResp(share)));
  },
  "POST /api/share/delete": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const queryId = queryValue(request, "id");
    const ids = Array.isArray(req.ids) ? req.ids.map(String) : [String(queryId || req.id || "")];
    if (!ids.some((id) => state.sharings.some((item) => shareIdOf(item) === id))) {
      return jsonResponse(failure("sharing not found", 404));
    }
    state.sharings = state.sharings.filter((item) => !ids.includes(shareIdOf(item)));
    await saveState();
    return jsonResponse(success());
  },
  "POST /api/share/enable": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const share = state.sharings.find((item) => shareIdOf(item) === String(queryValue(request, "id") || req.id || ""));
    if (!share) return jsonResponse(failure("sharing not found", 404));
    share.disabled = false;
    share.modified = now();
    await saveState();
    return jsonResponse(success());
  },
  "POST /api/share/disable": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const share = state.sharings.find((item) => shareIdOf(item) === String(queryValue(request, "id") || req.id || ""));
    if (!share) return jsonResponse(failure("sharing not found", 404));
    share.disabled = true;
    share.modified = now();
    await saveState();
    return jsonResponse(success());
  },
});
