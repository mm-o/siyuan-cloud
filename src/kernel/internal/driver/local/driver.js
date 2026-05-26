import { normalizePath } from "../../model/path.js";
import {
  basenameOf,
  boolValue,
  dirnameOf,
  parseTime,
  rawDownloadUrl,
} from "../common.js";

const stripWorkspaceRoot = (value) => {
  const raw = String(value || "/").replace(/\\/g, "/");
  if (raw.startsWith("/@workspace")) return raw.replace(/^\/@workspace\/?/, "");
  if (/^[a-zA-Z]:\//.test(raw)) {
    throw new Error("Local driver in the SiYuan kernel port only supports workspace-relative root_folder_path");
  }
  return raw.replace(/^\/+/, "");
};

const joinWorkspacePath = (addition, relPath) => {
  const root = stripWorkspaceRoot(addition.root_folder_path || addition.RootFolderPath || "/");
  return normalizePath("/" + root + "/" + normalizePath(relPath || "/")).replace(/^\/+/, "");
};

const apiJson = async (client, apiPath, data) => {
  const response = await client.fetch(apiPath, {
    body: JSON.stringify(data || {}),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(payload.msg || `${apiPath} failed`);
  return payload.data;
};

const bytesToBase64 = (bytes) => {
  if (!bytes || !bytes.length) return "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = hasB ? bytes[index + 1] : 0;
    const c = hasC ? bytes[index + 2] : 0;
    output += chars[a >> 2];
    output += chars[((a & 3) << 4) | (b >> 4)];
    output += hasB ? chars[((b & 15) << 2) | (c >> 6)] : "=";
    output += hasC ? chars[c & 63] : "=";
  }
  return output;
};

const readWorkspaceFile = async (client, storage, relPath) => {
  const response = await client.fetch("/api/file/getFile", {
    body: JSON.stringify({ path: joinWorkspacePath(storage.addition_json, relPath) }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const contentType = response.headers && (response.headers["Content-Type"] || response.headers["content-type"]) || "application/octet-stream";
  if (typeof response.arrayBuffer === "function") {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      body: bytesToBase64(bytes),
      bodyEncoding: "base64",
      contentType,
      status: response.status || 200,
    };
  }
  return {
    body: await response.text(),
    contentType,
    status: response.status || 200,
  };
};

const fileToObj = (item, relPath, storage) => {
  const isDir = !!(item.isDir || item.is_dir);
  return {
    name: item.name || basenameOf(relPath),
    path: normalizePath(relPath),
    is_dir: isDir,
    size: Number(item.size || 0),
    modified: parseTime(Number(item.updated || 0)),
    created: parseTime(Number(item.updated || 0)),
    sign: "",
    thumb: "",
    type: isDir ? 1 : 0,
    hashinfo: "",
    hash_info: {},
    raw_url: isDir ? "" : rawDownloadUrl(storage, relPath, true),
    provider: "Local",
  };
};

const readDir = async (client, storage, relPath) => {
  const path = joinWorkspacePath(storage.addition_json, relPath);
  return apiJson(client, "/api/file/readDir", { path });
};

const resolveFile = async (client, storage, relPath) => {
  const clean = normalizePath(relPath || "/");
  if (clean === "/") {
    return {
      name: "root",
      isDir: true,
      size: 0,
      updated: Math.floor(Date.now() / 1000),
    };
  }
  const parent = dirnameOf(clean);
  const name = basenameOf(clean);
  const files = await readDir(client, storage, parent);
  const item = (files || []).find((entry) => entry.name === name);
  if (!item) throw new Error(`object not found: ${clean}`);
  return item;
};

export const createLocalDriver = ({ client }) => ({
  async test(storage) {
    await readDir(client, storage, "/");
    return { addition: storage.addition_json };
  },

  async list(storage, relPath) {
    const addition = storage.addition_json;
    const content = (await readDir(client, storage, relPath))
      .filter((item) => boolValue(addition.show_hidden, true) || !String(item.name || "").startsWith("."))
      .map((item) => fileToObj(item, normalizePath(relPath + "/" + item.name), storage));
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider: "Local",
      direct_upload_tools: [],
    };
  },

  async get(storage, relPath) {
    const item = await resolveFile(client, storage, relPath);
    return {
      ...fileToObj(item, relPath, storage),
      readme: "",
      header: "",
      related: [],
    };
  },

  async read(storage, relPath) {
    await resolveFile(client, storage, relPath);
    return readWorkspaceFile(client, storage, relPath);
  },

  async mkdir(storage, relPath) {
    const path = joinWorkspacePath(storage.addition_json, relPath);
    await apiJson(client, "/api/file/putFile", {
      path,
      isDir: true,
    });
  },

  async remove(storage, relPath) {
    await apiJson(client, "/api/file/removeFile", {
      path: joinWorkspacePath(storage.addition_json, relPath),
    });
  },

  async rename(storage, relPath, newName) {
    await apiJson(client, "/api/file/renameFile", {
      path: joinWorkspacePath(storage.addition_json, relPath),
      newPath: joinWorkspacePath(storage.addition_json, normalizePath(dirnameOf(relPath) + "/" + newName)),
    });
  },

  async move() {
    throw new Error("Local move is guarded until SiYuan workspace move semantics are proven");
  },

  async copy() {
    throw new Error("Local copy is guarded until SiYuan workspace copy semantics are proven");
  },

  async put() {
    throw new Error("Local upload is blocked until /api/file/putFile multipart bridging is proven in the kernel plugin runtime");
  },
});
