import { OPENLIST_VERSION } from "../internal/conf/const.js";
import {
  basename,
  normalizePath,
} from "../internal/model/path.js";
import {
  failure,
  jsonResponse,
  rawResponse,
  success,
  textResponse,
} from "./common/response.js";
import {
  countShareAccess,
  shareClientIP,
  shareNeedsPassword,
  sharePathInfo,
} from "./handles/share.js";

const privateBase = "/plugin/private/siyuan-cloud";
const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const htmlResponse = (html) => rawResponse(html, 200, "text/html; charset=utf-8");

const shareText = (request) => {
  const meta = request?.request || request?.Request || {};
  const headers = meta.headers || meta.Headers || {};
  const zh = String(headers["accept-language"] || headers["Accept-Language"] || "").toLowerCase().includes("zh");
  const keys = "download notFound notFoundMessage open password passwordTitle retry tryAgain verified wrongPassword".split(" ");
  const values = zh
    ? ["\u4e0b\u8f7d", "\u5206\u4eab\u4e0d\u5b58\u5728", "\u5206\u4eab\u4e0d\u5b58\u5728\u6216\u4e0d\u53ef\u7528\u3002", "\u6253\u5f00", "\u5bc6\u7801", "\u8bf7\u8f93\u5165\u5206\u4eab\u5bc6\u7801", "\u91cd\u8bd5", "\u5bc6\u7801\u9519\u8bef\uff0c\u8bf7\u91cd\u8bd5\u3002", "\u5df2\u9a8c\u8bc1", "\u5bc6\u7801\u9519\u8bef"]
    : ["Download", "Share not found", "The share does not exist or is unavailable.", "Open", "Password", "Share password", "Retry", "Password is incorrect. Please try again.", "Access verified", "Password is incorrect"];
  return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
};

const shareShell = (body) => htmlResponse(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Siyuan Cloud Share</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f6f7;color:#202124;font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(760px,calc(100vw - 32px));display:grid;gap:12px}
    h1{margin:0;font-size:18px;font-weight:600}
    form{display:grid;gap:10px}
    input{height:36px;padding:0 10px;border:1px solid #d0d0d0;border-radius:6px;background:#fff;font:inherit}
    a,button{height:36px;display:inline-grid;place-items:center;padding:0 14px;border:0;border-radius:6px;background:#3575f0;color:#fff;font:inherit;text-decoration:none;cursor:pointer}
    p{margin:0;color:#5f6368}
    .error{color:#d23f31}
  </style>
</head>
<body><main>${body}</main></body>
</html>`);

const sharePasswordPage = ({ action, message, text, title }) => shareShell(`<h1>${escapeHtml(title || text.passwordTitle)}</h1>
  ${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ""}
  <form method="get" action="${escapeHtml(privateBase + action)}" onsubmit="document.querySelector('.error')?.remove()">
    <input name="pwd" type="password" autofocus autocomplete="current-password" placeholder="${escapeHtml(text.password)}">
    <button type="submit">${message ? escapeHtml(text.retry) : escapeHtml(text.open)}</button>
  </form>`);

const sharePreviewPage = ({ info, path, pwd, text }) => {
  const name = basename(info.targetPath) || basename(path) || info.normalizedShare.id;
  const query = `download=1${pwd ? `&pwd=${encodeURIComponent(pwd)}` : ""}`;
  const url = `${privateBase}${path}?${query}`;
  return shareShell(`<h1>${escapeHtml(name)}</h1><p>${escapeHtml(text.verified)}</p><a href="${escapeHtml(url)}">${escapeHtml(text.download)}</a>`);
};

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
  saveState,
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
        private_base: privateBase,
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
      const pwd = queryValue(request, "pwd");
      const state = getState();
      const info = sharePathInfo({ path: sharePath, password: pwd, state });
      const needsPassword = shareNeedsPassword({ path: sharePath, password: pwd, state });
      const text = shareText(request);
      if (!info && needsPassword) return sharePasswordPage({ action: path, message: pwd ? text.tryAgain : "", text });
      if (!info) return sharePasswordPage({ action: path, message: text.notFoundMessage, text, title: text.notFound });
      await countShareAccess({ info, ip: shareClientIP(request), saveState });
      return queryValue(request, "download") ? readFileResponse(info.targetPath, request) : sharePreviewPage({ info, path, pwd, text });
    }
    if (path.startsWith("/d/") || path.startsWith("/p/")) {
      return readFileResponse(normalizePath(path.replace(/^\/[dp]/, "")), request);
    }
    if (path === "/sad" || path.startsWith("/sad/")) {
      return textResponse("sharing archive extract is not implemented in the SiYuan kernel port yet", 501);
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
