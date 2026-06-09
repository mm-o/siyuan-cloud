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
  if (!state.settings) state.settings = {};
  if (!state.settings.index_progress) {
    state.settings.index_progress = JSON.stringify(progress());
  }
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
    try {
      return { ...progress(), ...JSON.parse(getState().settings.index_progress || "{}") };
    } catch (_) {
      return progress();
    }
  };

  const writeProgress = async (value) => {
    getState().settings.index_progress = JSON.stringify({ ...progress(), ...(value || {}) });
    await saveState();
  };

  const clear = async () => {
    ensureSearchState(getState());
    getState().search_nodes = [];
    await saveState();
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

  const walkNodes = async (paths, maxDepth) => {
    if (!getObj || !listObjs) return buildStateNodes(paths, maxDepth);
    const roots = (Array.isArray(paths) && paths.length ? paths : ["/"]).map(normalizePath);
    const ignorePaths = parseIgnorePaths(getState().settings?.ignore_paths);
    const depthLimit = Math.max(1, Number(maxDepth || getState().settings?.max_index_depth || 20));
    const nodes = [];
    const seen = new Set();

    const walk = async (path, depth) => {
      const normalized = normalizePath(path);
      if (seen.has(normalized) || depth > depthLimit) return;
      seen.add(normalized);
      if (isIgnoredPath(normalized, ignorePaths)) return;
      if (isIndexDisabled?.(normalized)) return;
      const obj = await getObj(normalized);
      if (!obj) return;
      if (normalized !== "/") {
        nodes.push(normalizeNode({
          parent: dirname(normalized),
          name: obj.name || basename(normalized),
          is_dir: obj.is_dir,
          size: obj.size,
        }));
      }
      if (!obj.is_dir || depth >= depthLimit) return;
      const children = await listObjs(normalized);
      for (const child of children || []) {
        if (!child?.name) continue;
        await walk(normalizePath(`${normalized}/${child.name}`), depth + 1);
      }
    };

    for (const root of roots) {
      await walk(root, 0);
    }
    return nodes;
  };

  const build = async ({ clearFirst = true, paths = ["/"], maxDepth, count = true } = {}) => {
    ensureSearchState(getState());
    await writeProgress(progress(0, false));
    if (clearFirst) getState().search_nodes = [];
    let nodes = [];
    try {
      nodes = await walkNodes(paths, maxDepth);
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
