import {
  failure,
  jsonResponse,
  success,
} from "../common/response.js";
import {
  normalizeMeta,
  validateHideRules,
} from "../../internal/model/meta.js";

export const createMetaHandlers = ({
  getState,
  pageSlice,
  parseJson,
  queryValue,
  saveState,
}) => {
  const state = new Proxy({}, {
    get: (_, prop) => getState()[prop],
    set: (_, prop, value) => {
      getState()[prop] = value;
      return true;
    },
  });

  const nextId = () => Math.max(0, ...(state.metas || []).map((item) => item.id || 0)) + 1;

  return {
    "GET /api/admin/meta/list": async (request) => {
      state.metas = state.metas || [];
      return jsonResponse(success(pageSlice([...state.metas].sort((a, b) => a.id - b.id), request)));
    },
    "GET /api/admin/meta/get": async (request) => {
      const id = Number(queryValue(request, "id"));
      const meta = (state.metas || []).find((item) => item.id === id);
      return meta ? jsonResponse(success(meta)) : jsonResponse(failure("meta not found", 404));
    },
    "POST /api/admin/meta/create": async (request) => {
      const req = await parseJson(request);
      try {
        validateHideRules(req.hide);
      } catch (error) {
        return jsonResponse(failure(`${req.hide || ""} is illegal: ${error.message}`, 400));
      }
      state.metas = state.metas || [];
      const meta = normalizeMeta(req, nextId());
      if (state.metas.some((item) => item.path === meta.path)) return jsonResponse(failure("meta path already exists", 409));
      state.metas.push(meta);
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/admin/meta/update": async (request) => {
      const req = await parseJson(request);
      try {
        validateHideRules(req.hide);
      } catch (error) {
        return jsonResponse(failure(`${req.hide || ""} is illegal: ${error.message}`, 400));
      }
      state.metas = state.metas || [];
      const index = state.metas.findIndex((item) => item.id === Number(req.id));
      if (index < 0) return jsonResponse(failure("meta not found", 404));
      state.metas[index] = normalizeMeta({ ...state.metas[index], ...req }, state.metas[index].id);
      await saveState();
      return jsonResponse(success());
    },
    "POST /api/admin/meta/delete": async (request) => {
      const req = await parseJson(request);
      const id = Number(queryValue(request, "id") || req.id);
      state.metas = (state.metas || []).filter((item) => item.id !== id);
      await saveState();
      return jsonResponse(success());
    },
  };
};
