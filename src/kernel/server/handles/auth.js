import {
  generateAuthToken,
  passwordTimestamp,
  setUserPassword,
  tokenFingerprint,
  verifyPassword,
  verifyStaticPasswordHash,
} from "../../internal/auth/token.js";
import {
  failure,
  jsonResponse,
  success,
} from "../common/response.js";
import {
  sanitizeUser,
  USER_ROLE,
} from "../../internal/model/user.js";

const tokenResp = (user, settings) => ({
  token: generateAuthToken(user, settings?.token || "siyuan-cloud-token"),
  username: user?.username || "admin",
});

const requestToken = (request) => {
  const headers = request?.request?.headers || request?.Request?.Headers || {};
  for (const [key, value] of Object.entries(headers)) {
    if (!["authorization", "x-siyuan-cloud-authorization"].includes(String(key).toLowerCase())) continue;
    return String(Array.isArray(value) ? value[0] || "" : value || "").replace(/^Bearer\s+/i, "");
  }
  return "";
};

const rememberLoggedOutToken = async ({ currentUser, getState, request, saveState }) => {
  const ctx = currentUser(request, { allowDisabledGuest: true });
  if (!ctx.user || ctx.error || ctx.auth !== "jwt") return;
  const token = requestToken(request);
  if (!token) return;
  const user = getState().users.find((item) => Number(item.id) === Number(ctx.user.id));
  if (!user) return;
  const tokens = Array.isArray(user.logout_tokens) ? user.logout_tokens : [];
  const fingerprint = tokenFingerprint(token);
  user.logout_tokens = [fingerprint, ...tokens.filter((item) => item !== fingerprint)].slice(0, 32);
  await saveState();
};

export const createAuthHandlers = ({
  currentUser,
  getState,
  parseJson,
  saveState,
}) => ({
  "POST /api/auth/login": async (request) => {
    const req = await parseJson(request);
    const user = getState().users.find((item) => item.username === req.username);
    if (!user || user.disabled) return jsonResponse(failure("Invalid username or password", 401));
    if (!verifyPassword(user, req.password)) return jsonResponse(failure("Invalid username or password", 401));
    if (!user.pwd_hash && req.password !== undefined) setUserPassword(user, req.password);
    if (!user.pwd_ts) {
      user.pwd_ts = passwordTimestamp();
    }
    await saveState();
    return jsonResponse(success(tokenResp(user, getState().settings)));
  },
  "POST /api/auth/login/hash": async (request) => {
    const req = await parseJson(request);
    const user = getState().users.find((item) => item.username === req.username);
    if (!user || user.disabled) return jsonResponse(failure("Invalid username or password", 401));
    if (!verifyStaticPasswordHash(user, req.password)) return jsonResponse(failure("Invalid username or password", 401));
    if (!user.pwd_hash && user.password !== undefined) setUserPassword(user, user.password);
    if (!user.pwd_ts) {
      user.pwd_ts = passwordTimestamp();
    }
    await saveState();
    return jsonResponse(success(tokenResp(user, getState().settings)));
  },
  "POST /api/auth/login/ldap": async () => jsonResponse(failure("LDAP login is not implemented in the SiYuan kernel runtime", 501, {
    upstream: "OpenList server/handles/ldap_login.go",
    reason: "The JavaScript kernel plugin runtime has no LDAP server bind/search implementation yet.",
  })),
  "GET /api/auth/logout": async (request) => {
    await rememberLoggedOutToken({ currentUser, getState, request, saveState });
    return jsonResponse(success());
  },
  "POST /api/auth/logout": async (request) => {
    await rememberLoggedOutToken({ currentUser, getState, request, saveState });
    return jsonResponse(success());
  },
  "GET /api/me": async (request) => {
    const ctx = currentUser(request, { allowDisabledGuest: true });
    if (ctx.error) return jsonResponse(failure(ctx.error, 401));
    return jsonResponse(success(sanitizeUser(ctx.user)));
  },
  "POST /api/me/update": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const ctx = currentUser(request, { allowDisabledGuest: true });
    if (ctx.error) return jsonResponse(failure(ctx.error, 401));
    const current = ctx.user;
    const index = state.users.findIndex((item) => Number(item.id) === Number(current?.id));
    if (!current || current.role === USER_ROLE.GUEST) return jsonResponse(failure("Guest user can not update profile", 403));
    const next = {
      ...current,
      username: req.username || current.username,
      pwd_ts: req.password ? passwordTimestamp() : current.pwd_ts,
      sso_id: req.sso_id || current.sso_id || "",
    };
    if (req.password) setUserPassword(next, req.password, next.pwd_ts);
    state.users[index >= 0 ? index : 0] = next;
    await saveState();
    return jsonResponse(success());
  },
});
