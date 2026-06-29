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
import { canAccessByMeta, nearestMeta } from "../../internal/model/meta.js";
import {
  canCustomizeShareID,
  canShare,
  isAdminUser,
  normalizeUser,
  USER_ROLE,
} from "../../internal/model/user.js";

const randomShareId = () => Math.random().toString(36).slice(2, 10);
const validSharingID = /^[\w\u4e00-\u9fff-]+$/u;

const shareIdOf = (share) => String(share?.id || "");
const sharePwdOf = (share) => String(share?.pwd ?? "");
const shareFilesOf = (share) => Array.isArray(share?.files) ? share.files.map(normalizePath).filter(Boolean) : [];
const accessCache = new Map();
const accessCountDelay = 30 * 60 * 1000;
const pathWithinBase = (path, basePath) => {
  const target = normalizePath(path);
  const base = normalizePath(basePath || "/");
  return base === "/" || target === base || target.startsWith(`${base}/`);
};

const shareCreatorUser = (state, share) => {
  const normalized = normalizeShare(share);
  const users = (state.users || []).map(normalizeUser);
  return users.find((user) => Number(user.id) === Number(normalized.creator_id))
    || users.find((user) => user.username === normalized.creator)
    || null;
};

const canCreatorReadSharePath = (state, share, targetPath) => {
  const creator = shareCreatorUser(state, share);
  if (!creator || creator.disabled) return false;
  if (!pathWithinBase(targetPath, creator.base_path)) return false;
  const meta = nearestMeta(state, targetPath);
  return canAccessByMeta(creator, meta, targetPath, "");
};

const canCreatorReadShareTargets = (state, share, targetPath) => {
  const normalized = normalizeShare(share);
  if (targetPath !== "/") return canCreatorReadSharePath(state, share, targetPath);
  return normalized.files.length > 0
    && normalized.files.every((file) => canCreatorReadSharePath(state, share, file));
};

const shareTargetPath = (share, inner) => {
  const normalized = normalizeShare(share);
  if (normalized.files.length === 1 || inner !== "/") {
    const base = normalized.files.length === 1 ? normalized.files[0] : normalized.files.find((file) => basename(file) === inner.replace(/^\/+/, "").split("/")[0]);
    if (!base) return "";
    const rest = normalized.files.length === 1 ? inner : normalizePath("/" + inner.replace(/^\/+/, "").split("/").slice(1).join("/"));
    return rest === "/" ? normalizePath(base) : normalizePath(`${base}/${rest.replace(/^\/+/, "")}`);
  }
  return "/";
};

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
    creator_id: Number(share.creator_id || share.creatorId || 1),
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
  const targetPath = shareTargetPath(source, normalizePath("/" + normalized.replace(/^\/+/, "").split("/").slice(1).join("/")));
  if (!targetPath || !canCreatorReadShareTargets(state, source, targetPath)) return null;
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
    const targetPath = shareTargetPath(source, inner);
    if (!targetPath) return null;
    if (!canCreatorReadShareTargets(state, source, targetPath)) return null;
    return { inner, share: source, normalizedShare: share, targetPath };
  }
  if (!canCreatorReadShareTargets(state, source, "/")) return null;
  return { inner, share: source, normalizedShare: share, targetPath: "/" };
};

const validateSharingID = (id) => {
  if (!id) return "";
  if ([...String(id)].length > 64) throw new Error("share id must be at most 64 characters");
  if (!validSharingID.test(String(id))) throw new Error("share id can only contain letters, numbers, underscores, hyphens, and CJK characters");
  return String(id);
};

const resolveShareCreator = (state, reqUser, creatorName = "") => {
  if (isAdminUser(reqUser) && creatorName) {
    return (state.users || []).map(normalizeUser).find((user) => user.username === creatorName) || null;
  }
  if (isAdminUser(reqUser) && !creatorName) return reqUser;
  return reqUser;
};

const validateShareWriteRequest = ({ customId, files, reqUser, state, targetUser }) => {
  if (!isAdminUser(reqUser)) {
    if (!canShare(targetUser) || (customId && !canCustomizeShareID(targetUser))) {
      return failure("permission denied", 403);
    }
    for (const file of files) {
      if (!pathWithinBase(file, targetUser.base_path)) {
        return failure(`permission denied to share path [${file}]`, 500);
      }
      const meta = nearestMeta(state, file);
      if (!canAccessByMeta(targetUser, meta, file, "")) {
        return failure(`permission denied to share path [${file}]`, 500);
      }
    }
    return null;
  }
  if (customId && !canCustomizeShareID(reqUser)) return failure("permission denied", 403);
  return null;
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
  currentUser = () => normalizeUser({ id: 2, username: "guest", role: USER_ROLE.GUEST, disabled: true }, 1),
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
    const user = currentUser(request);
    state.sharings = state.sharings.map((share) => normalizeShare(share, now));
    const visible = isAdminUser(user)
      ? state.sharings
      : state.sharings.filter((share) => Number(normalizeShare(share).creator_id) === Number(user.id));
    const content = page(visible.map(shareResp), req);
    return jsonResponse(success(pageResp(content, visible.length)));
  },
  "GET /api/share/get": async (request) => {
    const state = getState();
    const user = currentUser(request);
    const id = queryValue(request, "id");
    const share = state.sharings.find((item) => shareIdOf(item) === id);
    if (!share || (!isAdminUser(user) && Number(normalizeShare(share).creator_id) !== Number(user.id))) {
      return jsonResponse(failure("sharing not found", 404));
    }
    return jsonResponse(success(shareResp(share)));
  },
  "POST /api/share/create": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const reqUser = currentUser(request);
    let customId = "";
    try {
      customId = validateSharingID(req.id || "");
    } catch (error) {
      return jsonResponse(failure(error.message, 400));
    }
    const files = (Array.isArray(req.files) ? req.files : []).map(normalizePath).filter(Boolean);
    if (!files.length) return jsonResponse(failure("must add at least 1 object", 400));
    const creator = resolveShareCreator(state, reqUser, req.creator || req.creator_name);
    if (!creator) return jsonResponse(failure("no such a user", 400));
    const permissionError = validateShareWriteRequest({ customId, files, reqUser, state, targetUser: creator });
    if (permissionError) return jsonResponse(permissionError);
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
      creator: creator.username,
      creator_id: creator.id,
      creator_role: creator.role,
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
    const reqUser = currentUser(request);
    const share = state.sharings.find((item) => shareIdOf(item) === String(req.id || ""));
    if (!share || (!isAdminUser(reqUser) && Number(normalizeShare(share).creator_id) !== Number(reqUser.id))) {
      return jsonResponse(failure("sharing not found", 404));
    }
    const files = Array.isArray(req.files) && req.files.length ? req.files.map(normalizePath) : shareFilesOf(share);
    if (!files.length) return jsonResponse(failure("must add at least 1 object", 400));
    const nextCreator = isAdminUser(reqUser) && (req.creator || req.creator_name)
      ? resolveShareCreator(state, reqUser, req.creator || req.creator_name)
      : resolveShareCreator(state, reqUser, normalizeShare(share).creator);
    if (!nextCreator) return jsonResponse(failure("no such a user", 400));
    const permissionError = validateShareWriteRequest({
      customId: req.new_id && req.new_id !== shareIdOf(share) ? req.new_id : "",
      files,
      reqUser,
      state,
      targetUser: nextCreator,
    });
    if (permissionError) return jsonResponse(permissionError);
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
      creator: nextCreator.username,
      creator_id: nextCreator.id,
      creator_role: nextCreator.role,
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
    const user = currentUser(request);
    const queryId = queryValue(request, "id");
    const ids = Array.isArray(req.ids) ? req.ids.map(String) : [String(queryId || req.id || "")];
    const matches = state.sharings.filter((item) => ids.includes(shareIdOf(item)));
    if (!matches.length || (!isAdminUser(user) && matches.some((share) => Number(normalizeShare(share).creator_id) !== Number(user.id)))) {
      return jsonResponse(failure("sharing not found", 404));
    }
    state.sharings = state.sharings.filter((item) => !ids.includes(shareIdOf(item)));
    await saveState();
    return jsonResponse(success());
  },
  "POST /api/share/enable": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const user = currentUser(request);
    const share = state.sharings.find((item) => shareIdOf(item) === String(queryValue(request, "id") || req.id || ""));
    if (!share || (!isAdminUser(user) && Number(normalizeShare(share).creator_id) !== Number(user.id))) {
      return jsonResponse(failure("sharing not found", 404));
    }
    share.disabled = false;
    share.modified = now();
    await saveState();
    return jsonResponse(success());
  },
  "POST /api/share/disable": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const user = currentUser(request);
    const share = state.sharings.find((item) => shareIdOf(item) === String(queryValue(request, "id") || req.id || ""));
    if (!share || (!isAdminUser(user) && Number(normalizeShare(share).creator_id) !== Number(user.id))) {
      return jsonResponse(failure("sharing not found", 404));
    }
    share.disabled = true;
    share.modified = now();
    await saveState();
    return jsonResponse(success());
  },
});
