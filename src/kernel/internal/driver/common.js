import { basename, dirname, normalizePath } from "../model/path.js";

export const boolValue = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true" || value === 1 || value === "1";
};

export const numberValue = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const parseTime = (value) => {
  if (!value) return new Date().toISOString();
  if (typeof value === "number") {
    const date = new Date(value > 100000000000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }
  const normalized = String(value).replace(/-/g, "/");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

export const rootedPath = (addition, relPath, key = "root_folder_path") => {
  const root = normalizePath(addition[key] || addition.RootFolderPath || "/");
  return normalizePath(root + "/" + normalizePath(relPath || "/"));
};

export const dirnameOf = dirname;
export const basenameOf = basename;

export const rawDownloadUrl = (storage, relPath, proxy = false) => {
  const prefix = proxy ? "/p" : "/d";
  return `/plugin/private/siyuan-cloud${prefix}${normalizePath(storage.mount_path + "/" + relPath)}`;
};

export const persistAddition = async (storage) => {
  if (storage?.saveDriverStorage) await storage.saveDriverStorage(storage.addition_json);
};
