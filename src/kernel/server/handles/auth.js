import {
  failure,
  jsonResponse,
  success,
} from "../common/response.js";
import {
  sanitizeUser,
  USER_ROLE,
} from "../../internal/model/user.js";

const tokenResp = (user) => ({ token: `siyuan-cloud-port:${user?.id || 1}`, username: user?.username || "admin" });

export const createAuthHandlers = ({
  getState,
  parseJson,
  saveState,
}) => ({
  "POST /api/auth/login": async (request) => {
    const req = await parseJson(request);
    const user = getState().users.find((item) => item.username === req.username);
    if (!user || user.disabled) return jsonResponse(failure("Invalid username or password", 401));
    if (user.password && req.password !== user.password) return jsonResponse(failure("Invalid username or password", 401));
    return jsonResponse(success(tokenResp(user)));
  },
  "POST /api/auth/login/hash": async (request) => {
    const req = await parseJson(request);
    const user = getState().users.find((item) => item.username === req.username);
    if (!user || user.disabled) return jsonResponse(failure("Invalid username or password", 401));
    return jsonResponse(success(tokenResp(user)));
  },
  "POST /api/auth/login/ldap": async () => jsonResponse(failure("LDAP login is not implemented in the SiYuan kernel runtime", 501, {
    upstream: "OpenList server/handles/ldap_login.go",
    reason: "The JavaScript kernel plugin runtime has no LDAP server bind/search implementation yet.",
  })),
  "GET /api/auth/logout": async () => jsonResponse(success()),
  "POST /api/auth/logout": async () => jsonResponse(success()),
  "GET /api/me": async () => {
    const user = getState().users.find((item) => item.role === USER_ROLE.ADMIN) || getState().users[0];
    return jsonResponse(success(sanitizeUser(user)));
  },
  "POST /api/me/update": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    const index = state.users.findIndex((item) => item.role === USER_ROLE.ADMIN);
    const current = state.users[index >= 0 ? index : 0];
    if (!current || current.role === USER_ROLE.GUEST) return jsonResponse(failure("Guest user can not update profile", 403));
    state.users[index >= 0 ? index : 0] = {
      ...current,
      username: req.username || current.username,
      password: req.password || current.password,
      sso_id: req.sso_id || current.sso_id || "",
    };
    await saveState();
    return jsonResponse(success());
  },
});
