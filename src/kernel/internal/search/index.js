import {
  basename,
  dirname,
  normalizePath,
} from "../model/path.js";

const progress = (objCount = 0, isDone = true, error = "", lastDoneTime = null) => ({
  obj_count: Number(objCount || 0),
  is_done: !!isDone,
  last_done_time: lastDoneTime,
  error: error || "",
});

const whereInParent = (node, parent) => {
  const normalized = normalizePath(parent || "/");
  if (normalized === "/") return true;
  return node.parent === normalized || node.parent.startsWith(`${normalized}/`);
};

const nodePath = (node) => normalizePath(`${node.parent}/${node.name}`);

const parseIgnorePaths = (value) => String(value || "")
  .split("\n")
  .map((item) => normalizePath(item.trim()))
  .filter((item) => item && item !== "/");

const isIgnoredPath = (path, ignorePaths) => ignorePaths.some((item) => path.startsWith(item));

const normalizeNode = (node) => ({
  parent: normalizePath(node.parent || "/"),
  name: String(node.name || ""),
  is_dir: !!node.is_dir,
  size: Number(node.size || 0),
});

export const ensureSearchState = (state) => {
  if (!Array.isArray(state.search_nodes)) state.search_nodes = [];
  state.search_nodes = state.search_nodes.map(normalizeNode).filter((node) => node.name);
  if (!state.index_progress) state.index_progress = progress();
};

export const createSearchIndex = ({
  getObj,
  getState,
  isIndexDisabled,
  listObjs,
  now,
  saveState,
}) => {
  const getProgress = () => {
    ensureSearchState(getState());
    return { ...progress(), ...(getState().index_progress || {}) };
  };

  const writeProgress = async (value) => {
    const next = { ...progress(), ...(value || {}) };
    getState().index_progress = next;
    if (next.is_done)
      await saveState();
  };

  const clear = async ({ persist = true } = {}) => {
    ensureSearchState(getState());
    getState().search_nodes = [];
    if (persist) await saveState();
  };

  const buildStateNodes = (paths, maxDepth) => {
    const state = getState();
    const roots = (Array.isArray(paths) && paths.length ? paths : ["/"]).map(normalizePath);
    const ignorePaths = parseIgnorePaths(state.settings?.ignore_paths);
    const depthLimit = Math.max(1, Number(maxDepth || state.settings?.max_index_depth || 20));
    return Object.values(state.entries || {})
      .filter((entry) => entry && entry.path && entry.path !== "/")
      .filter((entry) => !isIgnoredPath(normalizePath(entry.path), ignorePaths))
      .filter((entry) => !isIndexDisabled?.(normalizePath(entry.path)))
      .filter((entry) => roots.some((root) => entry.path === root || entry.path.startsWith(`${root === "/" ? "" : root}/`)))
      .filter((entry) => {
        const root = roots.find((item) => entry.path === item || entry.path.startsWith(`${item === "/" ? "" : item}/`)) || "/";
        const rel = entry.path.slice(root === "/" ? 1 : root.length + 1);
        return rel.split("/").filter(Boolean).length <= depthLimit;
      })
      .map((entry) => normalizeNode({
        parent: dirname(entry.path),
        name: entry.name || basename(entry.path),
        is_dir: entry.is_dir,
        size: entry.size,
      }));
  };

  const walkNodes = async (paths, maxDepth, shouldCancel, onProgress) => {
    if (!getObj || !listObjs) return buildStateNodes(paths, maxDepth);
    const roots = (Array.isArray(paths) && paths.length ? paths : ["/"]).map(normalizePath);
    const ignorePaths = parseIgnorePaths(getState().settings?.ignore_paths);
    const depthLimit = Math.max(1, Number(maxDepth || getState().settings?.max_index_depth || 20));
    const nodes = [];
    const seen = new Set();

    const walk = async (path, depth, listedObj = null) => {
      if (shouldCancel?.()) throw new Error("index canceled");
      const normalized = normalizePath(path);
      if (seen.has(normalized) || depth > depthLimit) return;
      seen.add(normalized);
      if (isIgnoredPath(normalized, ignorePaths)) return;
      if (isIndexDisabled?.(normalized)) return;
      const obj = listedObj || await getObj(normalized);
      if (!obj) return;
      if (normalized !== "/") {
        nodes.push(normalizeNode({
          parent: dirname(normalized),
          name: obj.name || basename(normalized),
          is_dir: obj.is_dir,
          size: obj.size,
        }));
        await onProgress?.({ found: nodes.length });
      }
      if (!obj.is_dir || depth >= depthLimit) return;
      let children = [];
      try {
        children = await listObjs(normalized);
      } catch (_) {
        return;
      }
      for (const child of children || []) {
        if (!child?.name) continue;
        if (shouldCancel?.()) throw new Error("index canceled");
        const childPath = normalizePath(`${normalized}/${child.name}`);
        if (seen.has(childPath) || depth + 1 > depthLimit) continue;
        if (isIgnoredPath(childPath, ignorePaths) || isIndexDisabled?.(childPath)) continue;
        if (child.is_dir) {
          await walk(childPath, depth + 1, child);
          continue;
        }
        seen.add(childPath);
        nodes.push(normalizeNode({
          parent: normalized,
          name: child.name,
          is_dir: false,
          size: child.size,
        }));
        await onProgress?.({ found: nodes.length });
      }
    };

    for (const root of roots) {
      await walk(root, 0);
    }
    return nodes;
  };

  const build = async ({ clearFirst = true, paths = ["/"], maxDepth, count = true, shouldCancel, onProgress } = {}) => {
    ensureSearchState(getState());
    await writeProgress(progress(0, false));
    if (clearFirst) getState().search_nodes = [];
    let nodes = [];
    try {
      if (shouldCancel?.()) throw new Error("index canceled");
      nodes = await walkNodes(paths, maxDepth, shouldCancel, onProgress);
      if (shouldCancel?.()) throw new Error("index canceled");
    } catch (error) {
      await writeProgress(progress(0, true, error?.message || String(error), now()));
      throw error;
    }
    if (!clearFirst) {
      for (const path of paths) {
        await del(path, { persist: false });
      }
    }
    getState().search_nodes.push(...nodes);
    const doneAt = now();
    if (count) await writeProgress(progress(nodes.length, true, "", doneAt));
    else await writeProgress(progress(getState().search_nodes.length, true, "", doneAt));
    await saveState();
  };

  const del = async (path, { persist = true } = {}) => {
    ensureSearchState(getState());
    const normalized = normalizePath(path || "/");
    getState().search_nodes = getState().search_nodes.filter((node) => {
      const current = nodePath(node);
      return current !== normalized && !whereInParent(node, normalized);
    });
    if (persist) await saveState();
  };

  const search = (req) => {
    ensureSearchState(getState());
    const parent = normalizePath(req.parent || "/");
    const keywords = String(req.keywords || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const scope = Number(req.scope || 0);
    const page = Math.max(1, Number(req.page || 1));
    const perPage = Math.max(1, Number(req.per_page || req.perPage || 30));
    const filtered = getState().search_nodes
      .filter((node) => whereInParent(node, parent))
      .filter((node) => !keywords.length || keywords.every((keyword) => node.name.toLowerCase().includes(keyword)))
      .filter((node) => scope === 0 || (scope === 1 ? node.is_dir : !node.is_dir))
      .sort((left, right) => left.name.localeCompare(right.name));
    const start = (page - 1) * perPage;
    return {
      content: filtered.slice(start, start + perPage),
      total: filtered.length,
    };
  };
  return {
    build,
    clear,
    del,
    getProgress,
    search,
    writeProgress,
  };
};
