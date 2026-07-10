import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  gzipSync,
  zipSync,
} from "fflate";
import {
  BlobWriter,
  TextReader,
  ZipWriter,
  configure as configureZipJs,
} from "@zip.js/zip.js";
import { create115Driver } from "../src/kernel/internal/driver/115/driver.js";
import { create115OpenDriver } from "../src/kernel/internal/driver/115_open/driver.js";
import { create115ShareDriver } from "../src/kernel/internal/driver/115_share/driver.js";
import { createAliyundriveOpenDriver } from "../src/kernel/internal/driver/aliyundrive_open/driver.js";
import { createOneDriveDriver } from "../src/kernel/internal/driver/onedrive/driver.js";
import { staticPasswordHash } from "../src/kernel/internal/auth/token.js";
import { signAwsV4 } from "../src/kernel/internal/driver/aws4.js";

configureZipJs({ useWebWorkers: false });

const storageData = new Map();
const rpcHandlers = new Map();
let quarkSortRequests = 0;
const quarkSortCookies = [];
let quarkDownloadRequests = 0;
let quarkUploadPreBody = null;
let quarkUploadHashBody = null;
const quarkUploadAuthBodies = [];
let quarkUploadedBody = "";
let quarkUploadCommitBody = "";
let quarkUploadFinishBody = null;
const pan115Forms = [];
const pan115OpenForms = [];
const pan115ShareQueries = [];
const pan115QrLoginPaths = [];
let pan115QrStatusCalls = 0;
let pan115DownurlCalls = 0;
const cloud189TvListParents = [];
let pan123UploadRequestBody = null;
let pan123S3AuthBody = null;
let pan123UploadCompleteBody = null;
let pan123UploadedBody = "";
const aliOpenCreateBodies = [];
const aliOpenCompleteBodies = [];
let aliOpenPreviewBody = null;
let aliOpenUploadedBody = "";
let aliOpenPutCount = 0;
let quarkOpenUploadPreBody = null;
let quarkOpenUploadUrlBody = null;
let quarkOpenUploadFinishBody = null;
let quarkOpenUploadedBody = "";
const baiduCreateBodies = [];
let baiduPrecreateBody = null;
let baiduLocateQuery = null;
let baiduSuperfileQuery = null;
let baiduUploadedBody = "";
const baiduArchiveRanges = [];
const oneDriveSessionBodies = [];
const oneDriveUploadRanges = [];
const oneDrivePatchBodies = [];
const oneDriveCopyBodies = [];
let oneDriveUploadedSize = 0;
const cloud189UploadRequests = [];
let cloud189UploadedBody = "";
let cloud189LoginSubmitBody = null;
let cloud189ListCookie = "";
let cloud189PcQrStateBody = null;
let cloud189RefreshCookieMode = false;
let cloud189SmsMode = false;
let cloud189SmsSentBody = null;
let cloud189SmsSentCount = 0;
let cloud189SmsSubmitBody = null;
let openListOtherBody = null;
const openListRenameBodies = [];
const openListMoveBodies = [];
const openListRemoveBodies = [];
const s3PutUrls = [];

const cloud189RsaKeyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 1024 });
const cloud189RsaPubKey = cloud189RsaKeyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");

const jsonBody = (payload) => ({
  ok: true,
  status: 200,
  statusText: "ok",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  async json() {
    return payload;
  },
  async text() {
    return JSON.stringify(payload);
  },
});

const parseForm = (payload) => Object.fromEntries(new URLSearchParams(String(payload || "")));

const makeZip = (files) => {
  const chunks = [];
  const central = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = 0x5c21;
  for (const file of files) {
    const name = file.nameBytes ? Buffer.from(file.nameBytes) : Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.content || "", "utf8");
    const flags = file.utf8 === false ? 0 : 0x0800;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    chunks.push(local, data);

    const dir = file.name.endsWith("/");
    const record = Buffer.alloc(46 + name.length);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(flags, 8);
    record.writeUInt16LE(0, 10);
    record.writeUInt16LE(dosTime, 12);
    record.writeUInt16LE(dosDate, 14);
    record.writeUInt32LE(0, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(dir ? (0o40755 << 16) : 0, 38);
    record.writeUInt32LE(offset, 42);
    name.copy(record, 46);
    central.push(record);
    offset += local.length + data.length;
  }
  const centralOffset = offset;
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...chunks, ...central, eocd]);
};

const baiduZipBytes = makeZip([
  { name: "hello.txt", content: "zip from baidu" },
  { name: "Cap 中文版_0.4.0-cn_x64-setup.exe", nameBytes: Buffer.from("43617020d6d0cec4b0e65f302e342e302d636e5f7836342d73657475702e657865", "hex"), content: "setup" },
  { name: "Cap 中文版安装包/", nameBytes: Buffer.from("43617020d6d0cec4b0e6b0b2d7b0b0fc2f", "hex"), content: "" },
].map((item) => ({ ...item, utf8: item.nameBytes ? false : item.utf8 })));

const openListZipBytes = makeZip([{ name: "hello.txt", content: "zip from openlist" }]);

const makeEncryptedZip = async (files, password) => {
  const writer = new ZipWriter(new BlobWriter("application/zip"), { password });
  for (const file of files) await writer.add(file.name, new TextReader(file.content || ""));
  const blob = await writer.close();
  return Buffer.from(await blob.arrayBuffer());
};

const makeTar = (files) => {
  const chunks = [];
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.content || "", "utf8");
    const header = Buffer.alloc(512);
    name.copy(header, 0, 0, Math.min(name.length, 100));
    header.write("0000644\0", 100, "ascii");
    header.write("0000000\0", 108, "ascii");
    header.write("0000000\0", 116, "ascii");
    header.write((file.name.endsWith("/") ? 0 : data.length).toString(8).padStart(11, "0") + "\0", 124, "ascii");
    header.write(Math.floor(Date.UTC(2026, 0, 1) / 1000).toString(8).padStart(11, "0") + "\0", 136, "ascii");
    header.fill(0x20, 148, 156);
    header[156] = file.name.endsWith("/") ? 53 : 48;
    header.write("ustar\0", 257, "ascii");
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
    chunks.push(header);
    if (!file.name.endsWith("/")) {
      chunks.push(data);
      const pad = (512 - (data.length % 512)) % 512;
      if (pad) chunks.push(Buffer.alloc(pad));
    }
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
};

globalThis.siyuan = {
  client: {
    async fetch(path, init = {}) {
      if (path === "/api/network/forwardProxy") {
        const req = JSON.parse(init.body || "{}");
        const url = new URL(req.url);
        if (/^(127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) {
          return jsonBody({
            code: 8,
            msg: `forward request failed: Post "${url}": dial tcp ${url.hostname}: ip address [${url.hostname}] is prohibited`,
          });
        }
        let body = { code: 200, message: "success", data: null };
        let contentType = "application/json";
        let headers = {};
        let status = 200;
        const forwardedHeader = (name) => (req.headers || [])
          .map((item) => Object.entries(item)[0])
          .find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || "";
        if (url.hostname === "s3.example.test" && req.method === "PUT") {
          s3PutUrls.push(req.url);
          status = 200;
          body = "";
        } else if (url.hostname === "s3.example.test" && req.method === "GET" && url.searchParams.get("delimiter") === "/") {
          contentType = "application/xml";
          body = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Contents><Key>remote-s3/object.txt</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><Size>9</Size></Contents></ListBucketResult>`;
        } else if (url.hostname === "s3.example.test" && req.method === "HEAD") {
          body = "";
          headers = { "Content-Length": "9", "Last-Modified": "Thu, 01 Jan 2026 00:00:00 GMT" };
        } else if (url.hostname === "s3.example.test" && req.method === "GET") {
          contentType = "text/plain";
          headers = { "Accept-Ranges": "bytes", "Content-Length": "9" };
          body = "s3 object";
        } else if (url.hostname === "webdav.example.test" && req.method === "PROPFIND") {
          contentType = "application/xml";
          const depth = (req.headers || []).map((item) => Object.entries(item)[0]).find(([key]) => key.toLowerCase() === "depth")?.[1] || "";
          const targetName = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "remote-image.jpg");
          if (depth === "0") {
            body = `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>${url.pathname}</d:href><d:propstat><d:prop><d:displayname>${targetName}</d:displayname><d:getcontentlength>42</d:getcontentlength><d:getlastmodified>Thu, 01 Jan 2026 00:00:00 GMT</d:getlastmodified><d:resourcetype/></d:prop></d:propstat></d:response></d:multistatus>`;
          } else {
            body = `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>${url.pathname.replace(/\/?$/, "/")}</d:href><d:propstat><d:prop><d:displayname>${targetName}</d:displayname><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response><d:response><d:href>${url.pathname.replace(/\/?$/, "/")}remote-image.jpg</d:href><d:propstat><d:prop><d:displayname>remote-image.jpg</d:displayname><d:getcontentlength>42</d:getcontentlength><d:getlastmodified>Thu, 01 Jan 2026 00:00:00 GMT</d:getlastmodified><d:resourcetype/></d:prop></d:propstat></d:response></d:multistatus>`;
          }
        } else if (url.hostname === "webdav.example.test" && req.method === "HEAD") {
          status = 503;
          body = "";
        } else if (url.hostname === "graph.microsoft.com" && url.pathname === "/v1.0/me/drive") {
          body = {
            id: "onedrive-drive-1",
            quota: {
              total: 1000,
              used: 250,
            },
          };
        } else if (url.hostname === "graph.microsoft.com" && req.method === "PATCH") {
          oneDrivePatchBodies.push({
            body: req.payload,
            path: url.pathname,
          });
          body = {
            id: "onedrive-file-1",
            name: req.payload?.name || "remote-doc.txt",
            parentReference: {
              driveId: "onedrive-drive-1",
              id: req.payload?.parentReference?.id || "onedrive-parent-1",
            },
          };
        } else if (url.hostname === "graph.microsoft.com" && url.pathname.endsWith("/copy")) {
          oneDriveCopyBodies.push(req.payload);
          body = {};
        } else if (url.hostname === "graph.microsoft.com" && url.pathname.endsWith("/children")) {
          body = {
            value: [{
              id: "onedrive-file-1",
              name: "remote-doc.txt",
              size: 12,
              fileSystemInfo: {
                createdDateTime: "2026-01-01T00:00:00.000Z",
                lastModifiedDateTime: "2026-01-01T00:00:00.000Z",
              },
              file: { mimeType: "text/plain" },
              "@microsoft.graph.downloadUrl": "https://download.example.test/remote-doc.txt",
              parentReference: {
                driveId: "onedrive-drive-1",
                id: "onedrive-parent-1",
              },
            }],
          };
        } else if (url.hostname === "graph.microsoft.com" && url.pathname.includes("/target:")) {
          body = {
            id: "onedrive-target-folder",
            name: "target",
            folder: {},
            parentReference: {
              driveId: "onedrive-drive-1",
              id: "root",
            },
          };
        } else if (url.hostname === "graph.microsoft.com" && url.pathname.endsWith("/createUploadSession")) {
          oneDriveSessionBodies.push(req.payload);
          body = {
            uploadUrl: "https://onedrive-upload.example.test/upload-session",
          };
        } else if (url.hostname === "graph.microsoft.com" && url.pathname.includes("/remote-doc.txt:")) {
          body = {
            id: "onedrive-file-1",
            name: "remote-doc.txt",
            size: 12,
            fileSystemInfo: {
              createdDateTime: "2026-01-01T00:00:00.000Z",
              lastModifiedDateTime: "2026-01-01T00:00:00.000Z",
            },
            file: { mimeType: "text/plain" },
            "@microsoft.graph.downloadUrl": "https://download.example.test/remote-doc.txt",
            parentReference: {
              driveId: "onedrive-drive-1",
              id: "onedrive-parent-1",
            },
          };
        } else if (url.hostname === "download.example.test" && req.method === "GET") {
          contentType = "text/plain";
          body = "onedrive doc";
        } else if (url.hostname === "onedrive-upload.example.test" && req.method === "PUT") {
          const range = req.headers.find((item) => item["Content-Range"])?.["Content-Range"] || "";
          oneDriveUploadRanges.push(range);
          assert.equal(req.payloadEncoding, "base64");
          oneDriveUploadedSize += Buffer.from(req.payload || "", "base64").byteLength;
          status = range.endsWith("/6291457") ? 201 : 202;
          body = {
            id: "onedrive-uploaded-file",
            name: "onedrive-big.bin",
            size: oneDriveUploadedSize,
            file: { mimeType: "application/octet-stream" },
          };
        } else if (url.hostname === "api.oplist.org" && url.pathname.endsWith("/onedrive/renewapi")) {
          body = {
            access_token: "OD_ACCESS_REFRESHED",
            refresh_token: "OD_REFRESH_REFRESHED",
          };
        } else if (url.hostname === "login.123pan.com" && url.pathname.endsWith("/api/user/sign_in")) {
          if (req.payload?.passport === "needverify") {
            body = {
              code: 403,
              message: "请进行验证",
            };
          }
        } else if (url.hostname === "yun.123pan.com" && url.pathname.endsWith("/b/api/file/list/new")) {
          body = {
            code: 0,
            message: "success",
            data: {
              Next: "-1",
              Total: 1,
              InfoList: [{
                FileName: "pan123.txt",
                Size: 10,
                UpdateAt: "2026-01-01T00:00:00.000Z",
                FileId: 12301,
                Type: 0,
                Etag: "123pan-md5",
                S3KeyFlag: "flag",
              }],
            },
          };
        } else if (url.hostname === "yun.123pan.com" && url.pathname.endsWith("/b/api/file/download_info")) {
          body = {
            code: 0,
            message: "success",
            data: {
              DownloadUrl: "https://download123.example.test/pan123.txt",
            },
          };
        } else if (url.hostname === "yun.123pan.com" && url.pathname.endsWith("/b/api/file/upload_request")) {
          pan123UploadRequestBody = req.payload;
          body = {
            code: 0,
            message: "success",
            data: {
              Bucket: "pan123-bucket",
              FileId: 12399,
              Key: "pan123/uploads/pan123-upload.txt",
              Reuse: false,
              StorageNode: "pan123-node",
              UploadId: "pan123-upload-id",
            },
          };
        } else if (url.hostname === "yun.123pan.com" && url.pathname.endsWith("/b/api/file/s3_upload_object/auth")) {
          pan123S3AuthBody = req.payload;
          body = {
            code: 0,
            message: "success",
            data: {
              presignedUrls: {
                1: "https://pan123-s3.example.test/pan123/uploads/pan123-upload.txt?partNumber=1",
              },
            },
          };
        } else if (url.hostname === "pan123-s3.example.test" && req.method === "PUT") {
          assert.equal(req.payloadEncoding, "base64");
          pan123UploadedBody = Buffer.from(req.payload || "", "base64").toString("utf8");
          body = "";
        } else if (url.hostname === "yun.123pan.com" && url.pathname.endsWith("/b/api/file/upload_complete/v2")) {
          pan123UploadCompleteBody = req.payload;
          body = {
            code: 0,
            message: "success",
            data: null,
          };
        } else if (url.hostname === "yun.123pan.com" && url.pathname.endsWith("/b/api/user/info")) {
          body = {
            code: 0,
            message: "success",
            data: {
              UID: 123,
              Nickname: "pan123-user",
              SpaceUsed: 10,
              SpacePermanent: 100,
              SpaceTemp: 0,
              FileCount: 1,
            },
          };
        } else if (url.hostname === "download123.example.test" && req.method === "GET") {
          contentType = "text/plain";
          body = "123pan doc";
        } else if (url.hostname === "openapi.alipan.com" && url.pathname.endsWith("/adrive/v1.0/user/getDriveInfo")) {
          body = {
            user_id: "ali-open-user",
            default_drive_id: "ali-open-drive",
            resource_drive_id: "ali-open-drive",
          };
        } else if (url.hostname === "openapi.alipan.com" && url.pathname.endsWith("/adrive/v1.0/user/getSpaceInfo")) {
          body = {
            personal_space_info: {
              total_size: 5000,
              used_size: 1250,
            },
          };
        } else if (url.hostname === "openapi.alipan.com" && url.pathname.endsWith("/adrive/v1.0/openFile/list")) {
          body = {
            items: req.payload?.parent_file_id === "root"
              ? [{
                  file_id: "ali-open-video-file",
                  name: "ali-video.mp4",
                  size: 1024,
                  type: "file",
                  created_at: "2026-01-01T00:00:00.000Z",
                  updated_at: "2026-01-01T00:00:00.000Z",
                }]
              : [],
            next_marker: "",
          };
        } else if (url.hostname === "openapi.alipan.com" && url.pathname.endsWith("/adrive/v1.0/openFile/getDownloadUrl")) {
          assert.equal(req.payload?.drive_id, "ali-open-drive");
          assert.equal(req.payload?.file_id, "ali-open-video-file");
          body = {
            url: "https://ali-download.example.test/ali-video.mp4",
          };
        } else if (url.hostname === "openapi.alipan.com" && url.pathname.endsWith("/adrive/v1.0/openFile/getVideoPreviewPlayInfo")) {
          aliOpenPreviewBody = req.payload;
          body = {
            video_preview_play_info: {
              live_transcoding_task_list: [{
                template_id: "FHD",
                status: "finished",
                url: "https://ali-preview.example.test/ali-video.m3u8",
              }],
            },
          };
        } else if (url.hostname === "openapi.alipan.com" && url.pathname.endsWith("/adrive/v1.0/openFile/create")) {
          aliOpenCreateBodies.push(req.payload);
          if (req.payload?.name === "ali-rapid.txt" && req.payload?.pre_hash) {
            body = {
              code: "PreHashMatched",
              message: "pre hash matched",
            };
          } else if (req.payload?.name === "ali-rapid.txt" && req.payload?.content_hash) {
            body = {
              drive_id: "ali-open-drive",
              file_id: "ali-open-rapid-file",
              upload_id: "ali-open-rapid-upload-id",
              rapid_upload: true,
              part_info_list: [],
            };
          } else {
            body = {
              drive_id: "ali-open-drive",
              file_id: "ali-open-upload-file",
              upload_id: "ali-open-upload-id",
              rapid_upload: false,
              part_info_list: [{
                part_number: 1,
                upload_url: "https://cn-beijing-data.aliyundrive.net/ali-open/upload-part-1",
              }],
            };
          }
        } else if (url.hostname === "cn-beijing-data.aliyundrive.net" && req.method === "PUT") {
          assert.equal(req.payloadEncoding, "base64");
          aliOpenPutCount += 1;
          aliOpenUploadedBody = Buffer.from(req.payload || "", "base64").toString("utf8");
          body = "";
        } else if (url.hostname === "openapi.alipan.com" && url.pathname.endsWith("/adrive/v1.0/openFile/complete")) {
          aliOpenCompleteBodies.push(req.payload);
          body = {
            drive_id: "ali-open-drive",
            file_id: req.payload?.file_id || "ali-open-upload-file",
            name: req.payload?.file_id === "ali-open-rapid-file" ? "ali-rapid.txt" : "ali-upload.txt",
            size: req.payload?.file_id === "ali-open-rapid-file" ? 131072 : 9,
            type: "file",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          };
        } else if (url.hostname === "drive.quark.cn" && url.pathname.endsWith("/1/clouddrive/file/sort")) {
          quarkSortRequests += 1;
          quarkSortCookies.push(req.headers.find((item) => item.Cookie)?.Cookie || "");
          const parent = url.searchParams.get("pdir_fid");
          if (parent === "0") headers = { "Set-Cookie": ["__puus=QUARK_REFRESHED_PUUS; Path=/"] };
          body = {
            status: 0,
            code: 0,
            message: "success",
            data: {
              list: parent === "quark-dir-1"
                ? [{
                    fid: "quark-file-1",
                    file_name: "quark-child.txt",
                    file: true,
                    category: 1,
                    size: 11,
                    created_at: 1767225600000,
                    updated_at: 1767225600000,
                  }]
                : [{
                    fid: "quark-dir-1",
                    file_name: "quark-folder ",
                    file: false,
                    size: 0,
                    created_at: 1767225600000,
                    updated_at: 1767225600000,
                  }],
            },
            metadata: { _total: 1 },
          };
        } else if (url.hostname === "drive.quark.cn" && url.pathname.endsWith("/1/clouddrive/file/v2/play/project")) {
          quarkDownloadRequests += 1;
          body = {
            status: 0,
            code: 0,
            message: "success",
            data: {
              video_list: [{
                video_info: {
                  url: "https://quark-transcode.example.test/quark-child.m3u8",
                  size: 11,
                },
              }],
            },
          };
        } else if (url.hostname === "drive.quark.cn" && url.pathname.endsWith("/1/clouddrive/file/download")) {
          quarkDownloadRequests += 1;
          body = {
            status: 0,
            code: 0,
            message: "success",
            data: [{ download_url: "https://quark-download.example.test/quark-child.txt" }],
          };
        } else if (url.hostname === "drive.quark.cn" && url.pathname.endsWith("/1/clouddrive/file/upload/pre")) {
          quarkUploadPreBody = req.payload;
          body = {
            status: 0,
            code: 0,
            message: "success",
            data: {
              task_id: "quark-upload-task",
              finish: false,
              upload_id: "quark-upload-id",
              obj_key: "quark/uploads/quark-upload.txt",
              upload_url: "http://oss.example.test",
              fid: "quark-upload-file",
              bucket: "quark-bucket",
              callback: {
                callbackUrl: "https://drive.quark.cn/callback",
                callbackBody: "callback-body",
              },
              format_type: "text/plain",
              size: 16,
              auth_info: "QUARK_AUTH_INFO",
            },
            metadata: {
              part_size: 8,
              part_thread: 1,
            },
          };
        } else if (url.hostname === "drive.quark.cn" && url.pathname.endsWith("/1/clouddrive/file/update/hash")) {
          quarkUploadHashBody = req.payload;
          body = {
            status: 0,
            code: 0,
            message: "success",
            data: { finish: false },
            metadata: {},
          };
        } else if (url.hostname === "drive.quark.cn" && url.pathname.endsWith("/1/clouddrive/file/upload/auth")) {
          quarkUploadAuthBodies.push(req.payload);
          body = {
            status: 0,
            code: 0,
            message: "success",
            data: {
              auth_key: `QUARK_AUTH_KEY_${quarkUploadAuthBodies.length}`,
              headers: [],
              speed: 0,
            },
            metadata: {},
          };
        } else if (url.hostname === "quark-bucket.oss.example.test" && req.method === "PUT") {
          assert.equal(req.payloadEncoding, "base64");
          assert.equal(req.headers.some((item) => item.Authorization?.startsWith("QUARK_AUTH_KEY_")), true);
          assert.equal(req.headers.some((item) => item["x-oss-user-agent"] === "aliyun-sdk-js/6.6.1 Chrome 98.0.4758.80 on Windows 10 64-bit"), true);
          quarkUploadedBody += Buffer.from(req.payload || "", "base64").toString("utf8");
          headers = { Etag: url.searchParams.get("partNumber") === "1" ? "QUARK_ETAG_1" : "QUARK_ETAG_2" };
          body = "";
        } else if (url.hostname === "quark-bucket.oss.example.test" && req.method === "POST") {
          assert.equal(req.headers.some((item) => item.Authorization?.startsWith("QUARK_AUTH_KEY_")), true);
          assert.equal(req.headers.some((item) => Boolean(item["Content-MD5"])), true);
          assert.equal(req.headers.some((item) => Boolean(item["x-oss-callback"])), true);
          quarkUploadCommitBody = req.payload || "";
          body = "";
        } else if (url.hostname === "drive.quark.cn" && url.pathname.endsWith("/1/clouddrive/file/upload/finish")) {
          quarkUploadFinishBody = req.payload;
          body = {
            status: 0,
            code: 0,
            message: "success",
            data: {
              task_id: "quark-upload-task",
              finish: true,
              fid: "quark-upload-file",
            },
          };
        } else if (url.hostname === "open-api-drive.quark.cn" && url.pathname.endsWith("/open/v1/user/info")) {
          body = {
            status: 0,
            req_id: "quark-open-user",
            data: { user_id: "quark-open-user", nickname: "quark-open" },
          };
        } else if (url.hostname === "open-api-drive.quark.cn" && url.pathname.endsWith("/open/v1/file/list")) {
          body = {
            status: 0,
            req_id: "quark-open-list",
            data: {
              file_list: [{
                fid: "quark-open-file-1",
                filename: "quark-open.txt",
                file_type: "1",
                size: 15,
                created_at: 1767225600000,
                updated_at: 1767225600000,
              }],
              last_page: true,
            },
          };
        } else if (url.hostname === "open-api-drive.quark.cn" && url.pathname.endsWith("/open/v1/file/get_download_url")) {
          body = {
            status: 0,
            req_id: "quark-open-download",
            data: {
              fid: "quark-open-file-1",
              size: 15,
              file_name: "quark-open.txt",
              download_url: "https://quark-open-download.example.test/quark-open.txt",
            },
          };
        } else if (url.hostname === "open-api-drive.quark.cn" && url.pathname.endsWith("/open/v1/file/upload_pre")) {
          quarkOpenUploadPreBody = req.payload;
          body = {
            status: 0,
            req_id: "quark-open-upload-pre",
            data: {
              finish: false,
              task_id: "quark-open-upload-task",
              fid: "quark-open-upload-file",
              part_size: 8,
            },
          };
        } else if (url.hostname === "open-api-drive.quark.cn" && url.pathname.endsWith("/open/v1/file/get_upload_urls")) {
          quarkOpenUploadUrlBody = req.payload;
          body = {
            status: 0,
            req_id: "quark-open-upload-url",
            data: {
              common_headers: {
                "X-Oss-Content-Sha256": "UNSIGNED-PAYLOAD",
                "X-Oss-Date": "20260605T000000Z",
              },
              upload_urls: [{
                part_number: 1,
                part_size: 8,
                signature_info: {
                  auth_type: "OSS",
                  signature: "QUARK_OPEN_OSS_SIGNATURE_1",
                },
                upload_url: "https://quark-open-oss.example.test/part-1",
              }, {
                part_number: 2,
                part_size: 6,
                signature_info: {
                  auth_type: "OSS",
                  signature: "QUARK_OPEN_OSS_SIGNATURE_2",
                },
                upload_url: "https://quark-open-oss.example.test/part-2",
              }],
              upload_id: "quark-open-upload-id",
            },
          };
        } else if (url.hostname === "quark-open-oss.example.test" && req.method === "PUT") {
          assert.equal(req.payloadEncoding, "base64");
          assert.equal(req.headers.some((item) => item.Authorization?.startsWith("QUARK_OPEN_OSS_SIGNATURE_")), true);
          assert.equal(req.headers.some((item) => item["X-Oss-Date"] === "20260605T000000Z"), true);
          quarkOpenUploadedBody += Buffer.from(req.payload || "", "base64").toString("utf8");
          headers = { Etag: url.pathname.endsWith("part-1") ? "QUARK_OPEN_ETAG_1" : "QUARK_OPEN_ETAG_2" };
          body = "";
        } else if (url.hostname === "open-api-drive.quark.cn" && url.pathname.endsWith("/open/v1/file/upload_finish")) {
          quarkOpenUploadFinishBody = req.payload;
          body = {
            status: 0,
            req_id: "quark-open-upload-finish",
            data: {
              task_id: "quark-open-upload-task",
              fid: "quark-open-upload-file",
              finish: true,
              pdir_fid: "0",
              size: 14,
            },
          };
        } else if (url.hostname === "open-api-drive.quark.cn" && url.pathname.endsWith("/oauth/authorize")) {
          body = {
            status: 0,
            req_id: "quark-tv-authorize",
            qr_data: "QUARK_TV_QR_DATA",
            query_token: "QUARK_TV_QUERY",
          };
        } else if (url.hostname === "open-api-drive.quark.cn" && url.pathname.endsWith("/oauth/code")) {
          body = {
            status: 0,
            req_id: "quark-tv-code",
            code: "QUARK_TV_CODE",
          };
        } else if (url.hostname === "api.extscreen.com" && url.pathname.endsWith("/quarkdrive/token")) {
          body = {
            code: 200,
            message: "success",
            data: {
              access_token: "QUARK_TV_ACCESS_BY_QR",
              refresh_token: "QUARK_TV_REFRESH_BY_QR",
            },
          };
        } else if (url.hostname === "open-api-drive.quark.cn" && url.pathname.endsWith("/user") && url.searchParams.get("method") === "user_info") {
          body = {
            status: 0,
            req_id: "quark-tv-user",
            data: { nickname: "quark-tv" },
          };
        } else if (url.hostname === "open-api-drive.quark.cn" && url.pathname.endsWith("/file") && url.searchParams.get("method") === "list") {
          body = {
            status: 0,
            req_id: "quark-tv-list",
            data: {
              total_count: 1,
              files: [{
                fid: "quark-tv-file-1",
                filename: "quark-tv.txt",
                file_type: "1",
                isdir: 0,
                size: 13,
                created_at: 1767225600000,
                updated_at: 1767225600000,
              }],
            },
          };
        } else if (url.hostname === "open-api-drive.quark.cn" && url.pathname.endsWith("/file") && url.searchParams.get("method") === "download") {
          body = {
            status: 0,
            req_id: "quark-tv-download",
            data: {
              fid: "quark-tv-file-1",
              file_name: "quark-tv.txt",
              size: 13,
              download_url: "https://quark-tv-download.example.test/quark-tv.txt",
            },
          };
        } else if (url.hostname === "cloud.189.cn" && url.pathname.endsWith("/api/portal/unifyLoginForPC.action")) {
          assert.equal(url.searchParams.get("appId"), "8025431004");
          assert.equal(url.searchParams.get("clientType"), "10020");
          headers = { "Set-Cookie": ["cloud189_pc_login=1; Path=/; HttpOnly"] };
          body = `
            <input type='hidden' name='captchaToken' value='CLOUD189_PC_CAPTCHA'>
            <script>
              var lt = "CLOUD189_PC_LT";
              var paramId = "CLOUD189_PC_PARAM";
              var reqId = "CLOUD189_PC_REQ";
            </script>
          `;
        } else if (url.hostname === "cloud.189.cn" && url.pathname.endsWith("/api/portal/loginUrl.action")) {
          status = 302;
          headers = { "Set-Cookie": ["cloud189_pre=1; Path=/; HttpOnly"] };
          body = "";
          headers.Location = "https://open.e.189.cn/api/logbox/oauth2/unifyAccountLogin.do?lt=CLOUD189_LT&reqId=CLOUD189_REQ&appId=cloud";
        } else if (url.hostname === "open.e.189.cn" && url.pathname.endsWith("/api/logbox/oauth2/unifyAccountLogin.do")) {
          headers = { "Set-Cookie": ["cloud189_login_page=1; Path=/; HttpOnly"] };
          body = "";
        } else if (url.hostname === "open.e.189.cn" && url.pathname.endsWith("/api/logbox/oauth2/appConf.do")) {
          const form = parseForm(req.payload);
          assert.equal(form.version, "2.0");
          assert.equal(form.appKey, "cloud");
          body = {
            result: "0",
            data: {
              accountType: "01",
              clientType: 10010,
              isOauth2: false,
              mailSuffix: "@pan.cn",
              paramId: "CLOUD189_PARAM",
              returnUrl: "https://cloud.189.cn/web/main",
            },
          };
        } else if (url.hostname === "open.e.189.cn" && url.pathname.endsWith("/api/logbox/config/encryptConf.do")) {
          const form = parseForm(req.payload);
          assert.equal(form.appId, "cloud");
          body = {
            result: 0,
            data: {
              pre: "{RSA}",
              pubKey: cloud189RsaPubKey,
            },
          };
        } else if (url.hostname === "open.e.189.cn" && url.pathname.endsWith("/api/logbox/oauth2/loginSubmit.do")) {
          const form = parseForm(req.payload);
          cloud189LoginSubmitBody = form;
          assert.equal(form.appKey, "cloud");
          assert.equal(form.userName.startsWith("{RSA}"), true);
          assert.equal(form.epd.startsWith("{RSA}"), true);
          if (cloud189SmsMode) {
            body = {
              result: -133,
              mobile: "18900000000",
              showName: "189****0000",
            };
          } else {
            body = {
              result: 0,
              toUrl: "https://cloud.189.cn/web/main",
            };
          }
        } else if (url.hostname === "open.e.189.cn" && url.pathname.endsWith("/api/logbox/oauth2/sendSmsCodeForSecondAuth.do")) {
          cloud189SmsSentCount += 1;
          cloud189SmsSentBody = parseForm(req.payload);
          assert.equal(cloud189SmsSentBody.mobile, "18900000000");
          assert.equal(cloud189SmsSentBody.appKey, "cloud");
          body = { result: 0 };
        } else if (url.hostname === "open.e.189.cn" && url.pathname.endsWith("/api/logbox/oauth2/submitForSecondAuth.do")) {
          cloud189SmsSubmitBody = parseForm(req.payload);
          assert.equal(cloud189SmsSubmitBody.mobile, "18900000000");
          assert.equal(cloud189SmsSubmitBody.appKey, "cloud");
          assert.equal(cloud189SmsSubmitBody.userName.startsWith("{RSA}"), true);
          assert.equal(cloud189SmsSubmitBody.epd.startsWith("{RSA}"), true);
          body = {
            result: 0,
            toUrl: "https://cloud.189.cn/web/main",
          };
        } else if (url.hostname === "open.e.189.cn" && url.pathname.endsWith("/api/logbox/oauth2/getUUID.do")) {
          const form = parseForm(req.payload);
          assert.equal(form.appId, "8025431004");
          assert.equal(req.headers.some((item) => item.Cookie === "cloud189_pc_login=1"), true);
          headers = { "Set-Cookie": ["cloud189_pc_uuid=1; Path=/; HttpOnly"] };
          body = {
            uuid: "CLOUD189_PC_UUID",
            encodeuuid: "CLOUD189_PC_ENCODE_UUID",
            encryuuid: "CLOUD189_PC_ENCRY_UUID",
          };
        } else if (url.hostname === "open.e.189.cn" && url.pathname.endsWith("/api/logbox/oauth2/qrcodeLoginState.do")) {
          cloud189PcQrStateBody = parseForm(req.payload);
          assert.equal(cloud189PcQrStateBody.appId, "8025431004");
          assert.equal(cloud189PcQrStateBody.clientType, "10020");
          assert.equal(cloud189PcQrStateBody.uuid, "CLOUD189_PC_UUID");
          assert.equal(cloud189PcQrStateBody.encryuuid, "CLOUD189_PC_ENCRY_UUID");
          assert.equal(req.headers.some((item) => item.Reqid === "CLOUD189_PC_REQ"), true);
          assert.equal(req.headers.some((item) => item.lt === "CLOUD189_PC_LT"), true);
          assert.equal(req.headers.some((item) => item.Cookie === "cloud189_pc_login=1; cloud189_pc_uuid=1"), true);
          body = {
            status: 0,
            redirectUrl: "https://cloud.189.cn/web/main?pc=1",
          };
        } else if (url.hostname === "cloud.189.cn" && url.pathname.endsWith("/web/main")) {
          headers = {
            "Set-Cookie": [
              `cookieUserSession=${cloud189SmsMode ? "CLOUD189_SMS_SESSION" : "CLOUD189_USER_SESSION"}; Path=/; HttpOnly`,
            ],
          };
          body = "";
        } else if (url.hostname === "cloud.189.cn" && url.pathname.endsWith("/v2/getUserBriefInfo.action")) {
          body = {
            sessionKey: "CLOUD189_SESSION",
          };
        } else if (url.hostname === "cloud.189.cn" && url.pathname.endsWith("/api/security/generateRsaKey.action")) {
          body = {
            pubKey: cloud189RsaPubKey,
            pkId: "CLOUD189_PK_ID",
            expire: Date.now() + 60000,
          };
        } else if (url.hostname === "cloud.189.cn" && url.pathname.endsWith("/api/open/file/listFiles.action")) {
          cloud189ListCookie = req.headers.find((item) => item.Cookie)?.Cookie || "";
          if (/CLOUD189_BAD_SESSION/.test(cloud189ListCookie)) {
            body = {
              errorCode: "InvalidSessionKey",
              errorMsg: "cookieUserSession invalid",
            };
          } else if (cloud189RefreshCookieMode && /folderId=189100/.test(url.search)) {
            if (!/cookieUserSession=CLOUD189_REFRESHED_SESSION/.test(cloud189ListCookie)) {
              body = {
                errorCode: "InvalidSessionKey",
                errorMsg: "cookieUserSession invalid",
              };
            } else if (Number(url.searchParams.get("pageNum") || 1) > 1) {
              body = {
                res_code: 0,
                fileListAO: { count: 0, folderList: [], fileList: [] },
              };
            } else {
              body = {
                res_code: 0,
                fileListAO: {
                  count: 1,
                  folderList: [],
                  fileList: [{ id: 189101, name: "nested.txt", size: 3, lastOpTime: "2026-01-01 00:00:00", icon: {} }],
                },
              };
            }
          } else {
            const parentId = url.searchParams.get("folderId") || "";
            const pageNum = Number(url.searchParams.get("pageNum") || 1);
            if (cloud189RefreshCookieMode && parentId === "-11" && pageNum === 1) {
              headers = { "Set-Cookie": ["cookieUserSession=CLOUD189_REFRESHED_SESSION; Path=/; HttpOnly"] };
            }
            body = pageNum > 1
              ? {
                  res_code: 0,
                  fileListAO: { count: 0, folderList: [], fileList: [] },
                }
              : parentId === "-11"
              ? {
                  res_code: 0,
                  fileListAO: {
                    count: 1,
                    folderList: [{ id: 189100, name: "upload-dir", lastOpTime: "2026-01-01 00:00:00" }],
                    fileList: [],
                  },
                }
              : {
                  res_code: 0,
                  fileListAO: { count: 0, folderList: [], fileList: [] },
                };
          }
        } else if (url.hostname === "upload.cloud.189.cn" && url.pathname.endsWith("/person/initMultiUpload")) {
          cloud189UploadRequests.push({
            headers: req.headers,
            params: url.searchParams.get("params"),
            uri: "/person/initMultiUpload",
          });
          body = {
            code: "SUCCESS",
            data: {
              fileDataExists: 0,
              uploadFileId: "CLOUD189_UPLOAD_ID",
            },
          };
        } else if (url.hostname === "upload.cloud.189.cn" && url.pathname.endsWith("/person/getMultiUploadUrls")) {
          cloud189UploadRequests.push({
            headers: req.headers,
            params: url.searchParams.get("params"),
            uri: "/person/getMultiUploadUrls",
          });
          body = {
            code: "SUCCESS",
            uploadUrls: {
              partNumber_1: {
                requestHeader: encodeURIComponent("Content-Type=text/plain&x-request-id=CLOUD189_PART"),
                requestURL: "https://cloud189-upload.example.test/part-1",
              },
            },
          };
        } else if (url.hostname === "cloud189-upload.example.test" && req.method === "PUT") {
          assert.equal(req.headers.some((item) => item["x-request-id"] === "CLOUD189_PART"), true);
          cloud189UploadedBody = Buffer.from(req.payload || "", "base64").toString("utf8");
          body = "";
        } else if (url.hostname === "upload.cloud.189.cn" && url.pathname.endsWith("/person/commitMultiUploadFile")) {
          cloud189UploadRequests.push({
            headers: req.headers,
            params: url.searchParams.get("params"),
            uri: "/person/commitMultiUploadFile",
          });
          body = { code: "SUCCESS" };
        } else if (url.hostname === "api.cloud.189.cn" && url.pathname.endsWith("/getSessionForPC.action")) {
          if (url.searchParams.has("redirectURL")) {
            assert.equal(url.searchParams.get("redirectURL"), "https://cloud.189.cn/web/main?pc=1");
            assert.equal(url.searchParams.get("appId"), "8025431004");
            assert.equal(req.headers.some((item) => item.Cookie === "cloud189_pc_login=1; cloud189_pc_uuid=1"), true);
            body = {
              res_code: 0,
              accessToken: "CLOUD189_PC_ACCESS_BY_QR",
              refreshToken: "CLOUD189_PC_REFRESH_BY_QR",
              sessionKey: "CLOUD189_PC_SESSION",
              sessionSecret: "CLOUD189_PC_SECRET",
              familySessionKey: "CLOUD189_PC_FAMILY_SESSION",
              familySessionSecret: "CLOUD189_PC_FAMILY_SECRET",
              loginName: "cloud189-pc",
            };
          } else {
            assert.equal(url.searchParams.get("accessToken"), "CLOUD189_PC_ACCESS_BY_QR");
            body = {
              res_code: 0,
              sessionKey: "CLOUD189_PC_SESSION",
              sessionSecret: "CLOUD189_PC_SECRET",
              familySessionKey: "CLOUD189_PC_FAMILY_SESSION",
              familySessionSecret: "CLOUD189_PC_FAMILY_SECRET",
              loginName: "cloud189-pc",
            };
          }
        } else if (url.hostname === "api.cloud.189.cn" && url.pathname.endsWith("/family/manage/getQrCodeUUID.action")) {
          assert.equal(req.headers.some((item) => item.Accept === "application/json;charset=UTF-8"), true);
          body = {
            uuid: "CLOUD189_TV_UUID",
          };
        } else if (url.hostname === "api.cloud.189.cn" && url.pathname.endsWith("/family/manage/qrcodeLoginResult.action")) {
          const uuid = url.searchParams.get("uuid");
          if (uuid === "CLOUD189_TV_PENDING_UUID") {
            body = {
              res_code: "QrCodeRollLoginFail",
              res_message: "qrCodeRollLogin() - appKey=600100885,timeStamp=178326299,uuid=https://open.e.189.cn/api/account/qrClinentLogin.do?paras=new_uuid%3DCLOUD189_TV_PENDING_UUID%7C8013418323,QrCodeRollLoginFail",
            };
          } else {
            assert.equal(uuid, "CLOUD189_TV_UUID");
            body = {
              accessToken: "CLOUD189_TV_ACCESS_BY_QR",
            };
          }
        } else if (url.hostname === "api.cloud.189.cn" && url.pathname.endsWith("/family/manage/loginFamilyMerge.action")) {
          assert.equal(url.searchParams.get("e189AccessToken"), "CLOUD189_TV_ACCESS_BY_QR");
          body = {
            sessionKey: "CLOUD189_TV_SESSION",
            sessionSecret: "CLOUD189_TV_SECRET",
            familySessionKey: "CLOUD189_TV_FAMILY_SESSION",
            familySessionSecret: "CLOUD189_TV_FAMILY_SECRET",
            loginName: "cloud189-tv",
          };
        } else if (url.hostname === "api.cloud.189.cn" && url.pathname.endsWith("/family/manage/getFamilyList.action")) {
          body = {
            familyInfoResp: [{
              familyId: 189001,
              remarkName: "cloud189-tv",
            }],
          };
        } else if (url.hostname === "api.cloud.189.cn" && url.pathname.endsWith("/listFiles.action")) {
          const parentId = url.searchParams.get("folderId") || "";
          const pageNum = Number(url.searchParams.get("pageNum") || 1);
          cloud189TvListParents.push(parentId);
          body = pageNum > 1
            ? `{"fileListAO":{"count":0,"folderList":[],"fileList":[]}}`
            : parentId === "-11"
            ? `{"fileListAO":{"count":1,"folderList":[{"id":423733170035514321,"name":"big-folder","lastOpTime":"2026-01-01 00:00:00","createDate":"2026-01-01 00:00:00"}],"fileList":[]}}`
            : `{"fileListAO":{"count":1,"folderList":[],"fileList":[{"id":423733170035514399,"name":"deep.txt","size":7,"md5":"cloud189-md5","lastOpTime":"2026-01-01 00:00:00","createDate":"2026-01-01 00:00:00"}]}}`;
        } else if (url.hostname === "api.cloud.189.cn" && url.pathname.endsWith("/getUserInfo.action")) {
          body = {
            loginName: "cloud189-tv",
          };
        } else if (url.hostname === "api.oplist.org" && url.pathname.endsWith("/baiduyun/renewapi")) {
          body = {
            access_token: "BAIDU_ACCESS_REFRESHED",
            refresh_token: "BAIDU_REFRESH_REFRESHED",
          };
        } else if (url.hostname === "pan.baidu.com" && url.pathname.endsWith("/rest/2.0/xpan/file") && url.searchParams.get("method") === "list") {
          const isImageMount = url.searchParams.get("dir") === "/image";
          const isPdfMount = url.searchParams.get("dir") === "/pdf";
          const isZipMount = url.searchParams.get("dir") === "/zip";
          body = {
            errno: 0,
            list: [isZipMount ? {
              fs_id: 99004,
              server_filename: "baidu.zip",
              path: "/zip/baidu.zip",
              size: baiduZipBytes.length,
              isdir: 0,
              server_mtime: 1767225600,
              server_ctime: 1767225600,
              category: 6,
            } : isPdfMount ? {
              fs_id: 99003,
              server_filename: "baidu-doc.pdf",
              path: "/pdf/baidu-doc.pdf",
              size: 8,
              isdir: 0,
              server_mtime: 1767225600,
              server_ctime: 1767225600,
              category: 4,
            } : isImageMount ? {
              fs_id: 99002,
              server_filename: "baidu-image.png",
              path: "/image/baidu-image.png",
              size: 6,
              isdir: 0,
              server_mtime: 1767225600,
              server_ctime: 1767225600,
              category: 3,
            } : {
              fs_id: 99001,
              server_filename: "baidu-video.mp4",
              path: "/baidu-video.mp4",
              size: 12,
              isdir: 0,
              server_mtime: 1767225600,
              server_ctime: 1767225600,
              category: 1,
            }],
          };
        } else if (url.hostname === "pan.baidu.com" && url.pathname.endsWith("/rest/2.0/xpan/file") && url.searchParams.get("method") === "create") {
          const form = parseForm(req.payload);
          baiduCreateBodies.push(form);
          if (!form.uploadid) {
            body = {
              errno: 31079,
              errmsg: "rapid upload unavailable",
            };
          } else {
            body = {
              errno: 0,
              fs_id: 99009,
              path: form.path,
              server_filename: "baidu-upload.txt",
              size: Number(form.size || 0),
              isdir: 0,
              ctime: Number(form.local_ctime || 0),
              mtime: Number(form.local_mtime || 0),
            };
          }
        } else if (url.hostname === "pan.baidu.com" && url.pathname.endsWith("/rest/2.0/xpan/file") && url.searchParams.get("method") === "precreate") {
          baiduPrecreateBody = parseForm(req.payload);
          body = {
            errno: 0,
            return_type: 1,
            path: baiduPrecreateBody.path,
            uploadid: "BAIDU_UPLOAD_ID",
            block_list: [0],
          };
        } else if (url.hostname === "pan.baidu.com" && url.pathname.endsWith("/rest/2.0/xpan/multimedia") && url.searchParams.get("method") === "filemetas") {
          const isImage = url.searchParams.get("fsids") === "[99002]";
          const isPdf = url.searchParams.get("fsids") === "[99003]";
          const isZip = url.searchParams.get("fsids") === "[99004]";
          body = {
            errno: 0,
            list: [{
              dlink: isZip ? "https://d.pcs.baidu.com/file/baidu.zip?fid=99004" : isPdf ? "https://d.pcs.baidu.com/file/baidu-doc.pdf?fid=99003" : isImage ? "https://d.pcs.baidu.com/file/baidu-image.png?fid=99002" : "https://d.pcs.baidu.com/file/baidu-video.mp4?fid=99001",
            }],
          };
        } else if (url.hostname === "pan.baidu.com" && url.pathname.endsWith("/api/mediainfo") && url.searchParams.get("type") === "VideoURL") {
          body = {
            errno: 0,
            info: {
              dlink: "https://baidu-cdn.example.test/baidu-video.mp4?crack_video=1",
            },
          };
        } else if (url.hostname === "d.pcs.baidu.com" && req.method === "HEAD") {
          assert.equal(req.redirect, false);
          headers = { Location: url.pathname.endsWith("baidu.zip") ? "https://baidu-cdn.example.test/baidu.zip?final=1" : url.pathname.endsWith("baidu-doc.pdf") ? "https://baidu-cdn.example.test/baidu-doc.pdf?final=1" : url.pathname.endsWith("baidu-image.png") ? "https://baidu-cdn.example.test/baidu-image.png?final=1" : "https://baidu-cdn.example.test/baidu-video.mp4?final=1" };
          body = "";
        } else if (url.hostname === "d.pcs.baidu.com" && url.pathname.endsWith("/rest/2.0/pcs/file") && url.searchParams.get("method") === "locateupload") {
          baiduLocateQuery = Object.fromEntries(url.searchParams);
          body = {
            errno: 0,
            servers: [{ server: "https://baidu-upload.example.test" }],
            bak_servers: [],
          };
        } else if (url.hostname === "baidu-upload.example.test" && url.pathname.endsWith("/rest/2.0/pcs/superfile2")) {
          baiduSuperfileQuery = Object.fromEntries(url.searchParams);
          assert.equal(req.method, "POST");
          assert.equal(req.payloadEncoding, "base64");
          const uploaded = Buffer.from(req.payload || "", "base64").toString("utf8");
          assert.match(uploaded, /name="file"; filename="baidu-upload.txt"/);
          baiduUploadedBody = uploaded.includes("\r\n\r\nbaidu-put\r\n") ? "baidu-put" : uploaded;
          body = {
            errno: 0,
            md5: crypto.createHash("md5").update("baidu-put").digest("hex"),
          };
        } else if (url.hostname === "baidu-cdn.example.test" && req.method === "GET") {
          const range = req.headers.find((item) => item.Range)?.Range || "";
          assert.equal(Object.hasOwn(req, "contentType"), false);
          assert.equal(Object.hasOwn(req, "payload"), false);
          assert.equal(Object.hasOwn(req, "payloadEncoding"), false);
          if (range) status = 206;
          contentType = url.pathname.endsWith("baidu.zip") ? "application/zip" : url.pathname.endsWith("baidu-doc.pdf") ? "application/pdf" : url.pathname.endsWith("baidu-image.png") ? "image/png" : "video/mp4";
          const source = url.pathname.endsWith("baidu.zip")
            ? baiduZipBytes
            : Buffer.from(url.pathname.endsWith("baidu-doc.pdf") ? "pdf" : url.pathname.endsWith("baidu-image.png") ? "image" : "baidu video");
          const rangeMatch = range.match(/^bytes=(\d+)-(\d*)$/);
          const start = rangeMatch ? Number(rangeMatch[1]) : 0;
          const end = rangeMatch && rangeMatch[2] ? Number(rangeMatch[2]) : source.length - 1;
          const slice = source.subarray(Math.min(start, source.length), Math.min(end + 1, source.length));
          if (url.pathname.endsWith("baidu.zip")) baiduArchiveRanges.push(range);
          headers = {
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${Math.max(start, start + slice.length - 1)}/${source.length}`,
            "Content-Length": String(slice.length),
          };
          body = slice.toString("base64");
        } else if (url.hostname === "passportapi.115.com" && url.pathname.endsWith("/check/sso")) {
          body = {
            code: 0,
            data: { user_id: 1150001 },
            state: 0,
          };
        } else if (url.hostname === "qrcodeapi.115.com" && url.pathname.endsWith("/token")) {
          headers = { "Set-Cookie": ["QR_TOKEN_COOKIE=token-cookie; Path=/; Domain=.115.com"] };
          body = {
            errno: 0,
            state: true,
            data: {
              qrcode: "https://qrcodeapi.115.com/mock-qrcode-content",
              sign: "115_QR_SIGN",
              time: 1767225600,
              uid: "115_QR_UID",
            },
          };
        } else if (url.hostname === "qrcodeapi.115.com" && url.pathname.endsWith("/get/status/")) {
          assert.equal(url.pathname, "/get/status/");
          headers = { "Set-Cookie": ["QR_STATUS_COOKIE=status-cookie; Path=/; Domain=.115.com"] };
          pan115QrStatusCalls += 1;
          body = {
            errno: 0,
            state: true,
            data: {
              msg: pan115QrStatusCalls >= 1 ? "allowed" : "waiting",
              status: pan115QrStatusCalls >= 1 ? 2 : 0,
            },
          };
        } else if (url.hostname === "passportapi.115.com" && url.pathname.endsWith("/login/qrcode")) {
          assert.match(url.pathname, /\/login\/qrcode$/);
          assert.equal(req.contentType, "application/x-www-form-urlencoded");
          assert.equal(req.payloadEncoding, "json");
          const cookie = req.headers.find((item) => item.Cookie)?.Cookie || "";
          assert.match(cookie, /QR_TOKEN_COOKIE=token-cookie/);
          assert.match(cookie, /QR_STATUS_COOKIE=status-cookie/);
          pan115QrLoginPaths.push(url.pathname);
          assert.equal(url.pathname, "/app/1.0/web/1.0/login/qrcode");
          assert.equal(req.payload, "account=115_QR_UID&app=web");
          body = {
            data: {
              cookie: {
                UID: "115_QR_UID",
                CID: "115_QR_CID",
                SEID: "115_QR_SEID",
                KID: "115_QR_KID",
              },
            },
            errno: 0,
            state: true,
          };
        } else if (url.hostname === "proapi.115.com" && url.pathname === "/app/chrome/downurl") {
          assert.equal(req.method, "POST");
          assert.equal(req.contentType, "application/x-www-form-urlencoded");
          assert.equal(req.payloadEncoding, "json");
          pan115DownurlCalls += 1;
          const form = parseForm(req.payload);
          assert.ok(form.data);
          assert.doesNotMatch(form.data, /\s/);
          const cookie = req.headers.find((item) => item.Cookie)?.Cookie || "";
          assert.match(cookie, /UID=115_UID/);
          headers = { "Set-Cookie": ["DOWNURL_COOKIE=downurl-cookie; Path=/; Domain=.115.com"] };
          body = { data: "", errno: 0, state: true };
        } else if (url.hostname === "webapi.115.com" && url.pathname === "/files" && req.method === "GET") {
          const cid = url.searchParams.get("cid") || "0";
          body = {
            cid,
            count: cid === "0" ? 3 : 0,
            data: cid === "0"
              ? [
                  {
                    cid: "115-folder-1",
                    n: "target",
                    pid: "0",
                    t: "1767225600",
                    tp: "1767225600",
                  },
                  {
                    cid: "0",
                    fid: "115-file-1",
                    n: "115-doc.txt",
                    pc: "pick-115-doc",
                    s: "15",
                    sha: "115SHA1",
                    t: "2026-01-01 00:00",
                    tp: "1767225600",
                    u: "https://thumb.example.test/115-doc.jpg",
                  },
                  {
                    cid: "0",
                    fid: "115-file-no-pc",
                    n: "115-no-pc.txt",
                    pc: [],
                    s: "15",
                    sha: "115NOPC",
                    t: "2026-01-01 00:00",
                    tp: "1767225600",
                  },
                ]
              : [],
            errno: 0,
            offset: Number(url.searchParams.get("offset") || 0),
            state: true,
          };
        } else if (url.hostname === "webapi.115.com" && url.pathname === "/files/get_info") {
          assert.equal(url.searchParams.get("file_id"), "115-file-no-pc");
          body = {
            data: [{
              file_id: "115-file-no-pc",
              name: "115-no-pc.txt",
              pick_code: "pick-115-no-pc",
              size: "15",
              sha1: "115NOPC",
              update_time: "2026-01-01 00:00",
              create_time: "1767225600",
            }],
            errno: 0,
            state: true,
          };
        } else if (url.hostname === "webapi.115.com" && url.pathname === "/files/add") {
          pan115Forms.push({ path: url.pathname, form: parseForm(req.payload) });
          body = { cid: "115-new-dir", cname: "new-dir", errno: 0, file_id: "115-new-dir", state: true };
        } else if (url.hostname === "webapi.115.com" && ["/files/move", "/files/copy", "/files/batch_rename"].includes(url.pathname)) {
          pan115Forms.push({ path: url.pathname, form: parseForm(req.payload) });
          body = { errno: 0, state: true };
        } else if (url.hostname === "webapi.115.com" && url.pathname === "/rb/delete") {
          pan115Forms.push({ path: url.pathname, form: parseForm(req.payload) });
          body = { errno: 0, state: true };
        } else if (url.hostname === "webapi.115.com" && url.pathname === "/files/index_info") {
          body = {
            data: {
              space_info: {
                all_total: { size: "1000", size_format: "1000B" },
                all_use: { size: "300", size_format: "300B" },
              },
            },
            errno: 0,
            state: true,
          };
        } else if (url.hostname === "proapi.115.com" && url.pathname === "/open/user/info") {
          body = {
            code: 0,
            data: {
              user_id: 1152001,
              rt_space_info: {
                all_total: { size: "2000" },
                all_use: { size: "600" },
              },
            },
          };
        } else if (url.hostname === "proapi.115.com" && url.pathname === "/open/ufile/files") {
          const cid = url.searchParams.get("cid") || "0";
          body = {
            code: 0,
            data: cid === "0"
              ? [
                  {
                    fid: "115-open-folder-1",
                    fn: "target",
                    fc: "0",
                    upt: 1767225600,
                    uppt: 1767225600,
                  },
                  {
                    fid: "115-open-file-1",
                    fn: "115-open-doc.txt",
                    fc: "1",
                    fs: 21,
                    pc: "pick-115-open-doc",
                    sha1: "115OPENSH1",
                    upt: 1767225600,
                    uppt: 1767225600,
                    thumbnail: "https://thumb.example.test/115-open-doc.jpg",
                  },
                ]
              : [],
            count: cid === "0" ? 2 : 0,
          };
        } else if (url.hostname === "proapi.115.com" && ["/open/folder/add", "/open/ufile/move", "/open/ufile/copy", "/open/ufile/delete", "/open/ufile/update"].includes(url.pathname)) {
          pan115OpenForms.push({ path: url.pathname, form: parseForm(req.payload) });
          body = { code: 0, data: {} };
        } else if (url.hostname === "proapi.115.com" && url.pathname === "/open/ufile/downurl") {
          body = {
            code: 0,
            data: {
              "115-open-file-1": {
                file_size: 21,
                url: { url: "https://115-open-download.example.test/115-open-doc.txt" },
              },
            },
          };
        } else if (url.hostname === "115-open-download.example.test" && req.method === "GET") {
          contentType = "text/plain";
          body = "115 open doc";
        } else if (url.hostname === "115cdn.com" && url.pathname === "/webapi/share/snap") {
          pan115ShareQueries.push(Object.fromEntries(url.searchParams.entries()));
          const cid = url.searchParams.get("cid") || "0";
          body = {
            errno: 0,
            state: true,
            data: {
              count: cid === "0" ? 2 : 0,
              list: cid === "0"
                ? [
                    {
                      cid: "115-share-folder-1",
                      file_name: "share-folder",
                      is_file: 0,
                      update_time: "1767225600",
                    },
                    {
                      file_id: "115-share-file-1",
                      file_name: "115-share-doc.txt",
                      is_file: 1,
                      sha1: "115SHARESHA1",
                      size: 23,
                      thumb_url: "https://thumb.example.test/115-share-doc.jpg",
                      update_time: "1767225600",
                    },
                  ]
                : [],
            },
          };
        } else if (url.hostname === "115cdn.com" && url.pathname === "/webapi/share/downurl") {
          body = {
            errno: 0,
            state: true,
            data: {
              fid: "115-share-file-1",
              fn: "115-share-doc.txt",
              fs: 23,
              url: { url: "https://115-share-download.example.test/115-share-doc.txt" },
            },
          };
        } else if (url.hostname === "115-share-download.example.test" && req.method === "GET") {
          contentType = "text/plain";
          body = "115 share doc";
        } else if (url.hostname === "openlist-login.example.test" && url.pathname.endsWith("/api/auth/login")) {
          body = {
            code: 200,
            message: "success",
            data: { token: "OPENLIST_TOKEN_REFRESHED" },
          };
        } else if (url.hostname === "openlist-login.example.test" && url.pathname.endsWith("/api/fs/list")) {
          const auth = req.headers.find((item) => item.Authorization)?.Authorization || "";
          body = auth === "OPENLIST_TOKEN_REFRESHED"
            ? {
                code: 200,
                message: "success",
                data: {
                  content: [{ name: "remote-login.txt", size: 11, is_dir: false, modified: new Date().toISOString(), created: new Date().toISOString() }],
                  total: 1,
                  write: true,
                  provider: "OpenList",
                },
              }
            : {
                code: 401,
                message: "unauthorized",
                data: null,
              };
        } else if (url.pathname.endsWith("/api/fs/other")) {
          openListOtherBody = req.payload;
          body = {
            code: 200,
            message: "success",
            data: {
              echoed_method: req.payload?.method || "",
              echoed_path: req.payload?.path || "",
              echoed_data: req.payload?.data || null,
            },
          };
        } else if (url.pathname.endsWith("/api/fs/rename")) {
          openListRenameBodies.push(req.payload);
          body = {
            code: 200,
            message: "success",
            data: null,
          };
        } else if (url.pathname.endsWith("/api/fs/move")) {
          openListMoveBodies.push(req.payload);
          body = {
            code: 200,
            message: "success",
            data: null,
          };
        } else if (url.pathname.endsWith("/api/fs/remove")) {
          openListRemoveBodies.push(req.payload);
          body = {
            code: 200,
            message: "success",
            data: null,
          };
        } else if (url.pathname.endsWith("/api/fs/list")) {
          const listPath = req.payload?.path || "/";
          const content = listPath === "/folder"
            ? [{ name: "nested.txt", size: 12, is_dir: false, modified: new Date().toISOString(), created: new Date().toISOString() }]
            : listPath === "/empty-dir" || listPath === "/target"
              ? []
              : [
                  { name: "remote.txt", size: 11, is_dir: false, modified: new Date().toISOString(), created: new Date().toISOString() },
                  { name: "folder", size: 0, is_dir: true, modified: new Date().toISOString(), created: new Date().toISOString() },
                  { name: "empty-dir", size: 0, is_dir: true, modified: new Date().toISOString(), created: new Date().toISOString() },
                ];
          body = {
            code: 200,
            message: "success",
            data: {
              content,
              total: content.length,
              write: true,
              provider: "OpenList",
            },
          };
        } else if (url.hostname === "example.test" && url.pathname.endsWith("/remote.zip") && req.method === "GET") {
          contentType = "application/zip";
          body = openListZipBytes.toString("base64");
        } else if (url.pathname.endsWith("/api/fs/get")) {
          const getPath = req.payload?.path || "/remote.txt";
          body = {
            code: 200,
            message: "success",
            data: getPath.endsWith("relative.txt")
              ? { name: "relative.txt", size: 13, is_dir: false, raw_url: "/d/relative.txt" }
              : getPath.endsWith("remote.zip")
                ? { name: "remote.zip", size: openListZipBytes.byteLength, is_dir: false, raw_url: "https://example.test/remote.zip" }
              : { name: "remote.txt", size: 11, is_dir: false, raw_url: "https://example.test/remote.txt" },
          };
        }
        const responseBody = typeof body === "string" && url.hostname === "s3.example.test" && req.responseEncoding === "base64"
          ? Buffer.from(body).toString("base64")
          : typeof body === "string" ? body : JSON.stringify(body);
        return jsonBody({
          code: 0,
          msg: "ok",
          data: {
            url: req.url,
            status,
            contentType,
            body: responseBody,
            bodyEncoding: url.hostname === "baidu-cdn.example.test" || url.hostname === "example.test" || (url.hostname === "s3.example.test" && req.responseEncoding === "base64") ? "base64" : "text",
            headers,
            elapsed: 1,
          },
        });
      }
      if (path === "/api/system/getConf") {
        return jsonBody({
          code: 0,
          msg: "ok",
          data: {
            conf: {
              user: {
                userId: "siyuan-user-id",
                userName: "siyuan-user",
                userNickname: "Siyuan User",
                userAvatarURL: "https://avatar.example.test/siyuan.png",
              },
            },
          },
        });
      }
      if (path === "/api/file/getFile") {
        return {
          ok: false,
          status: 404,
          statusText: "not found",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          async json() {
            return { code: 404, msg: "not found", data: null };
          },
          async text() {
            return "";
          },
        };
      }
      if (path === "/api/file/readDir") {
        const req = JSON.parse(init.body || "{}");
        const dirs = {
          "": [
            { name: "data", isDir: true, size: 0, updated: 1780000000 },
            { name: "search-root", isDir: true, size: 0, updated: 1780000000 },
          ],
          "data": [
            { name: "assets", isDir: true, size: 0, updated: 1780000000 },
            { name: "widgets", isDir: true, size: 0, updated: 1780000000 },
          ],
          "data/assets": [{ name: "workspace-hit.pdf", isDir: false, size: 4, updated: 1780000000 }],
          "data/widgets": [{ name: "workspace-widget.mp4", isDir: false, size: 4, updated: 1780000000 }],
          "E:/openlist-local": [{ name: "local-file.txt", isDir: false, size: 5, updated: 1780000000 }],
          "search-root": [{ name: "nested", isDir: true, size: 0, updated: 1780000000 }],
          "search-root/nested": [{ name: "workspace-hit.md", isDir: false, size: 13, updated: 1780000000 }],
        };
        return jsonBody({ code: 0, msg: "ok", data: dirs[String(req.path || "").replace(/^\/+/, "")] || [] });
      }
      return {
        ok: true,
        status: 200,
        statusText: "ok",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        async json() {
          return { code: 0, msg: "ok", data: [] };
        },
        async text() {
          return "[]";
        },
      };
    },
  },
  logger: {
    info() {},
    warn() {},
  },
  plugin: {
    lifecycle: {},
  },
  rpc: {
    async bind(method, handler) {
      rpcHandlers.set(method, handler);
    },
  },
  server: {
    private: {
      http: {},
    },
  },
  storage: {
    async get(path) {
      if (!storageData.has(path)) throw new Error("not found");
      return jsonBody(JSON.parse(storageData.get(path)));
    },
    async put(path, content) {
      storageData.set(path, content);
    },
  },
};

await import("../src/kernel/index.js");
await globalThis.siyuan.plugin.lifecycle.onload();

const rpcStatus = await rpcHandlers.get("siyuan-cloud.status")?.();
assert.equal(rpcStatus?.ok, true);
assert.ok(rpcStatus.routes.includes("POST /api/fs/torrent/parse"));
assert.ok(rpcStatus.stages.some((item) => item.key === "torrent" && item.status === "active"));
assert.ok(rpcStatus.stages.some((item) => item.key === "archive" && item.status === "active"));

const request = ({ method = "GET", path = "/", query = "", body, headers = {}, auth = true }) => ({
  context: { path },
  request: {
    body: body === undefined ? undefined : { data: body },
    headers: auth && !Object.keys(headers).some((key) => key.toLowerCase() === "authorization")
      ? { Authorization: "siyuan-cloud-token", ...headers }
      : headers,
    method,
  },
  url: { path, query },
});

const call = async (input) => globalThis.siyuan.server.private.http.handler(request(input));

const json = async (input) => {
  const response = await call(input);
  assert.equal(response.headers["Content-Type"][0].startsWith("application/json"), true, input.path);
  return response.body.data.data;
};

const waitFor = async (callback, attempts = 20) => {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    last = await callback();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return last;
};

const text = async (input) => {
  const response = await call(input);
  const body = response.body.raw
    ? Buffer.from(response.body.raw.data).toString("utf8")
    : response.body.string.values.join("");
  return {
    response,
    text: body,
  };
};

const signedS3Headers = ({ body = "", method = "GET", path, query = "" }) => signAwsV4({
  accessKeyId: "S3AK",
  body,
  headers: { Host: "localhost" },
  method,
  region: "us-east-1",
  secretAccessKey: "S3SK",
  url: `http://localhost${path}${query ? `?${query}` : ""}`,
});

const status = await json({ path: "/siyuan-cloud/status" });
assert.equal(status.code, 200);
assert.equal(status.data.ok, true);
assert.ok(status.data.routes.includes("POST /api/fs/mkdir"));
assert.ok(status.data.routes.includes("POST /api/fs/get_direct_upload_info"));
assert.ok(status.data.routes.includes("POST /api/fs/torrent/parse"));
assert.ok(status.data.stages.some((item) => item.key === "torrent" && item.status === "active"));
assert.ok(status.data.stages.some((item) => item.key === "archive" && item.status === "active"));
assert.ok(status.data.adapters.includes("115_cloud"));
assert.ok(status.data.adapters.includes("wps"));
assert.ok(status.data.capability_summary.partial > 0);
assert.equal(status.data.driver_capabilities["189CloudPC"].methods.put, "placeholder");
assert.equal(status.data.driver_capabilities.WPS.methods.put, "placeholder");
assert.equal(status.data.driver_capabilities.WPS.methods.details, "done");
assert.ok(status.data.routes.includes("GET /api/authn/webauthn_begin_login"));

const me = await json({ path: "/api/me" });
assert.equal(me.code, 200);
assert.equal(me.data.username, "Siyuan User");
assert.equal(me.data.role, 2);
assert.equal(me.data.password, "");
assert.equal(me.data.siyuan_account.user_id, "siyuan-user-id");
const login = await json({
  body: { username: "Siyuan User", password: "" },
  method: "POST",
  path: "/api/auth/login",
});
assert.equal(login.code, 200);
assert.equal(login.data.username, "Siyuan User");
assert.match(login.data.token, /^[^.]+\.[^.]+\.[^.]+$/);
const jwtMe = await json({
  auth: false,
  headers: { Authorization: login.data.token },
  path: "/api/me",
});
assert.equal(jwtMe.data.username, "Siyuan User");
const logout = await json({
  auth: false,
  headers: { Authorization: login.data.token },
  method: "POST",
  path: "/api/auth/logout",
});
assert.equal(logout.code, 200);
const loggedOutMe = await json({
  auth: false,
  headers: { Authorization: login.data.token },
  path: "/api/me",
});
assert.equal(loggedOutMe.code, 401);
assert.match(loggedOutMe.message, /logged out/);
const relogin = await json({
  body: { username: "Siyuan User", password: "" },
  method: "POST",
  path: "/api/auth/login",
});
assert.equal(relogin.code, 200);
const reloginMe = await json({
  auth: false,
  headers: { Authorization: relogin.data.token },
  path: "/api/me",
});
assert.equal(reloginMe.data.username, "Siyuan User");
const guestMe = await json({ auth: false, path: "/api/me" });
assert.equal(guestMe.data.username, "guest");
const guestAdminDenied = await json({ auth: false, path: "/api/admin/user/list" });
assert.equal(guestAdminDenied.code, 401);
assert.match(guestAdminDenied.message, /Guest user is disabled/);
const ldapLogin = await json({
  body: { username: "Siyuan User", password: "" },
  method: "POST",
  path: "/api/auth/login/ldap",
});
assert.equal(ldapLogin.code, 501);
const userCreate = await json({
  body: {
    username: "reader",
    password: "reader-pass",
    base_path: "/docs",
    permission: 256,
  },
  method: "POST",
  path: "/api/admin/user/create",
});
assert.equal(userCreate.code, 200);
assert.equal(userCreate.data.username, "reader");
assert.equal(userCreate.data.password, "");
assert.equal(userCreate.data.pwd_hash, undefined);
assert.equal(userCreate.data.pwd_salt, undefined);
const userList = await json({ path: "/api/admin/user/list" });
assert.equal(userList.code, 200);
assert.equal(userList.data.total, 3);
assert.equal(userList.data.content.some((item) => item.username === "guest" && item.disabled), true);
const userUpdate = await json({
  body: {
    id: userCreate.data.id,
    username: "reader",
    base_path: "/docs-updated",
    permission: 384,
    role: 0,
  },
  method: "POST",
  path: "/api/admin/user/update",
});
assert.equal(userUpdate.code, 200);
const userGet = await json({ path: "/api/admin/user/get", query: `id=${userCreate.data.id}` });
assert.equal(userGet.data.base_path, "/docs-updated");
assert.equal(userGet.data.permission, 384);
const readerLogin = await json({
  body: { username: "reader", password: "reader-pass" },
  method: "POST",
  path: "/api/auth/login",
});
assert.equal(readerLogin.code, 200);
const readerHashLogin = await json({
  body: { username: "reader", password: staticPasswordHash("reader-pass") },
  method: "POST",
  path: "/api/auth/login/hash",
});
assert.equal(readerHashLogin.code, 200);
const readerAdminDenied = await json({
  auth: false,
  headers: { Authorization: readerLogin.data.token },
  path: "/api/admin/user/list",
});
assert.equal(readerAdminDenied.code, 403);
assert.equal(readerAdminDenied.message, "You are not an admin");
await json({
  body: {
    id: userCreate.data.id,
    username: "reader",
    base_path: "/docs-updated",
    password: "reader-pass-new",
    permission: 384,
    role: 0,
  },
  method: "POST",
  path: "/api/admin/user/update",
});
const readerOldTokenAdmin = await json({
  auth: false,
  headers: { Authorization: readerLogin.data.token },
  path: "/api/admin/user/list",
});
assert.equal(readerOldTokenAdmin.code, 401);
assert.match(readerOldTokenAdmin.message, /Password has been changed/);
const readerOldTokenMe = await json({
  auth: false,
  headers: { Authorization: readerLogin.data.token },
  path: "/api/me",
});
assert.equal(readerOldTokenMe.code, 401);
assert.match(readerOldTokenMe.message, /Password has been changed/);
const userAdminDisabled = await json({
  body: { id: 1, username: "Siyuan User", role: 2, disabled: true },
  method: "POST",
  path: "/api/admin/user/update",
});
assert.equal(userAdminDisabled.code, 400);
const userCreateAdmin = await json({
  body: { username: "next-admin", role: 2 },
  method: "POST",
  path: "/api/admin/user/create",
});
assert.equal(userCreateAdmin.code, 400);
const userDelete = await json({
  body: { id: userCreate.data.id },
  method: "POST",
  path: "/api/admin/user/delete",
});
assert.equal(userDelete.code, 200);

const apiIndex = await json({ path: "/api/public/api" });
assert.equal(apiIndex.code, 200);
assert.equal(apiIndex.data.base_url, "/plugin/private/siyuan-cloud");
assert.equal(apiIndex.data.api_base, "/plugin/private/siyuan-cloud/api");
assert.equal(apiIndex.data.endpoints.download, "/plugin/private/siyuan-cloud/d/{path}");
assert.equal(apiIndex.data.endpoints.proxy, "/plugin/private/siyuan-cloud/p/{path}");
assert.equal(apiIndex.data.endpoints.webdav, "/plugin/private/siyuan-cloud/dav");
assert.equal(apiIndex.data.endpoints.s3, "/plugin/private/siyuan-cloud/s3");
assert.ok(apiIndex.data.capabilities.includes("openlist.http-api"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.torrent.parse"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.torrent.generate"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.torrent.rapid-upload.driver-boundary"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.archive.zip-list"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.archive.zip-extract-stored"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.archive.zip-extract-deflate"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.archive.zip-encrypted-detect"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.archive.zip-decompress-virtual"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.archive.decompress-upload-mounted"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.archive.tar-list"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.archive.tgz-extract"));
assert.ok(apiIndex.data.capabilities.includes("openlist.share.archive.zip-extract"));
assert.ok(apiIndex.data.capabilities.includes("openlist.share.archive.meta-list"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.archive.driver-paths"));
assert.ok(apiIndex.data.capability_summary.done > 0);
assert.ok(apiIndex.data.capability_summary.partial > 0);
assert.ok(apiIndex.data.capability_summary.placeholder > 0);
assert.ok(apiIndex.data.capability_summary.unsupported > 0);
assert.equal(apiIndex.data.capability_matrix.find((item) => item.key === "openlist.task")?.status, "partial");
assert.equal(apiIndex.data.capability_matrix.find((item) => item.key === "openlist.fs.offline-download")?.status, "placeholder");
assert.equal(apiIndex.data.capability_matrix.find((item) => item.key === "openlist.fs.archive.zip-decrypt")?.status, "unsupported");
assert.equal(apiIndex.data.driver_capabilities["115 Cloud"].methods.put, "placeholder");
assert.equal(apiIndex.data.driver_capabilities["115 Open"].methods.details, "done");
assert.equal(apiIndex.data.driver_capabilities["115 Open"].methods.put, "placeholder");
assert.equal(apiIndex.data.driver_capabilities["115 Share"].methods.put, "unsupported");
assert.equal(apiIndex.data.driver_capabilities["189CloudPC"].methods.rapid_upload, "placeholder");
assert.equal(apiIndex.data.driver_capabilities.QuarkTV.methods.put, "unsupported");
assert.equal(apiIndex.data.driver_capabilities.WPS.methods.put, "placeholder");
assert.equal(apiIndex.data.driver_capabilities.WPS.methods.details, "done");
assert.ok(apiIndex.data.routes.some((item) => item.method === "ANY" && item.path === "/api/fs/get"));
assert.ok(apiIndex.data.routes.some((item) => item.method === "ANY" && item.path === "/api/public/api"));
assert.ok(apiIndex.data.routes.some((item) => item.method === "POST" && item.path === "/api/fs/torrent/generate"));
const archiveExtensions = await json({ path: "/api/public/archive_extensions" });
assert.equal(archiveExtensions.code, 200);
assert.ok(archiveExtensions.data.includes(".zip"));
assert.ok(archiveExtensions.data.includes(".zip.001"));
assert.ok(archiveExtensions.data.includes(".part1.rar"));
assert.ok(archiveExtensions.data.includes(".tzst"));

const mkdir = await json({
  body: { path: "/smoke" },
  method: "POST",
  path: "/api/fs/mkdir",
});
assert.equal(mkdir.code, 200);

const put = await json({
  body: { content: "hello", path: "/smoke/a.txt" },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(put.code, 200);

const putBinary = await call({
  body: Uint8Array.from([0, 1, 2, 3]),
  headers: {
    "Content-Type": "application/octet-stream",
    "File-Path": "/smoke/binary.bin",
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(putBinary.statusCode, 200);

const directUploadInfo = await json({
  body: { path: "/smoke/direct.txt" },
  method: "POST",
  path: "/api/fs/get_direct_upload_info",
});
assert.equal(directUploadInfo.code, 200);
assert.equal(directUploadInfo.data, null);

const formUpload = await call({
  body: {
    files: {
      file: [{
        data: Uint8Array.from([104, 101, 108, 108, 111]),
        filename: "form.txt",
        headers: { "Content-Type": ["text/plain"] },
        size: 5,
      }],
    },
  },
  headers: {
    "File-Path": "/smoke/form.txt",
  },
  method: "PUT",
  path: "/api/fs/form",
});
assert.equal(formUpload.statusCode, 200);

const spacedPut = await json({
  body: { content: "space", path: "/smoke/spaced .txt" },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(spacedPut.code, 200);
const spacedBatchRename = await json({
  body: {
    rename_objects: [{
      new_name: "renamed spaced .txt",
      src_name: "spaced .txt",
    }],
    src_dir: "/smoke",
  },
  method: "POST",
  path: "/api/fs/batch_rename",
});
assert.equal(spacedBatchRename.code, 200);

const list = await json({
  body: { path: "/smoke", page: 1, per_page: 20 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(list.code, 200);
assert.equal(list.data.content.some((item) => item.name === "a.txt"), true);
assert.equal(list.data.content.some((item) => item.name === "binary.bin"), true);
assert.equal(list.data.content.some((item) => item.name === "form.txt"), true);
assert.equal(list.data.content.some((item) => item.name === "renamed spaced .txt"), true);

const binaryRead = await call({
  method: "GET",
  path: "/d/smoke/binary.bin",
});
assert.equal(binaryRead.statusCode, 200);
assert.equal(binaryRead.body.raw.contentType, "application/octet-stream");
assert.equal(new Uint8Array(binaryRead.body.raw.data).length, 4);

const propfind = await text({
  headers: { Depth: "1" },
  method: "PROPFIND",
  path: "/dav/smoke",
});
assert.equal(propfind.response.statusCode, 207);
assert.match(propfind.text, /a\.txt/);

const webdavPut = await text({
  body: "from webdav",
  headers: { "Content-Type": "text/plain; charset=utf-8" },
  method: "PUT",
  path: "/dav/smoke/b.txt",
});
assert.equal(webdavPut.response.statusCode, 201);

const webdavMove = await text({
  headers: { Destination: "/dav/smoke/c.txt" },
  method: "MOVE",
  path: "/dav/smoke/b.txt",
});
assert.equal(webdavMove.response.statusCode, 201);

const webdavReadOnlyUser = await json({
  body: {
    base_path: "/",
    permission: 1 << 8,
    username: "webdav-readonly",
  },
  method: "POST",
  path: "/api/admin/user/create",
});
assert.equal(webdavReadOnlyUser.code, 200);
const webdavReadOnlyToken = "siyuan-cloud-port:" + webdavReadOnlyUser.data.id;
const webdavReadOnlyPropfind = await text({
  headers: { Authorization: webdavReadOnlyToken, Depth: "0" },
  method: "PROPFIND",
  path: "/dav/smoke",
});
assert.equal(webdavReadOnlyPropfind.response.statusCode, 207);
const webdavReadOnlyPut = await text({
  body: "blocked",
  headers: { Authorization: webdavReadOnlyToken },
  method: "PUT",
  path: "/dav/smoke/readonly-denied.txt",
});
assert.equal(webdavReadOnlyPut.response.statusCode, 403);
await json({
  body: {
    id: webdavReadOnlyUser.data.id,
    username: "webdav-readonly",
    base_path: "/",
    permission: (1 << 8) | (1 << 9),
  },
  method: "POST",
  path: "/api/admin/user/update",
});
const webdavManagePut = await text({
  body: "allowed",
  headers: { Authorization: webdavReadOnlyToken },
  method: "PUT",
  path: "/dav/smoke/manage-allowed.txt",
});
assert.equal(webdavManagePut.response.statusCode, 201);

const archive = await json({
  body: { path: "/smoke/a.txt" },
  method: "POST",
  path: "/api/fs/archive/meta",
});
assert.equal(archive.code, 501);
assert.equal(archive.data.operation, "meta");
const archiveZipBytes = makeZip([
  { name: "archive-root/", content: "" },
  { name: "archive-root/hello.txt", content: "hello archive" },
  { name: "nested/", content: "" },
  { name: "nested/world.txt", content: "world" },
]);
const archiveZipPut = await call({
  body: archiveZipBytes,
  headers: {
    "Content-Type": "application/zip",
    "File-Path": "/smoke/test.zip",
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(archiveZipPut.statusCode, 200);
const archiveZipMeta = await json({
  body: { path: "/smoke/test.zip" },
  method: "POST",
  path: "/api/fs/archive/meta",
});
assert.equal(archiveZipMeta.code, 200);
assert.equal(archiveZipMeta.data.raw_url, "/plugin/private/siyuan-cloud/ae/smoke/test.zip");
assert.equal(archiveZipMeta.data.content.some((item) => item.name === "archive-root"), true);
assert.equal(archiveZipMeta.data.content.some((item) => item.name === "nested"), true);
assert.equal(archiveZipMeta.data.content.find((item) => item.name === "archive-root").children.some((child) => child.name === "hello.txt"), true);
const archiveZipList = await json({
  body: { inner_path: "archive-root", page: 1, path: "/smoke/test.zip", per_page: 10 },
  method: "POST",
  path: "/api/fs/archive/list",
});
assert.equal(archiveZipList.code, 200);
assert.equal(archiveZipList.data.total, 1);
assert.equal(archiveZipList.data.content[0].name, "hello.txt");
const archiveLimitedUser = await json({
  body: {
    base_path: "/smoke",
    permission: 0,
    username: "archive-limited",
  },
  method: "POST",
  path: "/api/admin/user/create",
});
assert.equal(archiveLimitedUser.code, 200);
const archiveLimitedToken = "siyuan-cloud-port:" + archiveLimitedUser.data.id;
const archiveNoReadPermission = await json({
  body: { path: "/smoke/test.zip" },
  headers: { Authorization: archiveLimitedToken },
  method: "POST",
  path: "/api/fs/archive/meta",
});
assert.equal(archiveNoReadPermission.code, 403);
await json({
  body: {
    id: archiveLimitedUser.data.id,
    username: "archive-limited",
    base_path: "/smoke",
    permission: 1 << 12,
  },
  method: "POST",
  path: "/api/admin/user/update",
});
const archiveReadPermission = await json({
  body: { path: "/smoke/test.zip" },
  headers: { Authorization: archiveLimitedToken },
  method: "POST",
  path: "/api/fs/archive/meta",
});
assert.equal(archiveReadPermission.code, 200);
const archiveDecompressNoPermission = await json({
  body: {
    dst_dir: "/smoke/archive-limited-out",
    name: ["test.zip"],
    src_dir: "/smoke",
  },
  headers: { Authorization: archiveLimitedToken },
  method: "POST",
  path: "/api/fs/archive/decompress",
});
assert.equal(archiveDecompressNoPermission.code, 403);
await json({
  body: {
    id: archiveLimitedUser.data.id,
    username: "archive-limited",
    base_path: "/smoke",
    permission: (1 << 12) | (1 << 13),
  },
  method: "POST",
  path: "/api/admin/user/update",
});
const archiveDecompressPermission = await json({
  body: {
    dst_dir: "/smoke/archive-limited-out",
    name: ["test.zip"],
    overwrite: true,
    src_dir: "/smoke",
  },
  headers: { Authorization: archiveLimitedToken },
  method: "POST",
  path: "/api/fs/archive/decompress",
});
assert.equal(archiveDecompressPermission.code, 200);
const gbkZipBytes = makeZip([
  { name: "Cap 中文版_0.4.0-cn_x64-setup.exe", nameBytes: Buffer.from("43617020d6d0cec4b0e65f302e342e302d636e5f7836342d73657475702e657865", "hex"), content: "setup" },
  { name: "视频.mp4", nameBytes: Buffer.from("cad3c6b52e6d7034", "hex"), content: "video" },
].map((item) => ({ ...item, utf8: false })));
const gbkZipPut = await call({
  body: gbkZipBytes,
  headers: {
    "Content-Type": "application/zip",
    "File-Path": "/smoke/gbk.zip",
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(gbkZipPut.statusCode, 200);
const gbkZipMeta = await json({
  body: { path: "/smoke/gbk.zip" },
  method: "POST",
  path: "/api/fs/archive/meta",
});
assert.equal(gbkZipMeta.code, 200);
assert.equal(gbkZipMeta.data.content.some((item) => item.name === "Cap 中文版_0.4.0-cn_x64-setup.exe"), true);
assert.equal(gbkZipMeta.data.content.some((item) => item.name === "视频.mp4"), true);
const archiveZipExtract = await text({
  method: "GET",
  path: "/ae/smoke/test.zip",
  query: "inner=archive-root%2Fhello.txt",
});
assert.equal(archiveZipExtract.response.statusCode, 200);
assert.equal(archiveZipExtract.text, "hello archive");
assert.equal(archiveZipExtract.response.headers["Content-Disposition"], undefined);
const archiveZipDownload = await text({
  method: "GET",
  path: "/ae/smoke/test.zip",
  query: "inner=archive-root%2Fhello.txt&download=1",
});
assert.equal(archiveZipDownload.response.statusCode, 200);
assert.equal(archiveZipDownload.response.headers["Content-Disposition"][0], 'attachment; filename="hello.txt"');
const archiveDriverDown = await text({
  method: "GET",
  path: "/ad/smoke/test.zip",
  query: "inner=archive-root%2Fhello.txt",
});
assert.equal(archiveDriverDown.response.statusCode, 200);
assert.equal(archiveDriverDown.text, "hello archive");
const archiveDriverProxy = await text({
  method: "GET",
  path: "/ap/smoke/test.zip",
  query: "inner=nested%2Fworld.txt",
});
assert.equal(archiveDriverProxy.response.statusCode, 200);
assert.equal(archiveDriverProxy.text, "world");
const deflatedZipPut = await call({
  body: zipSync({ "deflated.txt": new TextEncoder().encode("hello deflate") }),
  headers: {
    "Content-Type": "application/zip",
    "File-Path": "/smoke/deflated.zip",
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(deflatedZipPut.statusCode, 200);
const deflatedZipExtract = await text({
  method: "GET",
  path: "/ae/smoke/deflated.zip",
  query: "inner=deflated.txt",
});
assert.equal(deflatedZipExtract.response.statusCode, 200);
assert.equal(deflatedZipExtract.text, "hello deflate");
const encryptedZipBytes = await makeEncryptedZip([{ name: "secret.txt", content: "secret" }], "secret");
const encryptedZipPut = await call({
  body: encryptedZipBytes,
  headers: {
    "Content-Type": "application/zip",
    "File-Path": "/smoke/encrypted.zip",
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(encryptedZipPut.statusCode, 200);
const encryptedZipMeta = await json({
  body: { path: "/smoke/encrypted.zip" },
  method: "POST",
  path: "/api/fs/archive/meta",
});
assert.equal(encryptedZipMeta.code, 200);
assert.equal(encryptedZipMeta.data.encrypted, true);
const encryptedZipExtract = await text({
  method: "GET",
  path: "/ae/smoke/encrypted.zip",
  query: "inner=secret.txt",
});
assert.equal(encryptedZipExtract.response.statusCode, 501);
assert.match(encryptedZipExtract.text, /wrong archive password/);
const encryptedZipWrongExtract = await text({
  method: "GET",
  path: "/ae/smoke/encrypted.zip",
  query: "inner=secret.txt&pass=bad",
});
assert.equal(encryptedZipWrongExtract.response.statusCode, 501);
assert.match(encryptedZipWrongExtract.text, /wrong archive password/);
const encryptedZipGoodExtract = await text({
  method: "GET",
  path: "/ae/smoke/encrypted.zip",
  query: "inner=secret.txt&pass=secret",
});
assert.equal(encryptedZipGoodExtract.response.statusCode, 501);
assert.match(encryptedZipGoodExtract.text, /wrong archive password/);
const tarBytes = makeTar([
  { name: "tar-root/", content: "" },
  { name: "tar-root/a.txt", content: "hello tar" },
  { name: "tar-root/deep/b.txt", content: "deep tar" },
]);
const archiveTarPut = await call({
  body: tarBytes,
  headers: {
    "Content-Type": "application/x-tar",
    "File-Path": "/smoke/test.tar",
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(archiveTarPut.statusCode, 200);
const archiveTarMeta = await json({
  body: { path: "/smoke/test.tar" },
  method: "POST",
  path: "/api/fs/archive/meta",
});
assert.equal(archiveTarMeta.code, 200);
assert.equal(archiveTarMeta.data.content.some((item) => item.name === "tar-root"), true);
const archiveTarExtract = await text({
  method: "GET",
  path: "/ae/smoke/test.tar",
  query: "inner=tar-root%2Fa.txt",
});
assert.equal(archiveTarExtract.response.statusCode, 200);
assert.equal(archiveTarExtract.text, "hello tar");
const archiveTgzPut = await call({
  body: gzipSync(tarBytes),
  headers: {
    "Content-Type": "application/gzip",
    "File-Path": "/smoke/test.tgz",
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(archiveTgzPut.statusCode, 200);
const archiveTgzList = await json({
  body: { inner_path: "tar-root/deep", page: 1, path: "/smoke/test.tgz", per_page: 10 },
  method: "POST",
  path: "/api/fs/archive/list",
});
assert.equal(archiveTgzList.code, 200);
assert.equal(archiveTgzList.data.content[0].name, "b.txt");
const archiveZipDecompress = await json({
  body: {
    dst_dir: "/smoke/unzip",
    inner_path: "nested",
    name: ["test.zip"],
    overwrite: true,
    put_into_new_dir: true,
    src_dir: "/smoke",
  },
  method: "POST",
  path: "/api/fs/archive/decompress",
});
assert.equal(archiveZipDecompress.code, 200);
assert.equal(archiveZipDecompress.data.task.length, 1);
assert.equal(archiveZipDecompress.data.task[0].state, "succeeded");
const archiveZipDecompressedGet = await json({
  body: { path: "/smoke/unzip/test/world.txt" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(archiveZipDecompressedGet.code, 200);
assert.equal(archiveZipDecompressedGet.data.size, 5);
const archiveTarDecompress = await json({
  body: {
    dst_dir: "/smoke/untar",
    inner_path: "tar-root/deep",
    name: ["test.tgz"],
    overwrite: true,
    put_into_new_dir: false,
    src_dir: "/smoke",
  },
  method: "POST",
  path: "/api/fs/archive/decompress",
});
assert.equal(archiveTarDecompress.code, 200);
const archiveTarDecompressedGet = await json({
  body: { path: "/smoke/untar/b.txt" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(archiveTarDecompressedGet.code, 200);
assert.equal(archiveTarDecompressedGet.data.size, 8);
const encryptedZipDecompress = await json({
  body: {
    archive_pass: "secret",
    dst_dir: "/smoke/secret-unzip",
    inner_path: "/",
    name: ["encrypted.zip"],
    overwrite: true,
    put_into_new_dir: false,
    src_dir: "/smoke",
  },
  method: "POST",
  path: "/api/fs/archive/decompress",
});
assert.equal(encryptedZipDecompress.code, 501);
assert.match(String(encryptedZipDecompress.message || ""), /wrong archive password/);
const shareArchiveCreate = await json({
  body: { files: ["/smoke/test.zip"], id: "share-archive-smoke", pwd: "zip" },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(shareArchiveCreate.code, 200);
const shareArchiveMeta = await json({
  body: { password: "zip", path: "/@s/share-archive-smoke/" },
  method: "POST",
  path: "/api/fs/archive/meta",
});
assert.equal(shareArchiveMeta.code, 200);
assert.equal(shareArchiveMeta.data.raw_url, "/plugin/private/siyuan-cloud/sad/share-archive-smoke?pwd=zip");
assert.equal(shareArchiveMeta.data.content.some((item) => item.name === "archive-root"), true);
const shareArchiveList = await json({
  body: { inner_path: "/", page: 1, password: "zip", path: "/@s/share-archive-smoke/", per_page: 10 },
  method: "POST",
  path: "/api/fs/archive/list",
});
assert.equal(shareArchiveList.code, 200);
assert.equal(shareArchiveList.data.content.some((item) => item.name === "archive-root"), true);
const shareArchivePasswordPage = await text({
  method: "GET",
  path: "/sad/share-archive-smoke/",
});
assert.equal(shareArchivePasswordPage.response.statusCode, 200);
assert.match(shareArchivePasswordPage.text, /Share password/);
const shareArchiveExtract = await text({
  method: "GET",
  path: "/sad/share-archive-smoke/",
  query: "pwd=zip&inner=archive-root%2Fhello.txt",
});
assert.equal(shareArchiveExtract.response.statusCode, 200);
assert.equal(shareArchiveExtract.text, "hello archive");
const shareArchiveRawDownload = await text({
  method: "GET",
  path: "/sd/share-archive-smoke",
  query: "download=1&pwd=zip",
});
assert.equal(shareArchiveRawDownload.response.statusCode, 200);
assert.equal(Buffer.from(shareArchiveRawDownload.response.body.raw.data).subarray(0, 4).toString("hex"), "504b0304");

const offlineDownload = await json({
  body: {
    delete_policy: "delete_on_upload_succeed",
    path: "/smoke",
    tool: "aria2",
    urls: [" https://example.test/a.iso ", "", "   "],
  },
  method: "POST",
  path: "/api/fs/add_offline_download",
});
assert.equal(offlineDownload.code, 501);
assert.equal(offlineDownload.data.tasks.length, 1);
assert.equal(offlineDownload.data.tasks[0].name, "https://example.test/a.iso");

const torrentInfoBytes = Buffer.from("d6:lengthi123e4:name8:demo.txt12:piece lengthi16e6:pieces20:01234567890123456789e", "utf8");
const torrentRootBytes = Buffer.concat([
  Buffer.from("d4:info", "utf8"),
  torrentInfoBytes,
  Buffer.from("5:x-casd5:cloud3:1898:file_md532:ABCDEF0123456789ABCDEF01234567899:slice_md532:0123456789ABCDEF0123456789ABCDEF10:slice_sizei16eee", "utf8"),
]);
const torrentBase64 = torrentRootBytes.toString("base64");
const torrentParsed = await json({
  body: { torrent_data: torrentBase64 },
  method: "POST",
  path: "/api/fs/torrent/parse",
});
assert.equal(torrentParsed.code, 200);
assert.equal(torrentParsed.data.name, "demo.txt");
assert.equal(torrentParsed.data.total_size, 123);
assert.equal(torrentParsed.data.piece_length, 16);
assert.equal(torrentParsed.data.piece_count, 1);
assert.equal(torrentParsed.data.has_cas, true);
assert.equal(torrentParsed.data.cas.file_md5, "ABCDEF0123456789ABCDEF0123456789");
assert.equal(torrentParsed.data.cas.slice_md5, "0123456789ABCDEF0123456789ABCDEF");
assert.equal(torrentParsed.data.cas.slice_size, 16);
assert.equal(torrentParsed.data.cas.cloud, "189");
assert.equal(torrentParsed.data.files[0].path, "demo.txt");
assert.equal(torrentParsed.data.files[0].size, 123);
assert.equal(torrentParsed.data.info_hash, crypto.createHash("sha1").update(torrentInfoBytes).digest("hex"));
const torrentUploaded = await json({
  body: {
    files: {
      torrent: [{
        data: Buffer.from(torrentRootBytes),
        filename: "demo.torrent",
        headers: { "Content-Type": ["application/x-bittorrent"] },
        size: torrentRootBytes.length,
      }],
    },
  },
  method: "POST",
  path: "/api/fs/torrent/upload_parse",
});
assert.equal(torrentUploaded.code, 200);
assert.equal(torrentUploaded.data.info.name, "demo.txt");
assert.equal(torrentUploaded.data.torrent_data, torrentBase64);
const torrentRapidMissingRequired = await json({
  body: {},
  method: "POST",
  path: "/api/fs/torrent/rapid_upload",
});
assert.equal(torrentRapidMissingRequired.code, 400);
const torrentRapidNoStorage = await json({
  body: { path: "/smoke", torrent_data: torrentBase64 },
  method: "POST",
  path: "/api/fs/torrent/rapid_upload",
});
assert.equal(torrentRapidNoStorage.code, 400);
assert.match(torrentRapidNoStorage.message, /target storage/);

const torrentGenerateMissingRequired = await json({
  body: {},
  method: "POST",
  path: "/api/fs/torrent/generate",
});
assert.equal(torrentGenerateMissingRequired.code, 400);
const torrentGenerated = await json({
  body: { path: "/smoke/a.txt" },
  method: "POST",
  path: "/api/fs/torrent/generate",
});
assert.equal(torrentGenerated.code, 200);
assert.equal(torrentGenerated.data.file_name, "a.txt.torrent");
assert.equal(torrentGenerated.data.with_cas, false);
assert.equal(Boolean(torrentGenerated.data.torrent_data), true);
const torrentGeneratedParsed = await json({
  body: { torrent_data: torrentGenerated.data.torrent_data },
  method: "POST",
  path: "/api/fs/torrent/parse",
});
assert.equal(torrentGeneratedParsed.code, 200);
assert.equal(torrentGeneratedParsed.data.name, "a.txt");
assert.equal(torrentGeneratedParsed.data.total_size, 5);
assert.equal(torrentGeneratedParsed.data.files[0].path, "a.txt");
assert.equal(torrentGeneratedParsed.data.has_cas, false);
const torrentGeneratedCasWrongStorage = await json({
  body: { path: "/smoke/a.txt", with_cas: true },
  method: "POST",
  path: "/api/fs/torrent/generate",
});
assert.equal(torrentGeneratedCasWrongStorage.code, 400);
assert.match(torrentGeneratedCasWrongStorage.message, /CAS torrent generation/);
const readOnlyTorrentUser = await json({
  body: {
    base_path: "/smoke",
    permission: 0,
    username: "torrent-readonly",
  },
  method: "POST",
  path: "/api/admin/user/create",
});
assert.equal(readOnlyTorrentUser.code, 200);
const readOnlyTorrentToken = "siyuan-cloud-port:" + readOnlyTorrentUser.data.id;
const torrentGenerateByUser = await json({
  body: { path: "/smoke/a.txt" },
  headers: { Authorization: readOnlyTorrentToken },
  method: "POST",
  path: "/api/fs/torrent/generate",
});
assert.equal(torrentGenerateByUser.code, 200);
const torrentGenerateOutsideBase = await json({
  body: { path: "/copies/smoke/a.txt" },
  headers: { Authorization: readOnlyTorrentToken },
  method: "POST",
  path: "/api/fs/torrent/generate",
});
assert.equal(torrentGenerateOutsideBase.code, 403);
const torrentRapidByUserDenied = await json({
  body: { path: "/copies", torrent_data: torrentBase64 },
  headers: { Authorization: readOnlyTorrentToken },
  method: "POST",
  path: "/api/fs/torrent/rapid_upload",
});
assert.equal(torrentRapidByUserDenied.code, 403);

const mkdirCopies = await json({
  body: { path: "/copies" },
  method: "POST",
  path: "/api/fs/mkdir",
});
assert.equal(mkdirCopies.code, 200);

const copy = await json({
  body: { dst_dir: "/copies", names: ["smoke"], src_dir: "/" },
  method: "POST",
  path: "/api/fs/copy",
});
assert.equal(copy.code, 200);
assert.equal(Array.isArray(copy.data.tasks), true);

const mkdirMoves = await json({
  body: { path: "/moved" },
  method: "POST",
  path: "/api/fs/mkdir",
});
assert.equal(mkdirMoves.code, 200);

const moveSingle = await json({
  body: { dst_dir: "/moved", names: ["a.txt"], src_dir: "/smoke" },
  method: "POST",
  path: "/api/fs/move",
});
assert.equal(moveSingle.code, 200);

const movedList = await json({
  body: { path: "/moved", page: 1, per_page: 20 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(movedList.data.content.some((item) => item.name === "a.txt"), true);

const smokeAfterMove = await json({
  body: { path: "/smoke", page: 1, per_page: 20 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(smokeAfterMove.data.content.some((item) => item.name === "a.txt"), false);

const shareCreate = await json({
  body: {
    files: ["/moved/a.txt", "/copies/smoke"],
    id: "share-smoke",
    max_accessed: 10,
    pwd: "pw",
    readme: "share readme",
    remark: "share smoke",
  },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(shareCreate.code, 200);
assert.equal(shareCreate.data.id, "share-smoke");
assert.deepEqual(shareCreate.data.files, ["/moved/a.txt", "/copies/smoke"]);
assert.equal(shareCreate.data.pwd, "pw");
assert.equal(shareCreate.data.max_accessed, 10);
assert.equal(shareCreate.data.sid, undefined);
assert.equal(shareCreate.data.path, undefined);
assert.equal(shareCreate.data.password, undefined);
const shareList = await json({
  body: { page: 1, per_page: 10 },
  method: "POST",
  path: "/api/share/list",
});
assert.equal(shareList.data.content.some((item) => item.id === "share-smoke" && Array.isArray(item.files)), true);
const shareRootWrongPwd = await json({
  body: { page: 1, password: "bad", path: "/share-smoke", per_page: 10 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(shareRootWrongPwd.code, 404);
const shareRoot = await json({
  body: { page: 1, password: "pw", path: "/share-smoke", per_page: 10 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(shareRoot.code, 200);
assert.equal(shareRoot.data.write, false);
assert.equal(shareRoot.data.content.some((item) => item.name === "a.txt"), true);
assert.equal(shareRoot.data.content.some((item) => item.name === "smoke"), true);
const shareFile = await json({
  body: { password: "pw", path: "/share-smoke/a.txt" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(shareFile.code, 200);
assert.equal(shareFile.data.raw_url, "/plugin/private/siyuan-cloud/sd/share-smoke/a.txt?pwd=pw");
const sharePasswordPage = await text({
  method: "GET",
  path: "/sd/share-smoke/a.txt",
});
assert.equal(sharePasswordPage.response.statusCode, 200);
assert.match(sharePasswordPage.text, /Share password/);
assert.match(sharePasswordPage.text, /action="\/plugin\/private\/siyuan-cloud\/sd\/share-smoke\/a.txt"/);
const shareDownloadPasswordPage = await text({
  method: "GET",
  path: "/sd/share-smoke/a.txt",
  query: "download=1",
});
assert.match(shareDownloadPasswordPage.text, /action="\/plugin\/private\/siyuan-cloud\/sd\/share-smoke\/a.txt\?download=1"/);
const shareWrongPasswordPage = await text({
  method: "GET",
  path: "/sd/share-smoke/a.txt",
  query: "pwd=bad",
});
assert.equal(shareWrongPasswordPage.response.statusCode, 200);
assert.match(shareWrongPasswordPage.text, /Password is incorrect/);
assert.match(shareWrongPasswordPage.text, /Share password/);
const missingSharePage = await text({
  method: "GET",
  path: "/sd/missing-share",
  query: "pwd=bad",
});
assert.equal(missingSharePage.response.statusCode, 200);
assert.match(missingSharePage.text, /Share not found/);
const shareDownload = await text({
  method: "GET",
  path: "/sd/share-smoke/a.txt",
  query: "pwd=pw",
});
assert.match(shareDownload.text, /Access verified/);
assert.match(shareDownload.text, /download=1&amp;pwd=pw/);
const shareRawDownload = await text({
  method: "GET",
  path: "/sd/share-smoke/a.txt",
  query: "download=1&pwd=pw",
});
assert.equal(shareRawDownload.text, "hello");
await json({
  body: { content: "video", path: "/moved/video.mp4" },
  headers: { "Content-Type": "video/mp4" },
  method: "PUT",
  path: "/api/fs/put",
});
const shareVideoCreate = await json({
  body: { files: ["/moved/video.mp4"], id: "share-video", pwd: "vpw" },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(shareVideoCreate.code, 200);
const shareVideoPreview = await text({
  method: "GET",
  path: "/sd/share-video",
  query: "pwd=vpw",
});
assert.match(shareVideoPreview.text, /Access verified/);
assert.match(shareVideoPreview.text, /download=1&amp;pwd=vpw/);
assert.doesNotMatch(shareVideoPreview.text, /<video/);
const shareAfterSameIP = await json({
  method: "GET",
  path: "/api/share/get",
  query: "id=share-smoke",
});
assert.equal(shareAfterSameIP.data.accessed, 1);
const shareDownloadDifferentIP = await text({
  headers: { "X-Forwarded-For": "203.0.113.10" },
  method: "GET",
  path: "/sd/share-smoke/a.txt",
  query: "download=1&pwd=pw",
});
assert.equal(shareDownloadDifferentIP.text, "hello");
const shareAfterDifferentIP = await json({
  method: "GET",
  path: "/api/share/get",
  query: "id=share-smoke",
});
assert.equal(shareAfterDifferentIP.data.accessed, 2);
const shareUpdatePwd = await json({
  body: {
    ...shareAfterDifferentIP.data,
    accessed: 7,
    max_accessed: 20,
    pwd: "pw2",
    remark: "share smoke updated",
  },
  method: "POST",
  path: "/api/share/update",
});
assert.equal(shareUpdatePwd.code, 200);
assert.equal(shareUpdatePwd.data.pwd, "pw2");
assert.equal(shareUpdatePwd.data.accessed, 7);
assert.equal(shareUpdatePwd.data.max_accessed, 20);
assert.equal(shareUpdatePwd.data.remark, "share smoke updated");
const shareOldPwdPage = await text({
  method: "GET",
  path: "/sd/share-smoke/a.txt",
  query: "pwd=pw",
});
assert.equal(shareOldPwdPage.response.statusCode, 200);
assert.match(shareOldPwdPage.text, /Password is incorrect/);
const shareNewPwdDownload = await text({
  method: "GET",
  path: "/sd/share-smoke/a.txt",
  query: "download=1&pwd=pw2",
});
assert.equal(shareNewPwdDownload.text, "hello");
await json({ body: { id: "share-smoke" }, method: "POST", path: "/api/share/disable" });
const disabledShare = await json({
  body: { page: 1, password: "pw2", path: "/share-smoke", per_page: 10 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(disabledShare.code, 404);
await json({ body: { id: "share-smoke" }, method: "POST", path: "/api/share/enable" });

const shareQueryCreate = await json({
  body: {
    files: ["/moved/a.txt"],
    id: "share-query",
  },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(shareQueryCreate.code, 200);
const shareQueryDisable = await json({
  method: "POST",
  path: "/api/share/disable",
  query: "id=share-query",
});
assert.equal(shareQueryDisable.code, 200);
const shareQueryDisabled = await json({
  method: "GET",
  path: "/api/share/get",
  query: "id=share-query",
});
assert.equal(shareQueryDisabled.data.disabled, true);
const shareQueryEnable = await json({
  method: "POST",
  path: "/api/share/enable",
  query: "id=share-query",
});
assert.equal(shareQueryEnable.code, 200);
const shareQueryEnabled = await json({
  method: "GET",
  path: "/api/share/get",
  query: "id=share-query",
});
assert.equal(shareQueryEnabled.data.disabled, false);
const shareQueryDelete = await json({
  method: "POST",
  path: "/api/share/delete",
  query: "id=share-query",
});
assert.equal(shareQueryDelete.code, 200);
const shareQueryDeleted = await json({
  method: "GET",
  path: "/api/share/get",
  query: "id=share-query",
});
assert.equal(shareQueryDeleted.code, 404);
const shareDeleteMissing = await json({
  method: "POST",
  path: "/api/share/delete",
  query: "id=share-missing",
});
assert.equal(shareDeleteMissing.code, 404);
assert.equal(shareDeleteMissing.message, "sharing not found");

const shareRenameA = await json({
  body: { files: ["/moved/a.txt"], id: "share-rename-a" },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(shareRenameA.code, 200);
const shareRenameB = await json({
  body: { files: ["/moved/a.txt"], id: "share-rename-b" },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(shareRenameB.code, 200);
const shareRenameConflict = await json({
  body: { files: ["/moved/a.txt"], id: "share-rename-b", new_id: "share-rename-a" },
  method: "POST",
  path: "/api/share/update",
});
assert.equal(shareRenameConflict.code, 500);
assert.equal(shareRenameConflict.message, "UNIQUE constraint failed: sharings.id");
const shareRenameBStillExists = await json({
  method: "GET",
  path: "/api/share/get",
  query: "id=share-rename-b",
});
assert.equal(shareRenameBStillExists.code, 200);

const shareLimitedUserCreate = await json({
  body: {
    base_path: "/",
    permission: (1 << 6) | (1 << 14) | (1 << 15),
    username: "share-limited",
  },
  method: "POST",
  path: "/api/admin/user/create",
});
assert.equal(shareLimitedUserCreate.code, 200);
const limitedToken = "siyuan-cloud-port:" + shareLimitedUserCreate.data.id;
const limitedShareCreate = await json({
  body: { files: ["/moved/a.txt"], id: "share-limited-ok" },
  headers: { Authorization: limitedToken },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(limitedShareCreate.code, 200);
assert.equal(limitedShareCreate.data.creator, "share-limited");
assert.equal(limitedShareCreate.data.creator_id, shareLimitedUserCreate.data.id);
const limitedShareList = await json({
  body: { page: 1, per_page: 50 },
  headers: { Authorization: limitedToken },
  method: "POST",
  path: "/api/share/list",
});
assert.deepEqual(limitedShareList.data.content.map((item) => item.id), ["share-limited-ok"]);
const limitedCannotGetAdminShare = await json({
  headers: { Authorization: limitedToken },
  method: "GET",
  path: "/api/share/get",
  query: "id=share-rename-a",
});
assert.equal(limitedCannotGetAdminShare.code, 404);
const limitedArchiveShareCreate = await json({
  body: { files: ["/smoke/test.zip"], id: "share-limited-archive-ok", pwd: "zip" },
  headers: { Authorization: limitedToken },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(limitedArchiveShareCreate.code, 200);
const limitedArchiveShareMeta = await json({
  body: { password: "zip", path: "/@s/share-limited-archive-ok/" },
  method: "POST",
  path: "/api/fs/archive/meta",
});
assert.equal(limitedArchiveShareMeta.code, 200);
await json({
  body: {
    id: shareLimitedUserCreate.data.id,
    username: "share-limited",
    base_path: "/moved",
    permission: (1 << 6) | (1 << 14) | (1 << 15),
  },
  method: "POST",
  path: "/api/admin/user/update",
});
const limitedOutsideBaseShare = await json({
  body: { files: ["/copies/smoke"], id: "share-limited-bad-path" },
  headers: { Authorization: limitedToken },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(limitedOutsideBaseShare.code, 500);
assert.match(limitedOutsideBaseShare.message, /permission denied to share path/);
await json({
  body: {
    path: "/moved/private",
  },
  method: "POST",
  path: "/api/fs/mkdir",
});
await json({
  body: {
    path: "/moved/private/secret.txt",
    content: "secret",
  },
  method: "PUT",
  path: "/api/fs/put",
});
const metaProtectMovedPrivate = await json({
  body: {
    path: "/moved/private",
    read_users: [1],
    read_users_sub: true,
  },
  method: "POST",
  path: "/api/admin/meta/create",
});
assert.equal(metaProtectMovedPrivate.code, 200);
const limitedMetaDeniedShare = await json({
  body: { files: ["/moved/private/secret.txt"], id: "share-limited-meta-denied" },
  headers: { Authorization: limitedToken },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(limitedMetaDeniedShare.code, 500);
assert.match(limitedMetaDeniedShare.message, /permission denied to share path/);
await json({
  body: {
    id: shareLimitedUserCreate.data.id,
    username: "share-limited",
    base_path: "/copies",
    permission: (1 << 6) | (1 << 14) | (1 << 15),
  },
  method: "POST",
  path: "/api/admin/user/update",
});
const limitedShareAfterBaseChange = await json({
  body: { page: 1, path: "/share-limited-ok", per_page: 10 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(limitedShareAfterBaseChange.code, 404);
const limitedShareDownloadAfterBaseChange = await text({
  method: "GET",
  path: "/sd/share-limited-ok",
  query: "download=1",
});
assert.match(limitedShareDownloadAfterBaseChange.text, /Share not found/);
const limitedArchiveAfterBaseChange = await json({
  body: { password: "zip", path: "/@s/share-limited-archive-ok/" },
  method: "POST",
  path: "/api/fs/archive/meta",
});
assert.equal(limitedArchiveAfterBaseChange.code, 500);
assert.match(limitedArchiveAfterBaseChange.message, /share does not exist/);
await json({
  body: {
    id: shareLimitedUserCreate.data.id,
    username: "share-limited",
    base_path: "/moved",
    disabled: true,
    permission: (1 << 6) | (1 << 14) | (1 << 15),
  },
  method: "POST",
  path: "/api/admin/user/update",
});
const limitedShareAfterCreatorDisabled = await json({
  body: { password: "", path: "/share-limited-ok" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(limitedShareAfterCreatorDisabled.code, 404);
await json({
  body: {
    id: shareLimitedUserCreate.data.id,
    username: "share-limited",
    base_path: "/moved",
    disabled: false,
    permission: (1 << 6) | (1 << 14) | (1 << 15),
  },
  method: "POST",
  path: "/api/admin/user/update",
});
const guestShareCreate = await json({
  body: { files: ["/moved/a.txt"], id: "share-guest-denied" },
  headers: { Authorization: "siyuan-cloud-port:2" },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(guestShareCreate.code, 403);
assert.equal(guestShareCreate.message, "permission denied");

const limitedCopy = await json({
  body: { dst_dir: "/moved/copies-limited", names: ["a.txt"], src_dir: "/moved" },
  headers: { Authorization: limitedToken },
  method: "POST",
  path: "/api/fs/copy",
});
assert.equal(limitedCopy.code, 200);
assert.equal(limitedCopy.data.tasks[0].creator, "share-limited");
assert.equal(limitedCopy.data.tasks[0].creator_id, shareLimitedUserCreate.data.id);
const limitedCopyDone = await json({
  headers: { Authorization: limitedToken },
  method: "GET",
  path: "/api/task/copy/done",
});
assert.equal(limitedCopyDone.code, 200);
assert.deepEqual(limitedCopyDone.data.map((item) => item.id), [limitedCopy.data.tasks[0].id]);
const limitedMoveDenied = await json({
  body: { dst_dir: "/moved/copies-limited", names: ["a.txt"], src_dir: "/moved" },
  headers: { Authorization: limitedToken },
  method: "POST",
  path: "/api/fs/move",
});
assert.equal(limitedMoveDenied.code, 403);
const limitedCopyOutsideBaseDenied = await json({
  body: { dst_dir: "/moved/copies-limited", names: ["smoke"], src_dir: "/copies" },
  headers: { Authorization: limitedToken },
  method: "POST",
  path: "/api/fs/copy",
});
assert.equal(limitedCopyOutsideBaseDenied.code, 403);

const copyDone = await json({
  method: "GET",
  path: "/api/task/copy/done",
});
assert.equal(copyDone.code, 200);
assert.equal(Array.isArray(copyDone.data), true);
assert.equal(copyDone.data.length >= 2, true);
assert.equal(typeof copyDone.data[0].id, "string");
assert.equal(typeof copyDone.data[0].creator_id, "number");
assert.equal(typeof copyDone.data[0].creator_role, "number");
assert.equal(copyDone.data.some((item) => item.id === limitedCopy.data.tasks[0].id), true);
const copyTaskId = copyDone.data[0].id;
const copyTaskInfo = await json({
  body: { tid: copyTaskId },
  method: "POST",
  path: "/api/task/copy/info",
});
assert.equal(copyTaskInfo.code, 200);
assert.equal(copyTaskInfo.data.id, copyTaskId);
const limitedCannotReadAdminCopy = await json({
  body: { tid: copyDone.data.find((item) => item.id !== limitedCopy.data.tasks[0].id).id },
  headers: { Authorization: limitedToken },
  method: "POST",
  path: "/api/task/copy/info",
});
assert.equal(limitedCannotReadAdminCopy.code, 404);

const moveDone = await json({
  method: "GET",
  path: "/api/task/move/done",
});
assert.equal(moveDone.code, 200);
assert.equal(Array.isArray(moveDone.data), true);
assert.equal(moveDone.data.length >= 1, true);
const moveTaskId = moveDone.data[0].id;
const cancelMissing = await json({
  body: { tid: "missing-task" },
  method: "POST",
  path: "/api/task/move/cancel",
});
assert.equal(cancelMissing.code, 404);
const retrySome = await json({
  body: [moveTaskId, "missing-task"],
  method: "POST",
  path: "/api/task/move/retry_some",
});
assert.equal(retrySome.code, 200);
assert.equal(retrySome.data["missing-task"], "task not found");
const retrySomeInvalid = await json({
  body: { tids: [moveTaskId] },
  method: "POST",
  path: "/api/task/move/retry_some",
});
assert.equal(retrySomeInvalid.code, 400);
assert.equal(retrySomeInvalid.message, "invalid request format");
const deleteSome = await json({
  body: [copyTaskId, "missing-task"],
  method: "POST",
  path: "/api/task/copy/delete_some",
});
assert.equal(deleteSome.code, 200);
assert.equal(deleteSome.data["missing-task"], "task not found");

await json({ body: { path: "/copy-skip-src" }, method: "POST", path: "/api/fs/mkdir" });
await json({ body: { path: "/copy-skip-dst" }, method: "POST", path: "/api/fs/mkdir" });
await json({ body: { content: "source conflict", path: "/copy-skip-src/conflict.txt" }, method: "PUT", path: "/api/fs/put" });
await json({ body: { content: "source fresh", path: "/copy-skip-src/fresh.txt" }, method: "PUT", path: "/api/fs/put" });
await json({ body: { content: "dest conflict", path: "/copy-skip-dst/conflict.txt" }, method: "PUT", path: "/api/fs/put" });
const copySkip = await json({
  body: { dst_dir: "/copy-skip-dst", names: ["conflict.txt", "fresh.txt"], overwrite: false, skip_existing: true, src_dir: "/copy-skip-src" },
  method: "POST",
  path: "/api/fs/copy",
});
assert.equal(copySkip.code, 200);
const copySkipList = await json({ body: { path: "/copy-skip-dst", page: 1, per_page: 20 }, method: "POST", path: "/api/fs/list" });
assert.equal(copySkipList.data.content.some((item) => item.name === "conflict.txt"), true);
assert.equal(copySkipList.data.content.some((item) => item.name === "fresh.txt"), true);

await json({ body: { path: "/move-skip-src" }, method: "POST", path: "/api/fs/mkdir" });
await json({ body: { path: "/move-skip-dst" }, method: "POST", path: "/api/fs/mkdir" });
await json({ body: { content: "source conflict", path: "/move-skip-src/conflict.txt" }, method: "PUT", path: "/api/fs/put" });
await json({ body: { content: "source fresh", path: "/move-skip-src/fresh.txt" }, method: "PUT", path: "/api/fs/put" });
await json({ body: { content: "dest conflict", path: "/move-skip-dst/conflict.txt" }, method: "PUT", path: "/api/fs/put" });
const moveSkip = await json({
  body: { dst_dir: "/move-skip-dst", names: ["conflict.txt", "fresh.txt"], overwrite: false, skip_existing: true, src_dir: "/move-skip-src" },
  method: "POST",
  path: "/api/fs/move",
});
assert.equal(moveSkip.code, 200);
const moveSkipDst = await json({ body: { path: "/move-skip-dst", page: 1, per_page: 20 }, method: "POST", path: "/api/fs/list" });
assert.equal(moveSkipDst.data.content.some((item) => item.name === "conflict.txt"), true);
assert.equal(moveSkipDst.data.content.some((item) => item.name === "fresh.txt"), true);
const moveSkipSrc = await json({ body: { path: "/move-skip-src", page: 1, per_page: 20 }, method: "POST", path: "/api/fs/list" });
assert.equal(moveSkipSrc.data.content.some((item) => item.name === "conflict.txt"), true);
assert.equal(moveSkipSrc.data.content.some((item) => item.name === "fresh.txt"), false);

const metaCreate = await json({
  body: { hide: "^secret", h_sub: true, path: "/smoke", readme: "readme", r_sub: true },
  method: "POST",
  path: "/api/admin/meta/create",
});
assert.equal(metaCreate.code, 200);

const metaList = await json({
  method: "GET",
  path: "/api/admin/meta/list",
});
assert.equal(metaList.code, 200);
assert.equal(metaList.data.content.some((item) => item.path === "/smoke"), true);

await json({
  body: { content: "hello message", title: "smoke" },
  method: "POST",
  path: "/api/admin/message/send",
});
const messages = await json({
  method: "POST",
  path: "/api/admin/message/get",
});
assert.equal(messages.code, 200);
assert.equal(messages.data.content.length, 1);

const indexBuild = await json({
  method: "POST",
  path: "/api/admin/index/build",
});
assert.equal(indexBuild.code, 200);
const indexProgress = await json({
  method: "GET",
  path: "/api/admin/index/progress",
});
assert.equal(indexProgress.data.is_done, true);
assert.equal(indexProgress.data.obj_count > 0, true);
const asyncIndexUpdate = await json({
  body: { async: true, paths: ["/copy-skip-src"] },
  method: "POST",
  path: "/api/admin/index/update",
});
assert.equal(asyncIndexUpdate.code, 200);
assert.equal(["pending", "running"].includes(asyncIndexUpdate.data.task.state), true);
const asyncIndexTask = await waitFor(async () => {
  const info = await json({
    body: { tid: asyncIndexUpdate.data.task.id },
    method: "POST",
    path: "/api/task/index/info",
  });
  return info.data.state === "succeeded" ? info : null;
});
assert.equal(asyncIndexTask.code, 200);
assert.equal(asyncIndexTask.data.progress, 100);
const indexDoneTasks = await json({
  method: "GET",
  path: "/api/task/index/done",
});
assert.equal(indexDoneTasks.data.some((item) => item.id === asyncIndexUpdate.data.task.id), true);
const stoppableIndexUpdate = await json({
  body: { async: true, paths: ["/copy-skip-src"] },
  method: "POST",
  path: "/api/admin/index/update",
});
assert.equal(stoppableIndexUpdate.code, 200);
const indexStop = await json({
  method: "POST",
  path: "/api/admin/index/stop",
});
if (indexStop.code === 200) {
  assert.equal(indexStop.data.task_id, stoppableIndexUpdate.data.task.id);
  const canceledIndexTask = await waitFor(async () => {
    const info = await json({
      body: { tid: stoppableIndexUpdate.data.task.id },
      method: "POST",
      path: "/api/task/index/info",
    });
    return info.data.state === "canceled" ? info : null;
  });
  assert.equal(canceledIndexTask.data.state, "canceled");
} else {
  assert.equal(indexStop.code, 400);
  const finishedIndexTask = await json({
    body: { tid: stoppableIndexUpdate.data.task.id },
    method: "POST",
    path: "/api/task/index/info",
  });
  assert.equal(["succeeded", "canceled"].includes(finishedIndexTask.data.state), true);
}
const searchFile = await json({
  body: { keywords: "fresh", page: 1, parent: "/", per_page: 10, scope: 2 },
  method: "POST",
  path: "/api/fs/search",
});
assert.equal(searchFile.code, 200);
assert.equal(searchFile.data.content.some((item) => item.parent === "/copy-skip-src" && item.name === "fresh.txt" && item.is_dir === false && typeof item.type === "number"), true);
const searchLimitedUser = await json({
  body: {
    base_path: "/copy-skip-src",
    permission: 0,
    username: "search-limited",
  },
  method: "POST",
  path: "/api/admin/user/create",
});
assert.equal(searchLimitedUser.code, 200);
const searchLimitedToken = "siyuan-cloud-port:" + searchLimitedUser.data.id;
const searchLimited = await json({
  body: { keywords: "fresh", page: 1, parent: "/copies", per_page: 10, scope: 2 },
  headers: { Authorization: searchLimitedToken },
  method: "POST",
  path: "/api/fs/search",
});
assert.equal(searchLimited.code, 403);
const searchLimitedSubtree = await json({
  body: { keywords: "fresh", page: 1, parent: "/copy-skip-src", per_page: 10, scope: 2 },
  headers: { Authorization: searchLimitedToken },
  method: "POST",
  path: "/api/fs/search",
});
assert.equal(searchLimitedSubtree.code, 200);
assert.equal(searchLimitedSubtree.data.content.some((item) => item.parent === "/copy-skip-src" && item.name === "fresh.txt"), true);
const searchDir = await json({
  body: { keywords: "copy-skip", page: 1, parent: "/", per_page: 10, scope: 1 },
  method: "POST",
  path: "/api/fs/search",
});
assert.equal(searchDir.code, 200);
assert.equal(searchDir.data.content.some((item) => item.name === "copy-skip-src" && item.is_dir === true), true);
const workspaceIndexUpdate = await json({
  body: { paths: ["/@workspace/search-root"] },
  method: "POST",
  path: "/api/admin/index/update",
});
assert.equal(workspaceIndexUpdate.code, 200);
const searchWorkspace = await json({
  body: { keywords: "workspace-hit", page: 1, parent: "/@workspace/search-root", per_page: 10, scope: 2 },
  method: "POST",
  path: "/api/fs/search",
});
assert.equal(searchWorkspace.code, 200);
assert.equal(searchWorkspace.data.content.some((item) => item.parent === "/@workspace/search-root/nested" && item.name === "workspace-hit.md"), true);
const indexClear = await json({
  method: "POST",
  path: "/api/admin/index/clear",
});
assert.equal(indexClear.code, 200);
const searchAfterClear = await json({
  body: { keywords: "fresh", page: 1, parent: "/", per_page: 10, scope: 2 },
  method: "POST",
  path: "/api/fs/search",
});
assert.equal(searchAfterClear.data.total, 0);
const indexUpdate = await json({
  body: { max_depth: 20, paths: ["/copy-skip-src"] },
  method: "POST",
  path: "/api/admin/index/update",
});
assert.equal(indexUpdate.code, 200);
const searchAfterUpdate = await json({
  body: { keywords: "fresh", page: 1, parent: "/", per_page: 10, scope: 2 },
  method: "POST",
  path: "/api/fs/search",
});
assert.equal(searchAfterUpdate.data.content.some((item) => item.parent === "/copy-skip-src" && item.name === "fresh.txt"), true);
const searchSubtree = await json({
  body: { keywords: "fresh", page: 1, parent: "/copy-skip-src", per_page: 10, scope: 2 },
  method: "POST",
  path: "/api/fs/search",
});
assert.equal(searchSubtree.data.content.some((item) => item.parent === "/copy-skip-src" && item.name === "fresh.txt"), true);
const searchMultiKeyword = await json({
  body: { keywords: "fresh txt", page: 1, parent: "/copy-skip-src", per_page: 10, scope: 2 },
  method: "POST",
  path: "/api/fs/search",
});
assert.equal(searchMultiKeyword.data.content.length, 1);
assert.equal(searchMultiKeyword.data.content[0].name, "fresh.txt");
const searchInvalidPage = await json({
  body: { keywords: "fresh", page: 0, parent: "/", per_page: 10 },
  method: "POST",
  path: "/api/fs/search",
});
assert.equal(searchInvalidPage.code, 400);
assert.equal(searchInvalidPage.message, "page can't < 1");

await json({
  body: { key: "ignore_paths", value: "/copy-skip-src" },
  method: "POST",
  path: "/api/admin/setting/save",
});
await json({
  method: "POST",
  path: "/api/admin/index/build",
});
const searchIgnoredPath = await json({
  body: { keywords: "fresh", page: 1, parent: "/copy-skip-src", per_page: 10, scope: 2 },
  method: "POST",
  path: "/api/fs/search",
});
assert.equal(searchIgnoredPath.data.total, 0);
await json({
  body: { key: "ignore_paths", value: "" },
  method: "POST",
  path: "/api/admin/setting/save",
});

await json({
  body: { content: "hidden", path: "/no-index/hit.txt" },
  method: "PUT",
  path: "/api/fs/put",
});
const noIndexStorage = await json({
  body: { addition: { address: "https://webdav.example.test", password: "p", username: "u" }, driver: "WebDav", mount_path: "/no-index", disable_index: true },
  method: "POST",
  path: "/api/admin/storage/create",
});
assert.equal(noIndexStorage.code, 200);
await json({
  method: "POST",
  path: "/api/admin/index/build",
});
const searchDisabledIndex = await json({
  body: { keywords: "hit", page: 1, parent: "/no-index", per_page: 10, scope: 2 },
  method: "POST",
  path: "/api/fs/search",
});
assert.equal(searchDisabledIndex.data.total, 0);

await json({
  method: "POST",
  path: "/api/admin/scan/start",
});
const scanProgress = await json({
  method: "GET",
  path: "/api/admin/scan/progress",
});
assert.equal(scanProgress.data.status, "done");

const storageCreate = await json({
  body: { addition: { address: "https://webdav.example.test", password: "p", username: "u" }, driver: "WebDav", mount_path: "/verify-smoke", remark: "first" },
  method: "POST",
  path: "/api/admin/storage/create",
});
assert.equal(storageCreate.code, 200);
const storageCreateAgain = await json({
  body: { addition: { address: "https://webdav.example.test", password: "p", username: "u" }, driver: "WebDav", mount_path: "/verify-smoke", remark: "second" },
  method: "POST",
  path: "/api/admin/storage/create",
});
assert.equal(storageCreateAgain.code, 409);
const storageList = await json({
  method: "GET",
  path: "/api/admin/storage/list",
});
assert.equal(storageList.data.content.filter((item) => item.mount_path === "/verify-smoke").length, 1);
const webdavImageGet = await json({
  body: { path: "/verify-smoke/remote-image.jpg" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(webdavImageGet.code, 200);
assert.equal(webdavImageGet.data.name, "remote-image.jpg");
assert.equal(webdavImageGet.data.raw_url, "/plugin/private/siyuan-cloud/p/verify-smoke/remote-image.jpg");
const webdavRootList = await json({
  body: { page: 1, path: "/verify-smoke", per_page: 10 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(webdavRootList.code, 200);
assert.deepEqual(webdavRootList.data.content.map((item) => item.name), ["remote-image.jpg"]);
const workspaceMount = await json({
  body: { addition: { root_folder_path: "/@workspace" }, driver: "SiYuanWorkspace", mount_path: "/workspace-smoke" },
  method: "POST",
  path: "/api/admin/storage/create",
});
assert.equal(workspaceMount.code, 200);
const workspaceMountList = await json({
  body: { page: 1, path: "/workspace-smoke", per_page: 10 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(workspaceMountList.code, 200);
assert.equal(workspaceMountList.data.content.some((item) => item.name === "search-root"), true);
const workspaceAssetGet = await json({
  body: { path: "/workspace-smoke/data/assets/workspace-hit.pdf" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(workspaceAssetGet.code, 200);
assert.equal(workspaceAssetGet.data.raw_url, "/assets/workspace-hit.pdf");
const workspaceAssetPreview = await call({
  method: "GET",
  path: "/p/workspace-smoke/data/assets/workspace-hit.pdf",
});
assert.equal(workspaceAssetPreview.statusCode, 302);
assert.equal(workspaceAssetPreview.headers.Location[0], "/assets/workspace-hit.pdf");
const workspaceGenericPublicGet = await json({
  body: { path: "/workspace-smoke/data/widgets/workspace-widget.mp4" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(workspaceGenericPublicGet.code, 200);
assert.equal(workspaceGenericPublicGet.data.raw_url, "/widgets/workspace-widget.mp4");
const workspaceGenericPublicPreview = await call({
  method: "GET",
  path: "/p/workspace-smoke/data/widgets/workspace-widget.mp4",
});
assert.equal(workspaceGenericPublicPreview.statusCode, 302);
assert.equal(workspaceGenericPublicPreview.headers.Location[0], "/widgets/workspace-widget.mp4");
const persistedStorage = await json({
  body: {
    addition: { root_folder_path: "/persisted", token: "mount-token" },
    driver: "WebDav",
    mount_path: "/persisted-mount",
    remark: "persisted mount",
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
assert.equal(persistedStorage.code, 200);
const splitConfig = JSON.parse(storageData.get("config.json"));
assert.equal(splitConfig.storages.some((item) => item.mount_path === "/persisted-mount" && JSON.parse(item.addition).token === "mount-token"), true);
assert.equal(storageData.has("siyuan-cloud/state.json"), false);
await globalThis.siyuan.plugin.lifecycle.onload();
const persistedStorageGet = await json({
  method: "GET",
  path: "/api/admin/storage/get",
  query: `id=${persistedStorage.data.id}`,
});
assert.equal(persistedStorageGet.data.mount_path, "/persisted-mount");
assert.equal(JSON.parse(persistedStorageGet.data.addition).root_folder_path, "/persisted");
assert.equal(JSON.parse(persistedStorageGet.data.addition).token, "mount-token");
const driverNames = await json({
  method: "GET",
  path: "/api/admin/driver/names",
});
assert.equal(driverNames.data.includes("OpenList"), true);
assert.equal(driverNames.data.includes("WebDav"), true);
assert.equal(driverNames.data.includes("BaiduNetdisk"), true);
assert.equal(driverNames.data.includes("AliyundriveOpen"), true);
assert.equal(driverNames.data.includes("123Pan"), true);
assert.equal(driverNames.data.includes("Onedrive"), true);
assert.equal(driverNames.data.includes("189Cloud"), true);
assert.equal(driverNames.data.includes("189CloudPC"), true);
assert.equal(driverNames.data.includes("189CloudTV"), true);
assert.equal(driverNames.data.includes("Quark"), true);
assert.equal(driverNames.data.includes("UC"), true);
assert.equal(driverNames.data.includes("QuarkOpen"), true);
assert.equal(driverNames.data.includes("QuarkTV"), true);
assert.equal(driverNames.data.includes("UCTV"), true);
assert.equal(driverNames.data.includes("Local"), true);
assert.equal(driverNames.data.includes("115 Cloud"), true);
assert.equal(driverNames.data.includes("115 Open"), true);
assert.equal(driverNames.data.includes("115 Share"), true);
assert.equal(driverNames.data.includes("WPS"), true);
assert.equal(driverNames.data.includes("SiYuanKernel"), false);
assert.equal(driverNames.data.includes("SiYuanWorkspace"), true);
assert.equal(driverNames.data.includes("GoogleDrive"), false);
const quarkInfo = await json({
  method: "GET",
  path: "/api/admin/driver/info",
  query: "driver=Quark",
});
assert.equal(quarkInfo.data.config.prefer_proxy, false);
assert.equal(quarkInfo.data.additional.find((item) => item.name === "use_transcoding_address")?.default, "false");
const baiduInfo = await json({
  method: "GET",
  path: "/api/admin/driver/info",
  query: "driver=BaiduNetdisk",
});
assert.equal(baiduInfo.code, 200);
assert.equal(baiduInfo.data.additional.some((item) => item.name === "refresh_token" && item.required), true);
assert.equal(baiduInfo.data.additional.find((item) => item.name === "download_api")?.default, "crack_video");
const oneDriveInfo = await json({
  method: "GET",
  path: "/api/admin/driver/info",
  query: "driver=Onedrive",
});
assert.equal(oneDriveInfo.data.additional.some((item) => item.name === "region" && item.type === "select"), true);
const cloud189PcInfo = await json({
  method: "GET",
  path: "/api/admin/driver/info",
  query: "driver=189CloudPC",
});
assert.equal(cloud189PcInfo.data.additional.some((item) => item.name === "login_type" && item.type === "select"), true);
assert.equal(cloud189PcInfo.data.additional.some((item) => item.name === "generate_torrent"), true);
const cloud189PcQrStart = await json({
  body: {
    driver: "189CloudPC",
    addition: {
      login_type: "qrcode",
      root_folder_id: "-11",
    },
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(cloud189PcQrStart.code, 502);
assert.equal(cloud189PcQrStart.data.verify.type, "qrcode");
assert.equal(cloud189PcQrStart.data.verify.qr_text, "CLOUD189_PC_UUID");
assert.equal(cloud189PcQrStart.data.addition.qrcode_uuid, "CLOUD189_PC_UUID");
assert.equal(cloud189PcQrStart.data.addition.qrcode_reqid, "CLOUD189_PC_REQ");
const cloud189PcQrDone = await json({
  body: {
    driver: "189CloudPC",
    addition: cloud189PcQrStart.data.addition,
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(cloud189PcQrDone.code, 200);
assert.equal(cloud189PcQrDone.data.addition.access_token, "CLOUD189_PC_ACCESS_BY_QR");
assert.equal(cloud189PcQrDone.data.addition.refresh_token, "CLOUD189_PC_REFRESH_BY_QR");
assert.equal(cloud189PcQrDone.data.addition.sessionKey, "CLOUD189_PC_SESSION");
assert.equal(cloud189PcQrDone.data.addition.qrcode_uuid, undefined);
assert.equal(cloud189PcQrStateBody.paramId, "CLOUD189_PC_PARAM");
const cloud189PcFamilyDone = await json({
  body: {
    driver: "189CloudPC",
    addition: {
      access_token: "CLOUD189_PC_ACCESS_BY_QR",
      root_folder_id: "-11",
      type: "family",
    },
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(cloud189PcFamilyDone.code, 200);
assert.equal(cloud189PcFamilyDone.data.addition.root_folder_id, "");
assert.equal(cloud189PcFamilyDone.data.addition.family_id, "189001");
const cloud189TvInfo = await json({
  method: "GET",
  path: "/api/admin/driver/info",
  query: "driver=189CloudTV",
});
assert.equal(cloud189TvInfo.data.additional.some((item) => item.name === "access_token"), true);
const nativeTextEncoder = globalThis.TextEncoder;
globalThis.TextEncoder = undefined;
const cloud189TvQrStart = await json({
  body: {
    driver: "189CloudTV",
    addition: {
      root_folder_id: "-11",
    },
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(cloud189TvQrStart.code, 502);
assert.equal(cloud189TvQrStart.data.addition.temp_uuid, "CLOUD189_TV_UUID");
assert.equal(cloud189TvQrStart.data.verify.qr_text, "https://open.e.189.cn/api/account/qrClinentLogin.do?paras=new_uuid%3DCLOUD189_TV_UUID");
globalThis.TextEncoder = nativeTextEncoder;
const cloud189TvQrPending = await json({
  body: {
    driver: "189CloudTV",
    addition: {
      temp_uuid: "CLOUD189_TV_PENDING_UUID",
    },
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(cloud189TvQrPending.code, 502);
assert.equal(cloud189TvQrPending.data.verify.type, "qrcode");
assert.equal(cloud189TvQrPending.data.verify.qr_text, "https://open.e.189.cn/api/account/qrClinentLogin.do?paras=new_uuid%3DCLOUD189_TV_PENDING_UUID%7C8013418323");
assert.equal(cloud189TvQrPending.data.verify.message, "请使用天翼云盘 App 扫码登录，然后再次点击验证/保存。");
const cloud189TvQrDone = await json({
  body: {
    driver: "189CloudTV",
    addition: cloud189TvQrStart.data.addition,
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(cloud189TvQrDone.code, 200);
assert.equal(cloud189TvQrDone.data.addition.access_token, "CLOUD189_TV_ACCESS_BY_QR");
assert.equal(cloud189TvQrDone.data.addition.sessionKey, "CLOUD189_TV_SESSION");
assert.equal(cloud189TvQrDone.data.addition.temp_uuid, undefined);
const cloud189TvFamilyDone = await json({
  body: {
    driver: "189CloudTV",
    addition: {
      access_token: "CLOUD189_TV_ACCESS_BY_QR",
      root_folder_id: "-11",
      type: "family",
    },
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(cloud189TvFamilyDone.code, 200);
assert.equal(cloud189TvFamilyDone.data.addition.root_folder_id, "");
assert.equal(cloud189TvFamilyDone.data.addition.family_id, "189001");
await json({
  body: {
    driver: "189CloudTV",
    mount_path: "/remote-189-tv",
    addition: JSON.stringify({
      access_token: "CLOUD189_TV_ACCESS_BY_QR",
      root_folder_id: "-11",
      sessionKey: "CLOUD189_TV_SESSION",
      sessionSecret: "CLOUD189_TV_SECRET",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remote189TvList = await json({
  body: { path: "/remote-189-tv", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remote189TvList.data.content[0].name, "big-folder");
const remote189TvDeepList = await json({
  body: { path: "/remote-189-tv/big-folder", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remote189TvDeepList.data.content[0].name, "deep.txt");
assert.equal(cloud189TvListParents.includes("423733170035514321"), true);
await json({
  body: {
    driver: "189Cloud",
    mount_path: "/remote-189",
    addition: JSON.stringify({
      username: "cloud189-user",
      password: "cloud189-pass",
      root_folder_id: "-11",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remote189List = await json({
  body: { path: "/remote-189", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remote189List.code, 200);
assert.equal(remote189List.data.content[0].name, "upload-dir");
assert.equal(cloud189LoginSubmitBody.userName.startsWith("{RSA}"), true);
assert.equal(cloud189LoginSubmitBody.epd.startsWith("{RSA}"), true);
assert.match(cloud189ListCookie, /cookieUserSession=CLOUD189_USER_SESSION/);
const remote189Put = await json({
  body: "cloud189-put",
  headers: {
    "Content-Type": "text/plain",
    "File-Path": encodeURIComponent("/remote-189/upload-dir/cloud189-upload.txt"),
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(remote189Put.code, 200);
assert.equal(cloud189UploadedBody, "cloud189-put");
assert.deepEqual(cloud189UploadRequests.map((item) => item.uri), [
  "/person/initMultiUpload",
  "/person/getMultiUploadUrls",
  "/person/commitMultiUploadFile",
]);
for (const item of cloud189UploadRequests) {
  assert.match(item.params, /^[0-9a-f]+$/);
  assert.equal(item.headers.some((header) => header.SessionKey === "CLOUD189_SESSION"), true);
  assert.equal(item.headers.some((header) => header.PkId === "CLOUD189_PK_ID"), true);
  assert.equal(item.headers.some((header) => header.Signature && /^[0-9a-f]{40}$/.test(header.Signature)), true);
  assert.equal(item.headers.some((header) => header.EncryptionText && /^[A-Za-z0-9+/]+=*$/.test(header.EncryptionText)), true);
  assert.equal(item.headers.some((header) => header["X-Request-Date"]), true);
  assert.equal(item.headers.some((header) => header["X-Request-ID"]), true);
}
cloud189SmsMode = true;
const remote189SmsStart = await json({
  body: {
    driver: "189Cloud",
    addition: {
      username: "cloud189-user",
      password: "cloud189-pass",
      root_folder_id: "-11",
    },
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(remote189SmsStart.code, 502);
assert.equal(remote189SmsStart.data.verify.type, "sms");
assert.equal(remote189SmsStart.data.verify.mobile, "18900000000");
assert.equal(remote189SmsStart.data.verify.show_name, "189****0000");
assert.equal(remote189SmsStart.data.verify.second_context.mobile, "18900000000");
assert.equal(remote189SmsStart.data.verify.second_context.reqId, "CLOUD189_REQ");
assert.deepEqual(cloud189SmsSentBody, {
  appKey: "cloud",
  mobile: "18900000000",
});
assert.equal(cloud189SmsSentCount, 1);
const remote189SmsDone = await json({
  body: {
    driver: "189Cloud",
    addition: remote189SmsStart.data.addition,
    verify: {
      type: "sms",
      second_context: remote189SmsStart.data.verify.second_context,
      sms_code: "123456",
    },
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
cloud189SmsMode = false;
assert.equal(remote189SmsDone.code, 200);
assert.equal(cloud189SmsSentCount, 1);
assert.equal(cloud189SmsSubmitBody.mobile, "18900000000");
assert.equal(cloud189SmsSubmitBody.epd.startsWith("{RSA}"), true);
await json({
  body: {
    driver: "189Cloud",
    mount_path: "/remote-189-sms",
    addition: remote189SmsDone.data.addition,
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
cloud189SmsMode = true;
cloud189RefreshCookieMode = true;
const remote189SmsList = await json({
  body: { path: "/remote-189-sms", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
const remote189SmsNestedList = await json({
  body: { path: "/remote-189-sms/upload-dir", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
cloud189RefreshCookieMode = false;
cloud189SmsMode = false;
assert.equal(remote189SmsList.code, 200);
assert.equal(remote189SmsList.data.content[0].name, "upload-dir");
assert.equal(remote189SmsNestedList.code, 200);
assert.equal(remote189SmsNestedList.data.content[0].name, "nested.txt");
assert.match(cloud189ListCookie, /cookieUserSession=CLOUD189_REFRESHED_SESSION/);
assert.equal(cloud189SmsSentCount, 1);
await json({
  body: {
    driver: "189Cloud",
    mount_path: "/remote-189-needs-sms",
    addition: {
      username: "cloud189-user",
      password: "cloud189-pass",
      root_folder_id: "-11",
    },
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
cloud189SmsMode = true;
const remote189NeedsSmsList = await json({
  body: { path: "/remote-189-needs-sms", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
cloud189SmsMode = false;
assert.equal(remote189NeedsSmsList.code, 502);
assert.match(remote189NeedsSmsList.message, /SMS second verification is required/);
assert.equal(cloud189SmsSentCount, 1);
await json({
  body: {
    driver: "189Cloud",
    mount_path: "/remote-189-bad-cookie",
    addition: {
      cookie: "cookieUserSession=CLOUD189_BAD_SESSION",
      username: "cloud189-user",
      password: "cloud189-pass",
      root_folder_id: "-11",
    },
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
cloud189SmsMode = true;
const remote189BadCookieList = await json({
  body: { path: "/remote-189-bad-cookie", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
cloud189SmsMode = false;
assert.equal(remote189BadCookieList.code, 502);
assert.match(remote189BadCookieList.message, /login cookie is invalid or expired/);
assert.equal(cloud189SmsSentCount, 1);
const quarkOpenInfo = await json({
  method: "GET",
  path: "/api/admin/driver/info",
  query: "driver=QuarkOpen",
});
assert.equal(quarkOpenInfo.data.additional.some((item) => item.name === "app_id" && item.required), false);
assert.equal(quarkOpenInfo.data.config.only_proxy, true);
const quarkTvInfo = await json({
  method: "GET",
  path: "/api/admin/driver/info",
  query: "driver=QuarkTV",
});
assert.equal(quarkTvInfo.data.additional.some((item) => item.name === "link_method" && item.type === "select"), true);
assert.equal(quarkTvInfo.data.additional.find((item) => item.name === "link_method")?.default, "streaming");
const exportedConfig = await json({
  method: "GET",
  path: "/api/admin/config/export",
});
assert.equal(exportedConfig.code, 200);
assert.equal(Array.isArray(exportedConfig.data.storages), true);
const importedConfig = await json({
  body: {
    config: {
      ...exportedConfig.data,
      storages: [
        ...exportedConfig.data.storages,
        { addition: "{}", driver: "SiYuanKernel", id: 98, mount_path: "/" },
        { addition: { refresh_token: "rt" }, driver: "BaiduNetdisk", id: 99, mount_path: "/baidu-smoke" },
      ],
      sharings: [
        ...(exportedConfig.data.sharings || []),
        { files: ["/moved/a.txt"], id: "分享-导入", pwd: "pw" },
      ],
    },
  },
  method: "POST",
  path: "/api/admin/config/import",
});
assert.equal(importedConfig.code, 200);
assert.equal(importedConfig.data.storages >= 2, true);
assert.equal(importedConfig.data.sharings >= 1, true);
const importedAfterFilter = await json({
  method: "GET",
  path: "/api/admin/config/export",
});
assert.equal(importedAfterFilter.data.storages.some((item) => item.driver === "SiYuanKernel"), false);
const importedShare = await json({
  method: "GET",
  path: "/api/share/get",
  query: `id=${encodeURIComponent("分享-导入")}`,
});
assert.equal(importedShare.code, 200);
assert.equal(importedShare.data.id, "分享-导入");
await json({
  body: {
    driver: "OpenList",
    mount_path: "/remote",
    addition: JSON.stringify({ url: "https://openlist.example.test", token: "smoke" }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const rootWithMount = await json({
  body: { path: "/", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(rootWithMount.data.content.some((item) => item.name === "remote"), true);
const remoteList = await json({
  body: { path: "/remote", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remoteList.data.provider, "OpenList");
assert.equal(remoteList.data.content[0].name, "remote.txt");
await json({
  body: {
    driver: "OpenList",
    mount_path: "/remote-login",
    addition: JSON.stringify({
      password: "pass",
      url: "https://openlist-login.example.test",
      username: "user",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteLoginList = await json({
  body: { path: "/remote-login", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remoteLoginList.data.provider, "OpenList");
assert.equal(remoteLoginList.data.content[0].name, "remote-login.txt");
const openListLoginConfig = await json({
  method: "GET",
  path: "/api/admin/config/export",
});
const openListLoginStorage = openListLoginConfig.data.storages.find((item) => item.mount_path === "/remote-login");
assert.equal(JSON.parse(openListLoginStorage.addition).token, "OPENLIST_TOKEN_REFRESHED");
const remoteGet = await json({
  body: { path: "/remote/remote.txt" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(remoteGet.data.provider, "OpenList");
const openListDriverTest = await json({
  body: {
    addition: { token: "smoke", url: "https://openlist.example.test" },
    driver: "OpenList",
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(openListDriverTest.code, 200);
assert.equal(openListDriverTest.data.ok, true);
const openListAdminUrlTest = await json({
  body: {
    addition: { token: "smoke", url: "https://openlist.example.test/admin" },
    driver: "AListV3",
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(openListAdminUrlTest.code, 200);
const openListPrivateUrlTest = await json({
  body: {
    addition: { token: "smoke", url: "http://192.168.1.137:5244/admin" },
    driver: "AListV3",
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(openListPrivateUrlTest.code, 502);
assert.match(openListPrivateUrlTest.message, /SSRF protection/);
const remoteRelativeGet = await json({
  body: { path: "/remote/relative.txt" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(remoteRelativeGet.data.raw_url, "https://openlist.example.test/d/relative.txt");
const remoteRelativeRead = await call({
  path: "/d/remote/relative.txt",
});
assert.equal(remoteRelativeRead.statusCode, 302);
assert.equal(remoteRelativeRead.headers.Location[0], "https://openlist.example.test/d/relative.txt");
const remoteRelativeProxyRead = await call({
  path: "/p/remote/relative.txt",
});
assert.equal(remoteRelativeProxyRead.body.proxy.url, "https://openlist.example.test/d/relative.txt");
const remoteOther = await json({
  body: {
    path: "/remote/remote.txt",
    method: "custom-action",
    data: { value: "payload" },
  },
  method: "POST",
  path: "/api/fs/other",
});
assert.equal(remoteOther.code, 200);
assert.equal(remoteOther.data.echoed_path, "/remote.txt");
assert.equal(remoteOther.data.echoed_method, "custom-action");
assert.deepEqual(remoteOther.data.echoed_data, { value: "payload" });
assert.deepEqual(openListOtherBody, {
  path: "/remote.txt",
  method: "custom-action",
  data: { value: "payload" },
  password: "",
});
const remoteArchiveList = await json({
  body: { inner_path: "/", page: 1, path: "/remote/remote.zip", per_page: 10 },
  method: "POST",
  path: "/api/fs/archive/list",
});
assert.equal(remoteArchiveList.code, 200);
assert.equal(remoteArchiveList.data.content[0].name, "hello.txt");
const remoteArchiveExtract = await text({
  method: "GET",
  path: "/ae/remote/remote.zip",
  query: "inner=hello.txt",
});
assert.equal(remoteArchiveExtract.response.statusCode, 200);
assert.equal(remoteArchiveExtract.text, "zip from openlist");
const remoteBatchRename = await json({
  body: {
    rename_objects: [{
      new_name: "remote-renamed.txt",
      src_name: "remote.txt",
    }],
    src_dir: "/remote",
  },
  method: "POST",
  path: "/api/fs/batch_rename",
});
assert.equal(remoteBatchRename.code, 200);
const remoteRegexRename = await json({
  body: {
    new_name_regex: "regex-$1.txt",
    src_dir: "/remote",
    src_name_regex: "^(remote)\\.txt$",
  },
  method: "POST",
  path: "/api/fs/regex_rename",
});
assert.equal(remoteRegexRename.code, 200);
assert.deepEqual(openListRenameBodies, [
  { path: "/remote.txt", name: "remote-renamed.txt" },
  { path: "/remote.txt", name: "regex-remote.txt" },
]);
const remoteRecursiveMove = await json({
  body: {
    conflict_policy: "skip",
    dst_dir: "/remote/target",
    src_dir: "/remote",
  },
  method: "POST",
  path: "/api/fs/recursive_move",
});
assert.equal(remoteRecursiveMove.code, 200);
assert.equal(remoteRecursiveMove.message, "Successfully moved 2 files");
assert.deepEqual(openListMoveBodies, [
  { src_dir: "/", dst_dir: "/target", names: ["remote.txt"] },
  { src_dir: "/folder", dst_dir: "/target", names: ["nested.txt"] },
]);
const remoteRemoveEmpty = await json({
  body: {
    src_dir: "/remote",
  },
  method: "POST",
  path: "/api/fs/remove_empty_directory",
});
assert.equal(remoteRemoveEmpty.code, 200);
assert.deepEqual(openListRemoveBodies, [
  { dir: "/", names: ["empty-dir"] },
]);
const virtualOther = await json({
  body: {
    path: "/smoke/a.txt",
    method: "custom-action",
  },
  method: "POST",
  path: "/api/fs/other",
});
assert.equal(virtualOther.code, 500);
assert.equal(virtualOther.message, "not implement");
await json({
  body: {
    driver: "S3",
    mount_path: "/remote-s3",
    addition: JSON.stringify({
      access_key_id: "AK",
      bucket: "bucket",
      direct_upload_host: "https://direct-s3.example.test",
      enable_direct_upload: true,
      endpoint: "https://s3.example.test",
      force_path_style: true,
      region: "us-east-1",
      secret_access_key: "SK",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteS3List = await json({
  body: { path: "/remote-s3", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remoteS3List.data.provider, "S3");
assert.equal(remoteS3List.data.content[0].name, "object.txt");
const remoteS3Get = await json({
  body: { path: "/remote-s3/object.txt" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(remoteS3Get.data.provider, "S3");
const remoteS3Link = await json({
  body: { path: "/remote-s3/object.txt" },
  method: "POST",
  path: "/api/fs/link",
});
assert.equal(remoteS3Link.code, 200);
const remoteS3LinkUrl = new URL(remoteS3Link.data.url);
assert.equal(remoteS3LinkUrl.hostname, "s3.example.test");
assert.equal(remoteS3LinkUrl.pathname, "/bucket/object.txt");
assert.equal(remoteS3LinkUrl.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
assert.equal(remoteS3LinkUrl.searchParams.get("response-content-disposition"), "attachment; filename*=UTF-8''object.txt");
assert.ok(remoteS3Link.data.url.indexOf("X-Amz-Algorithm=") < remoteS3Link.data.url.indexOf("response-content-disposition="));
const remoteS3ProxyRead = await call({
  method: "GET",
  path: "/p/remote-s3/object.txt",
});
assert.equal(remoteS3ProxyRead.statusCode, 200);
assert.equal(remoteS3ProxyRead.body.proxy.url, "https://s3.example.test/bucket/object.txt");
assert.match(remoteS3ProxyRead.body.proxy.headers.Authorization[0], /AWS4-HMAC-SHA256/);
const remoteS3ProxyRangeRead = await call({
  headers: { Range: ["bytes=0-2"] },
  method: "GET",
  path: "/p/remote-s3/object.txt",
});
assert.equal(remoteS3ProxyRangeRead.statusCode, 200);
assert.equal(
  Object.entries(remoteS3ProxyRangeRead.body.proxy.headers).find(([key]) => key.toLowerCase() === "range")?.[1][0],
  "bytes=0-2",
);
const remoteS3DirectInfo = await json({
  body: { path: "/remote-s3/direct-upload.txt" },
  method: "POST",
  path: "/api/fs/get_direct_upload_info",
});
assert.equal(remoteS3DirectInfo.code, 200);
assert.equal(remoteS3DirectInfo.data.method, "PUT");
const remoteS3DirectUrl = new URL(remoteS3DirectInfo.data.upload_url);
assert.equal(remoteS3DirectUrl.hostname, "direct-s3.example.test");
assert.equal(remoteS3DirectUrl.pathname, "/bucket/direct-upload.txt");
assert.equal(remoteS3DirectUrl.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
assert.equal(remoteS3DirectUrl.searchParams.get("X-Amz-Credential")?.startsWith("AK/"), true);
assert.equal(remoteS3DirectUrl.searchParams.get("X-Amz-Expires"), "14400");
assert.equal(remoteS3DirectUrl.searchParams.get("X-Amz-SignedHeaders"), "host");
assert.equal(Boolean(remoteS3DirectUrl.searchParams.get("X-Amz-Signature")), true);
const remoteS3SpecialName = "投资/奥本海默传 “原子弹之父”的美国悲剧 (凯·伯德 马丁·J.舍温) (z-l v3.7.1).txt";
const remoteS3SpecialPut = await json({
  body: {
    content: "special s3 upload",
    path: `/remote-s3/${remoteS3SpecialName}`,
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(remoteS3SpecialPut.code, 200);
const remoteS3SpecialUrl = new URL(s3PutUrls.at(-1));
assert.equal(remoteS3SpecialUrl.pathname.includes("("), false);
assert.equal(remoteS3SpecialUrl.pathname.includes("%28"), true);
assert.equal(remoteS3SpecialUrl.pathname.includes("%29"), true);
await json({
  body: {
    driver: "115 Cloud",
    mount_path: "/remote-115",
    addition: JSON.stringify({
      cookie: "UID=115_UID;CID=115_CID;SEID=115_SEID;KID=115_KID",
      page_size: 1000,
      root_folder_id: "0",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remote115List = await json({
  body: { path: "/remote-115", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remote115List.code, 200);
assert.equal(remote115List.data.provider, "115 Cloud");
assert.equal(remote115List.data.content.some((item) => item.name === "115-doc.txt"), true);
const remote115Get = await json({
  body: { path: "/remote-115/115-doc.txt" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(remote115Get.data.provider, "115 Cloud");
assert.equal(remote115Get.data.name, "115-doc.txt");
const remote115QrStart = await json({
  body: {
    driver: "115 Cloud",
    addition: {
      page_size: 1000,
      root_folder_id: "0",
    },
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(remote115QrStart.code, 502);
assert.equal(remote115QrStart.data.verify.type, "qrcode");
assert.equal(remote115QrStart.data.verify.qr_text, "https://qrcodeapi.115.com/mock-qrcode-content");
assert.equal(remote115QrStart.data.addition.qrcode_token, "115_QR_UID");
const remote115QrDone = await json({
  body: {
    driver: "115 Cloud",
    addition: remote115QrStart.data.addition,
    verify: { type: "qrcode" },
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(remote115QrDone.code, 200);
assert.deepEqual(pan115QrLoginPaths.slice(-1), ["/app/1.0/web/1.0/login/qrcode"]);
assert.equal(remote115QrDone.data.addition.cookie, "UID=115_QR_UID;CID=115_QR_CID;SEID=115_QR_SEID;KID=115_QR_KID");
assert.equal(remote115QrDone.data.addition.qrcode_token, "");
const pan115Driver = create115Driver({ client: globalThis.siyuan.client });
const pan115Storage = {
  addition_json: {
    cookie: "UID=115_UID;CID=115_CID;SEID=115_SEID;KID=115_KID",
    root_folder_id: "0",
  },
  driver: "115 Cloud",
  mount_path: "/remote-115",
};
const pan115FormStart = pan115Forms.length;
await pan115Driver.mkdir(pan115Storage, "/new-dir");
await pan115Driver.rename(pan115Storage, "/115-doc.txt", "renamed-115.txt");
await pan115Driver.move(pan115Storage, "/115-doc.txt", "/target");
await pan115Driver.copy(pan115Storage, "/115-doc.txt", "/target");
await pan115Driver.remove(pan115Storage, "/115-doc.txt");
await assert.rejects(
  () => pan115Driver.read(pan115Storage, "/115-no-pc.txt"),
  /115 download url is empty/,
);
assert.equal(pan115DownurlCalls, 1);
const pan115Details = await pan115Driver.details(pan115Storage);
assert.deepEqual(pan115Forms.slice(pan115FormStart), [
  { path: "/files/add", form: { cname: "new-dir", pid: "0" } },
  { path: "/files/batch_rename", form: { fid: "115-file-1", file_name: "renamed-115.txt", "files_new_name[115-file-1]": "renamed-115.txt" } },
  { path: "/files/move", form: { "fid[0]": "115-file-1", pid: "115-folder-1" } },
  { path: "/files/copy", form: { "fid[0]": "115-file-1", pid: "115-folder-1" } },
  { path: "/rb/delete", form: { "fid[0]": "115-file-1" } },
]);
assert.deepEqual(pan115Details, {
  total_space: 1000,
  used_space: 300,
  free_space: 700,
});
await json({
  body: {
    driver: "115 Open",
    mount_path: "/remote-115-open",
    addition: JSON.stringify({
      access_token: "115_OPEN_ACCESS",
      limit_rate: 0,
      page_size: 200,
      refresh_token: "115_OPEN_REFRESH",
      root_folder_id: "0",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remote115OpenList = await json({
  body: { path: "/remote-115-open", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remote115OpenList.code, 200);
assert.equal(remote115OpenList.data.provider, "115 Open");
assert.equal(remote115OpenList.data.content.some((item) => item.name === "115-open-doc.txt"), true);
const remote115OpenRead = await call({
  method: "GET",
  path: "/p/remote-115-open/115-open-doc.txt",
});
assert.equal(remote115OpenRead.statusCode, 200);
assert.equal(remote115OpenRead.body.proxy.url, "https://115-open-download.example.test/115-open-doc.txt");
assert.equal(remote115OpenRead.body.proxy.headers["User-Agent"][0], "Mozilla/5.0 (Macintosh; Apple macOS 26_1_0) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/142.0.0.0 OpenList/425.6.30");
const pan115OpenDriver = create115OpenDriver({ client: globalThis.siyuan.client });
const pan115OpenStorage = {
  addition_json: {
    access_token: "115_OPEN_ACCESS",
    limit_rate: 0,
    refresh_token: "115_OPEN_REFRESH",
    root_folder_id: "0",
  },
  driver: "115 Open",
  mount_path: "/remote-115-open",
};
const pan115OpenFormStart = pan115OpenForms.length;
await pan115OpenDriver.mkdir(pan115OpenStorage, "/new-open-dir");
await pan115OpenDriver.rename(pan115OpenStorage, "/115-open-doc.txt", "renamed-115-open.txt");
await pan115OpenDriver.move(pan115OpenStorage, "/115-open-doc.txt", "/target");
await pan115OpenDriver.copy(pan115OpenStorage, "/115-open-doc.txt", "/target");
await pan115OpenDriver.remove(pan115OpenStorage, "/115-open-doc.txt");
const pan115OpenDetails = await pan115OpenDriver.details(pan115OpenStorage);
assert.deepEqual(pan115OpenForms.slice(pan115OpenFormStart), [
  { path: "/open/folder/add", form: { pid: "0", file_name: "new-open-dir" } },
  { path: "/open/ufile/update", form: { file_id: "115-open-file-1", file_name: "renamed-115-open.txt" } },
  { path: "/open/ufile/move", form: { file_ids: "115-open-file-1", to_cid: "115-open-folder-1" } },
  { path: "/open/ufile/copy", form: { pid: "115-open-folder-1", file_id: "115-open-file-1", no_dupli: "1" } },
  { path: "/open/ufile/delete", form: { file_ids: "115-open-file-1" } },
]);
assert.deepEqual(pan115OpenDetails, {
  total_space: 2000,
  used_space: 600,
  free_space: 1400,
});
await json({
  body: {
    driver: "115 Share",
    mount_path: "/remote-115-share",
    addition: JSON.stringify({
      cookie: "UID=115_UID;CID=115_CID;SEID=115_SEID;KID=115_KID",
      limit_rate: 0,
      page_size: 1000,
      receive_code: "abcd",
      root_folder_id: "0",
      share_code: "swnxxxxxxx",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remote115ShareList = await json({
  body: { path: "/remote-115-share", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remote115ShareList.code, 200);
assert.equal(remote115ShareList.data.provider, "115 Share");
assert.equal(remote115ShareList.data.write, false);
assert.equal(remote115ShareList.data.content.some((item) => item.name === "115-share-doc.txt"), true);
const remote115ShareRead = await call({
  method: "GET",
  path: "/p/remote-115-share/115-share-doc.txt",
});
assert.equal(remote115ShareRead.statusCode, 200);
assert.equal(remote115ShareRead.body.proxy.url, "https://115-share-download.example.test/115-share-doc.txt");
assert.equal(remote115ShareRead.body.proxy.headers["User-Agent"][0], "Mozilla/5.0 115Browser/35.6.0.3");
const pan115ShareDriver = create115ShareDriver({ client: globalThis.siyuan.client });
await assert.rejects(() => pan115ShareDriver.mkdir({ addition_json: {} }, "/blocked"), /not supported/);
assert.ok(pan115ShareQueries.some((query) => query.share_code === "swnxxxxxxx" && query.receive_code === "abcd"));
await json({
  body: {
    driver: "Onedrive",
    mount_path: "/remote-onedrive",
    addition: JSON.stringify({
      access_token: "OD_ACCESS",
      chunk_size: 3,
      refresh_token: "OD_REFRESH",
      region: "global",
      root_folder_path: "/",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteOneDriveList = await json({
  body: { path: "/remote-onedrive", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remoteOneDriveList.data.provider, "Onedrive");
assert.equal(remoteOneDriveList.data.content[0].name, "remote-doc.txt");
const remoteOneDriveGet = await json({
  body: { path: "/remote-onedrive/remote-doc.txt" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(remoteOneDriveGet.data.provider, "Onedrive");
await json({
  body: {
    driver: "Onedrive",
    mount_path: "/remote-onedrive-refresh",
    addition: JSON.stringify({
      refresh_token: "OD_REFRESH_OLD",
      region: "global",
      root_folder_path: "/",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteOneDriveRefreshList = await json({
  body: { path: "/remote-onedrive-refresh", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remoteOneDriveRefreshList.data.provider, "Onedrive");
const oneDriveRefreshConfig = await json({
  method: "GET",
  path: "/api/admin/config/export",
});
const oneDriveRefreshStorage = oneDriveRefreshConfig.data.storages.find((item) => item.mount_path === "/remote-onedrive-refresh");
const oneDriveRefreshAddition = JSON.parse(oneDriveRefreshStorage.addition);
assert.equal(oneDriveRefreshAddition.access_token, "OD_ACCESS_REFRESHED");
assert.equal(oneDriveRefreshAddition.refresh_token, "OD_REFRESH_REFRESHED");
const remoteOneDriveRead = await call({
  method: "GET",
  path: "/d/remote-onedrive/remote-doc.txt",
});
assert.equal(remoteOneDriveRead.statusCode, 302);
assert.equal(remoteOneDriveRead.headers.Location[0], "https://download.example.test/remote-doc.txt");
const remoteOneDriveProxyRead = await call({
  method: "GET",
  path: "/p/remote-onedrive/remote-doc.txt",
});
assert.equal(remoteOneDriveProxyRead.body.proxy.url, "https://download.example.test/remote-doc.txt");
assert.equal(remoteOneDriveProxyRead.body.proxy.method, "GET");
const remoteOneDriveLink = await json({
  body: { path: "/remote-onedrive/remote-doc.txt" },
  method: "POST",
  path: "/api/fs/link",
});
assert.equal(remoteOneDriveLink.data.raw_url, "https://download.example.test/remote-doc.txt");
assert.equal(remoteOneDriveLink.data.url, "https://download.example.test/remote-doc.txt");
const remoteOneDriveShareCreate = await json({
  body: { files: ["/remote-onedrive/remote-doc.txt"], id: "share-onedrive", pwd: "odpw" },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(remoteOneDriveShareCreate.code, 200);
const remoteOneDriveShareRedirect = await call({
  method: "GET",
  path: "/sd/share-onedrive",
  query: "download=1&pwd=odpw",
});
assert.equal(remoteOneDriveShareRedirect.statusCode, 302);
assert.equal(remoteOneDriveShareRedirect.headers.Location[0], "https://download.example.test/remote-doc.txt");
const oneDriveBigBody = "o".repeat(6 * 1024 * 1024 + 1);
const remoteOneDriveBigPut = await json({
  body: oneDriveBigBody,
  headers: {
    "Content-Type": "application/octet-stream",
    "File-Path": encodeURIComponent("/remote-onedrive/onedrive-big.bin"),
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(remoteOneDriveBigPut.code, 200);
assert.deepEqual(oneDriveSessionBodies.at(-1), {
  item: {
    fileSystemInfo: {},
  },
});
assert.deepEqual(oneDriveUploadRanges, [
  `bytes 0-${3 * 1024 * 1024 - 1}/${oneDriveBigBody.length}`,
  `bytes ${3 * 1024 * 1024}-${6 * 1024 * 1024 - 1}/${oneDriveBigBody.length}`,
  `bytes ${6 * 1024 * 1024}-${oneDriveBigBody.length - 1}/${oneDriveBigBody.length}`,
]);
assert.equal(oneDriveUploadedSize, oneDriveBigBody.length);
await json({
  body: {
    driver: "Onedrive",
    mount_path: "/remote-onedrive-direct",
    addition: JSON.stringify({
      access_token: "OD_ACCESS",
      chunk_size: 2,
      enable_direct_upload: true,
      refresh_token: "OD_REFRESH",
      region: "global",
      root_folder_path: "/",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteOneDriveDirectInfo = await json({
  body: { path: "/remote-onedrive-direct/direct.bin" },
  method: "POST",
  path: "/api/fs/get_direct_upload_info",
});
assert.equal(remoteOneDriveDirectInfo.code, 200);
assert.equal(remoteOneDriveDirectInfo.data.upload_url, "https://onedrive-upload.example.test/upload-session");
assert.equal(remoteOneDriveDirectInfo.data.chunk_size, 2 * 1024 * 1024);
assert.equal(remoteOneDriveDirectInfo.data.method, "PUT");
assert.deepEqual(oneDriveSessionBodies.at(-1), {
  item: {
    "@microsoft.graph.conflictBehavior": "rename",
  },
});
const oneDriveDriver = createOneDriveDriver({ client: globalThis.siyuan.client });
const oneDriveStorage = {
  addition_json: {
    access_token: "OD_ACCESS",
    refresh_token: "OD_REFRESH",
    region: "global",
    root_folder_path: "/",
  },
  driver: "Onedrive",
  mount_path: "/remote-onedrive",
};
const oneDrivePatchStart = oneDrivePatchBodies.length;
const oneDriveCopyStart = oneDriveCopyBodies.length;
await oneDriveDriver.rename(oneDriveStorage, "/remote-doc.txt", "renamed.txt");
await oneDriveDriver.move(oneDriveStorage, "/remote-doc.txt", "/target");
await oneDriveDriver.copy(oneDriveStorage, "/remote-doc.txt", "/target");
const oneDriveDetails = await oneDriveDriver.details(oneDriveStorage);
assert.deepEqual(oneDrivePatchBodies.slice(oneDrivePatchStart), [
  {
    path: "/v1.0/me/drive/root:/remote-doc.txt:",
    body: {
      parentReference: {
        id: "onedrive-parent-1",
      },
      name: "renamed.txt",
    },
  },
  {
    path: "/v1.0/me/drive/root:/remote-doc.txt:",
    body: {
      parentReference: {
        id: "onedrive-target-folder",
      },
      name: "remote-doc.txt",
    },
  },
]);
assert.deepEqual(oneDriveCopyBodies.slice(oneDriveCopyStart), [{
  parentReference: {
    driveId: "onedrive-drive-1",
    id: "onedrive-target-folder",
  },
  name: "remote-doc.txt",
}]);
assert.deepEqual(oneDriveDetails, {
  total_space: 1000,
  used_space: 250,
  free_space: 750,
});
await json({
  body: {
    driver: "AliyundriveOpen",
    mount_path: "/remote-ali-open",
    addition: JSON.stringify({
      access_token: "ALI_OPEN_ACCESS",
      drive_id: "ali-open-drive",
      drive_type: "resource",
      rapid_upload: true,
      root_folder_id: "root",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const aliOpenOther = await json({
  body: {
    path: "/remote-ali-open/ali-video.mp4",
    method: "video_preview",
  },
  method: "POST",
  path: "/api/fs/other",
});
assert.equal(aliOpenOther.code, 200);
assert.equal(aliOpenOther.data.video_preview_play_info.live_transcoding_task_list[0].url, "https://ali-preview.example.test/ali-video.m3u8");
assert.deepEqual(aliOpenPreviewBody, {
  drive_id: "ali-open-drive",
  file_id: "ali-open-video-file",
  category: "live_transcoding",
  url_expire_sec: 14400,
});
const aliOpenGet = await json({
  body: { path: "/remote-ali-open/ali-video.mp4" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(aliOpenGet.code, 200);
assert.equal(aliOpenGet.data.raw_url, "https://ali-download.example.test/ali-video.mp4");
const aliOpenDirectRead = await call({
  headers: { Range: ["bytes=0-"] },
  method: "GET",
  path: "/d/remote-ali-open/ali-video.mp4",
});
assert.equal(aliOpenDirectRead.statusCode, 302);
assert.equal(aliOpenDirectRead.headers.Location[0], "https://ali-download.example.test/ali-video.mp4");
const aliOpenProxyRead = await call({
  headers: { Range: ["bytes=0-"] },
  method: "GET",
  path: "/p/remote-ali-open/ali-video.mp4",
});
assert.equal(aliOpenProxyRead.statusCode, 200);
assert.equal(aliOpenProxyRead.body.proxy.url, "https://ali-download.example.test/ali-video.mp4");
assert.equal(aliOpenProxyRead.body.proxy.headers.Range[0], "bytes=0-");
const aliOpenOtherUnsupported = await json({
  body: {
    path: "/remote-ali-open/ali-video.mp4",
    method: "doc_preview",
  },
  method: "POST",
  path: "/api/fs/other",
});
assert.equal(aliOpenOtherUnsupported.code, 500);
assert.equal(aliOpenOtherUnsupported.message, "not support");
const remoteAliOpenPut = await json({
  body: "hello ali",
  headers: {
    "Content-Type": "text/plain",
    "File-Path": encodeURIComponent("/remote-ali-open/ali-upload.txt"),
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(remoteAliOpenPut.code, 200);
const aliOpenNormalCreate = aliOpenCreateBodies.at(-1);
assert.equal(aliOpenNormalCreate.drive_id, "ali-open-drive");
assert.equal(aliOpenNormalCreate.parent_file_id, "root");
assert.equal(aliOpenNormalCreate.name, "ali-upload.txt");
assert.equal(aliOpenNormalCreate.type, "file");
assert.equal(aliOpenNormalCreate.check_name_mode, "ignore");
assert.deepEqual(aliOpenNormalCreate.part_info_list, [{ part_number: 1 }]);
assert.match(aliOpenNormalCreate.local_modified_at, /^\d{4}-\d{2}-\d{2}T/);
assert.equal(aliOpenUploadedBody, "hello ali");
assert.deepEqual(aliOpenCompleteBodies.at(-1), {
  drive_id: "ali-open-drive",
  file_id: "ali-open-upload-file",
  upload_id: "ali-open-upload-id",
});
const aliOpenPutCountBeforeRapid = aliOpenPutCount;
const aliOpenRapidBody = "rapid-ali".repeat(16384);
const remoteAliOpenRapidPut = await json({
  body: aliOpenRapidBody,
  headers: {
    "Content-Type": "text/plain",
    "File-Path": encodeURIComponent("/remote-ali-open/ali-rapid.txt"),
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(remoteAliOpenRapidPut.code, 200);
const aliOpenRapidPreHashCreate = aliOpenCreateBodies.at(-2);
const aliOpenRapidProofCreate = aliOpenCreateBodies.at(-1);
assert.equal(aliOpenRapidPreHashCreate.name, "ali-rapid.txt");
assert.equal(aliOpenRapidPreHashCreate.size, Buffer.byteLength(aliOpenRapidBody));
assert.equal(aliOpenRapidPreHashCreate.pre_hash, crypto.createHash("sha1").update(aliOpenRapidBody.slice(0, 1024)).digest("hex"));
assert.equal(aliOpenRapidProofCreate.name, "ali-rapid.txt");
assert.equal(aliOpenRapidProofCreate.pre_hash, undefined);
assert.equal(aliOpenRapidProofCreate.proof_version, "v1");
assert.equal(aliOpenRapidProofCreate.content_hash_name, "sha1");
assert.equal(aliOpenRapidProofCreate.content_hash, crypto.createHash("sha1").update(aliOpenRapidBody).digest("hex"));
assert.equal(Boolean(aliOpenRapidProofCreate.proof_code), true);
assert.equal(aliOpenPutCount, aliOpenPutCountBeforeRapid);
assert.deepEqual(aliOpenCompleteBodies.at(-1), {
  drive_id: "ali-open-drive",
  file_id: "ali-open-rapid-file",
  upload_id: "ali-open-rapid-upload-id",
});
const aliOpenDriver = createAliyundriveOpenDriver({ client: globalThis.siyuan.client });
const aliOpenDetails = await aliOpenDriver.details({
  addition_json: {
    access_token: "ALI_OPEN_ACCESS",
    drive_id: "ali-open-drive",
  },
  driver: "AliyundriveOpen",
  mount_path: "/remote-ali-open",
});
assert.deepEqual(aliOpenDetails, {
  total_space: 5000,
  used_space: 1250,
  free_space: 3750,
});
const remote123Create = await json({
  body: {
    driver: "123Pan",
    mount_path: "/remote-123",
    addition: JSON.stringify({
      access_token: "PAN123_ACCESS",
      password: "pass",
      platform: "web",
      root_folder_id: "0",
      username: "user",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remote123StorageGet = await json({
  method: "GET",
  path: "/api/admin/storage/get",
  query: `id=${remote123Create.data.id}`,
});
assert.equal(remote123StorageGet.data.driver, "123Pan");
assert.equal(remote123StorageGet.data.mount_path, "/remote-123");
assert.equal(JSON.parse(remote123StorageGet.data.addition).username, "user");
assert.equal(JSON.parse(remote123StorageGet.data.addition).password, "pass");
assert.equal(JSON.parse(remote123StorageGet.data.addition).access_token, "PAN123_ACCESS");
const syncedConfig = JSON.parse(storageData.get("config.json"));
const syncedRemote123 = syncedConfig.storages.find((item) => item.id === remote123Create.data.id);
syncedRemote123.addition = JSON.stringify({
  access_token: "PAN123_ACCESS",
  password: "synced-pass",
  platform: "web",
  root_folder_id: "0",
  username: "synced-user",
});
storageData.set("config.json", JSON.stringify(syncedConfig, null, 2));
const remote123StorageReloaded = await json({
  method: "GET",
  path: "/api/admin/storage/get",
  query: `id=${remote123Create.data.id}`,
});
assert.equal(JSON.parse(remote123StorageReloaded.data.addition).username, "synced-user");
assert.equal(JSON.parse(remote123StorageReloaded.data.addition).password, "synced-pass");
const remote123List = await json({
  body: { path: "/remote-123", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remote123List.data.provider, "123Pan");
assert.equal(remote123List.data.content[0].name, "pan123.txt");
const remote123Get = await json({
  body: { path: "/remote-123/pan123.txt" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(remote123Get.data.provider, "123Pan");
assert.equal(remote123Get.data.raw_url, "/plugin/private/siyuan-cloud/p/remote-123/pan123.txt");
const remote123Read = await call({
  method: "GET",
  path: "/d/remote-123/pan123.txt",
});
assert.equal(remote123Read.body.proxy.url, "https://download123.example.test/pan123.txt");
assert.equal(remote123Read.body.proxy.headers.Referer[0], "https://download123.example.test/");
assert.equal(remote123Read.body.proxy.method, "GET");
const remote123Preview = await call({
  method: "GET",
  path: "/p/remote-123/pan123.txt",
});
assert.equal(remote123Preview.body.proxy.url, "https://download123.example.test/pan123.txt");
assert.equal(remote123Preview.body.proxy.headers.Referer[0], "https://download123.example.test/");
const remote123ShareCreate = await json({
  body: { files: ["/remote-123/pan123.txt"], id: "share-remote-123", pwd: "rpw" },
  method: "POST",
  path: "/api/share/create",
});
assert.equal(remote123ShareCreate.code, 200);
assert.deepEqual(remote123ShareCreate.data.files, ["/remote-123/pan123.txt"]);
const remote123ShareGet = await json({
  body: { password: "rpw", path: "/share-remote-123" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(remote123ShareGet.code, 200);
assert.equal(remote123ShareGet.data.provider, "123Pan");
assert.equal(remote123ShareGet.data.raw_url, "/plugin/private/siyuan-cloud/sd/share-remote-123/?pwd=rpw");
const remote123ShareRead = await call({
  method: "GET",
  path: "/sd/share-remote-123",
  query: "download=1&pwd=rpw",
});
assert.equal(remote123ShareRead.body.proxy.url, "https://download123.example.test/pan123.txt");
const remote123Put = await json({
  body: "hello 123",
  headers: {
    "Content-Type": "text/plain",
    "File-Path": encodeURIComponent("/remote-123/pan123-upload.txt"),
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(remote123Put.code, 200);
assert.deepEqual(pan123UploadRequestBody, {
  driveId: 0,
  duplicate: 2,
  etag: "1bb45824de71b2f6476d800f427cb2ab",
  fileName: "pan123-upload.txt",
  parentFileId: "0",
  size: 9,
  type: 0,
});
assert.deepEqual(pan123S3AuthBody, {
  StorageNode: "pan123-node",
  bucket: "pan123-bucket",
  key: "pan123/uploads/pan123-upload.txt",
  partNumberEnd: 2,
  partNumberStart: 1,
  uploadId: "pan123-upload-id",
});
assert.equal(pan123UploadedBody, "hello 123");
assert.deepEqual(pan123UploadCompleteBody, {
  StorageNode: "pan123-node",
  bucket: "pan123-bucket",
  fileId: 12399,
  fileSize: 9,
  isMultipart: false,
  key: "pan123/uploads/pan123-upload.txt",
  uploadId: "pan123-upload-id",
});
const remote123Test = await json({
  body: {
    driver: "123Pan",
    addition: {
      access_token: "PAN123_ACCESS",
      password: "pass",
      platform: "web",
      root_folder_id: "0",
      username: "user",
    },
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(remote123Test.code, 200);
assert.equal(remote123Test.data.user.nickname, "pan123-user");
const remote123VerifyTest = await json({
  body: {
    driver: "123Pan",
    addition: {
      password: "pass",
      platform: "web",
      root_folder_id: "0",
      username: "need-verify",
    },
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(remote123VerifyTest.code, 502);
assert.equal(remote123VerifyTest.message, "请先在浏览器网页登录 123Pan 完成验证后，再回到插件登录");

await json({
  body: {
    driver: "Quark",
    mount_path: "/remote-quark",
    addition: JSON.stringify({
      cookie: "QUARK_COOKIE",
      root_folder_id: "0",
      order_by: "none",
      order_direction: "asc",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteQuarkList = await json({
  body: { path: "/remote-quark", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remoteQuarkList.data.provider, "Quark");
assert.equal(remoteQuarkList.data.content[0].name, "quark-folder ");
assert.equal(Object.hasOwn(remoteQuarkList.data.content[0], "path"), false);
const remoteQuarkRootGet = await json({
  body: { path: "/remote-quark" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(remoteQuarkRootGet.code, 200);
assert.equal(remoteQuarkRootGet.data.is_dir, true);
const remoteQuarkDirs = await json({
  body: { path: "/remote-quark" },
  method: "POST",
  path: "/api/fs/dirs",
});
assert.equal(remoteQuarkDirs.data[0].name, "quark-folder ");
const remoteQuarkChildList = await json({
  body: { path: "/remote-quark/quark-folder ", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remoteQuarkChildList.data.content[0].name, "quark-child.txt");
assert.equal(Object.hasOwn(remoteQuarkChildList.data.content[0], "path"), false);
assert.equal(quarkSortCookies[0], "QUARK_COOKIE");
assert.match(quarkSortCookies[1], /__puus=QUARK_REFRESHED_PUUS/);
const remoteQuarkGet = await json({
  body: { path: "/remote-quark/quark-folder /quark-child.txt" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(remoteQuarkGet.data.raw_url, "/plugin/private/siyuan-cloud/p/remote-quark/quark-folder /quark-child.txt");
const remoteQuarkLink = await json({
  body: { path: "/remote-quark/quark-folder /quark-child.txt" },
  method: "POST",
  path: "/api/fs/link",
});
assert.equal(remoteQuarkLink.data.url, "https://quark-download.example.test/quark-child.txt");
assert.equal(quarkSortRequests, 2);
assert.equal(quarkDownloadRequests, 1);
const remoteQuarkProxyRead1 = await call({
  headers: { Range: ["bytes=0-"] },
  method: "GET",
  path: "/p/remote-quark/quark-folder /quark-child.txt",
});
assert.equal(remoteQuarkProxyRead1.statusCode, 200);
assert.equal(remoteQuarkProxyRead1.body.proxy.url, "https://quark-download.example.test/quark-child.txt");
const remoteQuarkProxyRead2 = await call({
  headers: { Range: ["bytes=1024-"] },
  method: "GET",
  path: "/p/remote-quark/quark-folder /quark-child.txt",
});
assert.equal(remoteQuarkProxyRead2.statusCode, 200);
assert.equal(remoteQuarkProxyRead2.body.proxy.url, "https://quark-download.example.test/quark-child.txt");
assert.equal(quarkSortRequests, 2);
assert.equal(quarkDownloadRequests, 1);
const remoteQuarkPut = await json({
  body: "quark-upload-put",
  headers: {
    "Content-Type": "text/plain",
    "File-Path": encodeURIComponent("/remote-quark/quark-upload.txt"),
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(remoteQuarkPut.code, 200);
assert.equal(quarkUploadPreBody.ccp_hash_update, true);
assert.equal(quarkUploadPreBody.dir_name, "");
assert.equal(quarkUploadPreBody.file_name, "quark-upload.txt");
assert.equal(quarkUploadPreBody.format_type, "text/plain");
assert.equal(quarkUploadPreBody.pdir_fid, "0");
assert.equal(quarkUploadPreBody.size, 16);
assert.equal(Boolean(quarkUploadPreBody.l_created_at), true);
assert.equal(Boolean(quarkUploadPreBody.l_updated_at), true);
assert.deepEqual(quarkUploadHashBody, {
  md5: crypto.createHash("md5").update("quark-upload-put").digest("hex"),
  sha1: crypto.createHash("sha1").update("quark-upload-put").digest("hex"),
  task_id: "quark-upload-task",
});
assert.equal(quarkUploadAuthBodies.length, 3);
assert.equal(quarkUploadAuthBodies[0].auth_info, "QUARK_AUTH_INFO");
assert.match(quarkUploadAuthBodies[0].auth_meta, /^PUT\n\ntext\/plain\n/);
assert.match(quarkUploadAuthBodies[0].auth_meta, /\/quark-bucket\/quark\/uploads\/quark-upload\.txt\?partNumber=1&uploadId=quark-upload-id$/);
assert.equal(quarkUploadAuthBodies[0].task_id, "quark-upload-task");
assert.match(quarkUploadAuthBodies[1].auth_meta, /partNumber=2&uploadId=quark-upload-id$/);
assert.match(quarkUploadAuthBodies[2].auth_meta, /^POST\n[A-Za-z0-9+/=]+\napplication\/xml\n/);
assert.match(quarkUploadAuthBodies[2].auth_meta, /x-oss-callback:[A-Za-z0-9+/=]+/);
assert.match(quarkUploadAuthBodies[2].auth_meta, /\/quark-bucket\/quark\/uploads\/quark-upload\.txt\?uploadId=quark-upload-id$/);
assert.equal(quarkUploadedBody, "quark-upload-put");
assert.match(quarkUploadCommitBody, /<CompleteMultipartUpload>/);
assert.match(quarkUploadCommitBody, /<PartNumber>1<\/PartNumber>/);
assert.match(quarkUploadCommitBody, /<ETag>QUARK_ETAG_1<\/ETag>/);
assert.match(quarkUploadCommitBody, /<PartNumber>2<\/PartNumber>/);
assert.match(quarkUploadCommitBody, /<ETag>QUARK_ETAG_2<\/ETag>/);
assert.deepEqual(quarkUploadFinishBody, {
  obj_key: "quark/uploads/quark-upload.txt",
  task_id: "quark-upload-task",
});

await json({
  body: {
    driver: "Quark",
    mount_path: "/remote-quark-transcode",
    addition: JSON.stringify({
      cookie: "QUARK_COOKIE",
      root_folder_id: "0",
      order_by: "none",
      order_direction: "asc",
      use_transcoding_address: true,
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteQuarkTranscodeGet = await json({
  body: { path: "/remote-quark-transcode/quark-folder /quark-child.txt" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(remoteQuarkTranscodeGet.data.raw_url, "https://quark-transcode.example.test/quark-child.m3u8");

await json({
  body: {
    driver: "QuarkOpen",
    mount_path: "/remote-quark-open",
    addition: JSON.stringify({
      access_token: "QUARK_OPEN_ACCESS",
      app_id: "QUARK_APP",
      refresh_token: "QUARK_OPEN_REFRESH",
      root_folder_id: "0",
      sign_key: "QUARK_SIGN",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteQuarkOpenList = await json({
  body: { path: "/remote-quark-open", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remoteQuarkOpenList.data.provider, "QuarkOpen");
assert.equal(Object.hasOwn(remoteQuarkOpenList.data.content[0], "path"), false);
const remoteQuarkOpenLink = await json({
  body: { path: "/remote-quark-open/quark-open.txt" },
  method: "POST",
  path: "/api/fs/link",
});
assert.equal(remoteQuarkOpenLink.data.url, "https://quark-open-download.example.test/quark-open.txt");
const remoteQuarkOpenPut = await json({
  body: "quark-open-put",
  headers: {
    "Content-Type": "text/plain",
    "File-Path": encodeURIComponent("/remote-quark-open/quark-open-put.txt"),
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(remoteQuarkOpenPut.code, 200);
assert.equal(quarkOpenUploadPreBody.file_name, "quark-open-put.txt");
assert.equal(quarkOpenUploadPreBody.size, 14);
assert.equal(quarkOpenUploadPreBody.format_type, "text/plain");
assert.equal(quarkOpenUploadPreBody.md5, crypto.createHash("md5").update("quark-open-put").digest("hex"));
assert.equal(quarkOpenUploadPreBody.sha1, crypto.createHash("sha1").update("quark-open-put").digest("hex"));
assert.equal(quarkOpenUploadPreBody.pdir_fid, "0");
assert.equal(quarkOpenUploadPreBody.same_path_reuse, true);
assert.equal(quarkOpenUploadPreBody.proof_version, "v1");
assert.equal(Boolean(quarkOpenUploadPreBody.proof_seed1), true);
assert.equal(Boolean(quarkOpenUploadPreBody.proof_seed2), true);
assert.equal(Boolean(quarkOpenUploadPreBody.proof_code1), true);
assert.equal(Boolean(quarkOpenUploadPreBody.proof_code2), true);
assert.deepEqual(quarkOpenUploadUrlBody, {
  task_id: "quark-open-upload-task",
  part_info_list: [
    { part_number: 1, part_size: 8 },
    { part_number: 2, part_size: 6 },
  ],
});
assert.equal(quarkOpenUploadedBody, "quark-open-put");
assert.deepEqual(quarkOpenUploadFinishBody, {
  task_id: "quark-open-upload-task",
  part_info_list: [
    { part_number: 1, part_size: 8, etag: "QUARK_OPEN_ETAG_1" },
    { part_number: 2, part_size: 6, etag: "QUARK_OPEN_ETAG_2" },
  ],
});

await json({
  body: {
    driver: "QuarkTV",
    mount_path: "/remote-quark-tv",
    addition: JSON.stringify({
      access_token: "QUARK_TV_ACCESS",
      device_id: "QUARK_TV_DEVICE",
      link_method: "download",
      refresh_token: "QUARK_TV_REFRESH",
      root_folder_id: "0",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteQuarkTvList = await json({
  body: { path: "/remote-quark-tv", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remoteQuarkTvList.data.provider, "QuarkTV");
assert.equal(Object.hasOwn(remoteQuarkTvList.data.content[0], "path"), false);
const remoteQuarkTvLink = await json({
  body: { path: "/remote-quark-tv/quark-tv.txt" },
  method: "POST",
  path: "/api/fs/link",
});
assert.equal(remoteQuarkTvLink.data.url, "https://quark-tv-download.example.test/quark-tv.txt");

const quarkTvQrStart = await json({
  body: {
    driver: "QuarkTV",
    addition: {
      device_id: "QUARK_TV_DEVICE_QR",
      root_folder_id: "0",
    },
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(quarkTvQrStart.code, 502);
assert.equal(quarkTvQrStart.data.verify.qr_data, "QUARK_TV_QR_DATA");
assert.equal(quarkTvQrStart.data.addition.query_token, "QUARK_TV_QUERY");
const quarkTvQrDone = await json({
  body: {
    driver: "QuarkTV",
    addition: quarkTvQrStart.data.addition,
  },
  method: "POST",
  path: "/api/admin/driver/test",
});
assert.equal(quarkTvQrDone.code, 200);
assert.equal(quarkTvQrDone.data.addition.refresh_token, "QUARK_TV_REFRESH_BY_QR");

await json({
  body: {
    driver: "BaiduNetdisk",
    mount_path: "/remote-baidu",
    addition: JSON.stringify({
      access_token: "BAIDU_ACCESS",
      download_api: "official",
      root_folder_path: "/",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteBaiduList = await json({
  body: { path: "/remote-baidu", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remoteBaiduList.data.provider, "BaiduNetdisk");
assert.equal(remoteBaiduList.data.content[0].name, "baidu-video.mp4");
const remoteBaiduGet = await json({
  body: { path: "/remote-baidu/baidu-video.mp4" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(remoteBaiduGet.data.provider, "BaiduNetdisk");
assert.equal(remoteBaiduGet.data.raw_url, "/plugin/private/siyuan-cloud/p/remote-baidu/baidu-video.mp4");
const remoteBaiduRead = await call({
  headers: { Cookie: ["siyuan-local=1"], Range: ["bytes=0-1023"] },
  method: "GET",
  path: "/d/remote-baidu/baidu-video.mp4",
});
assert.equal(remoteBaiduRead.statusCode, 200);
assert.equal(remoteBaiduRead.body.proxy.url, "https://baidu-cdn.example.test/baidu-video.mp4?final=1");
assert.equal(remoteBaiduRead.body.proxy.headers.Range[0], "bytes=0-1023");
assert.equal(remoteBaiduRead.body.proxy.headers["User-Agent"][0], "pan.baidu.com");
assert.equal(remoteBaiduRead.body.proxy.headers.Cookie, undefined);
const remoteBaiduProxyRead = await call({
  headers: { Range: ["bytes=0-"] },
  method: "GET",
  path: "/p/remote-baidu/baidu-video.mp4",
});
assert.equal(remoteBaiduProxyRead.statusCode, 200);
assert.equal(remoteBaiduProxyRead.body.proxy.url, "https://baidu-cdn.example.test/baidu-video.mp4?final=1");
assert.equal(remoteBaiduProxyRead.body.proxy.headers.Range[0], "bytes=0-");
assert.equal(remoteBaiduProxyRead.body.proxy.headers["User-Agent"][0], "pan.baidu.com");
const remoteBaiduPut = await json({
  body: "baidu-put",
  headers: {
    "Content-Type": "text/plain",
    "File-Path": encodeURIComponent("/remote-baidu/baidu-upload.txt"),
  },
  method: "PUT",
  path: "/api/fs/put",
});
assert.equal(remoteBaiduPut.code, 200);
const baiduPutMd5 = crypto.createHash("md5").update("baidu-put").digest("hex");
assert.equal(baiduCreateBodies.length, 2);
assert.equal(baiduCreateBodies[0].path, "/baidu-upload.txt");
assert.equal(baiduCreateBodies[0].size, "9");
assert.equal(baiduCreateBodies[0].isdir, "0");
assert.equal(baiduCreateBodies[0].rtype, "3");
assert.equal(baiduCreateBodies[0].block_list, JSON.stringify([baiduPutMd5]));
assert.equal(Boolean(baiduCreateBodies[0].uploadid), false);
assert.equal(baiduPrecreateBody.path, "/baidu-upload.txt");
assert.equal(baiduPrecreateBody.size, "9");
assert.equal(baiduPrecreateBody.isdir, "0");
assert.equal(baiduPrecreateBody.autoinit, "1");
assert.equal(baiduPrecreateBody.rtype, "3");
assert.equal(baiduPrecreateBody.block_list, JSON.stringify([baiduPutMd5]));
assert.equal(baiduPrecreateBody["content-md5"], baiduPutMd5);
assert.equal(baiduPrecreateBody["slice-md5"], baiduPutMd5);
assert.equal(Boolean(baiduPrecreateBody.local_mtime), true);
assert.equal(Boolean(baiduPrecreateBody.local_ctime), true);
assert.equal(baiduLocateQuery.method, "locateupload");
assert.equal(baiduLocateQuery.appid, "250528");
assert.equal(baiduLocateQuery.path, "/baidu-upload.txt");
assert.equal(baiduLocateQuery.uploadid, "BAIDU_UPLOAD_ID");
assert.equal(baiduLocateQuery.upload_version, "2.0");
assert.equal(baiduLocateQuery.access_token, "BAIDU_ACCESS");
assert.equal(baiduSuperfileQuery.method, "upload");
assert.equal(baiduSuperfileQuery.access_token, "BAIDU_ACCESS");
assert.equal(baiduSuperfileQuery.type, "tmpfile");
assert.equal(baiduSuperfileQuery.path, "/baidu-upload.txt");
assert.equal(baiduSuperfileQuery.uploadid, "BAIDU_UPLOAD_ID");
assert.equal(baiduSuperfileQuery.partseq, "0");
assert.equal(baiduUploadedBody, "baidu-put");
assert.equal(baiduCreateBodies[1].path, "/baidu-upload.txt");
assert.equal(baiduCreateBodies[1].size, "9");
assert.equal(baiduCreateBodies[1].isdir, "0");
assert.equal(baiduCreateBodies[1].rtype, "3");
assert.equal(baiduCreateBodies[1].uploadid, "BAIDU_UPLOAD_ID");
assert.equal(baiduCreateBodies[1].block_list, JSON.stringify([baiduPutMd5]));
await json({
  body: {
    driver: "BaiduNetdisk",
    mount_path: "/remote-baidu-refresh",
    addition: JSON.stringify({
      download_api: "official",
      refresh_token: "BAIDU_REFRESH_OLD",
      root_folder_path: "/",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteBaiduRefreshList = await json({
  body: { path: "/remote-baidu-refresh", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remoteBaiduRefreshList.data.provider, "BaiduNetdisk");
const refreshedConfig = await json({
  method: "GET",
  path: "/api/admin/config/export",
});
const refreshedBaiduStorage = refreshedConfig.data.storages.find((item) => item.mount_path === "/remote-baidu-refresh");
const refreshedBaiduAddition = JSON.parse(refreshedBaiduStorage.addition);
assert.equal(refreshedBaiduAddition.access_token, "BAIDU_ACCESS_REFRESHED");
assert.equal(refreshedBaiduAddition.refresh_token, "BAIDU_REFRESH_REFRESHED");
await json({
  body: {
    driver: "BaiduNetdisk",
    mount_path: "/remote-baidu-stream",
    addition: JSON.stringify({
      access_token: "BAIDU_ACCESS",
      download_api: "crack_video",
      root_folder_path: "/",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteBaiduStreamGet = await json({
  body: { path: "/remote-baidu-stream/baidu-video.mp4" },
  method: "POST",
  path: "/api/fs/get",
});
assert.equal(remoteBaiduStreamGet.data.raw_url, "/plugin/private/siyuan-cloud/p/remote-baidu-stream/baidu-video.mp4");
const remoteBaiduStreamLink = await json({
  body: { path: "/remote-baidu-stream/baidu-video.mp4" },
  method: "POST",
  path: "/api/fs/link",
});
assert.equal(remoteBaiduStreamLink.data.raw_url, "/plugin/private/siyuan-cloud/p/remote-baidu-stream/baidu-video.mp4");
assert.equal(remoteBaiduStreamLink.data.url, "https://baidu-cdn.example.test/baidu-video.mp4?crack_video=1");
assert.equal(remoteBaiduStreamLink.data.header["User-Agent"], "netdisk");
const remoteBaiduStreamRead = await call({
  headers: { Range: ["bytes=0-"] },
  method: "GET",
  path: "/p/remote-baidu-stream/baidu-video.mp4",
});
assert.equal(remoteBaiduStreamRead.statusCode, 200);
assert.equal(remoteBaiduStreamRead.body.proxy.url, "https://baidu-cdn.example.test/baidu-video.mp4?crack_video=1");
assert.equal(remoteBaiduStreamRead.body.proxy.headers.Range[0], "bytes=0-");
assert.equal(remoteBaiduStreamRead.body.proxy.headers["User-Agent"][0], "netdisk");
await json({
  body: {
    driver: "BaiduNetdisk",
    mount_path: "/remote-baidu-image",
    addition: JSON.stringify({
      access_token: "BAIDU_ACCESS",
      download_api: "crack_video",
      root_folder_path: "/image",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteBaiduImageList = await json({
  body: { path: "/remote-baidu-image", page: 1, per_page: 50 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(remoteBaiduImageList.data.content[0].name, "baidu-image.png");
const remoteBaiduImageRead = await call({
  method: "GET",
  path: "/p/remote-baidu-image/baidu-image.png",
});
assert.equal(remoteBaiduImageRead.statusCode, 200);
assert.equal(remoteBaiduImageRead.body.proxy.url, "https://baidu-cdn.example.test/baidu-image.png?final=1");
assert.equal(remoteBaiduImageRead.body.proxy.headers["User-Agent"][0], "pan.baidu.com");
await json({
  body: {
    driver: "BaiduNetdisk",
    mount_path: "/remote-baidu-pdf",
    addition: JSON.stringify({
      access_token: "BAIDU_ACCESS",
      download_api: "crack_video",
      root_folder_path: "/pdf",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteBaiduPdfRead = await call({
  method: "GET",
  path: "/p/remote-baidu-pdf/baidu-doc.pdf",
});
assert.equal(remoteBaiduPdfRead.statusCode, 200);
assert.equal(remoteBaiduPdfRead.body.proxy.url, "https://baidu-cdn.example.test/baidu-doc.pdf?final=1");
assert.equal(remoteBaiduPdfRead.body.proxy.headers["User-Agent"][0], "pan.baidu.com");
await json({
  body: {
    driver: "BaiduNetdisk",
    mount_path: "/remote-baidu-zip",
    addition: JSON.stringify({
      access_token: "BAIDU_ACCESS",
      download_api: "official",
      root_folder_path: "/zip",
    }),
  },
  method: "POST",
  path: "/api/admin/storage/create",
});
const remoteBaiduArchiveList = await json({
  body: { inner_path: "/", page: 1, path: "/remote-baidu-zip/baidu.zip", per_page: 10 },
  method: "POST",
  path: "/api/fs/archive/list",
});
assert.equal(remoteBaiduArchiveList.code, 200);
assert.equal(remoteBaiduArchiveList.data.content.some((item) => item.name === "hello.txt"), true);
assert.equal(remoteBaiduArchiveList.data.content.some((item) => item.name === "Cap 中文版_0.4.0-cn_x64-setup.exe"), true);
assert.equal(remoteBaiduArchiveList.data.content.some((item) => item.name === "Cap 中文版安装包"), true);
const remoteBaiduArchiveExtract = await text({
  method: "GET",
  path: "/ae/remote-baidu-zip/baidu.zip",
  query: "inner=hello.txt",
});
assert.equal(remoteBaiduArchiveExtract.response.statusCode, 200);
assert.equal(remoteBaiduArchiveExtract.text, "zip from baidu");
assert.ok(baiduArchiveRanges.some((range) => range === "bytes=0-"));
assert.ok(baiduArchiveRanges.some((range) => /^bytes=\d+-$/.test(range)));
const remoteBaiduTorrent = await json({
  body: { path: "/remote-baidu-zip/baidu.zip" },
  method: "POST",
  path: "/api/fs/torrent/generate",
});
assert.equal(remoteBaiduTorrent.code, 200);
assert.equal(remoteBaiduTorrent.data.file_name, "baidu.zip.torrent");

const lock = await text({
  method: "LOCK",
  path: "/dav/smoke/a.txt",
});
assert.equal(lock.response.statusCode, 200);
assert.match(lock.text, /locktoken/);

const keyAdded = await json({
  body: { key: "ssh-ed25519 smoke", title: "smoke" },
  method: "POST",
  path: "/api/me/sshkey/add",
});
assert.equal(keyAdded.code, 200);
const keys = await json({
  method: "GET",
  path: "/api/me/sshkey/list",
});
assert.equal(keys.data.length, 1);

const twoFa = await json({
  method: "POST",
  path: "/api/auth/2fa/generate",
});
assert.equal(twoFa.code, 200);
assert.equal(Boolean(twoFa.data.otp_secret), true);

const s3Buckets = await text({
  method: "GET",
  path: "/s3",
});
assert.equal(s3Buckets.response.statusCode, 200);
assert.match(s3Buckets.text, /<Name>siyuan-cloud<\/Name>/);

const s3Put = await text({
  body: "from s3",
  headers: { "Content-Type": "text/plain" },
  method: "PUT",
  path: "/s3/siyuan-cloud/smoke/s3.txt",
});
assert.equal(s3Put.response.statusCode, 200);

const s3Get = await text({
  method: "GET",
  path: "/s3/siyuan-cloud/smoke/s3.txt",
});
assert.equal(s3Get.text, "from s3");
const s3ReadOnlyGet = await text({
  headers: { Authorization: webdavReadOnlyToken },
  method: "GET",
  path: "/s3/siyuan-cloud/smoke/s3.txt",
});
assert.equal(s3ReadOnlyGet.text, "from s3");
await json({
  body: {
    id: webdavReadOnlyUser.data.id,
    username: "webdav-readonly",
    base_path: "/",
    permission: 1 << 8,
  },
  method: "POST",
  path: "/api/admin/user/update",
});
const s3ReadOnlyPut = await text({
  body: "blocked",
  headers: { Authorization: webdavReadOnlyToken },
  method: "PUT",
  path: "/s3/siyuan-cloud/smoke/s3-readonly-denied.txt",
});
assert.equal(s3ReadOnlyPut.response.statusCode, 403);
await json({
  body: {
    id: webdavReadOnlyUser.data.id,
    username: "webdav-readonly",
    base_path: "/",
    permission: (1 << 8) | (1 << 9),
  },
  method: "POST",
  path: "/api/admin/user/update",
});
const s3ManagePut = await text({
  body: "allowed",
  headers: { Authorization: webdavReadOnlyToken },
  method: "PUT",
  path: "/s3/siyuan-cloud/smoke/s3-manage-allowed.txt",
});
assert.equal(s3ManagePut.response.statusCode, 200);

const s3List = await text({
  method: "GET",
  path: "/s3/siyuan-cloud",
});
assert.match(s3List.text, /smoke\/s3\.txt/);

const s3PrefixList = await text({
  method: "GET",
  path: "/s3/siyuan-cloud",
  query: "prefix=smoke/&delimiter=/",
});
assert.match(s3PrefixList.text, /<Prefix>smoke\/<\/Prefix>/);

const s3Copy = await text({
  headers: { "x-amz-copy-source": "/siyuan-cloud/smoke/s3.txt" },
  method: "PUT",
  path: "/s3/siyuan-cloud/smoke/s3-copy.txt",
});
assert.equal(s3Copy.response.statusCode, 200);
assert.match(s3Copy.text, /CopyObjectResult/);

const s3DeleteMulti = await text({
  body: "<Delete><Object><Key>smoke/s3-copy.txt</Key></Object></Delete>",
  method: "POST",
  path: "/s3/siyuan-cloud",
  query: "delete",
});
assert.equal(s3DeleteMulti.response.statusCode, 200);
assert.match(s3DeleteMulti.text, /smoke\/s3-copy\.txt/);

const multipartInit = await text({
  method: "POST",
  path: "/s3/siyuan-cloud/smoke/multipart.txt",
  query: "uploads",
});
assert.match(multipartInit.text, /<UploadId>/);
const uploadId = multipartInit.text.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
assert.equal(Boolean(uploadId), true);

const multipartPart1 = await text({
  body: "multi",
  method: "PUT",
  path: "/s3/siyuan-cloud/smoke/multipart.txt",
  query: `uploadId=${encodeURIComponent(uploadId)}&partNumber=1`,
});
assert.equal(multipartPart1.response.statusCode, 200);
const multipartPart2 = await text({
  body: "part",
  method: "PUT",
  path: "/s3/siyuan-cloud/smoke/multipart.txt",
  query: `uploadId=${encodeURIComponent(uploadId)}&partNumber=2`,
});
assert.equal(multipartPart2.response.statusCode, 200);
const multipartParts = await text({
  method: "GET",
  path: "/s3/siyuan-cloud/smoke/multipart.txt",
  query: `uploadId=${encodeURIComponent(uploadId)}`,
});
assert.match(multipartParts.text, /<ListPartsResult/);
assert.match(multipartParts.text, /<PartNumber>2<\/PartNumber>/);
const multipartUploads = await text({
  method: "GET",
  path: "/s3/siyuan-cloud",
  query: "uploads&prefix=smoke/",
});
assert.match(multipartUploads.text, /<ListMultipartUploadsResult/);
assert.match(multipartUploads.text, /smoke\/multipart\.txt/);
const multipartComplete = await text({
  body: "<CompleteMultipartUpload/>",
  method: "POST",
  path: "/s3/siyuan-cloud/smoke/multipart.txt",
  query: `uploadId=${encodeURIComponent(uploadId)}`,
});
assert.match(multipartComplete.text, /CompleteMultipartUploadResult/);
const multipartGet = await text({
  method: "GET",
  path: "/s3/siyuan-cloud/smoke/multipart.txt",
});
assert.equal(multipartGet.text, "multipart");

const multipartAbortInit = await text({
  method: "POST",
  path: "/s3/siyuan-cloud/smoke/abort.txt",
  query: "uploads",
});
const abortUploadId = multipartAbortInit.text.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
assert.equal(Boolean(abortUploadId), true);
const multipartAbort = await text({
  method: "DELETE",
  path: "/s3/siyuan-cloud/smoke/abort.txt",
  query: `uploadId=${encodeURIComponent(abortUploadId)}`,
});
assert.equal(multipartAbort.response.statusCode, 204);
const multipartAbortList = await text({
  method: "GET",
  path: "/s3/siyuan-cloud",
  query: "uploads&prefix=smoke/abort",
});
assert.doesNotMatch(multipartAbortList.text, /smoke\/abort\.txt/);

const s3Delete = await text({
  method: "DELETE",
  path: "/s3/siyuan-cloud/smoke/s3.txt",
});
assert.equal(s3Delete.response.statusCode, 204);

await json({
  body: { path: "/s3-root", name: "s3-mapped" },
  method: "POST",
  path: "/api/fs/mkdir",
});
await json({
  body: "mapped",
  headers: { "File-Path": encodeURIComponent("/s3-root/mapped.txt"), "Content-Type": "text/plain" },
  method: "PUT",
  path: "/api/fs/put",
});
await json({
  body: [
    { key: "s3_access_key_id", value: "S3AK" },
    { key: "s3_secret_access_key", value: "S3SK" },
    { key: "s3_buckets", value: JSON.stringify([{ name: "mapped", path: "/s3-root" }]) },
  ],
  method: "POST",
  path: "/api/admin/setting/save",
});
const s3UnsignedDenied = await text({
  method: "GET",
  path: "/s3",
});
assert.equal(s3UnsignedDenied.response.statusCode, 403);
const s3SignedBuckets = await text({
  headers: signedS3Headers({ path: "/s3" }),
  method: "GET",
  path: "/s3",
});
assert.equal(s3SignedBuckets.response.statusCode, 200);
assert.match(s3SignedBuckets.text, /<Name>mapped<\/Name>/);
const s3WrongSignature = await text({
  headers: { ...signedS3Headers({ path: "/s3/mapped/mapped.txt" }), Authorization: "AWS4-HMAC-SHA256 Credential=S3AK/20260101/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=bad" },
  method: "GET",
  path: "/s3/mapped/mapped.txt",
});
assert.equal(s3WrongSignature.response.statusCode, 403);
const s3SignedMappedGet = await text({
  headers: signedS3Headers({ path: "/s3/mapped/mapped.txt" }),
  method: "GET",
  path: "/s3/mapped/mapped.txt",
});
assert.equal(s3SignedMappedGet.text, "mapped");
const s3SignedPutBody = "signed put";
const s3SignedPut = await text({
  body: s3SignedPutBody,
  headers: { ...signedS3Headers({ body: s3SignedPutBody, method: "PUT", path: "/s3/mapped/written.txt" }), "Content-Type": "text/plain" },
  method: "PUT",
  path: "/s3/mapped/written.txt",
});
assert.equal(s3SignedPut.response.statusCode, 200);
const s3SignedWrittenGet = await text({
  headers: signedS3Headers({ path: "/s3/mapped/written.txt" }),
  method: "GET",
  path: "/s3/mapped/written.txt",
});
assert.equal(s3SignedWrittenGet.text, s3SignedPutBody);
await json({
  body: [
    { key: "s3_access_key_id", value: "" },
    { key: "s3_secret_access_key", value: "" },
    { key: "s3_buckets", value: "[]" },
  ],
  method: "POST",
  path: "/api/admin/setting/save",
});

console.log("kernel route smoke ok");
