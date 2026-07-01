import { normalizePath } from "../../model/path.js";

const joinWorkspacePath = (root, relPath) => {
  const cleanRoot = normalizePath(root || "/@workspace").replace(/^\/@workspace\/?/, "");
  const cleanRel = normalizePath(relPath || "/").replace(/^\/+/, "");
  return normalizePath(`/@workspace/${[cleanRoot, cleanRel].filter(Boolean).join("/")}`);
};

export const createSiYuanWorkspaceDriver = ({ workspaceGet, workspaceList, workspacePublicUrl, workspaceReadText }) => {
  const objForMount = (storage, relPath, obj = {}) => {
    const isDir = !!obj.is_dir;
    const path = normalizePath(`${storage.mount_path}/${normalizePath(relPath).replace(/^\/+/, "")}`);
    const workspacePath = joinWorkspacePath(storage.addition_json?.root_folder_path, relPath);
    return {
      ...obj,
      path,
      raw_url: isDir ? "" : (workspacePublicUrl(workspacePath) || `/plugin/private/siyuan-cloud/d${path}`),
      provider: "siyuan-workspace",
    };
  };

  return {
    async list(storage, relPath, req = {}) {
      const workspacePath = joinWorkspacePath(storage.addition_json?.root_folder_path, relPath);
      const result = await workspaceList(workspacePath, req);
      if (result.error) throw new Error(result.error.message || "workspace list failed");
      return {
        ...result.data,
        content: (result.data.content || []).map((item) => objForMount(storage, normalizePath(`${relPath}/${item.name}`), item)),
        provider: "siyuan-workspace",
      };
    },

    async get(storage, relPath) {
      const workspacePath = joinWorkspacePath(storage.addition_json?.root_folder_path, relPath);
      const result = await workspaceGet(workspacePath);
      if (result.error) throw new Error(result.error.message || "workspace get failed");
      return objForMount(storage, relPath, result.data);
    },

    async read(storage, relPath) {
      const workspacePath = joinWorkspacePath(storage.addition_json?.root_folder_path, relPath);
      const publicUrl = workspacePublicUrl(workspacePath);
      if (publicUrl) return { redirect: publicUrl };
      const result = await workspaceReadText(workspacePath);
      if (!result.ok) throw new Error(`workspace read failed: ${result.status}`);
      return {
        body: result.text,
        bodyEncoding: "text",
        contentType: result.contentType,
        status: result.status,
      };
    },

    async test() {
      return { status: "work" };
    },
  };
};
