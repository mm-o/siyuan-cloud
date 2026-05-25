import { defaultSettings } from "./settings.js";

export const defaultState = (now) => ({
  settings: defaultSettings(),
  users: [
    {
      id: 1,
      username: "admin",
      password: "",
      role: 2,
      disabled: false,
      base_path: "/",
      permission: 67108863,
      sso_id: "",
      otp: false,
      otp_secret: "",
    },
  ],
  storages: [
    {
      id: 1,
      mount_path: "/",
      order: 0,
      driver: "SiYuanKernel",
      cache_expiration: 30,
      status: "work",
      addition: "{}",
      remark: "Virtual OpenList storage backed by SiYuan kernel plugin storage.",
      modified: now(),
      disabled: false,
    },
  ],
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
});
