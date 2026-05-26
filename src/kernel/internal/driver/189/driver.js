import { normalizePath } from "../../model/path.js";
import {
  basenameOf,
  dirnameOf,
  parseTime,
  rawDownloadUrl,
} from "../common.js";
import {
  forwardProxy,
  remoteJson,
} from "../http.js";

const randomNoCache = () => String(Date.now()) + String(Math.random()).slice(2, 8);

const cookieHeader = (addition) => addition.cookie || addition.Cookie || "";

const check189 = (payload) => {
  if (payload?.errorCode) throw new Error(payload.errorMsg || payload.errorCode);
  const code = Number(payload?.res_code || payload?.resCode || 0);
  if (code !== 0) throw new Error(payload?.res_message || payload?.resMessage || "189Cloud request failed");
  return payload;
};

const request189 = async (client, storage, url, {
  body,
  contentType = "application/json",
  method = "GET",
  query = {},
} = {}) => {
  const target = new URL(url);
  target.searchParams.set("noCache", randomNoCache());
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  }
  const resp = await remoteJson(client, target.toString(), {
    allowErrorStatus: true,
    body,
    contentType,
    headers: {
      Accept: "application/json;charset=UTF-8",
      Cookie: cookieHeader(storage.addition_json),
      Referer: "https://cloud.189.cn/",
      "User-Agent": "Mozilla/5.0",
    },
    method,
  });
  return check189(resp);
};

const formBody = (data) => new URLSearchParams(
  Object.entries(data).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]),
).toString();

const fileToObj = (file, relPath, storage, isDir) => ({
  name: file.name || basenameOf(relPath),
  path: normalizePath(relPath),
  is_dir: !!isDir,
  size: Number(file.size || 0),
  modified: parseTime(file.lastOpTime),
  created: parseTime(file.lastOpTime),
  sign: "",
  thumb: file.icon?.smallUrl || file.smallUrl || "",
  type: isDir ? 1 : 0,
  hashinfo: "",
  hash_info: {},
  id: String(file.id || ""),
  raw_url: isDir ? "" : rawDownloadUrl(storage, relPath),
  provider: "189Cloud",
  file: { ...file, is_dir: !!isDir },
});

const rootFolderId = (addition) => addition.root_folder_id || addition.RootFolderID || "-11";

const listByParent = async (client, storage, parentId) => {
  const result = [];
  let pageNum = 1;
  for (;;) {
    const resp = await request189(client, storage, "https://cloud.189.cn/api/open/file/listFiles.action", {
      method: "GET",
      query: {
        pageSize: "60",
        pageNum,
        mediaType: "0",
        folderId: parentId,
        iconOption: "5",
        orderBy: "lastOpTime",
        descending: "true",
      },
    });
    const list = resp.fileListAO || {};
    for (const folder of list.folderList || []) result.push({ ...folder, is_dir: true });
    for (const file of list.fileList || []) result.push({ ...file, is_dir: false });
    if (!list.count || !(list.folderList || []).length && !(list.fileList || []).length) break;
    pageNum += 1;
  }
  return result;
};

const resolveFile = async (client, storage, relPath) => {
  const clean = normalizePath(relPath || "/");
  if (clean === "/") {
    return {
      id: rootFolderId(storage.addition_json),
      name: "root",
      is_dir: true,
      path: "/",
    };
  }
  let parentId = rootFolderId(storage.addition_json);
  let current = null;
  for (const part of clean.split("/").filter(Boolean)) {
    const files = await listByParent(client, storage, parentId);
    current = files.find((item) => item.name === part);
    if (!current) throw new Error(`object not found: ${clean}`);
    parentId = String(current.id || "");
  }
  return current;
};

const headerValue = (headers = {}, name) => {
  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  return "";
};

const resolveRedirect = async (client, url) => {
  const resp = await forwardProxy(client, url, {
    allowErrorStatus: true,
    headers: { "User-Agent": "Mozilla/5.0" },
    method: "GET",
    responseEncoding: "text",
  });
  return headerValue(resp.headers, "location") || url;
};

const linkFor = async (client, storage, file) => {
  const resp = await request189(client, storage, "https://cloud.189.cn/api/portal/getFileInfo.action", {
    method: "GET",
    query: { fileId: file.id },
  });
  let url = resp.downloadUrl || resp.fileDownloadUrl || "";
  if (!url) throw new Error("get download url failed");
  if (url.startsWith("//")) url = "https:" + url;
  url = url.replace(/^http:\/\//, "https://");
  const redirected = await resolveRedirect(client, url);
  return redirected.replace(/^http:\/\//, "https://");
};

const batchTask = async (client, storage, type, targetFolderId, files) => {
  const taskInfos = files.map((file) => ({
    fileId: String(file.id || ""),
    fileName: file.name || "",
    isFolder: file.is_dir ? 1 : 0,
  }));
  await request189(client, storage, "https://cloud.189.cn/api/open/batch/createBatchTask.action", {
    body: formBody({
      type,
      targetFolderId: targetFolderId || "",
      taskInfos,
    }),
    contentType: "application/x-www-form-urlencoded",
    method: "POST",
  });
};

export const create189CloudDriver = ({ client }) => ({
  async test(storage) {
    await request189(client, storage, "https://cloud.189.cn/api/portal/getUserSizeInfo.action");
    return { addition: storage.addition_json };
  },

  async list(storage, relPath) {
    const parent = await resolveFile(client, storage, relPath);
    const content = (await listByParent(client, storage, String(parent.id || "")))
      .map((file) => fileToObj(file, normalizePath(relPath + "/" + file.name), storage, file.is_dir));
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider: "189Cloud",
      direct_upload_tools: [],
    };
  },

  async get(storage, relPath, options = {}) {
    const file = await resolveFile(client, storage, relPath);
    const obj = fileToObj(file, relPath, storage, file.is_dir);
    if (!obj.is_dir && !options.skipLink) {
      const url = await linkFor(client, storage, file);
      obj.raw_url = url;
      obj.url = url;
    }
    return {
      ...obj,
      readme: "",
      header: "",
      related: [],
    };
  },

  async read(storage, relPath, options = {}) {
    const file = await resolveFile(client, storage, relPath);
    if (file.is_dir) throw new Error("not file");
    const url = await linkFor(client, storage, file);
    return {
      link: {
        url,
        header: options.proxyHeaders || options.headers || {},
        content_length: Number(file.size || 0),
      },
    };
  },

  async mkdir(storage, relPath) {
    const parent = await resolveFile(client, storage, dirnameOf(relPath));
    await request189(client, storage, "https://cloud.189.cn/api/open/file/createFolder.action", {
      body: formBody({
        parentFolderId: String(parent.id || ""),
        folderName: basenameOf(relPath),
      }),
      contentType: "application/x-www-form-urlencoded",
      method: "POST",
    });
  },

  async move(storage, relPath, dstRelPath) {
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await batchTask(client, storage, "MOVE", String(dst.id || ""), [file]);
  },

  async copy(storage, relPath, dstRelPath) {
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await batchTask(client, storage, "COPY", String(dst.id || ""), [file]);
  },

  async remove(storage, relPath) {
    const file = await resolveFile(client, storage, relPath);
    await batchTask(client, storage, "DELETE", "", [file]);
  },

  async rename(storage, relPath, newName) {
    const file = await resolveFile(client, storage, relPath);
    const isDir = !!file.is_dir;
    await request189(client, storage, isDir
      ? "https://cloud.189.cn/api/open/file/renameFolder.action"
      : "https://cloud.189.cn/api/open/file/renameFile.action", {
      body: formBody(isDir
        ? { folderId: String(file.id || ""), destFolderName: newName }
        : { fileId: String(file.id || ""), destFileName: newName }),
      contentType: "application/x-www-form-urlencoded",
      method: "POST",
    });
  },

  async put() {
    throw new Error("189Cloud upload/login encryption is not implemented in the SiYuan kernel port yet");
  },
});
