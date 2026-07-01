import { normalizePath } from "../model/path.js";
import { create115Driver } from "./115/driver.js";
import { create123PanDriver } from "./123/driver.js";
import { create189CloudDriver } from "./189/driver.js";
import { create189CloudTVDriver } from "./189_tv/driver.js";
import { create189CloudPCDriver } from "./189pc/driver.js";
import { createAliyundriveOpenDriver } from "./aliyundrive_open/driver.js";
import { createBaiduNetdiskDriver } from "./baidu_netdisk/driver.js";
import { createOneDriveDriver } from "./onedrive/driver.js";
import { createOpenListDriver } from "./openlist/driver.js";
import { createQuarkOpenDriver } from "./quark_open/driver.js";
import { createQuarkDriver } from "./quark_uc/driver.js";
import { createQuarkUCTVDriver } from "./quark_uc_tv/driver.js";
import { createS3Driver } from "./s3/driver.js";
import { createSiYuanWorkspaceDriver } from "./siyuan_workspace/driver.js";
import { createWebDavDriver } from "./webdav/driver.js";

const parseAddition = (storage) => {
  if (storage.addition_json) return storage.addition_json;
  try {
    return JSON.parse(storage.addition || "{}");
  } catch (_) {
    return {};
  }
};

const relPathForMount = (mountPath, path) => {
  const mount = normalizePath(mountPath);
  const current = normalizePath(path);
  if (mount === "/") return current;
  const rest = current === mount ? "" : current.slice(mount.length);
  return normalizePath(rest || "/");
};

export const createDriverRuntime = ({ client, getSettings, saveStorageAddition, workspaceGet, workspaceList, workspacePublicUrl, workspaceReadText }) => {
  const drivers = {
    SiYuanWorkspace: createSiYuanWorkspaceDriver({ workspaceGet, workspaceList, workspacePublicUrl, workspaceReadText }),
    OpenList: createOpenListDriver({ client }),
    AListV3: createOpenListDriver({ client }),
    "AList V3": createOpenListDriver({ client }),
    S3: createS3Driver({ client }),
    Doge: createS3Driver({ client }),
    WebDav: createWebDavDriver({ client }),
    "115 Cloud": create115Driver({ client }),
    "115": create115Driver({ client }),
    Onedrive: createOneDriveDriver({ client }),
    OneDrive: createOneDriveDriver({ client }),
    "123Pan": create123PanDriver({ client }),
    "123": create123PanDriver({ client }),
    BaiduNetdisk: createBaiduNetdiskDriver({ client }),
    BaiduNetDisk: createBaiduNetdiskDriver({ client }),
    AliyundriveOpen: createAliyundriveOpenDriver({ client }),
    AliyunDriveOpen: createAliyundriveOpenDriver({ client }),
    "189Cloud": create189CloudDriver({ client }),
    "189CloudPC": create189CloudPCDriver({ client }),
    "189CloudTV": create189CloudTVDriver({ client }),
    Quark: createQuarkDriver({ client }),
    UC: createQuarkDriver({ client }),
    QuarkOpen: createQuarkOpenDriver({ client }),
    QuarkTV: createQuarkUCTVDriver({ client }),
    UCTV: createQuarkUCTVDriver({ client }),
  };

  const runtime = {
    drivers,
    canHandle(storage) {
      return !!drivers[storage?.driver];
    },
    mountEntries(storages, now) {
      const seen = new Set();
      return (storages || [])
        .filter((storage) => !storage.disabled && normalizePath(storage.mount_path || "/") !== "/")
        .map((storage) => normalizePath(storage.mount_path))
        .map((mountPath) => mountPath.split("/").filter(Boolean)[0])
        .filter((name) => {
          if (!name || seen.has(name)) return false;
          seen.add(name);
          return true;
        })
        .map((name) => ({
          name,
          path: `/${name}`,
          is_dir: true,
          size: 0,
          modified: now(),
          created: now(),
          provider: "mount",
        }));
    },
    resolve(storages, path) {
      const current = normalizePath(path || "/");
      const candidates = (storages || [])
        .filter((storage) => !storage.disabled && runtime.canHandle(storage))
        .map((storage) => {
          const addition = parseAddition(storage);
          return {
            ...storage,
            addition_json: addition,
            mount_path: normalizePath(storage.mount_path || "/"),
            settings: getSettings ? getSettings() : {},
            saveDriverStorage: async (updatedAddition = addition) => {
              if (saveStorageAddition) await saveStorageAddition(storage, updatedAddition);
            },
          };
        })
        .filter((storage) => storage.mount_path !== "/" && (current === storage.mount_path || current.startsWith(storage.mount_path + "/")))
        .sort((a, b) => b.mount_path.length - a.mount_path.length);
      const storage = candidates[0];
      if (!storage) return null;
      return {
        storage,
        driver: drivers[storage.driver],
        relPath: relPathForMount(storage.mount_path, current),
      };
    },
    async test(driverName, addition) {
      const driver = drivers[driverName];
      if (!driver?.test) throw new Error(`driver [${driverName}] does not expose a test method`);
      return driver.test({
        addition_json: addition || {},
        driver: driverName,
        mount_path: "/",
        settings: getSettings ? getSettings() : {},
      });
    },
  };

  return runtime;
};
