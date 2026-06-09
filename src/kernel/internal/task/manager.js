import { TASK_TYPES } from "../conf/const.js";

const DONE_STATES = new Set(["canceled", "failed", "succeeded"]);
const UNDONE_STATES = new Set(["pending", "running", "canceling", "errored", "failing", "waiting_retry", "before_retry"]);

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

export const normalizeTaskRecord = (task = {}) => ({
  id: String(task.id || ""),
  name: String(task.name || ""),
  creator: String(task.creator || "admin"),
  creator_role: Number(task.creator_role ?? 2),
  state: String(task.state || "succeeded"),
  status: String(task.status || ""),
  progress: Number.isFinite(Number(task.progress)) ? Number(task.progress) : 100,
  start_time: task.start_time || null,
  end_time: task.end_time || null,
  total_bytes: Number(task.total_bytes || 0),
  error: String(task.error || ""),
});

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
    tasks[type][task.id] = normalizeTaskRecord(task);
    await saveState();
    return tasks[type][task.id];
  };

  const getTask = (type, id) => {
    const tasks = ensureTaskBuckets(getState());
    const task = tasks[type]?.[id] || null;
    return task ? normalizeTaskRecord(task) : null;
  };

  const listTasks = (type, done) => {
    const tasks = ensureTaskBuckets(getState());
    return Object.values(tasks[type] || {})
      .map(normalizeTaskRecord)
      .filter((task) => done ? DONE_STATES.has(task.state) : UNDONE_STATES.has(task.state))
      .sort((a, b) => String(b.start_time || "").localeCompare(String(a.start_time || "")));
  };

  const removeTask = async (type, id) => {
    const tasks = ensureTaskBuckets(getState());
    if (!tasks[type]?.[id]) return false;
    delete tasks[type][id];
    await saveState();
    return true;
  };

  const clearByState = async (type, states) => {
    const tasks = ensureTaskBuckets(getState());
    for (const task of Object.values(tasks[type] || {})) {
      if (states.has(task.state)) delete tasks[type][task.id];
    }
    await saveState();
  };

  const markCanceled = async (type, id) => {
    const tasks = ensureTaskBuckets(getState());
    const task = tasks[type]?.[id];
    if (!task) return false;
    if (task) {
      task.state = "canceled";
      task.status = "canceled";
      task.end_time = now();
    }
    await saveState();
    return true;
  };

  const retryTask = async (type, id) => {
    const tasks = ensureTaskBuckets(getState());
    const task = tasks[type]?.[id];
    if (!task) return false;
    task.state = "succeeded";
    task.status = "completed";
    task.progress = 100;
    task.error = "";
    task.end_time = now();
    await saveState();
    return true;
  };

  const retryFailed = async (type) => {
    const tasks = ensureTaskBuckets(getState());
    for (const task of Object.values(tasks[type] || {})) {
      if (task.state !== "failed") continue;
      task.state = "succeeded";
      task.status = "completed";
      task.progress = 100;
      task.error = "";
      task.end_time = now();
    }
    await saveState();
  };

  return {
    addTask,
    clearDone: (type) => clearByState(type, DONE_STATES),
    clearSucceeded: (type) => clearByState(type, new Set(["succeeded"])),
    getTask,
    listTasks,
    markCanceled,
    removeTask,
    retryFailed,
    retryTask,
  };
};
