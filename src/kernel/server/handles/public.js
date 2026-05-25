import { OPENLIST_VERSION } from "../../internal/conf/const.js";
import { SETTING_FLAG } from "../../internal/model/setting.js";
import { acceptedArchiveExtensions } from "../../internal/fs/archive.js";
import { jsonResponse, success } from "../common/response.js";

export const createPublicHandlers = ({
  getState,
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

  return {
    "ANY /api/public/settings": async () => jsonResponse(success(publicSettings())),
    "ANY /api/public/offline_download_tools": async () => jsonResponse(success([])),
    "ANY /api/public/archive_extensions": async () => jsonResponse(success(acceptedArchiveExtensions())),
  };
};
