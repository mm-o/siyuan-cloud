import {
  failure,
  jsonResponse,
  success,
} from "../common/response.js";

const notImplemented = (name) => jsonResponse(failure(`${name} is not implemented in the SiYuan kernel port yet`, 501));

export const createCompatHandlers = () => ({
  "GET /api/auth/sso": async () => notImplemented("sso login"),
  "GET /api/auth/sso_callback": async () => notImplemented("sso callback"),
  "GET /api/auth/get_sso_id": async () => notImplemented("sso id lookup"),
  "GET /api/auth/sso_get_token": async () => notImplemented("sso token lookup"),
  "GET /api/authn/webauthn_begin_login": async () => notImplemented("webauthn login"),
  "POST /api/authn/webauthn_finish_login": async () => notImplemented("webauthn login"),
  "GET /api/authn/webauthn_begin_registration": async () => notImplemented("webauthn registration"),
  "POST /api/authn/webauthn_finish_registration": async () => notImplemented("webauthn registration"),
  "POST /api/authn/delete_authn": async () => jsonResponse(success()),
  "GET /api/authn/getcredentials": async () => jsonResponse(success([])),
  "POST /api/admin/user/del_cache": async () => jsonResponse(success()),
});
