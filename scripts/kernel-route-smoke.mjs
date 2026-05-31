import assert from "node:assert/strict";

const storageData = new Map();
const rpcHandlers = new Map();
let quarkSortRequests = 0;
let quarkDownloadRequests = 0;

const jsonBody = (payload) => ({
  async json() {
    return payload;
  },
  async text() {
    return JSON.stringify(payload);
  },
});

globalThis.siyuan = {
  client: {
    async fetch(path, init = {}) {
      if (path === "/api/network/forwardProxy") {
        const req = JSON.parse(init.body || "{}");
        const url = new URL(req.url);
        let body = { code: 200, message: "success", data: null };
        let contentType = "application/json";
        let headers = {};
        if (url.hostname === "s3.example.test" && req.method === "GET" && url.searchParams.get("delimiter") === "/") {
          contentType = "application/xml";
          body = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Contents><Key>remote-s3/object.txt</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><Size>9</Size></Contents></ListBucketResult>`;
        } else if (url.hostname === "s3.example.test" && req.method === "HEAD") {
          body = "";
          headers = { "Content-Length": "9", "Last-Modified": "Thu, 01 Jan 2026 00:00:00 GMT" };
        } else if (url.hostname === "s3.example.test" && req.method === "GET") {
          contentType = "text/plain";
          body = "s3 object";
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
            }],
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
          };
        } else if (url.hostname === "download.example.test" && req.method === "GET") {
          contentType = "text/plain";
          body = "onedrive doc";
        } else if (url.hostname === "api.oplist.org" && url.pathname.endsWith("/onedrive/renewapi")) {
          body = {
            access_token: "OD_ACCESS_REFRESHED",
            refresh_token: "OD_REFRESH_REFRESHED",
          };
        } else if (url.hostname === "www.123pan.com" && url.pathname.endsWith("/b/api/file/list/new")) {
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
        } else if (url.hostname === "www.123pan.com" && url.pathname.endsWith("/b/api/file/download_info")) {
          body = {
            code: 0,
            message: "success",
            data: {
              DownloadUrl: "https://download123.example.test/pan123.txt",
            },
          };
        } else if (url.hostname === "www.123pan.com" && url.pathname.endsWith("/b/api/user/info")) {
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
        } else if (url.hostname === "drive.quark.cn" && url.pathname.endsWith("/1/clouddrive/file/sort")) {
          quarkSortRequests += 1;
          const parent = url.searchParams.get("pdir_fid");
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
        } else if (url.hostname === "api.oplist.org" && url.pathname.endsWith("/baiduyun/renewapi")) {
          body = {
            access_token: "BAIDU_ACCESS_REFRESHED",
            refresh_token: "BAIDU_REFRESH_REFRESHED",
          };
        } else if (url.hostname === "pan.baidu.com" && url.pathname.endsWith("/rest/2.0/xpan/file") && url.searchParams.get("method") === "list") {
          const isImageMount = url.searchParams.get("dir") === "/image";
          body = {
            errno: 0,
            list: [isImageMount ? {
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
        } else if (url.hostname === "pan.baidu.com" && url.pathname.endsWith("/rest/2.0/xpan/multimedia") && url.searchParams.get("method") === "filemetas") {
          const isImage = url.searchParams.get("fsids") === "[99002]";
          body = {
            errno: 0,
            list: [{
              dlink: isImage ? "https://d.pcs.baidu.com/file/baidu-image.png?fid=99002" : "https://d.pcs.baidu.com/file/baidu-video.mp4?fid=99001",
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
          headers = { Location: url.pathname.endsWith("baidu-image.png") ? "https://baidu-cdn.example.test/baidu-image.png?final=1" : "https://baidu-cdn.example.test/baidu-video.mp4?final=1" };
          body = "";
        } else if (url.hostname === "baidu-cdn.example.test" && req.method === "GET") {
          const range = req.headers.find((item) => item.Range)?.Range || "";
          contentType = url.pathname.endsWith("baidu-image.png") ? "image/png" : "video/mp4";
          headers = {
            "Accept-Ranges": "bytes",
            "Content-Range": range === "bytes=0-8388607" ? "bytes 0-8388607/16777216" : "bytes 0-1023/4096",
            "Content-Length": range === "bytes=0-8388607" ? "8388608" : "1024",
          };
          body = Buffer.from(url.pathname.endsWith("baidu-image.png") ? "image" : "baidu video").toString("base64");
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
        } else if (url.pathname.endsWith("/api/fs/list")) {
          body = {
            code: 200,
            message: "success",
            data: {
              content: [{ name: "remote.txt", size: 11, is_dir: false, modified: new Date().toISOString(), created: new Date().toISOString() }],
              total: 1,
              write: true,
              provider: "OpenList",
            },
          };
        } else if (url.pathname.endsWith("/api/fs/get")) {
          body = {
            code: 200,
            message: "success",
            data: { name: "remote.txt", size: 11, is_dir: false, raw_url: "https://example.test/remote.txt" },
          };
        }
        return jsonBody({
          code: 0,
          msg: "ok",
          data: {
            url: req.url,
            status: 200,
            contentType,
            body: typeof body === "string" ? body : JSON.stringify(body),
            bodyEncoding: url.hostname === "baidu-cdn.example.test" ? "base64" : "text",
            headers,
            elapsed: 1,
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

const handler = globalThis.siyuan.server.private.http.handler;
const rpcStatus = await rpcHandlers.get("siyuan-cloud.status")?.();
assert.equal(rpcStatus?.ok, true);
assert.ok(rpcStatus.routes.includes("POST /api/fs/torrent/parse"));
assert.ok(rpcStatus.stages.some((item) => item.key === "torrent" && item.status === "active"));

const request = ({ method = "GET", path = "/", query = "", body, headers = {} }) => ({
  context: { path },
  request: {
    body: body === undefined ? undefined : { data: body },
    headers,
    method,
  },
  url: { path, query },
});

const call = async (input) => handler(request(input));

const json = async (input) => {
  const response = await call(input);
  assert.equal(response.headers["Content-Type"][0].startsWith("application/json"), true, input.path);
  return response.body.data.data;
};

const text = async (input) => {
  const response = await call(input);
  return {
    response,
    text: response.body.string.values.join(""),
  };
};

const status = await json({ path: "/siyuan-cloud/status" });
assert.equal(status.code, 200);
assert.equal(status.data.ok, true);
assert.ok(status.data.routes.includes("POST /api/fs/mkdir"));
assert.ok(status.data.routes.includes("POST /api/fs/get_direct_upload_info"));
assert.ok(status.data.routes.includes("POST /api/fs/torrent/parse"));
assert.ok(status.data.stages.some((item) => item.key === "torrent" && item.status === "active"));
assert.ok(status.data.routes.includes("GET /api/authn/webauthn_begin_login"));

const apiIndex = await json({ path: "/api/public/api" });
assert.equal(apiIndex.code, 200);
assert.equal(apiIndex.data.base_url, "/plugin/private/siyuan-cloud");
assert.equal(apiIndex.data.api_base, "/plugin/private/siyuan-cloud/api");
assert.equal(apiIndex.data.endpoints.download, "/plugin/private/siyuan-cloud/d/{path}");
assert.equal(apiIndex.data.endpoints.proxy, "/plugin/private/siyuan-cloud/p/{path}");
assert.equal(apiIndex.data.endpoints.webdav, "/plugin/private/siyuan-cloud/dav");
assert.equal(apiIndex.data.endpoints.s3, "/plugin/private/siyuan-cloud/s3");
assert.ok(apiIndex.data.capabilities.includes("openlist.http-api"));
assert.ok(apiIndex.data.capabilities.includes("openlist.fs.torrent.placeholder"));
assert.ok(apiIndex.data.routes.some((item) => item.method === "ANY" && item.path === "/api/fs/get"));
assert.ok(apiIndex.data.routes.some((item) => item.method === "ANY" && item.path === "/api/public/api"));
assert.ok(apiIndex.data.routes.some((item) => item.method === "POST" && item.path === "/api/fs/torrent/generate"));

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

const list = await json({
  body: { path: "/smoke", page: 1, per_page: 20 },
  method: "POST",
  path: "/api/fs/list",
});
assert.equal(list.code, 200);
assert.equal(list.data.content.some((item) => item.name === "a.txt"), true);
assert.equal(list.data.content.some((item) => item.name === "binary.bin"), true);
assert.equal(list.data.content.some((item) => item.name === "form.txt"), true);

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

const archive = await json({
  body: { path: "/smoke/a.txt" },
  method: "POST",
  path: "/api/fs/archive/meta",
});
assert.equal(archive.code, 501);
assert.equal(archive.data.operation, "meta");

for (const [path, operation] of [
  ["/api/fs/torrent/parse", "parse"],
  ["/api/fs/torrent/upload_parse", "upload_parse"],
  ["/api/fs/torrent/rapid_upload", "rapid_upload"],
  ["/api/fs/torrent/generate", "generate"],
]) {
  const torrent = await json({
    body: { path: "/smoke/a.txt", torrent_data: "" },
    method: "POST",
    path,
  });
  assert.equal(torrent.code, 501);
  assert.equal(torrent.data.operation, operation);
  assert.match(torrent.data.upstream_source, /server\/handles\/torrent\.go/);
}

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

const copyDone = await json({
  method: "GET",
  path: "/api/task/copy/done",
});
assert.equal(copyDone.code, 200);
assert.equal(copyDone.data.content.length >= 1, true);

const moveDone = await json({
  method: "GET",
  path: "/api/task/move/done",
});
assert.equal(moveDone.code, 200);
assert.equal(moveDone.data.content.length >= 1, true);

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
assert.equal(metaList.data.content.length, 1);

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
assert.equal(indexProgress.data.status, "done");

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
  body: { driver: "SiYuanKernel", mount_path: "/verify-smoke", remark: "first" },
  method: "POST",
  path: "/api/admin/storage/create",
});
assert.equal(storageCreate.code, 200);
const storageCreateAgain = await json({
  body: { driver: "SiYuanKernel", mount_path: "/verify-smoke", remark: "second" },
  method: "POST",
  path: "/api/admin/storage/create",
});
assert.equal(storageCreateAgain.code, 200);
assert.equal(storageCreateAgain.data.id, storageCreate.data.id);
const storageList = await json({
  method: "GET",
  path: "/api/admin/storage/list",
});
assert.equal(storageList.data.content.filter((item) => item.mount_path === "/verify-smoke").length, 1);
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
assert.equal(driverNames.data.includes("115 Cloud"), false);
assert.equal(driverNames.data.includes("GoogleDrive"), false);
const quarkInfo = await json({
  method: "GET",
  path: "/api/admin/driver/info",
  query: "driver=Quark",
});
assert.equal(quarkInfo.data.config.prefer_proxy, false);
assert.equal(quarkInfo.data.additional.find((item) => item.name === "use_transcoding_address")?.default, "true");
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
const cloud189TvInfo = await json({
  method: "GET",
  path: "/api/admin/driver/info",
  query: "driver=189CloudTV",
});
assert.equal(cloud189TvInfo.data.additional.some((item) => item.name === "access_token"), true);
const quarkOpenInfo = await json({
  method: "GET",
  path: "/api/admin/driver/info",
  query: "driver=QuarkOpen",
});
assert.equal(quarkOpenInfo.data.additional.some((item) => item.name === "app_id" && item.required), true);
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
        { addition: { refresh_token: "rt" }, driver: "BaiduNetdisk", id: 99, mount_path: "/baidu-smoke" },
      ],
    },
  },
  method: "POST",
  path: "/api/admin/config/import",
});
assert.equal(importedConfig.code, 200);
assert.equal(importedConfig.data.storages >= 2, true);
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
await json({
  body: {
    driver: "S3",
    mount_path: "/remote-s3",
    addition: JSON.stringify({
      access_key_id: "AK",
      bucket: "bucket",
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
await json({
  body: {
    driver: "Onedrive",
    mount_path: "/remote-onedrive",
    addition: JSON.stringify({
      access_token: "OD_ACCESS",
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
assert.equal(remoteOneDriveRead.body.proxy.url, "https://download.example.test/remote-doc.txt");
assert.equal(remoteOneDriveRead.body.proxy.method, "GET");
const remoteOneDriveLink = await json({
  body: { path: "/remote-onedrive/remote-doc.txt" },
  method: "POST",
  path: "/api/fs/link",
});
assert.equal(remoteOneDriveLink.data.raw_url, "https://download.example.test/remote-doc.txt");
assert.equal(remoteOneDriveLink.data.url, "https://download.example.test/remote-doc.txt");
await json({
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
const remote123Read = await call({
  method: "GET",
  path: "/d/remote-123/pan123.txt",
});
assert.equal(remote123Read.body.proxy.url, "https://download123.example.test/pan123.txt");
assert.equal(remote123Read.body.proxy.headers.Referer[0], "https://download123.example.test/");
assert.equal(remote123Read.body.proxy.method, "GET");
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

console.log("kernel route smoke ok");
