import {
  basename,
  dirname,
  normalizePath,
} from "../../model/path.js";
import {
  forwardProxy,
  remoteJson,
} from "../http.js";

const trimAddress = (address) => String(address || "").replace(/\/+$/, "");

const headersFor = (addition) => ({
  Authorization: addition.token || addition.Token || "",
});

const checkResp = (payload) => {
  if (payload.code && payload.code !== 200) throw new Error(payload.message || `OpenList code ${payload.code}`);
  return payload.data;
};

const login = async (client, storage) => {
  const addition = storage.addition_json;
  if (!addition.username && !addition.Username) return;
  const payload = await remoteJson(
    client,
    `${trimAddress(addition.url || addition.address || addition.Address)}/api/auth/login`,
    {
      body: {
        username: addition.username || addition.Username || "",
        password: addition.password || addition.Password || "",
      },
      method: "POST",
      timeout: Number(addition.timeout || 30000),
    },
  );
  addition.token = payload?.data?.token || "";
  if (storage.saveDriverStorage) await storage.saveDriverStorage(addition);
};

const objFrom = (item, path) => ({
  name: item.name,
  path,
  is_dir: !!item.is_dir,
  size: Number(item.size || 0),
  modified: item.modified || new Date().toISOString(),
  created: item.created || item.modified || new Date().toISOString(),
  thumb: item.thumb || "",
  sign: item.sign || "",
  type: item.type || 0,
  hashinfo: item.hashinfo || item.hash_info || "",
});

export const createOpenListDriver = ({ client }) => {
  const request = async (storage, apiPath, method, body, retry = false) => {
    const addition = storage.addition_json;
    const payload = await remoteJson(
      client,
      `${trimAddress(addition.url || addition.address || addition.Address)}/api${apiPath}`,
      {
        body,
        headers: headersFor(addition),
        method,
        timeout: Number(addition.timeout || 30000),
      },
    );
    if ((payload.code === 401 || payload.code === 403) && !retry) {
      await login(client, storage);
      return request(storage, apiPath, method, body, true);
    }
    return checkResp(payload);
  };

  return {
    async list(storage, relPath, req) {
      const addition = storage.addition_json;
      const data = await request(storage, "/fs/list", "POST", {
        page: Number(req.page || 1),
        per_page: Number(req.per_page || req.perPage || 0),
        path: relPath,
        password: addition.meta_password || "",
        refresh: !!req.refresh,
      });
      return {
        content: (data.content || []).map((item) => objFrom(item, normalizePath(relPath + "/" + item.name))),
        total: Number(data.total || data.content?.length || 0),
        readme: data.readme || "",
        header: data.header || "",
        write: data.write !== false,
        provider: "OpenList",
        direct_upload_tools: [],
      };
    },
    async get(storage, relPath) {
      const addition = storage.addition_json;
      const data = await request(storage, "/fs/get", "POST", {
        path: relPath,
        password: addition.meta_password || "",
      });
      return {
        ...objFrom(data, relPath),
        raw_url: data.raw_url || "",
        readme: data.readme || "",
        header: data.header || "",
        provider: "OpenList",
        related: data.related || [],
      };
    },
    async mkdir(storage, relPath) {
      await request(storage, "/fs/mkdir", "POST", { path: relPath });
    },
    async move(storage, relPath, dstRelPath) {
      await request(storage, "/fs/move", "POST", {
        src_dir: dirname(relPath),
        dst_dir: normalizePath(dstRelPath),
        names: [basename(relPath)],
      });
    },
    async copy(storage, relPath, dstRelPath) {
      await request(storage, "/fs/copy", "POST", {
        src_dir: dirname(relPath),
        dst_dir: normalizePath(dstRelPath),
        names: [basename(relPath)],
      });
    },
    async remove(storage, relPath) {
      await request(storage, "/fs/remove", "POST", {
        dir: dirname(relPath),
        names: [relPath.split("/").filter(Boolean).pop()],
      });
    },
    async rename(storage, relPath, newName) {
      await request(storage, "/fs/rename", "POST", { path: relPath, name: newName });
    },
    async put(storage, relPath, content, mime, options = {}) {
      const addition = storage.addition_json;
      const response = await forwardProxy(
        client,
        `${trimAddress(addition.url || addition.address || addition.Address)}/api/fs/put`,
        {
          allowErrorStatus: true,
          body: content || "",
          contentType: mime || "application/octet-stream",
          headers: {
            Authorization: addition.token || addition.Token || "",
            "File-Path": relPath,
            Password: addition.meta_password || "",
          },
          method: "PUT",
          payloadEncoding: options.bodyEncoding === "base64" ? "base64" : undefined,
          responseEncoding: "text",
          timeout: Number(addition.timeout || 30000),
        },
      );
      const payload = JSON.parse(response.body || "{}");
      checkResp(payload);
    },
  };
};
