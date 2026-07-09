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

export const headerValue = (headers = {}, name) => {
  const target = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  return "";
};

export const userAgentFromOptions = (options = {}, fallback = "") =>
  options.userAgent
  || headerValue(options.requestHeaders, "User-Agent")
  || headerValue(options.headers, "User-Agent")
  || fallback;

export const persistAddition = async (storage) => {
  if (storage?.saveDriverStorage) await storage.saveDriverStorage(storage.addition_json);
};

export const createStorageCache = ({ ttl = 5 * 60 * 1000, linkTtl = 30 * 60 * 1000 } = {}) => {
  const list = new Map();
  const file = new Map();
  const link = new Map();
  const storageKey = (storage) => String(storage.id || storage.mount_path || JSON.stringify(storage.addition_json || {}));
  const cached = async (map, key, producer, ttlMs = ttl) => {
    const now = Date.now();
    const hit = map.get(key);
    if (hit && hit.expires > now) return hit.value;
    const value = await producer();
    map.set(key, { value, expires: now + ttlMs });
    return value;
  };
  const clear = (storage) => {
    const prefix = `${storageKey(storage)}:`;
    for (const map of [list, file, link]) {
      for (const key of map.keys()) {
        if (key.startsWith(prefix)) map.delete(key);
      }
    }
  };
  return {
    clear,
    file: (storage, key, producer) => cached(file, `${storageKey(storage)}:file:${key}`, producer),
    link: (storage, key, producer) => cached(link, `${storageKey(storage)}:link:${key}`, producer, linkTtl),
    list: (storage, key, producer) => cached(list, `${storageKey(storage)}:list:${key}`, producer),
  };
};
