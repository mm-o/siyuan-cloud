import { normalizePath } from "../../model/path.js";
import {
  basenameOf,
  boolValue,
  dirnameOf,
  parseTime,
  persistAddition,
  rawDownloadUrl,
} from "../common.js";
import { remoteJson } from "../http.js";

const configs = {
  Quark: {
    api: "https://drive.quark.cn/1/clouddrive",
    pr: "ucpro",
    referer: "https://pan.quark.cn",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch",
  },
  UC: {
    api: "https://pc-api.uc.cn/1/clouddrive",
    pr: "UCBrowser",
    referer: "https://drive.uc.cn",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) uc-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch",
  },
};

const checkQuark = (payload) => {
  if (Number(payload?.status || 0) >= 400 || Number(payload?.code || 0) !== 0) {
    throw new Error(payload?.message || "quark request failed");
  }
  return payload;
};

const cookieHeader = (addition) => addition.cookie || addition.Cookie || "";

const confFor = (storage) => configs[storage.driver] || configs.Quark;

const requestQuark = async (client, storage, pathname, {
  body,
  method = "GET",
  query = {},
  userAgent,
} = {}) => {
  const conf = confFor(storage);
  const target = new URL(`${conf.api}${pathname}`);
  target.searchParams.set("pr", conf.pr);
  target.searchParams.set("fr", "pc");
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  }
  const resp = await remoteJson(client, target.toString(), {
    allowErrorStatus: true,
    body,
    headers: {
      Accept: "application/json, text/plain, */*",
      Cookie: cookieHeader(storage.addition_json),
      Referer: conf.referer,
      "User-Agent": userAgent || conf.ua,
    },
    method,
  });
  return checkQuark(resp);
};

const timeFromMs = (value) => parseTime(Number(value || 0));

const fileToObj = (file, relPath, storage) => {
  const isDir = !file.file;
  return {
    name: file.file_name || basenameOf(relPath),
    path: normalizePath(relPath),
    is_dir: isDir,
    size: Number(file.size || 0),
    modified: timeFromMs(file.updated_at || file.l_updated_at),
    created: timeFromMs(file.created_at || file.l_created_at),
    sign: "",
    thumb: file.thumbnail || "",
    type: isDir ? 1 : 0,
    hashinfo: "",
    hash_info: {},
    id: file.fid || "",
    raw_url: isDir ? "" : rawDownloadUrl(storage, relPath, true),
    provider: storage.driver || "Quark",
    file,
  };
};

const listByParent = async (client, storage, parentId) => {
  const addition = storage.addition_json;
  const result = [];
  const size = 100;
  let page = 1;
  for (;;) {
    const query = {
      pdir_fid: parentId || addition.root_folder_id || "0",
      _size: size,
      _fetch_total: "1",
      fetch_all_file: "1",
      fetch_risk_file_name: "1",
      _page: page,
    };
    if ((addition.order_by || "none") !== "none") {
      query._sort = `file_type:asc,${addition.order_by}:${addition.order_direction || "asc"}`;
    }
    const resp = await requestQuark(client, storage, "/file/sort", { method: "GET", query });
    const list = resp?.data?.list || [];
    for (const file of list) {
      if (!boolValue(addition.only_list_video_file) || !file.file || Number(file.category || 0) === 1) {
        result.push({ ...file, file_name: decodeHtml(file.file_name || "") });
      }
    }
    if (page * size >= Number(resp?.metadata?._total || list.length)) break;
    page += 1;
  }
  return result;
};

const decodeHtml = (value) => String(value || "")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"")
  .replace(/&#39;/g, "'");

const resolveFile = async (client, storage, relPath) => {
  const clean = normalizePath(relPath || "/");
  const rootId = storage.addition_json.root_folder_id || storage.addition_json.RootFolderID || "0";
  if (clean === "/") {
    return {
      fid: rootId,
      file_name: "root",
      file: false,
      path: "/",
    };
  }
  let parentId = rootId;
  let current = null;
  for (const part of clean.split("/").filter(Boolean)) {
    const files = await listByParent(client, storage, parentId);
    current = files.find((item) => item.file_name === part);
    if (!current) throw new Error(`object not found: ${clean}`);
    parentId = current.fid;
  }
  return current;
};

const downloadLink = async (client, storage, file) => {
  const conf = confFor(storage);
  if (
    boolValue(storage.addition_json.use_transcoding_address)
    && storage.driver === "Quark"
    && Number(file.category || 0) === 1
    && Number(file.size || 0) > 0
  ) {
    const resp = await requestQuark(client, storage, "/file/v2/play/project", {
      body: {
        fid: file.fid,
        resolutions: "low,normal,high,super,2k,4k",
        supports: "fmp4_av,m3u8,dolby_vision",
      },
      method: "POST",
      userAgent: conf.ua,
    });
    for (const info of resp?.data?.video_list || []) {
      if (info?.video_info?.url) {
        return {
          header: {},
          url: info.video_info.url,
          content_length: Number(info.video_info.size || file.size || 0),
        };
      }
    }
    throw new Error("no link found");
  }

  const resp = await requestQuark(client, storage, "/file/download", {
    body: { fids: [file.fid] },
    method: "POST",
    userAgent: conf.ua,
  });
  const url = resp?.data?.[0]?.download_url || "";
  if (!url) throw new Error("get download url failed");
  return {
    header: {
      Cookie: cookieHeader(storage.addition_json),
      Referer: conf.referer,
      "User-Agent": conf.ua,
    },
    url,
    content_length: Number(file.size || 0),
  };
};

const manageFile = async (client, storage, pathname, body) => {
  await requestQuark(client, storage, pathname, { body, method: "POST" });
};

export const createQuarkDriver = ({ client }) => ({
  async test(storage) {
    await requestQuark(client, storage, "/config");
    if (storage.addition_json.AdditionVersion !== 2 && storage.addition_json.addition_version !== 2) {
      storage.addition_json.addition_version = 2;
      await persistAddition(storage);
    }
    return { addition: storage.addition_json };
  },

  async list(storage, relPath) {
    const parent = await resolveFile(client, storage, relPath);
    const content = (await listByParent(client, storage, parent.fid))
      .map((file) => fileToObj(file, normalizePath(relPath + "/" + file.file_name), storage));
    return {
      content,
      total: content.length,
      readme: "",
      header: "",
      write: true,
      provider: storage.driver || "Quark",
      direct_upload_tools: [],
    };
  },

  async get(storage, relPath, options = {}) {
    const file = await resolveFile(client, storage, relPath);
    const obj = fileToObj(file, relPath, storage);
    if (!obj.is_dir && !options.skipLink) {
      const link = await downloadLink(client, storage, file);
      obj.raw_url = link.url;
      obj.url = link.url;
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
    if (!file.file) throw new Error("not file");
    const link = await downloadLink(client, storage, file);
    const header = { ...link.header, ...(options.proxyHeaders || options.headers || {}) };
    return {
      link: {
        url: link.url,
        header,
        content_length: link.content_length,
        concurrency: 3,
        part_size: 10 * 1024 * 1024,
      },
    };
  },

  async mkdir(storage, relPath) {
    const parent = await resolveFile(client, storage, dirnameOf(relPath));
    await manageFile(client, storage, "/file", {
      dir_init_lock: false,
      dir_path: "",
      file_name: basenameOf(relPath),
      pdir_fid: parent.fid,
    });
  },

  async move(storage, relPath, dstRelPath) {
    const file = await resolveFile(client, storage, relPath);
    const dst = await resolveFile(client, storage, dstRelPath);
    await manageFile(client, storage, "/file/move", {
      action_type: 1,
      exclude_fids: [],
      filelist: [file.fid],
      to_pdir_fid: dst.fid,
    });
  },

  async remove(storage, relPath) {
    const file = await resolveFile(client, storage, relPath);
    await manageFile(client, storage, "/file/delete", {
      action_type: 1,
      exclude_fids: [],
      filelist: [file.fid],
    });
  },

  async rename(storage, relPath, newName) {
    const file = await resolveFile(client, storage, relPath);
    await manageFile(client, storage, "/file/rename", {
      fid: file.fid,
      file_name: newName,
    });
  },

  async copy() {
    throw new Error("Quark copy is not supported by the OpenList driver");
  },

  async put() {
    throw new Error("Quark upload is not implemented in the SiYuan kernel port yet");
  },
});
