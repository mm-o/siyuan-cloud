import { STATE_FILE } from "./conf/const.js";
import { defaultSettings } from "./bootstrap/data/settings.js";
import { defaultState } from "./bootstrap/data/state.js";

export const saveState = async (storage, state) => {
  await storage.put(STATE_FILE, JSON.stringify(state, null, 2));
};

export const loadState = async ({ now, storage }) => {
  try {
    const file = await storage.get(STATE_FILE);
    const loaded = await file.json();
    if (loaded && loaded.entries && loaded.users) {
      return {
        shouldSave: false,
        state: {
          ...defaultState(now),
          ...loaded,
          settings: { ...defaultSettings(), ...(loaded.settings || {}) },
          tasks: loaded.tasks || {},
          metas: loaded.metas || [],
          messages: loaded.messages || [],
          ssh_keys: loaded.ssh_keys || [],
          scan: loaded.scan || { status: "idle", total: 0, done: 0 },
          webdav_locks: loaded.webdav_locks || {},
          s3_multipart_uploads: loaded.s3_multipart_uploads || {},
          sharings: loaded.sharings || [],
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
