import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const LOCALES = ["zh_CN", "en_US"];
const DOC_ROOT = "assets/docs";
const MANIFEST_PATH = "docs/feishu-docs.json";
const GENERATED_TS_PATH = "src/utils/feishuDocs.generated.ts";
const TEMP_DIR = ".tmp/feishu-doc-sync";

const ROOT_DOCS = [
  { kind: "readme", pairKey: "readme", locale: "zh_CN", id: "readme.zh_CN", key: "/README", title: "说明文档", source: "README_zh_CN.md" },
  { kind: "readme", pairKey: "readme", locale: "en_US", id: "readme.en_US", key: "/README", title: "README", source: "README.md" },
  { kind: "changelog", pairKey: "changelog", locale: "zh_CN", id: "changelog.zh_CN", key: "/更新日志", title: "更新日志", source: "assets/docs/zh_CN/更新日志.md" },
  { kind: "changelog", pairKey: "changelog", locale: "en_US", id: "changelog.en_US", key: "/CHANGELOG", title: "CHANGELOG", source: "assets/docs/en_US/CHANGELOG.md" },
  { kind: "api", pairKey: "api", locale: "zh_CN", id: "api.zh_CN", key: "/API", title: "API", generated: true },
  { kind: "api", pairKey: "api", locale: "en_US", id: "api.en_US", key: "/API", title: "API", generated: true },
  { kind: "drivers", pairKey: "drivers", locale: "zh_CN", id: "drivers.zh_CN", key: "驱动说明", title: "驱动说明", generated: true, children: [] },
  { kind: "drivers", pairKey: "drivers", locale: "en_US", id: "drivers.en_US", key: "Drivers", title: "Drivers", generated: true, children: [] },
];

const DRIVER_DOC_GROUPS = [
  { drivers: ["OpenList"], en: "OpenList Compatible", zh: "OpenList 兼容挂载" },
  { drivers: ["AListV3", "AList V3"], en: "OpenList AList Local Mounting and Proxy", zh: "OpenList AList 本地挂载与代理" },
  { drivers: ["S3"], en: "S3 Compatible", zh: "S3 兼容存储" },
  { drivers: ["Doge"], en: "DogeCloud", zh: "DogeCloud 挂载" },
  { drivers: ["115 Cloud", "115"], en: "115 Cloud", zh: "115 Cloud 挂载" },
  { drivers: ["115 Open", "115Open"], en: "115 Open", zh: "115 Open 挂载" },
  { drivers: ["115 Share", "115Share"], en: "115 Share", zh: "115 Share 挂载" },
  { drivers: ["123Pan", "123"], en: "123Pan", zh: "123Pan 挂载" },
  { drivers: ["189Cloud", "189CloudPC", "189CloudTV"], en: "189Cloud Series", zh: "189Cloud 系列" },
  { drivers: ["AliyundriveOpen", "AliyunDriveOpen"], en: "Aliyundrive Open", zh: "阿里云盘开放平台" },
  { drivers: ["BaiduNetdisk", "BaiduNetDisk"], en: "Baidu Netdisk", zh: "百度网盘挂载" },
  { drivers: ["GitHub Releases"], en: "GitHub Releases", zh: "GitHub Releases" },
  { drivers: ["Onedrive", "OneDrive"], en: "OneDrive", zh: "OneDrive 挂载" },
  { drivers: ["Quark", "UC", "QuarkOpen", "QuarkTV", "UCTV"], en: "Quark UC Series", zh: "Quark UC 系列" },
  { drivers: ["WPS"], en: "WPS", zh: "WPS 云文档" },
  { drivers: ["Local"], en: "Local Storage", zh: "Local 本地存储" },
  { drivers: ["SiYuanWorkspace"], en: "SiYuan Workspace", zh: "思源工作空间" },
  { drivers: ["WebDav"], en: "WebDAV", zh: "WebDAV 挂载" },
];

function normalizeDriverName(value) {
  const driver = String(value || "").trim();
  if (/^alist\s*v3$/i.test(driver)) return "AListV3";
  if (/^onedrive$/i.test(driver)) return "OneDrive";
  if (/^webdav$/i.test(driver)) return "WebDav";
  return driver;
}

function slug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "doc";
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function contentHash(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export function shouldUpdateDocument(record, nextHash) {
  return record?.contentHash !== nextHash;
}

function markdownTitle(file) {
  return path.basename(file, ".md");
}

function markdownFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  } catch {
    return [];
  }
}

export function buildCatalog({ cwd = process.cwd() } = {}) {
  const entries = ROOT_DOCS.map((entry) => ({ ...entry, children: [...(entry.children || [])] }));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  for (const locale of LOCALES) {
    const dirName = locale === "zh_CN" ? "驱动说明" : "Drivers";
    const dir = path.join(cwd, DOC_ROOT, locale, dirName);
    for (const name of markdownFiles(dir)) {
      const title = markdownTitle(name);
      const pair = DRIVER_DOC_GROUPS.find((group) => group[locale === "zh_CN" ? "zh" : "en"] === title);
      const pairKey = `driver.${slug(pair?.en || title)}`;
      const id = `${pairKey}.${locale}`;
      const parentId = `drivers.${locale}`;
      const entry = {
        kind: "driver",
        pairKey,
        locale,
        id,
        key: `/${dirName}/${title}`,
        parentId,
        title,
        source: path.join(DOC_ROOT, locale, dirName, name).replace(/\\/g, "/"),
      };
      entries.push(entry);
      byId.set(id, entry);
      byId.get(parentId)?.children.push(id);
    }
  }

  const driverDocs = {};
  for (const group of DRIVER_DOC_GROUPS) {
    const zh = entries.find((entry) => entry.locale === "zh_CN" && entry.kind === "driver" && entry.title === group.zh);
    const en = entries.find((entry) => entry.locale === "en_US" && entry.kind === "driver" && entry.title === group.en);
    for (const driver of group.drivers) {
      driverDocs[normalizeDriverName(driver)] = {
        zh_CN: zh?.id || "",
        en_US: en?.id || "",
      };
    }
  }

  return { entries, driverDocs };
}

function counterpartFor(entry, catalog) {
  return catalog.entries.find((item) => item.pairKey === entry.pairKey && item.locale !== entry.locale);
}

export function renderLanguageSwitch({ locale, counterpartUrl }) {
  if (!counterpartUrl) return "";
  return locale === "zh_CN"
    ? `> 中文 | [English](${counterpartUrl})\n\n`
    : `> [中文](${counterpartUrl}) | English\n\n`;
}

export function replaceWikiRefs(markdown, refs) {
  return String(markdown || "").replace(/\[\[([^\]]+)]]/g, (_, rawTitle) => {
    const title = String(rawTitle || "").trim();
    const url = refs.get(title);
    return url ? `[${title}](${url})` : title;
  });
}

function docRecord(manifest, id) {
  return manifest.docs?.[id] || {};
}

function docUrl(manifest, id) {
  return id ? docRecord(manifest, id).url || "" : "";
}

function buildRefMap(catalog, manifest, locale) {
  const refs = new Map();
  for (const entry of catalog.entries) {
    const url = docUrl(manifest, entry.id);
    if (!url) continue;
    if (entry.locale === locale) {
      refs.set(entry.title, url);
      refs.set(entry.key.replace(/^\//, ""), url);
    } else if (!refs.has(entry.title)) {
      refs.set(entry.title, url);
    }
  }
  return refs;
}

async function fetchRuntimeApi() {
  const base = process.env.SIYUAN_CLOUD_API_URL;
  if (!base) return null;
  try {
    const response = await fetch(base);
    const json = await response.json();
    return json?.data || json;
  } catch {
    return null;
  }
}

function renderApiDoc(locale, data) {
  const zh = locale === "zh_CN";
  const routes = Object.entries(data?.endpoints || {}).map(([key, value]) => `- \`${key}\`: \`${value}\``);
  const capabilities = (data?.capabilities || []).map((item) => `- \`${item}\``);
  const liveRoutes = (data?.routes || []).map((route) => `- \`${route.method || "ANY"} ${route.path || ""}\``);
  if (zh) {
    return [
      "# API",
      "",
      "思盘 API 文档以运行时接口为准。发版同步时可设置 `SIYUAN_CLOUD_API_URL` 指向正在运行的 `/api/public/api`，脚本会把发现结果写入本页。",
      "",
      "- 私有基础路径：`/plugin/private/siyuan-cloud`",
      "- OpenList 兼容 API：`/plugin/private/siyuan-cloud/api`",
      "- 下载入口：`/plugin/private/siyuan-cloud/d/{path}`",
      "- 代理入口：`/plugin/private/siyuan-cloud/p/{path}`",
      "- WebDAV：`/plugin/private/siyuan-cloud/dav`",
      "- S3：`/plugin/private/siyuan-cloud/s3`",
      "- 运行时发现：`/plugin/private/siyuan-cloud/api/public/api`",
      "",
      "响应包络保持 OpenList 风格：`{ \"code\": 200, \"message\": \"success\", \"data\": ... }`。",
      "",
      "## 端点",
      "",
      ...(routes.length ? routes : ["- 未提供运行时发现数据。"]),
      "",
      "## 能力",
      "",
      ...(capabilities.length ? capabilities : ["- 未提供运行时发现数据。"]),
      "",
      "## 路由",
      "",
      ...(liveRoutes.length ? liveRoutes : ["- 未提供运行时发现数据。"]),
      "",
    ].join("\n");
  }
  return [
    "# API",
    "",
    "The API document follows the runtime discovery endpoint. During release sync, set `SIYUAN_CLOUD_API_URL` to a running `/api/public/api` endpoint and the script will write the discovered routes here.",
    "",
    "- Private base path: `/plugin/private/siyuan-cloud`",
    "- OpenList-compatible API: `/plugin/private/siyuan-cloud/api`",
    "- Download endpoint: `/plugin/private/siyuan-cloud/d/{path}`",
    "- Proxy endpoint: `/plugin/private/siyuan-cloud/p/{path}`",
    "- WebDAV: `/plugin/private/siyuan-cloud/dav`",
    "- S3: `/plugin/private/siyuan-cloud/s3`",
    "- Runtime discovery: `/plugin/private/siyuan-cloud/api/public/api`",
    "",
    "Responses use the OpenList-style envelope: `{ \"code\": 200, \"message\": \"success\", \"data\": ... }`.",
    "",
    "## Endpoints",
    "",
    ...(routes.length ? routes : ["- Runtime discovery data was not provided."]),
    "",
    "## Capabilities",
    "",
    ...(capabilities.length ? capabilities : ["- Runtime discovery data was not provided."]),
    "",
    "## Routes",
    "",
    ...(liveRoutes.length ? liveRoutes : ["- Runtime discovery data was not provided."]),
    "",
  ].join("\n");
}

function renderDriverIndex(entry, catalog, manifest) {
  const lines = entry.locale === "zh_CN"
    ? ["# 驱动说明", "", "每个驱动文档都保留在本知识库子文档中。插件里的驱动帮助按钮会直接打开对应飞书文档。", ""]
    : ["# Drivers", "", "Each driver document is kept as a child document in this knowledge base. Driver help buttons in the plugin open the matching Feishu document directly.", ""];
  for (const childId of entry.children || []) {
    const child = catalog.entries.find((item) => item.id === childId);
    const url = docUrl(manifest, childId);
    if (child && url) lines.push(`- [${child.title}](${url})`);
  }
  lines.push("");
  return lines.join("\n");
}

async function renderContent(entry, catalog, manifest, cwd, runtimeApi) {
  const counterpartUrl = docUrl(manifest, counterpartFor(entry, catalog)?.id);
  let markdown = "";
  if (entry.kind === "api") {
    markdown = renderApiDoc(entry.locale, runtimeApi);
  } else if (entry.kind === "drivers") {
    markdown = renderDriverIndex(entry, catalog, manifest);
  } else {
    markdown = fs.readFileSync(path.join(cwd, entry.source), "utf8");
  }
  return renderLanguageSwitch({ locale: entry.locale, counterpartUrl })
    + replaceWikiRefs(markdown, buildRefMap(catalog, manifest, entry.locale));
}

function parseFirstJson(text) {
  const source = String(text || "");
  const start = source.indexOf("{");
  if (start < 0) throw new Error(`No JSON object in CLI output: ${source}`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(source.slice(start, index + 1));
    }
  }
  throw new Error(`Unclosed JSON object in CLI output: ${source}`);
}

function larkCommand() {
  const cliJs = process.env.LARK_CLI_JS || "D:/nodejs/node_modules/@larksuite/cli/scripts/run.js";
  if (fs.existsSync(cliJs)) return { command: process.execPath, prefix: [cliJs] };
  return { command: process.platform === "win32" ? "lark-cli.cmd" : "lark-cli", prefix: [] };
}

function runLark(args, { dryRun = false } = {}) {
  if (dryRun) {
    console.log(`[dry-run] lark-cli ${args.join(" ")}`);
    return { ok: true, dry_run: true, data: {} };
  }
  const { command, prefix } = larkCommand();
  const result = spawnSync(command, [...prefix, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
      LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
    },
  });
  if (result.status !== 0) {
    throw new Error([
      `lark-cli ${args.join(" ")} failed with exit ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }
  return parseFirstJson(result.stdout || result.stderr);
}

function collectItems(payload) {
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.spaces)) return payload.data.spaces;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.spaces)) return payload.spaces;
  return [];
}

function ensureSpace(manifest, { dryRun }) {
  manifest.space ||= { name: process.env.FEISHU_DOC_SPACE_NAME || "思盘文档" };
  if (manifest.space.id) return manifest.space.id;

  const list = runLark(["wiki", "+space-list", "--as", "user", "--format", "json"], { dryRun });
  const existing = collectItems(list).find((space) => space.name === manifest.space.name);
  if (existing?.space_id) {
    manifest.space = { ...manifest.space, id: existing.space_id, name: existing.name };
    return manifest.space.id;
  }

  const created = runLark([
    "wiki", "+space-create",
    "--as", "user",
    "--name", manifest.space.name,
    "--description", "思盘插件文档，由本地 Markdown 同步生成。",
    "--format", "json",
  ], { dryRun });
  const data = created.data || created;
  manifest.space = {
    ...manifest.space,
    id: data.space_id || (dryRun ? "dry_run_space" : ""),
    name: data.name || manifest.space.name,
  };
  return manifest.space.id;
}

function ensureDocument(entry, manifest, spaceId, { dryRun }) {
  manifest.docs ||= {};
  if (manifest.docs[entry.id]?.documentId) return;

  const args = [
    "wiki", "+node-create",
    "--as", "user",
    "--title", entry.title,
    "--format", "json",
  ];
  if (entry.parentId) {
    const parent = manifest.docs[entry.parentId];
    if (!parent?.nodeToken) throw new Error(`Missing parent node token for ${entry.id}`);
    args.push("--parent-node-token", parent.nodeToken);
  } else {
    args.push("--space-id", spaceId);
  }

  const created = runLark(args, { dryRun });
  const data = created.data || created;
  const fakeToken = dryRun ? `dry_run_${entry.id.replace(/[^a-z0-9]+/gi, "_")}` : "";
  manifest.docs[entry.id] = {
    title: entry.title,
    locale: entry.locale,
    key: entry.key,
    source: entry.source || "",
    parentId: entry.parentId || "",
    nodeToken: data.node_token || fakeToken,
    documentId: data.obj_token || fakeToken,
    url: data.node_token || fakeToken ? `https://my.feishu.cn/wiki/${data.node_token || fakeToken}` : "",
  };
}

function writeTempMarkdown(id, markdown) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const file = path.join(TEMP_DIR, `${id.replace(/[^a-z0-9._-]/gi, "-")}.md`);
  fs.writeFileSync(file, markdown, "utf8");
  return file.replace(/\\/g, "/");
}

function updateDocument(entry, markdown, manifest, { dryRun }) {
  const documentId = manifest.docs?.[entry.id]?.documentId;
  if (!documentId) throw new Error(`Missing documentId for ${entry.id}`);
  const temp = writeTempMarkdown(entry.id, markdown);
  runLark([
    "docs", "+update",
    "--as", "user",
    "--doc", documentId,
    "--command", "overwrite",
    "--doc-format", "markdown",
    "--content", `@${temp}`,
    "--format", "json",
  ], { dryRun });
}

function writeGeneratedTs(catalog, manifest) {
  const roots = { zh_CN: {}, en_US: {} };
  const items = { zh_CN: [], en_US: [] };
  const driverDocs = {};

  for (const entry of catalog.entries) {
    const record = docRecord(manifest, entry.id);
    if (!record.url) continue;
    if (["readme", "changelog", "api", "drivers"].includes(entry.kind)) roots[entry.locale][entry.kind] = record.url;
    if (["changelog", "drivers"].includes(entry.kind)) {
      items[entry.locale].push({
        key: entry.key,
        icon: entry.kind === "changelog" ? "#iconList" : "#iconFolder",
        title: entry.title,
        desc: record.url,
        href: record.url,
      });
    }
  }

  for (const [driver, ids] of Object.entries(catalog.driverDocs)) {
    driverDocs[driver] = {};
    for (const locale of LOCALES) {
      const url = docUrl(manifest, ids[locale]);
      if (url) driverDocs[driver][locale] = url;
    }
  }

  const payload = {
    space: manifest.space || {},
    roots,
    items,
    driverDocs,
  };
  fs.mkdirSync(path.dirname(GENERATED_TS_PATH), { recursive: true });
  const content = `// Generated by scripts/feishu-doc-sync.mjs. Do not edit manually.\nexport const FEISHU_DOCS = ${JSON.stringify(payload, null, 2)} as const\n`;
  if (!fs.existsSync(GENERATED_TS_PATH) || fs.readFileSync(GENERATED_TS_PATH, "utf8") !== content) fs.writeFileSync(GENERATED_TS_PATH, content, "utf8");
}

export async function syncFeishuDocs({ cwd = process.cwd(), dryRun = false } = {}) {
  const catalog = buildCatalog({ cwd });
  const manifest = readJson(path.join(cwd, MANIFEST_PATH), { version: 1, docs: {} });
  const stats = { updated: 0, skipped: 0 };
  const spaceId = ensureSpace(manifest, { dryRun });

  for (const entry of catalog.entries.filter((item) => !item.parentId)) ensureDocument(entry, manifest, spaceId, { dryRun });
  for (const entry of catalog.entries.filter((item) => item.parentId)) ensureDocument(entry, manifest, spaceId, { dryRun });
  if (!dryRun) writeJson(path.join(cwd, MANIFEST_PATH), manifest);

  const runtimeApi = await fetchRuntimeApi();
  for (const entry of catalog.entries) {
    const markdown = await renderContent(entry, catalog, manifest, cwd, runtimeApi);
    const hash = contentHash(markdown);
    const record = docRecord(manifest, entry.id);
    if (shouldUpdateDocument(record, hash)) {
      updateDocument(entry, markdown, manifest, { dryRun });
      record.contentHash = hash;
      stats.updated += 1;
    } else {
      stats.skipped += 1;
    }
  }
  if (!dryRun) {
    writeJson(path.join(cwd, MANIFEST_PATH), manifest);
    writeGeneratedTs(catalog, manifest);
  }

  return { catalog, manifest, stats };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { manifest, stats } = await syncFeishuDocs({ dryRun });
  console.log(JSON.stringify({
    ok: true,
    space: manifest.space,
    docs: Object.keys(manifest.docs || {}).length,
    updated: stats.updated,
    skipped: stats.skipped,
    manifest: MANIFEST_PATH,
    generated: GENERATED_TS_PATH,
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
  });
}
