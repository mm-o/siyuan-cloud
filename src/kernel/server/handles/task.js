import { TASK_TYPES } from "../../internal/conf/const.js";
import {
  failure,
  jsonResponse,
  pageResp,
  success,
} from "../common/response.js";

export const taskListResp = (taskStore, type, done) => {
  const tasks = taskStore.listTasks(type, done);
  return pageResp(tasks, tasks.length);
};

export const createTaskHandlers = ({
  parseJson,
  queryValue,
  saveState,
  taskStore,
}) => {
  const map = {};
  const taskId = async (request) => {
    const req = await parseJson(request);
    return queryValue(request, "tid") || req.tid || req.id || "";
  };
  for (const type of TASK_TYPES) {
    map[`GET /api/task/${type}/undone`] = async () => jsonResponse(success(taskListResp(taskStore, type, false)));
    map[`GET /api/task/${type}/done`] = async () => jsonResponse(success(taskListResp(taskStore, type, true)));
    map[`GET /api/task/${type}/info`] = async (request) => {
      const task = taskStore.getTask(type, await taskId(request));
      return task ? jsonResponse(success(task)) : jsonResponse(failure("task not found", 404));
    };
    map[`POST /api/task/${type}/info`] = map[`GET /api/task/${type}/info`];
    map[`POST /api/task/${type}/retry`] = async (request) => {
      const task = taskStore.getTask(type, await taskId(request));
      if (task) {
        task.state = "succeeded";
        task.status = "completed";
        task.progress = 100;
        task.error = "";
        await saveState();
      }
      return jsonResponse(success());
    };
    map[`POST /api/task/${type}/retry_failed`] = async () => jsonResponse(success());
    map[`POST /api/task/${type}/clear_done`] = async () => {
      await taskStore.clearDone(type);
      return jsonResponse(success());
    };
    map[`POST /api/task/${type}/clear_succeeded`] = map[`POST /api/task/${type}/clear_done`];
    map[`POST /api/task/${type}/cancel`] = async (request) => {
      await taskStore.markCanceled(type, await taskId(request));
      return jsonResponse(success());
    };
    map[`POST /api/task/${type}/delete`] = async (request) => {
      await taskStore.removeTask(type, await taskId(request));
      return jsonResponse(success());
    };
    map[`POST /api/task/${type}/cancel_some`] = async () => jsonResponse(success({}));
    map[`POST /api/task/${type}/delete_some`] = async () => jsonResponse(success([]));
    map[`POST /api/task/${type}/retry_some`] = async () => jsonResponse(success({}));
  }
  return map;
};
