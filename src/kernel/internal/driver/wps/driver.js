import { basenameOf, createStorageCache, dirnameOf, parseTime } from "../common.js";
import { remoteJsonWithMeta } from "../http.js";

const ENDPOINT_BUSINESS = "https://365.kdocs.cn";
const ENDPOINT_PERSONAL = "https://drive.wps.cn";
const LOGIN_ENDPOINT = "https://account.kdocs.cn/api/v3/islogin";
const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const cache = createStorageCache();

const modeOf = (addition = {}) => addition.mode || addition.Mode || "Personal";
const cookieOf = (addition = {}) => addition.cookie || addition.Cookie || "";
const customUaOf = (addition = {}) => addition.custom_ua || addition.CustomUA || "";
const getUA = (addition = {}) => customUaOf(addition) || DEFAULT_UA;

const isPersonal = (storage) => {
  const login = storage.__wpsLogin;
  if (login && login.is_company_account !== undefined) return !login.is_company_account;
  return modeOf(storage.addition_json) === "Personal";
};

const driveHost = (storage) => isPersonal(storage) ? ENDPOINT_PERSONAL : ENDPOINT_BUSINESS;
const drivePrefix = (storage) => isPersonal(storage) ? "" : "/3rd/drive";
const driveUrl = (storage, path) => `${driveHost(storage)}${drivePrefix(storage)}${path}`;

const headersFor = (storage, json = false) => {
  const headers = {
    Accept: "application/json",
    Cookie: cookieOf(storage.addition_json),
    "User-Agent": getUA(storage.addition_json),
  };
  if (json) {
    headers["Content-Type"] = "application/json";
    headers.Origin = driveHost(storage);
  }
  return headers;
};

const checkAPI = (payload, meta) => {
  if (payload?.result && payload.result !== "ok") {
    throw new Error(`${payload.result}: ${payload.msg || "unknown error"}`);
  }
  if (Number(meta?.status || 0) >= 400) {
    throw new Error(payload?.msg || `http error: ${meta.status}`);
  }
  return payload;
};

const requestWps = async (client, storage, url, {
  body,
  method = "GET",
  query = {},
  json = false,
  retryDuplicated = false,
} = {}) => {
  const target = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  }
  for (;;) {
    const { json: payload, meta } = await remoteJsonWithMeta(client, target.toString(), {
      allowErrorStatus: true,
      body,
      headers: headersFor(storage, json),
      method,
    });
    if (retryDuplicated && Number(meta?.status || 0) === 403 && payload?.result === "fileTaskDuplicated") {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    return checkAPI(payload, meta);
  }
};

const joinPath = (basePath, name) => {
  if (!basePath || basePath === "/") return `/${name}`;
  return `${String(basePath).replace(/\/+$/, "")}/${name}`;
};

const groupToObj = (group, basePath = "/") => ({
  name: group.name || "",
  is_dir: true,
  size: 0,
  modified: new Date().toISOString(),
  created: new Date().toISOString(),
  id: String(group.group_id || group.id || ""),
  path: joinPath(basePath, group.name || ""),
  provider: "WPS",
  wps: {
    kind: "group",
    group_id: Number(group.group_id || group.id || 0),
  },
});

const canDownload = (file, personal) => {
  if (!file || file.ftype === "folder") return false;
  if (Number(file.file_perms_acl?.download || 0) !== 0) return true;
  return personal;
};

const fileToObj = (file, basePath = "/", personal = true) => {
  const isDir = file.ftype === "folder";
  return {
    name: file.fname || "",
    is_dir: isDir,
    size: Number(file.fsize || 0),
    modified: parseTime(Number(file.mtime || 0)),
    created: parseTime(Number(file.ctime || 0)),
    id: String(file.id || ""),
    path: joinPath(basePath, file.fname || ""),
    provider: "WPS",
    wps: {
      kind: isDir ? "folder" : "file",
      file_id: Number(file.id || 0),
      group_id: Number(file.groupid || 0),
      has_file: true,
      can_download: canDownload(file, personal),
    },
  };
};

const rootNode = () => ({
  name: "root",
  is_dir: true,
  size: 0,
  modified: new Date().toISOString(),
  created: new Date().toISOString(),
  id: "root",
  path: "/",
  provider: "WPS",
  wps: { kind: "root" },
});

const ensureLogin = async (client, storage) => {
  if (storage.__wpsLogin) return storage.__wpsLogin;
  if (!cookieOf(storage.addition_json)) throw new Error("cookie is empty");
  const { json, meta } = await remoteJsonWithMeta(client, LOGIN_ENDPOINT, {
    allowErrorStatus: true,
    headers: headersFor(storage),
    method: "GET",
  });
  if (Number(meta?.status || 0) >= 400) throw new Error(`failed to check login status, status code: ${meta.status}`);
  if (modeOf(storage.addition_json) === "Business" && !Number(json?.companyid || json?.current_companyid || 0)) {
    throw new Error("wps company id is empty, please check business account login");
  }
  storage.__wpsLogin = json || {};
  return storage.__wpsLogin;
};

const getGroups = async (client, storage) => {
  await ensureLogin(client, storage);
  return cache.list(storage, "groups", async () => {
    if (modeOf(storage.addition_json) === "Personal") {
      const resp = await requestWps(client, storage, driveUrl(storage, "/api/v3/groups"));
      return (resp.groups || []).map((group) => ({ group_id: group.id, name: group.name }));
    }
    const companyID = Number(storage.__wpsLogin?.companyid || storage.__wpsLogin?.current_companyid || 0);
    const resp = await requestWps(client, storage, `${ENDPOINT_BUSINESS}/3rd/plus/groups/v1/companies/${companyID}/users/self/groups/private`);
    return resp.groups || [];
  });
};

const getFiles = async (client, storage, groupID, parentID = 0) => {
  await ensureLogin(client, storage);
  return cache.list(storage, `files:${groupID}:${parentID}`, async () => {
    const files = [];
    let offset = 0;
    for (let index = 0; index < 50; index += 1) {
      const resp = await requestWps(client, storage, driveUrl(storage, `/api/v5/groups/${groupID}/files`), {
        query: {
          parentid: parentID,
          offset,
        },
      });
      files.push(...(resp.files || []));
      if (Number(resp.next_offset) === -1) break;
      offset = Number(resp.next_offset || 0);
    }
    return files;
  });
};

const childrenForNode = async (client, storage, node, basePath = "/") => {
  if (!node || node.wps?.kind === "root") {
    return (await getGroups(client, storage)).map((group) => groupToObj(group, basePath));
  }
  if (node.wps?.kind !== "group" && node.wps?.kind !== "folder") return [];
  const parentID = node.wps?.kind === "folder" && node.wps?.has_file ? Number(node.wps.file_id || 0) : 0;
  return (await getFiles(client, storage, Number(node.wps.group_id || 0), parentID))
    .map((file) => fileToObj(file, basePath, isPersonal(storage)));
};

const resolveRoot = async (client, storage) => {
  const rootPath = storage.addition_json.root_folder_path || storage.addition_json.RootFolderPath || "/";
  if (!rootPath || rootPath === "/") return rootNode();
  let current = rootNode();
  let basePath = "/";
  for (const name of String(rootPath).split("/").filter(Boolean)) {
    const children = await childrenForNode(client, storage, current, basePath);
    current = children.find((item) => item.is_dir && item.name === name);
    if (!current) throw new Error(`root path ${JSON.stringify(rootPath)} not found`);
    basePath = current.path;
  }
  return { ...current, name: "root", path: "/" };
};

const resolveNode = async (client, storage, relPath) => {
  const cleanParts = String(relPath || "/").split("/").filter(Boolean);
  let current = await resolveRoot(client, storage);
  let basePath = "/";
  if (!cleanParts.length) return current;
  for (const name of cleanParts) {
    const children = await childrenForNode(client, storage, current, basePath);
    current = children.find((item) => item.name === name);
    if (!current) throw new Error(`object not found: ${relPath}`);
    basePath = current.path;
  }
  return current;
};

const downloadLink = async (client, storage, node) => {
  if (!node?.wps || node.wps.kind !== "file" || !node.wps.has_file) throw new Error("not support");
  if (!node.wps.can_download) throw new Error("can not download");
  return cache.link(storage, `download:${node.wps.group_id}:${node.wps.file_id}`, async () => {
    const resp = await requestWps(
      client,
      storage,
      `${driveHost(storage)}${drivePrefix(storage)}/api/v5/groups/${node.wps.group_id}/files/${node.wps.file_id}/download`,
      { query: { support_checksums: "sha1" } },
    );
    if (!resp.url) throw new Error("empty download url");
    return {
      url: resp.url,
      header: {
        Referer: driveHost(storage),
        "User-Agent": getUA(storage.addition_json),
      },
      content_length: Number(node.size || 0),
    };
  });
};

const doJSON = async (client, storage, method, path, body, retryDuplicated = false) => {
  const resp = await requestWps(client, storage, driveUrl(storage, path), {
    body,
    json: true,
    method,
    retryDuplicated,
  });
  cache.clear(storage);
  return resp;
};

const parentInfo = async (client, storage, relPath) => {
  const parent = await resolveNode(client, storage, dirnameOf(relPath));
  if (parent.wps?.kind !== "group" && parent.wps?.kind !== "folder") throw new Error("not support");
  return {
    groupID: Number(parent.wps.group_id || 0),
    parentID: parent.wps?.kind === "folder" && parent.wps?.has_file ? Number(parent.wps.file_id || 0) : 0,
    parent,
  };
};

export const createWpsDriver = ({ client }) => ({
  async test(storage) {
    await ensureLogin(client, storage);
    await resolveRoot(client, storage);
    return { addition: storage.addition_json };
  },

  async list(storage, relPath) {
    const node = await resolveNode(client, storage, relPath);
    const content = await childrenForNode(client, storage, node, relPath || "/");
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider: "WPS",
      direct_upload_tools: [],
    };
  },

  async get(storage, relPath, options = {}) {
    const node = await resolveNode(client, storage, relPath);
    const result = {
      ...node,
      readme: "",
      header: "",
      related: [],
    };
    if (!result.is_dir && !options.skipLink) {
      const link = await downloadLink(client, storage, node);
      result.raw_url = link.url;
      result.url = link.url;
    }
    return result;
  },

  async read(storage, relPath, options = {}) {
    const node = await resolveNode(client, storage, relPath);
    if (node.is_dir) throw new Error("not file");
    const link = await downloadLink(client, storage, node);
    return {
      link: {
        url: link.url,
        header: { ...link.header, ...(options.proxyHeaders || options.headers || {}) },
        content_length: link.content_length,
      },
    };
  },

  async mkdir(storage, relPath) {
    const { groupID, parentID } = await parentInfo(client, storage, relPath);
    await doJSON(client, storage, "POST", "/api/v5/files/folder", {
      groupid: groupID,
      name: basenameOf(relPath),
      parentid: parentID,
    });
  },

  async move(storage, relPath, dstRelPath) {
    const src = await resolveNode(client, storage, relPath);
    const dst = await resolveNode(client, storage, dstRelPath);
    if (src.wps?.kind !== "file" && src.wps?.kind !== "folder") throw new Error("not support");
    if (dst.wps?.kind !== "group" && dst.wps?.kind !== "folder") throw new Error("not support");
    await doJSON(client, storage, "POST", `/api/v3/groups/${src.wps.group_id}/files/batch/move`, {
      fileids: [Number(src.wps.file_id || 0)],
      target_groupid: Number(dst.wps.group_id || 0),
      target_parentid: dst.wps?.kind === "folder" && dst.wps?.has_file ? Number(dst.wps.file_id || 0) : 0,
    }, true);
  },

  async copy(storage, relPath, dstRelPath) {
    const src = await resolveNode(client, storage, relPath);
    const dst = await resolveNode(client, storage, dstRelPath);
    if (src.wps?.kind !== "file" && src.wps?.kind !== "folder") throw new Error("not support");
    if (dst.wps?.kind !== "group" && dst.wps?.kind !== "folder") throw new Error("not support");
    await doJSON(client, storage, "POST", `/api/v3/groups/${src.wps.group_id}/files/batch/copy`, {
      duplicated_name_model: 1,
      fileids: [Number(src.wps.file_id || 0)],
      groupid: Number(src.wps.group_id || 0),
      target_groupid: Number(dst.wps.group_id || 0),
      target_parentid: dst.wps?.kind === "folder" && dst.wps?.has_file ? Number(dst.wps.file_id || 0) : 0,
    }, true);
  },

  async remove(storage, relPath) {
    const node = await resolveNode(client, storage, relPath);
    if (node.wps?.kind !== "file" && node.wps?.kind !== "folder") throw new Error("not support");
    await doJSON(client, storage, "POST", `/api/v3/groups/${node.wps.group_id}/files/batch/delete`, {
      fileids: [Number(node.wps.file_id || 0)],
    }, true);
  },

  async rename(storage, relPath, newName) {
    const node = await resolveNode(client, storage, relPath);
    if (node.wps?.kind !== "file" && node.wps?.kind !== "folder") throw new Error("not support");
    await doJSON(client, storage, "PUT", `/api/v3/groups/${node.wps.group_id}/files/${node.wps.file_id}`, {
      fname: newName,
    });
  },

  async details(storage) {
    await ensureLogin(client, storage);
    if (isPersonal(storage)) {
      const resp = await requestWps(client, storage, `${ENDPOINT_PERSONAL}/api/v3/spaces`);
      return {
        total_space: Number(resp.total || 0),
        used_space: Number(resp.used || 0),
        free_space: Math.max(0, Number(resp.total || 0) - Number(resp.used || 0)),
      };
    }
    const companyID = Number(storage.__wpsLogin?.companyid || storage.__wpsLogin?.current_companyid || 0);
    const resp = await requestWps(client, storage, `${ENDPOINT_BUSINESS}/3rd/plussvr/compose/v1/u/companies/batch/service-space`, {
      query: { comp_ids: companyID },
    });
    const info = (resp.info || []).find((item) => Number(item.id || 0) === companyID) || (resp.info || [])[0];
    if (!info) throw new Error(`service space info not found for company ID: ${companyID}`);
    return {
      total_space: Number(info.space_total || 0),
      used_space: Number(info.space_used || 0),
      free_space: Math.max(0, Number(info.space_total || 0) - Number(info.space_used || 0)),
    };
  },

  async put() {
    throw new Error("WPS upload is not implemented in the SiYuan kernel JavaScript port yet");
  },
});
