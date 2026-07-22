import { OPENLIST_VERSION } from "../../internal/conf/const.js";
import { driverNames } from "../../internal/driver/info.js";
import { acceptedArchiveExtensions } from "../../internal/fs/archive.js";
import { SETTING_FLAG } from "../../internal/model/setting.js";
import { jsonResponse, success } from "../common/response.js";

const STATUS = {
  DONE: "done",
  PARTIAL: "partial",
  PLACEHOLDER: "placeholder",
  UNSUPPORTED: "unsupported",
};

export const CAPABILITY_ITEMS = [
  { key: "openlist.http-api", status: STATUS.DONE, area: "base", summary: "OpenList-style route table and response envelope." },
  { key: "openlist.fs", status: STATUS.DONE, area: "fs", summary: "List/get/link/upload/manage routes are wired for virtual FS and runtime mounts." },
  { key: "openlist.admin", status: STATUS.DONE, area: "admin", summary: "Settings, users, storages, metas, messages, scan, config import/export, and driver metadata routes are available." },
  { key: "openlist.public", status: STATUS.DONE, area: "public", summary: "Public discovery routes expose routes, settings, archive extensions, and capability metadata." },
  { key: "openlist.share", status: STATUS.DONE, area: "share", summary: "OpenList-style share management and private-route share reads/downloads are available." },
  { key: "openlist.share.multi-file", status: STATUS.DONE, area: "share", summary: "Share roots can contain multiple files and directories." },
  { key: "openlist.webdav", status: STATUS.PARTIAL, area: "protocol", summary: "WebDAV read/write surface is available; full lock/etag/condition compatibility is still pending.", next: "Align WebDAV conditional headers, lock persistence, and edge-client behavior." },
  { key: "openlist.s3", status: STATUS.PARTIAL, area: "protocol", summary: "S3 bucket/object/multipart surface and SigV4 checks are available; full S3 semantics are still pending.", next: "Align metadata, multipart completion details, ranges, and delete-marker behavior." },
  { key: "openlist.search.local-index", status: STATUS.PARTIAL, area: "search", summary: "Local persisted search_nodes index, OpenList-style build/update/stop/clear/progress routes, and search route are available.", next: "Keep full OpenList search backend matrix as a later migration." },
  { key: "openlist.task", status: STATUS.PARTIAL, area: "task", summary: "Task routes, TaskInfo shapes, lightweight persisted records, and a single-worker queue base are available.", next: "Wire heavy operations into the queue and add retry scheduling plus group coordinators." },
  { key: "openlist.task.manager-shape", status: STATUS.DONE, area: "task", summary: "done/undone/info/cancel/delete/retry/batch/clear response shapes match the ported OpenList handlers." },
  { key: "openlist.security.request-context", status: STATUS.PARTIAL, area: "security", summary: "JWT request context, PwdHash/Salt password storage, logout token invalidation, and permission checks cover major FS/share/task/protocol/archive/torrent/search entrances.", next: "Port real 2FA/WebAuthn/SSO/LDAP challenge flows and broader secret migration/desensitization." },
  { key: "openlist.fs.torrent.parse", status: STATUS.DONE, area: "torrent", summary: "Torrent parse and upload_parse use a JS bencode reader." },
  { key: "openlist.fs.torrent.generate", status: STATUS.DONE, area: "torrent", summary: "Single-file torrent generation is available for readable virtual/workspace/mounted files." },
  { key: "openlist.fs.torrent.rapid-upload.driver-boundary", status: STATUS.PARTIAL, area: "torrent", summary: "Rapid upload validates CAS torrents and delegates to driver methods when present.", next: "Port real 189/189PC rapidUploadFromTorrent implementations." },
  { key: "openlist.fs.offline-download", status: STATUS.PLACEHOLDER, area: "offline", summary: "add_offline_download keeps OpenList request/response shape but no real tool runner is ported.", next: "Port aria2/qbit/transmission/SimpleHttp/ed2k behind the task manager." },
  { key: "openlist.fs.archive.zip-list", status: STATUS.DONE, area: "archive", summary: "ZIP meta/list supports virtual files and mounted range readers." },
  { key: "openlist.fs.archive.zip-extract-stored", status: STATUS.DONE, area: "archive", summary: "ZIP stored entries can be extracted." },
  { key: "openlist.fs.archive.zip-extract-deflate", status: STATUS.DONE, area: "archive", summary: "ZIP deflate entries can be extracted." },
  { key: "openlist.fs.archive.zip-encrypted-detect", status: STATUS.DONE, area: "archive", summary: "Encrypted ZIP entries are detected and fail with an explicit 501 boundary." },
  { key: "openlist.fs.archive.zip-decrypt", status: STATUS.UNSUPPORTED, area: "archive", summary: "Encrypted ZIP decryption is not implemented." },
  { key: "openlist.fs.archive.zip-decompress-virtual", status: STATUS.DONE, area: "archive", summary: "ZIP entries can decompress into virtual FS targets." },
  { key: "openlist.fs.archive.decompress-upload-mounted", status: STATUS.PARTIAL, area: "archive", summary: "Archive decompress can upload into mounted targets with put() support.", next: "Move decompress into a cancellable task with progress and overwrite policy." },
  { key: "openlist.fs.archive.tar-list", status: STATUS.DONE, area: "archive", summary: "tar meta/list is available." },
  { key: "openlist.fs.archive.tar-extract", status: STATUS.DONE, area: "archive", summary: "tar entry extract is available." },
  { key: "openlist.fs.archive.tgz-list", status: STATUS.DONE, area: "archive", summary: "tgz/tar.gz meta/list is available." },
  { key: "openlist.fs.archive.tgz-extract", status: STATUS.DONE, area: "archive", summary: "tgz/tar.gz entry extract is available." },
  { key: "openlist.fs.archive.rar-7z-iso", status: STATUS.PLACEHOLDER, area: "archive", summary: "RAR/7z/ISO are advertised only as unsupported archive tool placeholders.", next: "Choose reader, verify license/wasm packaging, and add smoke fixtures before enabling." },
  { key: "openlist.share.archive.zip-extract", status: STATUS.DONE, area: "archive", summary: "Shared ZIP entries can be extracted through /sad after share checks." },
  { key: "openlist.share.archive.meta-list", status: STATUS.DONE, area: "archive", summary: "Share archive meta/list supports OpenList /@s split paths." },
  { key: "openlist.fs.archive.driver-paths", status: STATUS.DONE, area: "archive", summary: "/ad and /ap archive path extraction routes are available." },
  { key: "openlist.fs.archive.entry-range", status: STATUS.PLACEHOLDER, area: "archive", summary: "Archive entry extraction is not a seekable media Range proxy yet.", next: "Implement archive entry Range responses before treating archive videos like normal /p playback." },
];

const CAPABILITIES = CAPABILITY_ITEMS
  .filter((item) => item.status !== STATUS.UNSUPPORTED)
  .map((item) => item.key);

const METHOD_NAMES = [
  "list",
  "get",
  "link",
  "read",
  "mkdir",
  "rename",
  "move",
  "copy",
  "remove",
  "put",
  "direct_upload",
  "other",
  "details",
  "rapid_upload",
  "torrent",
  "offline",
];

const methodRow = (methods, note = "") => ({
  methods: Object.fromEntries(METHOD_NAMES.map((name) => [name, methods[name] || STATUS.UNSUPPORTED])),
  note,
});

const baseManage = {
  list: STATUS.DONE,
  get: STATUS.DONE,
  link: STATUS.DONE,
  read: STATUS.DONE,
  mkdir: STATUS.DONE,
  rename: STATUS.DONE,
  move: STATUS.DONE,
  copy: STATUS.DONE,
  remove: STATUS.DONE,
  put: STATUS.DONE,
};

const DRIVER_CAPABILITIES = {
  SiYuanWorkspace: methodRow({ list: STATUS.DONE, get: STATUS.DONE, link: STATUS.DONE, read: STATUS.DONE, rename: STATUS.PARTIAL, remove: STATUS.PARTIAL }, "Workspace adapter is intentionally conservative; upload stays guarded."),
  Local: methodRow({ ...baseManage, link: STATUS.UNSUPPORTED, read: STATUS.DONE }, "Desktop frontend Electron runtime only; kernel HTTP does not proxy local disks."),
  WebDav: methodRow({ ...baseManage }, "Runtime WebDAV driver is available; protocol-server compatibility is tracked separately."),
  OpenList: methodRow({ ...baseManage, other: STATUS.DONE }, "Upstream OpenList/AList proxy driver."),
  AListV3: methodRow({ ...baseManage, other: STATUS.DONE }, "Upstream OpenList/AList proxy driver."),
  "AList V3": methodRow({ ...baseManage, other: STATUS.DONE }, "Alias for AListV3."),
  S3: methodRow({ ...baseManage, direct_upload: STATUS.DONE }, "S3/Doge runtime supports presigned direct upload info."),
  Doge: methodRow({ ...baseManage, direct_upload: STATUS.DONE }, "S3-compatible Doge runtime."),
  "115 Cloud": methodRow({ ...baseManage, put: STATUS.PLACEHOLDER, details: STATUS.DONE, offline: STATUS.PLACEHOLDER }, "Upload/offline remain blocked on 115 rapid/ECDH and OSS multipart work."),
  "115 Open": methodRow({ ...baseManage, put: STATUS.PLACEHOLDER, details: STATUS.DONE, offline: STATUS.PARTIAL }, "115 Open token/list/link/basic management/details are ported; upload remains blocked on OSS multipart work."),
  "115 Share": methodRow({ list: STATUS.DONE, get: STATUS.DONE, link: STATUS.DONE, read: STATUS.DONE, mkdir: STATUS.UNSUPPORTED, rename: STATUS.UNSUPPORTED, move: STATUS.UNSUPPORTED, copy: STATUS.UNSUPPORTED, remove: STATUS.UNSUPPORTED, put: STATUS.UNSUPPORTED }, "OpenList marks 115 Share management/upload methods as NotSupport."),
  "123Pan": methodRow({ ...baseManage, copy: STATUS.UNSUPPORTED }, "123Pan upload path is ported; copy is not exposed by the current runtime."),
  "189Cloud": methodRow({ ...baseManage, rapid_upload: STATUS.PLACEHOLDER, torrent: STATUS.PLACEHOLDER }, "Normal login/list/upload have smoke coverage; real-account SMS and large upload validation remain pending."),
  "189CloudPC": methodRow({ ...baseManage, put: STATUS.PLACEHOLDER, rapid_upload: STATUS.PLACEHOLDER, torrent: STATUS.PLACEHOLDER }, "PC QR login/session refresh, family-cloud ID refill, list/link/basic management are ported; upload/CAS/torrent remain placeholders."),
  "189CloudTV": methodRow({ ...baseManage, put: STATUS.PLACEHOLDER, rapid_upload: STATUS.PLACEHOLDER }, "TV QR login/session refresh, family-cloud ID refill, list/link/basic management are ported; upload remains a placeholder."),
  AliyundriveOpen: methodRow({ ...baseManage, other: STATUS.DONE }, "AliyundriveOpen includes video_preview other() and upload."),
  BaiduNetdisk: methodRow({ ...baseManage, move: STATUS.UNSUPPORTED, copy: STATUS.UNSUPPORTED }, "Baidu list/link/upload/basic management are ported; move/copy are not exposed by the current runtime."),
  "GitHub Releases": methodRow({ list: STATUS.DONE, get: STATUS.DONE, link: STATUS.DONE, read: STATUS.DONE, mkdir: STATUS.UNSUPPORTED, rename: STATUS.UNSUPPORTED, move: STATUS.UNSUPPORTED, copy: STATUS.UNSUPPORTED, remove: STATUS.UNSUPPORTED, put: STATUS.UNSUPPORTED }, "GitHub Releases mirrors OpenList's read-only release asset driver; management and upload methods are NotImplement."),
  Onedrive: methodRow({ ...baseManage, direct_upload: STATUS.DONE, details: STATUS.DONE }, "OneDrive small/big upload and direct upload info are ported."),
  OneDrive: methodRow({ ...baseManage, direct_upload: STATUS.DONE, details: STATUS.DONE }, "Alias for Onedrive."),
  Quark: methodRow({ ...baseManage, copy: STATUS.UNSUPPORTED, details: STATUS.DONE }, "Quark/UC upload, details, and basic management are ported; copy is not implemented upstream here."),
  UC: methodRow({ ...baseManage, copy: STATUS.UNSUPPORTED, details: STATUS.DONE }, "UC shares the Quark runtime boundary."),
  QuarkOpen: methodRow({ ...baseManage, copy: STATUS.UNSUPPORTED }, "QuarkOpen upload and basic management are ported; copy is not exposed."),
  QuarkTV: methodRow({ list: STATUS.DONE, get: STATUS.DONE, link: STATUS.DONE, read: STATUS.DONE, mkdir: STATUS.UNSUPPORTED, rename: STATUS.UNSUPPORTED, move: STATUS.UNSUPPORTED, copy: STATUS.UNSUPPORTED, remove: STATUS.UNSUPPORTED, put: STATUS.UNSUPPORTED }, "OpenList marks QuarkTV management/upload methods as NotImplement."),
  UCTV: methodRow({ list: STATUS.DONE, get: STATUS.DONE, link: STATUS.DONE, read: STATUS.DONE, mkdir: STATUS.UNSUPPORTED, rename: STATUS.UNSUPPORTED, move: STATUS.UNSUPPORTED, copy: STATUS.UNSUPPORTED, remove: STATUS.UNSUPPORTED, put: STATUS.UNSUPPORTED }, "OpenList marks UCTV management/upload methods as NotImplement."),
  WPS: methodRow({ ...baseManage, put: STATUS.PLACEHOLDER, details: STATUS.DONE }, "WPS login/list/link/basic management/details are ported; upload remains a structured placeholder."),
};

export const capabilityMatrix = () => CAPABILITY_ITEMS.map((item) => ({ ...item }));

export const capabilitySummary = () => CAPABILITY_ITEMS.reduce((acc, item) => {
  acc[item.status] = (acc[item.status] || 0) + 1;
  return acc;
}, {});

export const driverCapabilityMatrix = () => Object.fromEntries(driverNames().map((name) => {
  const row = DRIVER_CAPABILITIES[name] || methodRow({}, "Driver is exposed without a completed method matrix.");
  return [name, { ...row, methods: { ...row.methods } }];
}));

const ENDPOINTS = {
  api: "/plugin/private/siyuan-cloud/api",
  download: "/plugin/private/siyuan-cloud/d/{path}",
  proxy: "/plugin/private/siyuan-cloud/p/{path}",
  webdav: "/plugin/private/siyuan-cloud/dav",
  s3: "/plugin/private/siyuan-cloud/s3",
  share_download: "/plugin/private/siyuan-cloud/sd/{id}/{path}",
  archive_extract: "/plugin/private/siyuan-cloud/ae/{archive_path}?inner={entry_path}",
};

export const createPublicHandlers = ({
  getState,
  handlersRef,
  settingItem,
}) => {
  const publicSettings = () => {
    const result = {};
    for (const [key, value] of Object.entries(getState().settings)) {
      const item = settingItem(key, value, 0);
      if (item.flag !== SETTING_FLAG.PRIVATE) result[key] = item.value;
    }
    result.version = OPENLIST_VERSION;
    return result;
  };

  const routeEntries = () => Object.keys(handlersRef ? handlersRef() : {})
    .sort()
    .map((route) => {
      const [method, ...pathParts] = route.split(" ");
      return { method, path: pathParts.join(" ") };
    });

  const apiIndex = () => ({
    name: "Siyuan Cloud",
    upstream: "OpenList",
    version: OPENLIST_VERSION,
    base_url: "/plugin/private/siyuan-cloud",
    api_base: "/plugin/private/siyuan-cloud/api",
    envelope: { code: 200, message: "success", data: null },
    endpoints: ENDPOINTS,
    capabilities: CAPABILITIES,
    capability_summary: capabilitySummary(),
    capability_matrix: capabilityMatrix(),
    driver_capabilities: driverCapabilityMatrix(),
    routes: routeEntries(),
  });

  return {
    "ANY /api/public/api": async () => jsonResponse(success(apiIndex())),
    "ANY /api/public/routes": async () => jsonResponse(success(apiIndex())),
    "ANY /api/public/settings": async () => jsonResponse(success(publicSettings())),
    "ANY /api/public/offline_download_tools": async () => jsonResponse(success([])),
    "ANY /api/public/archive_extensions": async () => jsonResponse(success(acceptedArchiveExtensions())),
  };
};
