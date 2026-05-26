import {
  basename,
  dirname,
  isSafeRelativeName,
  normalizePath,
} from "../model/path.js";

export const createVirtualFs = ({ getState, now }) => {
  const byteLengthForBase64 = (value) => {
    const clean = String(value || "").replace(/[\r\n\s]/g, "");
    if (!clean) return 0;
    const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
  };

  const ensureDir = (path) => {
    const state = getState();
    const normalized = normalizePath(path);
    if (!state.entries[normalized]) {
      state.entries[normalized] = {
        name: basename(normalized),
        path: normalized,
        is_dir: true,
        size: 0,
        modified: now(),
        created: now(),
        children: [],
      };
    }
    const parentPath = dirname(normalized);
    const parent = state.entries[parentPath];
    if (parent && parent.is_dir && normalized !== "/" && !parent.children.includes(normalized)) {
      parent.children.push(normalized);
      parent.children.sort();
      parent.modified = now();
    }
    return state.entries[normalized];
  };

  const createFile = (path, content, mime, options = {}) => {
    const state = getState();
    const normalized = normalizePath(path);
    const parent = ensureDir(dirname(normalized));
    const bodyEncoding = String(options.bodyEncoding || "text");
    const text = content === undefined || content === null ? "" : String(content);
    const size = Number(options.size || 0) || (bodyEncoding.startsWith("base64") ? byteLengthForBase64(text) : text.length);
    state.entries[normalized] = {
      name: basename(normalized),
      path: normalized,
      is_dir: false,
      size,
      modified: now(),
      created: state.entries[normalized]?.created || now(),
      content: text,
      body_encoding: bodyEncoding,
      mime: mime || "text/plain; charset=utf-8",
    };
    if (!parent.children.includes(normalized)) {
      parent.children.push(normalized);
      parent.children.sort();
    }
    parent.modified = now();
    return state.entries[normalized];
  };

  const removeEntry = (path) => {
    const state = getState();
    const entry = state.entries[path];
    if (!entry || path === "/") return;
    if (entry.children) {
      for (const child of [...entry.children]) removeEntry(child);
    }
    const parent = state.entries[dirname(path)];
    if (parent && parent.children) {
      parent.children = parent.children.filter((item) => item !== path);
      parent.modified = now();
    }
    delete state.entries[path];
  };

  const cloneEntryTree = (srcPath, dstPath) => {
    const state = getState();
    const src = state.entries[srcPath];
    if (!src) throw new Error("object not found");
    if (src.is_dir) {
      ensureDir(dstPath);
      for (const child of src.children || []) {
        cloneEntryTree(child, normalizePath(dstPath + "/" + basename(child)));
      }
    } else {
      createFile(dstPath, src.content || "", src.mime, {
        bodyEncoding: src.body_encoding || "text",
        size: src.size || 0,
      });
    }
  };

  const moveEntryTree = (srcPath, dstPath) => {
    cloneEntryTree(srcPath, dstPath);
    removeEntry(srcPath);
  };

  const renameEntryInDir = (dir, srcName, newName, options) => {
    const state = getState();
    const srcPath = normalizePath(dir + "/" + srcName);
    const dstPath = normalizePath(dir + "/" + newName);
    if (!isSafeRelativeName(newName)) throw new Error("relative path is not allowed");
    if (!state.entries[srcPath]) return false;
    if (state.entries[dstPath] && dstPath !== srcPath && !options?.overwrite) throw new Error(`file [${newName}] exists`);
    if (state.entries[dstPath] && dstPath !== srcPath) removeEntry(dstPath);
    moveEntryTree(srcPath, dstPath);
    return true;
  };

  const removeEmptyDirs = (rootPath) => {
    const state = getState();
    let removed = 0;
    const walk = (path) => {
      const entry = state.entries[path];
      if (!entry || !entry.is_dir || path === "/") return false;
      for (const child of [...(entry.children || [])]) walk(child);
      if ((entry.children || []).length === 0) {
        removeEntry(path);
        removed += 1;
        return true;
      }
      return false;
    };
    for (const child of [...(state.entries[rootPath]?.children || [])]) walk(child);
    return removed;
  };

  return {
    cloneEntryTree,
    createFile,
    ensureDir,
    moveEntryTree,
    removeEmptyDirs,
    removeEntry,
    renameEntryInDir,
  };
};
