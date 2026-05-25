import { TASK_TYPES } from "../conf/const.js";

const DONE_STATES = new Set(["succeeded", "failed", "canceled"]);

export const ensureTaskBuckets = (state) => {
  state.tasks = state.tasks || {};
  for (const type of TASK_TYPES) {
    state.tasks[type] = state.tasks[type] || {};
  }
  return state.tasks;
};

export const createTaskRecord = ({
  creator,
  error,
  name,
  now,
  status,
  totalBytes,
  type,
}) => {
  const time = now();
  return {
    id: `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || type,
    creator: creator?.username || "admin",
    creator_role: creator?.role ?? 2,
    state: error ? "failed" : "succeeded",
    status: status || (error ? "failed" : "completed"),
    progress: error ? 0 : 100,
    start_time: time,
    end_time: time,
    total_bytes: totalBytes || 0,
    error: error || "",
  };
};

export const createTaskStore = ({
  getState,
  now,
  saveState,
}) => {
  const addTask = async (type, input) => {
    const state = getState();
    const tasks = ensureTaskBuckets(state);
    const task = createTaskRecord({
      ...input,
      creator: state.users?.[0],
      now,
      type,
    });
    tasks[type][task.id] = task;
    await saveState();
    return task;
  };

  const getTask = (type, id) => {
    const tasks = ensureTaskBuckets(getState());
    return tasks[type]?.[id] || null;
  };

  const listTasks = (type, done) => {
    const tasks = ensureTaskBuckets(getState());
    return Object.values(tasks[type] || {})
      .filter((task) => done ? DONE_STATES.has(task.state) : !DONE_STATES.has(task.state))
      .sort((a, b) => String(b.start_time || "").localeCompare(String(a.start_time || "")));
  };

  const removeTask = async (type, id) => {
    const tasks = ensureTaskBuckets(getState());
    if (tasks[type]) delete tasks[type][id];
    await saveState();
  };

  const clearDone = async (type) => {
    const tasks = ensureTaskBuckets(getState());
    for (const task of Object.values(tasks[type] || {})) {
      if (DONE_STATES.has(task.state)) delete tasks[type][task.id];
    }
    await saveState();
  };

  const markCanceled = async (type, id) => {
    const task = getTask(type, id);
    if (task) {
      task.state = "canceled";
      task.status = "canceled";
      task.end_time = now();
    }
    await saveState();
  };

  return {
    addTask,
    clearDone,
    getTask,
    listTasks,
    markCanceled,
    removeTask,
  };
};
