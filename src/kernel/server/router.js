import { OPENLIST_VERSION } from "../internal/conf/const.js";
import { normalizePath } from "../internal/model/path.js";
import {
  failure,
  jsonResponse,
  success,
  textResponse,
} from "./common/response.js";
import { sharePathInfo } from "./handles/share.js";

export const createRouter = ({
  getState,
  handleWebDav,
  handleS3,
  handlers,
  isWorkspacePath,
  pick,
  queryValue,
  readFileResponse: externalReadFileResponse,
  requestPath,
  warn,
  workspaceReadText,
}) => {
  const fallbackReadFileResponse = async (filePath) => {
    const state = getState();
    if (isWorkspacePath(filePath)) {
      const file = await workspaceReadText(filePath);
      if (!file.ok) return textResponse(file.text || "not found", file.status || 404);
      return textResponse(file.text, 200, file.contentType);
    }
    const entry = state.entries[filePath];
    if (!entry || entry.is_dir) return textResponse("not found", 404);
    return textResponse(entry.content || "", 200, entry.mime || "application/octet-stream");
  };
  const readFileResponse = externalReadFileResponse || fallbackReadFileResponse;

  const dispatch = async (request) => {
    const requestMeta = pick(request, "request", "Request");
    const method = String(pick(requestMeta, "method", "Method") || "GET").toUpperCase();
    const path = requestPath(request);
    const key = method + " " + path;
    const anyKey = "ANY " + path;
    const handler = handlers[key] || handlers[anyKey];
    if (handler) return handler(request);
    if (path === "/" || path === "/@manage") {
      return jsonResponse(success({
        name: "Siyuan Cloud",
        version: OPENLIST_VERSION,
        message: "OpenList compatibility layer is running.",
        private_base: "/plugin/private/siyuan-cloud",
        routes: Object.keys(handlers).sort(),
      }));
    }
    if (path === "/dav" || path.startsWith("/dav/")) {
      return handleWebDav(request);
    }
    if (path === "/s3" || path.startsWith("/s3/")) {
      return handleS3(request);
    }
    if (path.startsWith("/sd/")) {
      const sharePath = normalizePath(path.replace(/^\/sd/, ""));
      const info = sharePathInfo({ path: sharePath, password: queryValue(request, "pwd"), state: getState() });
      if (!info) return textResponse("the share does not exist or password is wrong", 404);
      return readFileResponse(info.targetPath, request);
    }
    if (path.startsWith("/d/") || path.startsWith("/p/")) {
      return readFileResponse(normalizePath(path.replace(/^\/[dp]/, "")), request);
    }
    if (path.startsWith("/ad/") || path.startsWith("/ap/") || path.startsWith("/ae/")) {
      return textResponse("archive download is not implemented in the SiYuan kernel port yet", 501);
    }
    return jsonResponse(failure("route not implemented: " + key, 404), 404);
  };

  return async (request) => {
    try {
      return await dispatch(request);
    } catch (error) {
      await warn("request failed", String(error && error.stack || error));
      return jsonResponse(failure(String(error && error.message || error), 500), 500);
    }
  };
};
