import { normalizePath } from "./path.js";
import {
  canAccessWithoutPassword,
  canSeeHides,
} from "./user.js";

export const normalizeMeta = (input, id) => ({
  id: Number(input.id || input.ID || id || 0),
  path: normalizePath(input.path || input.Path || "/"),
  read_users: Array.isArray(input.read_users) ? input.read_users : [],
  read_users_sub: !!input.read_users_sub,
  write_users: Array.isArray(input.write_users) ? input.write_users : [],
  write_users_sub: !!input.write_users_sub,
  password: String(input.password || ""),
  p_sub: !!input.p_sub,
  write: !!input.write,
  w_sub: !!input.w_sub,
  hide: String(input.hide || ""),
  h_sub: !!input.h_sub,
  readme: String(input.readme || ""),
  r_sub: !!input.r_sub,
  header: String(input.header || ""),
  header_sub: !!input.header_sub,
});

export const metaCoversPath = (metaPath, path, includeSub) => {
  const meta = normalizePath(metaPath);
  const target = normalizePath(path);
  if (meta === target) return true;
  return !!includeSub && target.startsWith(meta === "/" ? "/" : meta + "/");
};

export const nearestMeta = (state, path) => {
  const target = normalizePath(path);
  return (state.metas || [])
    .filter((meta) => metaCoversPath(meta.path, target, true))
    .sort((a, b) => b.path.length - a.path.length)[0] || null;
};

export const validateHideRules = (hide) => {
  for (const line of String(hide || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    new RegExp(line);
  }
};

export const isHiddenByMeta = (meta, path, name) => {
  if (!meta || !meta.hide || !metaCoversPath(meta.path, path, meta.h_sub)) return false;
  for (const line of String(meta.hide).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const pattern = new RegExp(line);
      if (pattern.test(name) || pattern.test(path)) return true;
    } catch (_) {
      return false;
    }
  }
  return false;
};

export const metaReadme = (meta, path) => (
  meta && metaCoversPath(meta.path, path, meta.r_sub) ? meta.readme : ""
);

export const metaHeader = (meta, path) => (
  meta && metaCoversPath(meta.path, path, meta.header_sub) ? meta.header : ""
);

export const canReadByMeta = (user, meta, path) => {
  if (!user || !meta || !meta.read_users?.length) return true;
  const userId = Number(user.id || 0);
  return !metaCoversPath(meta.path, path, meta.read_users_sub) || meta.read_users.map(Number).includes(userId);
};

export const canAccessByMeta = (user, meta, path, password = "") => {
  if (!user || !meta) return true;
  if (!canSeeHides(user) && isHiddenByMeta(meta, path, path.split("/").pop() || "")) return false;
  if (!canReadByMeta(user, meta, path)) return false;
  if (canAccessWithoutPassword(user)) return true;
  if (!meta.password || !metaCoversPath(meta.path, path, meta.p_sub)) return true;
  return meta.password === password;
};
