import {
  basename,
  dirname,
  normalizePath,
} from "../model/path.js";

export const createWorkspaceAdapter = ({
  client,
  extensionType,
  failure,
  now,
  page,
  toObjResp,
}) => {
  const isWorkspacePath = (path) => normalizePath(path).startsWith("/@workspace");

  const workspaceRelPath = (path) => {
    const normalized = normalizePath(path);
    const rel = normalized.replace(/^\/@workspace\/?/, "");
    return rel.replace(/^\/+/, "");
  };

  const siyuanApiJson = async (apiPath, data) => {
    const response = await client.fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data || {}),
    });
    const contentType = response.headers && (response.headers["Content-Type"] || response.headers["content-type"] || "");
    if (String(contentType).includes("application/json")) return response.json();
    return {
      code: response.ok ? 0 : response.status,
      msg: response.statusText || "",
      data: await response.text(),
    };
  };

  const workspaceObjResp = (item) => ({
    name: item.name,
    size: item.size || 0,
    is_dir: !!(item.isDir || item.is_dir),
    modified: new Date(Number(item.updated || 0) * 1000 || Date.now()).toISOString(),
    created: new Date(Number(item.updated || 0) * 1000 || Date.now()).toISOString(),
    sign: "",
    thumb: "",
    type: extensionType(item.name, item.isDir || item.is_dir),
    hashinfo: "",
    hash_info: {},
    provider: "siyuan-workspace",
  });

  const workspaceList = async (path, req) => {
    const rel = workspaceRelPath(path);
    const payload = await siyuanApiJson("/api/file/readDir", { path: rel });
    if (payload.code !== 0) return { error: failure(payload.msg || "readDir failed", payload.code || 500) };
    const content = (payload.data || [])
      .filter((item) => item && item.name && !String(item.name).startsWith("."))
      .map(workspaceObjResp);
    return {
      data: {
        content: page(content, req || {}),
        total: content.length,
        readme: "",
        header: "",
        write: true,
        write_content_bypass: false,
        provider: "siyuan-workspace",
        direct_upload_tools: [],
      },
    };
  };

  const workspaceGet = async (path) => {
    if (normalizePath(path) === "/@workspace") {
      return {
        data: {
          ...toObjResp({ name: "@workspace", is_dir: true, size: 0, modified: now(), created: now() }),
          raw_url: "",
          readme: "",
          header: "",
          provider: "siyuan-workspace",
          related: [],
        },
      };
    }
    const rel = workspaceRelPath(path);
    const parent = workspaceRelPath(dirname(path));
    const payload = await siyuanApiJson("/api/file/readDir", { path: parent });
    if (payload.code !== 0) return { error: failure(payload.msg || "readDir failed", payload.code || 500) };
    const item = (payload.data || []).find((entry) => entry.name === basename(path));
    if (!item) return { error: failure("object not found", 404) };
    return {
      data: {
        ...workspaceObjResp(item),
        raw_url: item.isDir ? "" : "/plugin/private/siyuan-cloud/d" + normalizePath("/@workspace/" + rel),
        readme: "",
        header: "",
        provider: "siyuan-workspace",
        related: [],
      },
    };
  };

  const workspaceReadText = async (path) => {
    const response = await client.fetch("/api/file/getFile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: workspaceRelPath(path) }),
    });
    return {
      ok: response.ok,
      status: response.status || 200,
      text: await response.text(),
      contentType: response.headers && (response.headers["Content-Type"] || response.headers["content-type"]) || "application/octet-stream",
    };
  };

  return {
    isWorkspacePath,
    siyuanApiJson,
    workspaceGet,
    workspaceList,
    workspaceReadText,
    workspaceRelPath,
  };
};
