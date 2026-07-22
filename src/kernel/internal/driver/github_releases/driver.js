import {
  basename,
  dirname,
  normalizePath,
} from "../../model/path.js";
import { remoteJson } from "../http.js";

const DEFAULT_REPO_STRUCTURE = "OpenListTeam/OpenList";
const GITHUB_API_VERSION = "2022-11-28";
const DEFAULT_TIME = "1970-01-01T00:00:00Z";

const boolValue = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true" || value === 1 || value === "1";
};

const joinPath = (left, right) => normalizePath(`${normalizePath(left || "/").replace(/\/+$/, "")}/${String(right || "").replace(/^\/+/, "")}`);

const parseTime = (value) => {
  const date = value ? new Date(value) : new Date(DEFAULT_TIME);
  return Number.isNaN(date.getTime()) ? DEFAULT_TIME : date.toISOString();
};

const headersFor = (addition) => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": GITHUB_API_VERSION,
  Authorization: addition.token ? `Bearer ${String(addition.token).trim()}` : "",
});

const parseRepos = (text = DEFAULT_REPO_STRUCTURE) => {
  const points = [];
  for (const rawLine of String(text || DEFAULT_REPO_STRUCTURE).split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(":");
    if (parts.length > 2) throw new Error(`invalid format: ${line}`);
    const point = parts.length === 1 ? "/" : normalizePath(parts[0]);
    const repo = (parts.length === 1 ? parts[0] : parts[1]).trim();
    if (!/^[^/\s:]+\/[^/\s:]+$/.test(repo)) throw new Error(`invalid repo: ${repo}`);
    points.push({ point, repo });
  }
  return points.length ? points : [{ point: "/", repo: DEFAULT_REPO_STRUCTURE }];
};

const nextDir = (wholePath, basePath) => {
  const whole = normalizePath(wholePath);
  const base = normalizePath(basePath);
  if (whole === base) return "";
  const prefix = base === "/" ? "/" : `${base}/`;
  if (!whole.startsWith(prefix)) return "";
  return whole.slice(prefix.length).split("/").filter(Boolean)[0] || "";
};

const addDir = (files, point, name, size, release) => {
  const existing = files.find((item) => item.name === name);
  if (existing) {
    existing.size += Number(size || 0);
    return;
  }
  files.push({
    name,
    path: joinPath(point, name),
    is_dir: true,
    size: Number(size || 0),
    modified: parseTime(release?.published_at || release?.created_at),
    created: parseTime(release?.created_at),
    raw_url: "",
    url: "",
    provider: "GitHub Releases",
  });
};

const rewriteGitHubUrl = (addition, rawUrl) => {
  const url = String(rawUrl || "");
  const proxy = String(addition.gh_proxy || addition.GitHubProxy || "").trim().replace(/\/+$/, "");
  if (!proxy || !url) return url;
  if (url.startsWith("https://github.com")) return url.replace("https://github.com", proxy);
  return url;
};

const fileObj = (point, name, size, created, updated, url, addition) => ({
  name,
  path: joinPath(point, name),
  is_dir: false,
  size: Number(size || 0),
  modified: parseTime(updated || created),
  created: parseTime(created),
  raw_url: rewriteGitHubUrl(addition, url),
  url: rewriteGitHubUrl(addition, url),
  provider: "GitHub Releases",
  hashinfo: "",
  hash_info: {},
});

const latestFiles = (point, release, addition) => (release?.assets || []).map((asset) => fileObj(
  point,
  asset.name,
  asset.size,
  asset.created_at,
  asset.updated_at,
  asset.browser_download_url,
  addition,
));

const latestSize = (release) => (release?.assets || []).reduce((sum, asset) => sum + Number(asset.size || 0), 0);

const allVersionSize = (releases) => (releases || []).reduce((sum, release) => sum + latestSize(release), 0);

const versionDirs = (point, releases) => (releases || []).map((release) => ({
  name: release.tag_name,
  path: joinPath(point, release.tag_name),
  is_dir: true,
  size: latestSize(release),
  modified: parseTime(release.published_at || release.created_at),
  created: parseTime(release.created_at),
  raw_url: "",
  url: release.html_url || "",
  provider: "GitHub Releases",
}));

const releaseByTagFiles = (point, tagName, releases, addition) => {
  const release = (releases || []).find((item) => item.tag_name === tagName);
  return release ? latestFiles(joinPath(point, tagName), release, addition) : [];
};

const sourceCodeFiles = (point, release, addition) => {
  if (!release) return [];
  return [
    fileObj(point, "Source code (zip)", 1, release.created_at, release.created_at, release.zipball_url, addition),
    fileObj(point, "Source code (tar.gz)", 1, release.created_at, release.created_at, release.tarball_url, addition),
  ];
};

const otherFiles = (point, files, addition) => (files || [])
  .filter((file) => String(file.name || "").endsWith(".md") || String(file.name || "").startsWith("LICENSE"))
  .map((file) => fileObj(point, file.name, file.size, DEFAULT_TIME, DEFAULT_TIME, file.download_url, addition));

export const createGitHubReleasesDriver = ({ client }) => {
  const apiGet = (storage, url) => remoteJson(client, url, {
    headers: headersFor(storage.addition_json),
    method: "GET",
    timeout: Number(storage.addition_json.timeout || 30000),
  });

  const latestRelease = (storage, point) =>
    apiGet(storage, `https://api.github.com/repos/${point.repo}/releases/latest`);

  const releases = (storage, point) =>
    apiGet(storage, `https://api.github.com/repos/${point.repo}/releases`);

  const repoContents = (storage, point) =>
    apiGet(storage, `https://api.github.com/repos/${point.repo}/contents`);

  const listPoint = async (storage, currentPath, point) => {
    const addition = storage.addition_json;
    const showAllVersion = boolValue(addition.show_all_version || addition.ShowAllVersion, false);
    const showReadme = boolValue(addition.show_readme ?? addition.ShowReadme, true);
    const showSourceCode = boolValue(addition.show_source_code || addition.ShowSourceCode, false);
    const files = [];

    if (!showAllVersion) {
      const release = await latestRelease(storage, point);
      if (point.point === currentPath) {
        files.push(...latestFiles(point.point, release, addition));
        if (showReadme) files.push(...otherFiles(point.point, await repoContents(storage, point), addition));
        if (showSourceCode) files.push(...sourceCodeFiles(point.point, release, addition));
      } else if (point.point.startsWith(currentPath === "/" ? "/" : `${currentPath}/`)) {
        const name = nextDir(point.point, currentPath);
        if (name) addDir(files, currentPath, name, latestSize(release), release);
      }
      return files;
    }

    const all = await releases(storage, point);
    if (point.point === currentPath) {
      files.push(...versionDirs(point.point, all));
      if (showReadme) files.push(...otherFiles(point.point, await repoContents(storage, point), addition));
    } else if (point.point.startsWith(currentPath === "/" ? "/" : `${currentPath}/`)) {
      const name = nextDir(point.point, currentPath);
      if (name) addDir(files, currentPath, name, allVersionSize(all), all[0]);
    } else if (currentPath === point.point || currentPath.startsWith(point.point === "/" ? "/" : `${point.point}/`)) {
      const tagName = nextDir(currentPath, point.point);
      if (tagName) {
        files.push(...releaseByTagFiles(point.point, tagName, all, addition));
        if (showSourceCode) files.push(...sourceCodeFiles(joinPath(point.point, tagName), all.find((item) => item.tag_name === tagName), addition));
      }
    }
    return files;
  };

  const listAll = async (storage, relPath, req = {}) => {
    const currentPath = normalizePath(relPath || "/");
    const files = [];
    for (const point of parseRepos(storage.addition_json.repo_structure || storage.addition_json.RepoStructure)) {
      files.push(...await listPoint(storage, currentPath, point, req));
    }
    return files;
  };

  return {
    async list(storage, relPath, req = {}) {
      const content = await listAll(storage, relPath, req);
      return {
        content,
        total: content.length,
        readme: "",
        header: "",
        write: false,
        provider: "GitHub Releases",
        direct_upload_tools: [],
      };
    },

    async get(storage, relPath) {
      const path = normalizePath(relPath || "/");
      if (path === "/") {
        return {
          name: "",
          is_dir: true,
          size: 0,
          modified: DEFAULT_TIME,
          created: DEFAULT_TIME,
          provider: "GitHub Releases",
          related: [],
        };
      }
      const parent = dirname(path);
      const name = basename(path);
      const content = await listAll(storage, parent);
      const obj = content.find((item) => item.name === name);
      if (!obj) throw new Error("object not found");
      return {
        ...obj,
        related: [],
      };
    },

    async link(storage, relPath) {
      const obj = await this.get(storage, relPath);
      if (obj.is_dir) throw new Error("not file");
      if (!obj.url) throw new Error("empty download url");
      return {
        link: {
          content_length: Number(obj.size || 0),
          header: {},
          method: "GET",
          url: obj.url,
        },
      };
    },

    async read(storage, relPath) {
      return this.link(storage, relPath);
    },

    async test(storage) {
      const points = parseRepos(storage.addition_json.repo_structure || storage.addition_json.RepoStructure);
      if (!points.length) throw new Error("repo_structure is empty");
      await latestRelease(storage, points[0]);
      return { ok: true };
    },
  };
};
