import { jsonResponse, success } from "../common/response.js";

export const createScanHandlers = ({
  getState,
  now,
  saveState,
}) => {
  const setScan = async (scan) => {
    getState().scan = {
      updated: now(),
      ...scan,
    };
    await saveState();
    return jsonResponse(success());
  };

  return {
    "POST /api/admin/scan/start": async () => setScan({ status: "done", total: 1, done: 1 }),
    "POST /api/admin/scan/stop": async () => setScan({ status: "idle", total: 0, done: 0 }),
    "GET /api/admin/scan/progress": async () => jsonResponse(success(getState().scan || { status: "idle", total: 0, done: 0 })),
  };
};
