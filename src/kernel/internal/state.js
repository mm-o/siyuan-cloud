import {
  CONFIG_FILE,
  LEGACY_STATE_FILE,
  RUNTIME_FILE,
  SEARCH_INDEX_FILE,
} from "./conf/const.js";
import { defaultSettings } from "./bootstrap/data/settings.js";
import { defaultState } from "./bootstrap/data/state.js";
import {
  defaultAdminUser,
  defaultGuestUser,
  normalizeUser,
  USER_ROLE,
} from "./model/user.js";

const lastWritten = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const storageRateLimitDelay = (error) => {
  const message = String(error?.message || error || "");
  if (!/TooManyRequests|Requests?/i.test(message)) return 0;
  const match = message.match(/(\d{3,6})/);
  return Math.max(1000, Number(match?.[1] || 3000) + 200);
};

const storageCall = async (run) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const delay = storageRateLimitDelay(error);
      if (!delay || attempt === 2) throw error;
      await sleep(delay);
    }
  }
  return null;
};

const readJson = async (storage, path) => {
  try {
    const file = await storageCall(() => storage.get(path));
    if (file?.text) {
      const content = await file.text();
      lastWritten.set(path, content);
      return JSON.parse(content);
    }
    const value = await file.json();
    lastWritten.set(path, JSON.stringify(value, null, 2));
    return value;
  } catch (_) {
    return null;
  }
};

const writeJson = async (storage, path, value) => {
  const content = JSON.stringify(value, null, 2);
  if (lastWritten.get(path) === content) return;
  await storageCall(() => storage.put(path, content));
  lastWritten.set(path, content);
};

const parseJsonObject = (value) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch (_) {
    return {};
  }
};

const pickConfigState = (state) => ({
  version: 1,
  settings: state.settings || {},
  users: state.users || [],
  storages: state.storages || [],
  metas: state.metas || [],
  sharings: state.sharings || [],
  ssh_keys: state.ssh_keys || [],
});

const pickRuntimeState = (state) => ({
  version: 1,
  entries: state.entries || {},
  tasks: state.tasks || {},
  messages: state.messages || [],
  scan: state.scan || { status: "idle", total: 0, done: 0 },
  webdav_locks: state.webdav_locks || {},
  s3_multipart_uploads: state.s3_multipart_uploads || {},
});

const pickSearchState = (state) => ({
  version: 1,
  index_progress: state.index_progress || {},
  search_nodes: state.search_nodes || [],
});

const normalizeUsers = (users) => {
  const normalized = Array.isArray(users) ? users.map(normalizeUser) : [];
  if (!normalized.some((user) => user.role === USER_ROLE.ADMIN)) {
    normalized.unshift(defaultAdminUser());
  }
  if (!normalized.some((user) => user.role === USER_ROLE.GUEST)) {
    normalized.push(defaultGuestUser());
  }
  return normalized.map((user, index) => ({
    ...user,
    id: Number(user.id || index + 1),
    disabled: user.role === USER_ROLE.ADMIN ? false : !!user.disabled,
  }));
};

const normalizeStorages = (storages) => (Array.isArray(storages) ? storages : [])
  .filter((storage) => storage?.driver !== "SiYuanKernel");

const normalizeDomains = (domains) => {
  if (!domains) return ["config", "runtime", "search"];
  if (typeof domains === "string") return [domains];
  if (Array.isArray(domains)) return domains;
  return ["config", "runtime", "search"];
};

export const saveState = async (storage, state, domains) => {
  const items = new Set(normalizeDomains(domains));
  if (items.has("config")) await writeJson(storage, CONFIG_FILE, pickConfigState(state));
  if (items.has("runtime")) await writeJson(storage, RUNTIME_FILE, pickRuntimeState(state));
  if (items.has("search")) await writeJson(storage, SEARCH_INDEX_FILE, pickSearchState(state));
};

export const loadConfigState = async ({ storage }) => {
  const config = await readJson(storage, CONFIG_FILE);
  if (!config) return null;
  return {
    settings: { ...defaultSettings(), ...(config.settings || {}) },
    users: normalizeUsers(config.users),
    storages: normalizeStorages(config.storages),
    metas: config.metas || [],
    sharings: config.sharings || [],
    ssh_keys: config.ssh_keys || [],
  };
};

export const loadState = async ({ now, storage }) => {
  try {
    const config = await loadConfigState({ storage });
    const runtime = await readJson(storage, RUNTIME_FILE);
    const search = await readJson(storage, SEARCH_INDEX_FILE);
    const legacyState = !config && !runtime && !search ? await readJson(storage, LEGACY_STATE_FILE) : null;
    const loaded = legacyState || (
      config || runtime || search
        ? {
            ...(runtime || {}),
            ...(config || {}),
            ...(search || {}),
          }
        : null
    );
    if (loaded && (loaded.entries || loaded.users || loaded.storages || loaded.sharings)) {
      return {
        shouldSave: !!legacyState,
        state: {
          ...defaultState(now),
          ...loaded,
          settings: { ...defaultSettings(), ...(loaded.settings || {}) },
          users: normalizeUsers(loaded.users),
          storages: normalizeStorages(loaded.storages),
          tasks: loaded.tasks || {},
          metas: loaded.metas || [],
          messages: loaded.messages || [],
          ssh_keys: loaded.ssh_keys || [],
          scan: loaded.scan || { status: "idle", total: 0, done: 0 },
          webdav_locks: loaded.webdav_locks || {},
          s3_multipart_uploads: loaded.s3_multipart_uploads || {},
          sharings: loaded.sharings || [],
          index_progress: loaded.index_progress || parseJsonObject(loaded.settings?.index_progress),
          search_nodes: loaded.search_nodes || [],
        },
      };
    }
  } catch (_) {
    // Fall through to a fresh state.
  }
  return {
    shouldSave: true,
    state: defaultState(now),
  };
};
