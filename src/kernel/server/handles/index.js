import { jsonResponse, success } from "../common/response.js";

const progress = (status, message) => ({
  done: status === "done" ? 1 : 0,
  message,
  status,
  total: 1,
});

export const createIndexHandlers = ({
  getState,
  saveState,
}) => {
  const setProgress = async (value) => {
    getState().settings.index_progress = JSON.stringify(value);
    await saveState();
    return jsonResponse(success());
  };

  return {
    "POST /api/admin/index/build": async () => setProgress(progress("done", "Siyuan Cloud virtual index is ready")),
    "POST /api/admin/index/update": async () => setProgress(progress("done", "Siyuan Cloud virtual index is updated")),
    "POST /api/admin/index/stop": async () => setProgress(progress("idle", "index stopped")),
    "POST /api/admin/index/clear": async () => setProgress(progress("idle", "index cleared")),
    "GET /api/admin/index/progress": async () => {
      try {
        return jsonResponse(success(JSON.parse(getState().settings.index_progress || "{}")));
      } catch (_) {
        return jsonResponse(success({}));
      }
    },
  };
};
