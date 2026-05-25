import {
  jsonResponse,
  success,
} from "../common/response.js";

const tokenResp = () => ({ token: "siyuan-cloud-port" });

export const createAuthHandlers = ({
  getState,
  parseJson,
  saveState,
}) => ({
  "POST /api/auth/login": async () => jsonResponse(success(tokenResp())),
  "POST /api/auth/login/hash": async () => jsonResponse(success(tokenResp())),
  "POST /api/auth/login/ldap": async () => jsonResponse(success(tokenResp())),
  "GET /api/auth/logout": async () => jsonResponse(success()),
  "POST /api/auth/logout": async () => jsonResponse(success()),
  "GET /api/me": async () => {
    const user = { ...getState().users[0], password: "", otp_secret: "" };
    return jsonResponse(success(user));
  },
  "POST /api/me/update": async (request) => {
    const req = await parseJson(request);
    const state = getState();
    state.users[0] = { ...state.users[0], ...req, id: 1, role: 2, password: req.password ? "" : state.users[0].password };
    await saveState();
    return jsonResponse(success());
  },
});
