import { OPENLIST_VERSION } from "../../internal/conf/const.js";
import { SETTING_FLAG } from "../../internal/model/setting.js";
import { acceptedArchiveExtensions } from "../../internal/fs/archive.js";
import { jsonResponse, success } from "../common/response.js";

export const createPublicHandlers = ({
  getState,
  handlersRef,
  settingItem,
}) => {
  const publicSettings = () => {
    const result = {};
    for (const [key, value] of Object.entries(getState().settings)) {
      const item = settingItem(key, value, 0);
      if (item.flag !== SETTING_FLAG.PRIVATE) result[key] = item.value;
    }
    result.version = OPENLIST_VERSION;
    return result;
  };

  const routeEntries = () => Object.keys(handlersRef ? handlersRef() : {})
    .sort()
    .map((route) => {
      const [method, ...pathParts] = route.split(" ");
      const path = pathParts.join(" ");
      return {
        method,
        path,
        url: path.startsWith("/api") ? `/plugin/private/siyuan-cloud${path}` : path,
      };
    });

  const apiIndex = () => ({
    name: "Siyuan Cloud",
    upstream: "OpenList",
    version: OPENLIST_VERSION,
    base_url: "/plugin/private/siyuan-cloud",
    api_base: "/plugin/private/siyuan-cloud/api",
    envelope: { code: 200, message: "success", data: null },
    routes: routeEntries(),
    endpoints: {
      api: "/plugin/private/siyuan-cloud/api",
      download: "/plugin/private/siyuan-cloud/d/{path}",
      proxy: "/plugin/private/siyuan-cloud/p/{path}",
      webdav: "/plugin/private/siyuan-cloud/dav",
      s3: "/plugin/private/siyuan-cloud/s3",
      share_download: "/plugin/private/siyuan-cloud/sd/{id}/{path}",
    },
    capabilities: [
      "openlist.http-api",
      "openlist.fs",
      "openlist.search.local-index",
      "openlist.admin",
      "openlist.public",
      "openlist.share",
      "openlist.share.multi-file",
      "openlist.task",
      "openlist.task.manager-shape",
      "openlist.webdav",
      "openlist.s3",
      "openlist.fs.torrent.placeholder",
    ],
    notes: [
      "Use this plugin private route as an OpenList-compatible base URL.",
      "Route names, request fields, response envelope, /d, /p, /dav, and /s3 follow OpenList-compatible boundaries where implemented.",
      "Unsupported OpenList capabilities return structured compatibility placeholders instead of silent behavior changes.",
    ],
  });

  return {
    "ANY /api/public/api": async () => jsonResponse(success(apiIndex())),
    "ANY /api/public/routes": async () => jsonResponse(success(apiIndex())),
    "ANY /api/public/settings": async () => jsonResponse(success(publicSettings())),
    "ANY /api/public/offline_download_tools": async () => jsonResponse(success([])),
    "ANY /api/public/archive_extensions": async () => jsonResponse(success(acceptedArchiveExtensions())),
  };
};
