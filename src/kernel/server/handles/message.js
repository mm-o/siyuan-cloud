import {
  jsonResponse,
  pageResp,
  success,
} from "../common/response.js";

export const createMessageHandlers = ({
  getState,
  now,
  parseJson,
  saveState,
}) => {
  const state = new Proxy({}, {
    get: (_, prop) => getState()[prop],
    set: (_, prop, value) => {
      getState()[prop] = value;
      return true;
    },
  });

  return {
    "POST /api/admin/message/get": async () => {
      state.messages = state.messages || [];
      return jsonResponse(success(pageResp([...state.messages].reverse(), state.messages.length)));
    },
    "POST /api/admin/message/send": async (request) => {
      const req = await parseJson(request);
      state.messages = state.messages || [];
      state.messages.push({
        id: `message-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        title: req.title || req.Title || "",
        content: req.content || req.message || req.Message || "",
        type: req.type || "info",
        created: now(),
      });
      await saveState();
      return jsonResponse(success());
    },
  };
};
