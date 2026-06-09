import { TASK_TYPES } from "../../internal/conf/const.js";
import {
  failure,
  jsonResponse,
  success,
} from "../common/response.js";

export const createTaskHandlers = ({
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
    const task = taskStore.getTask(type, tid);
    if (!task) return jsonResponse(failure("task not found", 404));
    await callback(task, tid);
    return jsonResponse(success());
  };
  const batch = (type, callback) => async (request) => {
    const req = await parseJson(request);
    if (!Array.isArray(req)) return jsonResponse(failure("invalid request format", 400));
    const tids = req;
    const errors = {};
    for (const tid of tids) {
      if (!taskStore.getTask(type, tid)) {
        errors[tid] = "task not found";
        continue;
      }
      await callback(String(tid));
    }
    return jsonResponse(success(errors));
  };
  for (const type of TASK_TYPES) {
    map[`GET /api/task/${type}/undone`] = async () => jsonResponse(success(taskStore.listTasks(type, false)));
    map[`GET /api/task/${type}/done`] = async () => jsonResponse(success(taskStore.listTasks(type, true)));
    const infoHandler = async (request) => {
      const task = taskStore.getTask(type, await taskId(request));
      return task ? jsonResponse(success(task)) : jsonResponse(failure("task not found", 404));
    };
    map[`POST /api/task/${type}/info`] = infoHandler;
    map[`GET /api/task/${type}/info`] = infoHandler;
    map[`POST /api/task/${type}/retry`] = targeted(type, async (_, tid) => taskStore.retryTask(type, tid));
    map[`POST /api/task/${type}/retry_failed`] = async () => {
      await taskStore.retryFailed(type);
      return jsonResponse(success());
    };
    map[`POST /api/task/${type}/clear_done`] = async () => {
      await taskStore.clearDone(type);
      return jsonResponse(success());
    };
    map[`POST /api/task/${type}/clear_succeeded`] = async () => {
      await taskStore.clearSucceeded(type);
      return jsonResponse(success());
    };
    map[`POST /api/task/${type}/cancel`] = targeted(type, async (_, tid) => taskStore.markCanceled(type, tid));
    map[`POST /api/task/${type}/delete`] = targeted(type, async (_, tid) => taskStore.removeTask(type, tid));
    map[`POST /api/task/${type}/cancel_some`] = batch(type, async (tid) => taskStore.markCanceled(type, tid));
    map[`POST /api/task/${type}/delete_some`] = batch(type, async (tid) => taskStore.removeTask(type, tid));
    map[`POST /api/task/${type}/retry_some`] = batch(type, async (tid) => taskStore.retryTask(type, tid));
  }
  return map;
};
