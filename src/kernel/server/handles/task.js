import { TASK_TYPES } from "../../internal/conf/const.js";
import {
  failure,
  jsonResponse,
  success,
} from "../common/response.js";

export const createTaskHandlers = ({
  currentUser,
  parseJson,
  queryValue,
  taskStore,
}) => {
  const map = {};
  const parseTaskRequest = async (request) => {
    const req = await parseJson(request);
    return {
      req,
      tid: queryValue(request, "tid") || req.tid || req.id || "",
    };
  };
  const taskId = async (request) => (await parseTaskRequest(request)).tid;
  const targeted = (type, callback) => async (request) => {
    const tid = await taskId(request);
    const user = currentUser?.(request);
    const task = taskStore.getTask(type, tid, user);
    if (!task) return jsonResponse(failure("task not found", 404));
    await callback(task, tid, user);
    return jsonResponse(success());
  };
  const batch = (type, callback) => async (request) => {
    const req = await parseJson(request);
    const user = currentUser?.(request);
    if (!Array.isArray(req)) return jsonResponse(failure("invalid request format", 400));
    const tids = req;
    const errors = {};
    for (const tid of tids) {
      if (!taskStore.getTask(type, tid, user)) {
        errors[tid] = "task not found";
        continue;
      }
      await callback(String(tid), user);
    }
    return jsonResponse(success(errors));
  };
  for (const type of TASK_TYPES) {
    map[`GET /api/task/${type}/undone`] = async (request) => jsonResponse(success(taskStore.listTasks(type, false, currentUser?.(request))));
    map[`GET /api/task/${type}/done`] = async (request) => jsonResponse(success(taskStore.listTasks(type, true, currentUser?.(request))));
    const infoHandler = async (request) => {
      const task = taskStore.getTask(type, await taskId(request), currentUser?.(request));
      return task ? jsonResponse(success(task)) : jsonResponse(failure("task not found", 404));
    };
    map[`POST /api/task/${type}/info`] = infoHandler;
    map[`GET /api/task/${type}/info`] = infoHandler;
    map[`POST /api/task/${type}/retry`] = targeted(type, async (_, tid, user) => taskStore.retryTask(type, tid, user));
    map[`POST /api/task/${type}/retry_failed`] = async (request) => {
      await taskStore.retryFailed(type, currentUser?.(request));
      return jsonResponse(success());
    };
    map[`POST /api/task/${type}/clear_done`] = async (request) => {
      await taskStore.clearDone(type, currentUser?.(request));
      return jsonResponse(success());
    };
    map[`POST /api/task/${type}/clear_succeeded`] = async (request) => {
      await taskStore.clearSucceeded(type, currentUser?.(request));
      return jsonResponse(success());
    };
    map[`POST /api/task/${type}/cancel`] = targeted(type, async (_, tid, user) => taskStore.markCanceled(type, tid, user));
    map[`POST /api/task/${type}/delete`] = targeted(type, async (_, tid, user) => taskStore.removeTask(type, tid, user));
    map[`POST /api/task/${type}/cancel_some`] = batch(type, async (tid, user) => taskStore.markCanceled(type, tid, user));
    map[`POST /api/task/${type}/delete_some`] = batch(type, async (tid, user) => taskStore.removeTask(type, tid, user));
    map[`POST /api/task/${type}/retry_some`] = batch(type, async (tid, user) => taskStore.retryTask(type, tid, user));
  }
  return map;
};
