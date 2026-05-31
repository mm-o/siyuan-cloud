import { OPENLIST_VERSION } from "../../internal/conf/const.js";
import { jsonResponse, success, textResponse } from "../common/response.js";

const ADAPTERS = [
  "siyuan-storage",
  "siyuan-workspace",
  "local",
  "openlist",
  "alist_v3",
  "webdav",
  "s3",
  "onedrive",
  "123pan",
  "baidu_netdisk",
  "aliyundrive_open",
  "189cloud",
  "189cloud_pc",
  "189cloud_tv",
  "quark",
  "uc",
  "quark_open",
  "quark_tv",
  "uc_tv",
];

const STAGES = [
  ["kernel", "done"],
  ["auth", "done"],
  ["fs", "done"],
  ["torrent", "active"],
  ["streaming-proxy", "done"],
  ["admin", "done"],
  ["meta", "done"],
  ["security", "active"],
  ["share", "done"],
  ["task", "active"],
  ["real-adapter", "active"],
  ["webdav", "active"],
  ["s3", "active"],
];

const getSyncInfo = async (client) => {
  let syncignore = "";
  try {
    const response = await client.fetch("/api/file/getFile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: ".siyuan/syncignore" }),
    });
    if (response.ok) syncignore = await response.text();
  } catch (_) {
    syncignore = "";
  }
  const lines = syncignore
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const storagePath = "/storage/petal/siyuan-cloud/siyuan-cloud/state.json";
  const ignored = lines.some((line) => (
    line === "/storage/petal/**/*"
    || line === "/storage/petal/**"
    || line === "/storage/petal/siyuan-cloud/**/*"
    || line === "/storage/petal/siyuan-cloud/**"
    || line === storagePath
  ));
  return {
    persistent: true,
    syncable_by_default: true,
    ignored_by_syncignore: ignored,
    state_file: storagePath,
    source: "kernel/plugin/plugin.go + kernel/model/repository.go + kernel/model/sync.go",
  };
};

export const createStatusPayload = async ({
  client,
  getState,
  handlersRef,
}) => {
  const state = getState();
  const handlers = handlersRef();
  return {
    ok: true,
    version: OPENLIST_VERSION,
    users: state.users.length,
    entries: Object.keys(state.entries).length,
    storages: state.storages.length,
    sharings: state.sharings.length,
    adapters: [...ADAPTERS],
    storage: await getSyncInfo(client),
    routes: Object.keys(handlers).sort(),
    stages: STAGES.map(([key, status]) => ({ key, status })),
  };
};

export const createStatusHandlers = ({
  client,
  getState,
  handlersRef,
}) => {
  return {
    "GET /ping": async () => textResponse("pong"),
    "ANY /ping": async () => textResponse("pong"),
    "GET /siyuan-cloud/status": async () => jsonResponse(success(await createStatusPayload({ client, getState, handlersRef }))),
  };
};
