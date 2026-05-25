import {
  failure,
  jsonResponse,
  success,
} from "../common/response.js";

export const createSecurityHandlers = ({
  getState,
  now,
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

  const publicKeysForUser = (userId) => (state.ssh_keys || []).filter((item) => item.user_id === userId);

  const addKey = async (request, userId) => {
    const req = await parseJson(request);
    state.ssh_keys = state.ssh_keys || [];
    const id = Math.max(0, ...state.ssh_keys.map((item) => item.id || 0)) + 1;
    state.ssh_keys.push({
      id,
      user_id: Number(req.user_id || userId || 1),
      title: req.title || req.name || `key-${id}`,
      key: req.key || req.public_key || "",
      created: now(),
    });
    await saveState();
    return jsonResponse(success({ id }));
  };

  const deleteKey = async (request, userId) => {
    const req = await parseJson(request);
    const id = Number(queryValue(request, "id") || req.id);
    state.ssh_keys = (state.ssh_keys || []).filter((item) => item.id !== id || (userId && item.user_id !== userId));
    await saveState();
    return jsonResponse(success());
  };

  return {
    "GET /api/me/sshkey/list": async () => jsonResponse(success(publicKeysForUser(1))),
    "POST /api/me/sshkey/add": async (request) => addKey(request, 1),
    "POST /api/me/sshkey/delete": async (request) => deleteKey(request, 1),
    "GET /api/admin/user/sshkey/list": async (request) => {
      const userId = Number(queryValue(request, "user_id") || queryValue(request, "id") || 1);
      return jsonResponse(success(publicKeysForUser(userId)));
    },
    "POST /api/admin/user/sshkey/delete": async (request) => deleteKey(request, 0),
    "POST /api/auth/2fa/generate": async () => {
      const user = state.users[0];
      if (!user) return jsonResponse(failure("user not found", 404));
      user.otp_secret = `siyuan-cloud-${Math.random().toString(36).slice(2, 12)}`;
      await saveState();
      return jsonResponse(success({
        otp_secret: user.otp_secret,
        qr: "",
      }));
    },
    "POST /api/auth/2fa/verify": async () => {
      const user = state.users[0];
      if (!user) return jsonResponse(failure("user not found", 404));
      user.otp = true;
      await saveState();
      return jsonResponse(success());
    },
  };
};
