import { normalizePath } from "../model/path.js";
import { create123PanDriver } from "./123/driver.js";
import { create189CloudDriver } from "./189/driver.js";
import { createAliyundriveOpenDriver } from "./aliyundrive_open/driver.js";
import { createBaiduNetdiskDriver } from "./baidu_netdisk/driver.js";
import { createLocalDriver } from "./local/driver.js";
import { createOneDriveDriver } from "./onedrive/driver.js";
import { createOpenListDriver } from "./openlist/driver.js";
import { createQuarkDriver } from "./quark_uc/driver.js";
import { createS3Driver } from "./s3/driver.js";
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

export const createDriverRuntime = ({ client, saveStorageAddition }) => {
  const drivers = {
    OpenList: createOpenListDriver({ client }),
    AListV3: createOpenListDriver({ client }),
    "AList V3": createOpenListDriver({ client }),
    S3: createS3Driver({ client }),
    Doge: createS3Driver({ client }),
    WebDav: createWebDavDriver({ client }),
    Onedrive: createOneDriveDriver({ client }),
    OneDrive: createOneDriveDriver({ client }),
    "123Pan": create123PanDriver({ client }),
    "123": create123PanDriver({ client }),
    BaiduNetdisk: createBaiduNetdiskDriver({ client }),
    BaiduNetDisk: createBaiduNetdiskDriver({ client }),
    AliyundriveOpen: createAliyundriveOpenDriver({ client }),
    AliyunDriveOpen: createAliyundriveOpenDriver({ client }),
    "189Cloud": create189CloudDriver({ client }),
    Quark: createQuarkDriver({ client }),
    Local: createLocalDriver({ client }),
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
      });
    },
  };

  return runtime;
};
