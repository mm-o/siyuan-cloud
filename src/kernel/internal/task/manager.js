import { TASK_TYPES } from "../conf/const.js";

const DONE_STATES = new Set(["canceled", "failed", "succeeded"]);
const UNDONE_STATES = new Set(["pending", "running", "canceling", "errored", "failing", "waiting_retry", "before_retry"]);

class TaskCancelError extends Error {
  constructor(message = "task canceled") {
    super(message);
    this.name = "TaskCancelError";
  }
}

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
    creator_id: Number(creator?.id || 1),
    creator_role: creator?.role ?? 2,
    state: error ? "failed" : "succeeded",
    status: status || (error ? "failed" : "completed"),
    progress: error ? 0 : 100,
    start_time: time,
    end_time: time,
    total_bytes: totalBytes || 0,
    error: error || "",
    cancel_requested: false,
  };
};

export const createQueuedTaskRecord = ({
  creator,
  name,
  now,
  totalBytes,
  type,
}) => {
  const time = now();
  return {
    id: `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || type,
    creator: creator?.username || "admin",
    creator_id: Number(creator?.id || 1),
    creator_role: creator?.role ?? 2,
    state: "pending",
    status: "pending",
    progress: 0,
    start_time: null,
    end_time: null,
    queued_time: time,
    updated_time: time,
    total_bytes: totalBytes || 0,
    error: "",
    cancel_requested: false,
  };
};

export const normalizeTaskRecord = (task = {}) => ({
  id: String(task.id || ""),
  name: String(task.name || ""),
  creator: String(task.creator || "admin"),
  creator_id: Number(task.creator_id || task.creatorId || 1),
  creator_role: Number(task.creator_role ?? 2),
  state: String(task.state || "succeeded"),
  status: String(task.status || ""),
  progress: Number.isFinite(Number(task.progress)) ? Number(task.progress) : 100,
  start_time: task.start_time || null,
  end_time: task.end_time || null,
  queued_time: task.queued_time || task.start_time || null,
  updated_time: task.updated_time || task.end_time || task.start_time || null,
  total_bytes: Number(task.total_bytes || 0),
  error: String(task.error || ""),
  cancel_requested: !!task.cancel_requested,
});

export const createTaskStore = ({
  getState,
  now,
  saveState,
}) => {
  const queue = [];
  const workers = new Map();
  let running = 0;
  const concurrency = 1;

  const canAccessTask = (task, user) => {
    if (!user || Number(user.role) === 2) return true;
    const normalized = normalizeTaskRecord(task);
    if (normalized.creator_id) return Number(normalized.creator_id) === Number(user.id);
    return normalized.creator === user.username;
  };

  const addTask = async (type, input) => {
    const state = getState();
    const tasks = ensureTaskBuckets(state);
    const task = createTaskRecord({
      ...input,
      creator: input?.creator || state.users?.[0],
      now,
      type,
    });
    tasks[type][task.id] = normalizeTaskRecord(task);
    await saveState();
    return tasks[type][task.id];
  };

  const getTask = (type, id, user) => {
    const tasks = ensureTaskBuckets(getState());
    const task = tasks[type]?.[id] || null;
    return task && canAccessTask(task, user) ? normalizeTaskRecord(task) : null;
  };

  const updateTask = async (type, id, patch = {}) => {
    const tasks = ensureTaskBuckets(getState());
    const task = tasks[type]?.[id];
    if (!task) return null;
    Object.assign(task, patch, { updated_time: now() });
    tasks[type][id] = normalizeTaskRecord(task);
    await saveState();
    return tasks[type][id];
  };

  const runQueuedTask = async (type, id, worker) => {
    running += 1;
    const tasks = ensureTaskBuckets(getState());
    const task = tasks[type]?.[id];
    if (!task) {
      running -= 1;
      return;
    }
    if (task.cancel_requested) {
      await updateTask(type, id, {
        end_time: now(),
        progress: 0,
        state: "canceled",
        status: "canceled",
      });
      running -= 1;
      drainQueue();
      return;
    }
    await updateTask(type, id, {
      start_time: now(),
      state: "running",
      status: "running",
    });
    const isCanceled = () => {
      const current = ensureTaskBuckets(getState())[type]?.[id];
      return !!current?.cancel_requested;
    };
    const throwIfCanceled = () => {
      if (isCanceled()) throw new TaskCancelError();
    };
    const progress = async (patch = {}) => {
      throwIfCanceled();
      const next = {};
      if (patch.status !== undefined) next.status = String(patch.status);
      if (patch.progress !== undefined) next.progress = Math.max(0, Math.min(100, Number(patch.progress) || 0));
      if (patch.totalBytes !== undefined) next.total_bytes = Number(patch.totalBytes || 0);
      if (patch.error !== undefined) next.error = String(patch.error || "");
      await updateTask(type, id, next);
    };
    try {
      await worker({ id, isCanceled, progress, task: normalizeTaskRecord(task), throwIfCanceled });
      if (isCanceled()) throw new TaskCancelError();
      await updateTask(type, id, {
        end_time: now(),
        error: "",
        progress: 100,
        state: "succeeded",
        status: "completed",
      });
    } catch (error) {
      const canceled = error instanceof TaskCancelError || isCanceled();
      await updateTask(type, id, {
        end_time: now(),
        error: canceled ? "" : String(error?.message || error || "task failed"),
        state: canceled ? "canceled" : "failed",
        status: canceled ? "canceled" : "failed",
      });
    } finally {
      running -= 1;
      drainQueue();
    }
  };

  const drainQueue = () => {
    while (running < concurrency && queue.length) {
      const item = queue.shift();
      const worker = workers.get(item.id);
      workers.delete(item.id);
      if (!worker) continue;
      Promise.resolve().then(() => runQueuedTask(item.type, item.id, worker));
    }
  };

  const enqueueTask = async (type, input = {}, worker = async () => {}) => {
    const state = getState();
    const tasks = ensureTaskBuckets(state);
    const task = createQueuedTaskRecord({
      ...input,
      creator: input?.creator || state.users?.[0],
      now,
      type,
    });
    tasks[type][task.id] = normalizeTaskRecord(task);
    workers.set(task.id, worker);
    queue.push({ id: task.id, type });
    await saveState();
    drainQueue();
    return tasks[type][task.id];
  };

  const listTasks = (type, done, user) => {
    const tasks = ensureTaskBuckets(getState());
    return Object.values(tasks[type] || {})
      .map(normalizeTaskRecord)
      .filter((task) => canAccessTask(task, user))
      .filter((task) => done ? DONE_STATES.has(task.state) : UNDONE_STATES.has(task.state))
      .sort((a, b) => String(b.start_time || "").localeCompare(String(a.start_time || "")));
  };

  const removeTask = async (type, id, user) => {
    const tasks = ensureTaskBuckets(getState());
    if (!tasks[type]?.[id] || !canAccessTask(tasks[type][id], user)) return false;
    delete tasks[type][id];
    await saveState();
    return true;
  };

  const clearByState = async (type, states, user) => {
    const tasks = ensureTaskBuckets(getState());
    for (const task of Object.values(tasks[type] || {})) {
      if (!canAccessTask(task, user)) continue;
      if (states.has(task.state)) delete tasks[type][task.id];
    }
    await saveState();
  };

  const markCanceled = async (type, id, user) => {
    const tasks = ensureTaskBuckets(getState());
    const task = tasks[type]?.[id];
    if (!task || !canAccessTask(task, user)) return false;
    if (task.state === "pending") {
      workers.delete(id);
      const queueIndex = queue.findIndex((item) => item.id === id && item.type === type);
      if (queueIndex >= 0) queue.splice(queueIndex, 1);
      task.state = "canceled";
      task.status = "canceled";
      task.end_time = now();
      task.cancel_requested = true;
    } else if (task.state === "running") {
      task.state = "canceling";
      task.status = "canceling";
      task.cancel_requested = true;
    } else {
      task.state = "canceled";
      task.status = "canceled";
      task.end_time = now();
      task.cancel_requested = true;
    }
    task.updated_time = now();
    await saveState();
    return true;
  };

  const retryTask = async (type, id, user) => {
    const tasks = ensureTaskBuckets(getState());
    const task = tasks[type]?.[id];
    if (!task || !canAccessTask(task, user)) return false;
    task.state = "succeeded";
    task.status = "completed";
    task.progress = 100;
    task.error = "";
    task.cancel_requested = false;
    task.end_time = now();
    task.updated_time = now();
    await saveState();
    return true;
  };

  const retryFailed = async (type, user) => {
    const tasks = ensureTaskBuckets(getState());
    for (const task of Object.values(tasks[type] || {})) {
      if (!canAccessTask(task, user)) continue;
      if (task.state !== "failed") continue;
      task.state = "succeeded";
      task.status = "completed";
      task.progress = 100;
      task.error = "";
      task.cancel_requested = false;
      task.end_time = now();
      task.updated_time = now();
    }
    await saveState();
  };

  return {
    addTask,
    clearDone: (type, user) => clearByState(type, DONE_STATES, user),
    clearSucceeded: (type, user) => clearByState(type, new Set(["succeeded"]), user),
    enqueueTask,
    getTask,
    listTasks,
    markCanceled,
    removeTask,
    retryFailed,
    retryTask,
  };
};
