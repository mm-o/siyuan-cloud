import {
  failure,
  jsonResponse,
  success,
} from "../common/response.js";

export const createSecurityHandlers = ({
  currentUser,
  getState,
  now,
  parseJson,
  queryValue,
  requireAdmin,
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
  const notGuest = (request) => {
    const ctx = currentUser(request, { allowDisabledGuest: true });
    if (ctx.error) return { error: failure(ctx.error, 401), user: ctx.user };
    if (Number(ctx.user?.role) === 1) return { error: failure("You are a guest", 403), user: ctx.user };
    return ctx;
  };
  const adminOnly = (handler) => async (request) => {
    const ctx = requireAdmin?.(request);
    if (ctx?.error) return jsonResponse(ctx.error, ctx.error.code);
    return handler(request, ctx?.user);
  };

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
    "GET /api/me/sshkey/list": async (request) => {
      const ctx = notGuest(request);
      if (ctx.error) return jsonResponse(ctx.error);
      return jsonResponse(success(publicKeysForUser(Number(ctx.user.id))));
    },
    "POST /api/me/sshkey/add": async (request) => {
      const ctx = notGuest(request);
      if (ctx.error) return jsonResponse(ctx.error);
      return addKey(request, Number(ctx.user.id));
    },
    "POST /api/me/sshkey/delete": async (request) => {
      const ctx = notGuest(request);
      if (ctx.error) return jsonResponse(ctx.error);
      return deleteKey(request, Number(ctx.user.id));
    },
    "GET /api/admin/user/sshkey/list": adminOnly(async (request) => {
      const userId = Number(queryValue(request, "user_id") || queryValue(request, "id") || 1);
      return jsonResponse(success(publicKeysForUser(userId)));
    }),
    "POST /api/admin/user/sshkey/delete": adminOnly(async (request) => deleteKey(request, 0)),
    "POST /api/auth/2fa/generate": async (request) => {
      const ctx = notGuest(request);
      if (ctx.error) return jsonResponse(ctx.error);
      const user = state.users.find((item) => Number(item.id) === Number(ctx.user.id));
      if (!user) return jsonResponse(failure("user not found", 404));
      user.otp_secret = `siyuan-cloud-${Math.random().toString(36).slice(2, 12)}`;
      await saveState();
      return jsonResponse(success({
        otp_secret: user.otp_secret,
        qr: "",
      }));
    },
    "POST /api/auth/2fa/verify": async (request) => {
      const ctx = notGuest(request);
      if (ctx.error) return jsonResponse(ctx.error);
      const user = state.users.find((item) => Number(item.id) === Number(ctx.user.id));
      if (!user) return jsonResponse(failure("user not found", 404));
      user.otp = true;
      await saveState();
      return jsonResponse(success());
    },
  };
};
