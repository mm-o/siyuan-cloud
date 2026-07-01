import { defaultSettings } from "./settings.js";
import {
  defaultAdminUser,
  defaultGuestUser,
} from "../../model/user.js";

export const defaultState = (now) => ({
  settings: defaultSettings(),
  users: [
    defaultAdminUser(),
    defaultGuestUser(),
  ],
  storages: [],
  entries: {
    "/": {
      name: "",
      path: "/",
      is_dir: true,
      size: 0,
      modified: now(),
      created: now(),
      children: [],
    },
  },
  tasks: {},
  metas: [],
  messages: [],
  ssh_keys: [],
  scan: { status: "idle", total: 0, done: 0 },
  webdav_locks: {},
  s3_multipart_uploads: {},
  sharings: [],
  search_nodes: [],
});
