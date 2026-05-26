import { OPENLIST_VERSION } from "../../internal/conf/const.js";
import { jsonResponse, success, textResponse } from "../common/response.js";

export const createStatusHandlers = ({
  client,
  getState,
  handlersRef,
}) => {
  const getSyncInfo = async () => {
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

  return {
    "GET /ping": async () => textResponse("pong"),
    "ANY /ping": async () => textResponse("pong"),
    "GET /siyuan-cloud/status": async () => {
      const state = getState();
      const handlers = handlersRef();
      return jsonResponse(success({
        ok: true,
        version: OPENLIST_VERSION,
        users: state.users.length,
        entries: Object.keys(state.entries).length,
        storages: state.storages.length,
        sharings: state.sharings.length,
        adapters: [
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
          "quark",
        ],
        storage: await getSyncInfo(),
        routes: Object.keys(handlers).sort(),
        stages: [
          { key: "kernel", status: "done" },
          { key: "auth", status: "done" },
          { key: "fs", status: "done" },
          { key: "streaming-proxy", status: "done" },
          { key: "admin", status: "done" },
          { key: "meta", status: "done" },
          { key: "security", status: "active" },
          { key: "share", status: "done" },
          { key: "task", status: "active" },
          { key: "real-adapter", status: "active" },
          { key: "webdav", status: "active" },
          { key: "s3", status: "active" },
        ],
      }));
    },
  };
};
