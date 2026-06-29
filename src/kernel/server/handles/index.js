import { failure, jsonResponse, success } from "../common/response.js";

export const createIndexHandlers = ({
  currentUser,
  parseJson,
  requireAdmin,
  searchIndex,
  taskStore,
}) => {
  let activeIndexTaskId = "";
  const withAdmin = (handler) => async (request) => {
    const ctx = requireAdmin?.(request);
    if (ctx?.error) return jsonResponse(ctx.error, ctx.error.code);
    return handler(request, ctx?.user);
  };
  const shouldRunAsync = (req) => req.async === true || req.task === true || req.queued === true;
  const queueIndexTask = async (request, req, user, taskName, buildOptions) => {
    if (!taskStore?.enqueueTask) return null;
    const task = await taskStore.enqueueTask("index", {
      creator: currentUser?.(request) || user,
      name: taskName,
      status: "queued",
    }, async ({ id, isCanceled, progress, throwIfCanceled }) => {
      activeIndexTaskId = id;
      await progress({ progress: 5, status: "clearing" });
      throwIfCanceled();
      if (buildOptions.clearFirst) await searchIndex.clear();
      await progress({ progress: 15, status: "indexing" });
      await searchIndex.build({ ...buildOptions, shouldCancel: isCanceled });
      throwIfCanceled();
      await progress({ progress: 95, status: "finalizing" });
    });
    return task;
  };
  const currentIndexTask = (user) => {
    const undone = taskStore?.listTasks?.("index", false, user) || [];
    return undone.find((task) => task.state === "running" || task.state === "canceling")
      || undone[0]
      || null;
  };
  const handlers = {
    "POST /api/admin/index/build": async (request, user) => {
      const req = await parseJson(request);
      if (shouldRunAsync(req)) {
        const task = await queueIndexTask(request, req, user, "index build", { clearFirst: true, count: true, paths: ["/"] });
        return jsonResponse(success({ task }));
      }
      await searchIndex.clear();
      await searchIndex.build({ clearFirst: true, count: true, paths: ["/"] });
      return jsonResponse(success());
    },
    "POST /api/admin/index/update": async (request, user) => {
      const req = await parseJson(request);
      const paths = Array.isArray(req.paths) && req.paths.length ? req.paths : ["/"];
      if (shouldRunAsync(req)) {
        const task = await queueIndexTask(request, req, user, "index update", { clearFirst: false, count: false, maxDepth: req.max_depth, paths });
        return jsonResponse(success({ task }));
      }
      await searchIndex.build({ clearFirst: false, count: false, maxDepth: req.max_depth, paths });
      return jsonResponse(success());
    },
    "POST /api/admin/index/stop": async (_request, user) => {
      const activeTask = activeIndexTaskId
        ? taskStore?.getTask?.("index", activeIndexTaskId, user)
        : currentIndexTask(user);
      const task = activeTask && !["succeeded", "failed", "canceled"].includes(activeTask.state)
        ? activeTask
        : currentIndexTask(user);
      if (!task || task.state === "succeeded" || task.state === "failed" || task.state === "canceled") {
        return jsonResponse(failure("index is not running", 400));
      }
      await taskStore.markCanceled("index", task.id, user);
      await searchIndex.writeProgress({
        error: "index canceled",
        is_done: true,
        task_id: task.id,
      });
      return jsonResponse(success({ task_id: task.id }));
    },
    "POST /api/admin/index/clear": async () => {
      await searchIndex.clear();
      await searchIndex.writeProgress({
        error: "",
        is_done: true,
        last_done_time: null,
        obj_count: 0,
      });
      return jsonResponse(success());
    },
    "GET /api/admin/index/progress": async () => {
      const task = currentIndexTask();
      return jsonResponse(success({
        ...searchIndex.getProgress(),
        task: task || null,
        task_id: task?.id || "",
      }));
    },
  };
  return Object.fromEntries(Object.entries(handlers).map(([key, handler]) => [key, withAdmin(handler)]));
};
