import {
  failure,
  jsonResponse,
  pageResp,
  success,
} from "../common/response.js";
import { normalizePath } from "../../internal/model/path.js";

export const shareResp = (share) => ({
  id: share.id,
  sid: share.sid,
  path: share.path,
  password: share.password || "",
  expires: share.expires || "",
  disabled: !!share.disabled,
  remark: share.remark || "",
  readme: share.readme || "",
  header: share.header || "",
  created: share.created,
  modified: share.modified,
});

export const validShare = (share, password) => {
  if (!share || share.disabled) return false;
  if (share.password && share.password !== password) return false;
  if (share.expires && !Number.isNaN(Date.parse(share.expires)) && Date.parse(share.expires) < Date.now()) return false;
  return true;
};

export const sharePathInfo = ({ path, password, state }) => {
  const normalized = normalizePath(path);
  const [sid, ...innerParts] = normalized.replace(/^\/+/, "").split("/");
  if (!sid) return null;
  const share = state.sharings.find((item) => item.sid === sid);
  if (!validShare(share, password)) return null;
  const inner = normalizePath("/" + innerParts.join("/"));
  const targetPath = inner === "/" ? normalizePath(share.path) : normalizePath(share.path + "/" + inner.replace(/^\/+/, ""));
  return { inner, share, targetPath };
};

export const createShareReader = ({
  getState,
  isWorkspacePath,
  page,
  toFsGetResp,
  toObjResp,
  workspaceGet,
  workspaceList,
}) => {
  const shareList = async (req) => {
    const state = getState();
    const info = sharePathInfo({ path: req.path, password: req.password || req.pwd, state });
    if (!info) return null;
    if (isWorkspacePath(info.targetPath)) {
      const result = await workspaceList(info.targetPath, req);
      if (result.error) return { error: result.error };
      return {
        data: {
          ...result.data,
          readme: info.share.readme || "",
          header: info.share.header || "",
          write: false,
        },
      };
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
        readme: info.share.readme || "",
        header: info.share.header || "",
        write: false,
        write_content_bypass: false,
        provider: "sharing",
        direct_upload_tools: [],
      },
    };
  };

  const shareGet = async (req) => {
    const state = getState();
    const info = sharePathInfo({ path: req.path, password: req.password || req.pwd, state });
    if (!info) return null;
    if (isWorkspacePath(info.targetPath)) {
      const result = await workspaceGet(info.targetPath);
      if (result.error) return { error: result.error };
      return {
        data: {
          ...result.data,
          readme: info.share.readme || "",
          header: info.share.header || "",
          provider: "sharing",
        },
      };
    }
    const entry = state.entries[info.targetPath];
    if (!entry) return { error: failure("object not found", 404) };
    return {
      data: {
        ...toFsGetResp(entry, info.targetPath),
        readme: info.share.readme || "",
        header: info.share.header || "",
        provider: "sharing",
      },
    };
  };

  return { shareGet, shareList };
};

export const createShareHandlers = ({
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
    const content = page(state.sharings.map(shareResp), req);
    return jsonResponse(success(pageResp(content, state.sharings.length)));
  },
  "GET /api/share/get": async (request) => {
    const state = getState();
    const id = Number(queryValue(request, "id"));
    const sid = queryValue(request, "sid");
    const share = state.sharings.find((item) => item.id === id || item.sid === sid);
    if (!share) return jsonResponse(failure("share not found", 404));
    return jsonResponse(success(shareResp(share)));
  },
  "POST /api/share/create": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const path = normalizePath(req.path);
    if (isWorkspacePath(path)) {
      const result = await workspaceGet(path);
      if (result.error) return jsonResponse(result.error);
    } else if (!state.entries[path]) {
      return jsonResponse(failure("object not found", 404));
    }
    const id = Math.max(0, ...state.sharings.map((item) => item.id || 0)) + 1;
    const share = {
      id,
      sid: req.sid || Math.random().toString(36).slice(2, 10),
      path,
      password: req.password || "",
      expires: req.expires || "",
      disabled: !!req.disabled,
      remark: req.remark || "",
      readme: req.readme || "",
      header: req.header || "",
      created: now(),
      modified: now(),
    };
    state.sharings.push(share);
    await saveState();
    return jsonResponse(success(shareResp(share)));
  },
  "POST /api/share/update": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const share = state.sharings.find((item) => item.id === Number(req.id) || item.sid === req.sid);
    if (!share) return jsonResponse(failure("share not found", 404));
    Object.assign(share, {
      path: req.path ? normalizePath(req.path) : share.path,
      password: req.password ?? share.password,
      expires: req.expires ?? share.expires,
      disabled: req.disabled ?? share.disabled,
      remark: req.remark ?? share.remark,
      readme: req.readme ?? share.readme,
      header: req.header ?? share.header,
      modified: now(),
    });
    await saveState();
    return jsonResponse(success(shareResp(share)));
  },
  "POST /api/share/delete": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const ids = Array.isArray(req.ids) ? req.ids.map(Number) : [Number(req.id)];
    state.sharings = state.sharings.filter((item) => !ids.includes(item.id));
    await saveState();
    return jsonResponse(success());
  },
  "POST /api/share/enable": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const share = state.sharings.find((item) => item.id === Number(req.id) || item.sid === req.sid);
    if (!share) return jsonResponse(failure("share not found", 404));
    share.disabled = false;
    share.modified = now();
    await saveState();
    return jsonResponse(success());
  },
  "POST /api/share/disable": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const share = state.sharings.find((item) => item.id === Number(req.id) || item.sid === req.sid);
    if (!share) return jsonResponse(failure("share not found", 404));
    share.disabled = true;
    share.modified = now();
    await saveState();
    return jsonResponse(success());
  },
});
