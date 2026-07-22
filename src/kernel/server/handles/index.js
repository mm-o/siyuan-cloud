import { failure, jsonResponse, success } from "../common/response.js";

export const createIndexHandlers = ({
  parseJson,
  requireAdmin,
  searchIndex,
}) => {
  let cancelIndex = false;
  let indexRunning = false;
  const withAdmin = (handler) => async (request) => {
    const ctx = requireAdmin?.(request);
    if (ctx?.error) return jsonResponse(ctx.error, ctx.error.code);
    return handler(request);
  };
  const runIndexBuild = async (buildOptions) => {
    if (indexRunning) return false;
    indexRunning = true;
    cancelIndex = false;
    Promise.resolve().then(async () => {
      let lastProgressAt = 0;
      try {
        await searchIndex.build({
          ...buildOptions,
          shouldCancel: () => cancelIndex,
          onProgress: async ({ found }) => {
            const time = Date.now();
            if (time - lastProgressAt < 1000) return;
            lastProgressAt = time;
            await searchIndex.writeProgress({ obj_count: found, is_done: false, error: "" });
          },
        });
      } catch (error) {
        // searchIndex.build already writes the final error progress.
        if ((error?.message || String(error)) !== "index canceled")
          console.warn("[siyuan-cloud] build index error", error?.message || String(error));
      } finally {
        indexRunning = false;
        cancelIndex = false;
      }
    });
    return true;
  };
  const handlers = {
    "POST /api/admin/index/build": async () => {
      if (!await runIndexBuild({ clearFirst: true, count: true, paths: ["/"] }))
        return jsonResponse(failure("index is running", 400), 400);
      return jsonResponse(success());
    },
    "POST /api/admin/index/update": async (request) => {
      const req = await parseJson(request);
      const paths = Array.isArray(req.paths) && req.paths.length ? req.paths : ["/"];
      if (!await runIndexBuild({ clearFirst: false, count: false, maxDepth: req.max_depth, paths }))
        return jsonResponse(failure("index is running", 400), 400);
      return jsonResponse(success());
    },
    "POST /api/admin/index/stop": async () => {
      if (!indexRunning)
        return jsonResponse(failure("index is not running", 400), 400);
      cancelIndex = true;
      return jsonResponse(success());
    },
    "POST /api/admin/index/clear": async () => {
      if (indexRunning)
        return jsonResponse(failure("index is running", 400), 400);
      await searchIndex.clear({ persist: false });
      await searchIndex.writeProgress({
        error: "",
        is_done: true,
        last_done_time: null,
        obj_count: 0,
      });
      return jsonResponse(success());
    },
    "GET /api/admin/index/progress": async () => {
      return jsonResponse(success({
        ...searchIndex.getProgress(),
        running: indexRunning,
      }));
    },
  };
  return Object.fromEntries(Object.entries(handlers).map(([key, handler]) => [key, withAdmin(handler)]));
};
