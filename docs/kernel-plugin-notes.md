# SiYuan Kernel Plugin Notes

## Local Reference Trees

- `docs/siyuan-master`
  - Upstream: `https://github.com/siyuan-note/siyuan.git`
  - Reference: tag `v3.7.0-dev9`
  - Current local commit: `410dcc1`
- `docs/OpenList-main`
  - Upstream: `https://github.com/OpenListTeam/OpenList.git`
  - Branch: `main`
  - Current local commit: `9cc5dd9`

## Why SiYuan `dev`

Kernel plugin support was introduced by SiYuan PR #17487, merged into `dev`. The visible app version in local dev builds may not be bumped yet, so this plugin keeps `minAppVersion` loose and relies on feature availability.

Streaming proxy support from SiYuan PR #17748 is now present in `v3.7.0-dev9`. The plugin runtime can return `body.proxy` from a private HTTP handler. The SiYuan kernel validates that the target is `http` or `https`, allows only `GET` and `HEAD`, forwards the supplied request headers after filtering hop-by-hop headers, disables automatic compression, follows download redirects on the kernel side while preserving proxy headers such as `Range` and `User-Agent`, uses the shared SSRF-safe dialer, copies the final upstream response headers and status after filtering hop-by-hop headers and `Set-Cookie`, and streams the upstream body with `io.Copy`. This is the kernel capability that makes normal video/audio Range playback possible without driver-specific bounded range patches.

## 2026-05-30 Reference Refresh

- SiYuan upstream has no `dev9` branch; `dev9` is tag `v3.7.0-dev9` at `410dcc1`. Local `docs/siyuan-master` is checked out detached at that tag. `origin/dev` is currently `28a5bba`, two commits newer than the tag.
- `v3.7.0-dev9` includes the client-side `plugin.kernel` API in `app/src/plugin/kernel.ts`: frontend plugins can call kernel plugin JSON-RPC through `plugin.kernel.rpc.call.*`, send notifications with `plugin.kernel.rpc.notify.*`, batch JSON-RPC calls, bind notification handlers over `/ws/plugin/rpc`, and observe `kernel-plugin-state-change`.
- The kernel plugin streaming proxy path is now upstream in `kernel/plugin/server.go` with `ResponseProxy`; the local playback rule remains `fs.Link -> common.Proxy -> body.proxy`.
- `/api/network/forwardProxy` keeps the `redirect: false` option and now uses positive error codes for validation and payload decode failures. Drivers should continue using it for cloud JSON/API calls and link probes, not for media body streaming.
- OpenList `main` is now `9cc5dd9`. New useful upstream behavior includes `/api/fs/torrent/parse`, `/api/fs/torrent/upload_parse`, `/api/fs/torrent/rapid_upload`, and `/api/fs/torrent/generate`; parse/upload_parse and single-file generate are now ported in JavaScript, while rapid upload is kept at the driver-boundary until 189/189PC CAS methods are ported.
- OpenList fixed `FsMove` and `FsCopy` skipped-name handling in `server/handles/fsmanage.go`; keep this in mind when aligning copy/move tasks.
- OpenList hardened SimpleHttp offline download filename handling against temp path traversal. If SimpleHttp offline download is implemented here, copy the `sanitizeFilename` behavior before writing files to temporary storage.
- OpenList added ed2k routing/fallback for offline download tools and torrent/CAS support for 189/189PC rapid upload. These are useful future references, but currently remain outside this plugin's implemented capability surface.

## SiYuan Files To Inspect

- `docs/siyuan-master/kernel/plugin/manager.go`
- `docs/siyuan-master/kernel/plugin/plugin.go`
- `docs/siyuan-master/kernel/plugin/sandbox.go`
- `docs/siyuan-master/kernel/plugin/api_server.go`
- `docs/siyuan-master/kernel/plugin/server.go`
- `docs/siyuan-master/kernel/plugin/rpc.go`
- `docs/siyuan-master/kernel/api/plugin.go`
- `docs/siyuan-master/kernel/api/router.go`
- `docs/siyuan-master/kernel/model/plugin.go`

## Kernel Plugin Requirements

`plugin.json` needs:

```json
{
  "kernels": ["all"]
}
```

The plugin package needs:

```text
kernel.js
```

The private route exposed by SiYuan is:

```text
/plugin/private/:name/*path
```

For this plugin:

```text
/plugin/private/siyuan-cloud/*
```

SiYuan may start the real HTTP server on a random localhost port. Document-ready snippets should stay root-relative (`/plugin/private/siyuan-cloud/...`), while user-copied browser links use the current SiYuan origin. SiYuan's publish service is a good future target for stable public share links, but current upstream has `/plugin/public/:name/*path` disabled and `/plugin/private/:name/*path` guarded by `CheckAuth` plus `CheckAdminRole`; publish-service requests carry a reader-role token, so private plugin routes cannot be exposed through publish as-is.

## OpenList Files To Inspect

- `docs/OpenList-main/main.go`
- `docs/OpenList-main/cmd/root.go`
- `docs/OpenList-main/internal/bootstrap/run.go`
- `docs/OpenList-main/server/router.go`
- `docs/OpenList-main/server/static/static.go`
- `docs/OpenList-main/server/handles`
- `docs/OpenList-main/internal/op`
- `docs/OpenList-main/internal/fs`

## Porting Rule

Do not import OpenList Go code into `kernel.js`. Use OpenList source as an API and behavior reference, then port compatible behavior into the SiYuan kernel plugin runtime.

## Current Port Surface

SiYuan still loads `kernel.js` from the plugin output directory, but that file is generated from `src/kernel/**` during `pnpm dev` or `pnpm build`. The repository root should not keep a generated `kernel.js`. See `docs/kernel-architecture.md` for the source layout.

The current port mirrors OpenList's HTTP response envelope:

```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

Business errors should also be returned as JSON with HTTP 200 where possible, matching `server/common/common.go`.

Implemented and compatibility areas:

- Progress/status: `/siyuan-cloud/status` returns version, counters, route coverage, and migration stage states for the dock panel.
- Auth/session: `/api/auth/login`, `/api/auth/login/hash`, `/api/me`, `/api/me/update`, `/api/auth/logout`. Default admin is synchronized from SiYuan `/api/system/getConf` user nickname/name when available, with the disabled OpenList-style guest kept for compatibility. Login now returns an OpenList-style HS256 JWT carrying `username`, `pwd_ts`, `exp`, `iat`, and `nbf`; settings `token` is accepted as the admin token; empty Authorization maps to guest; password changes update `pwd_ts` so old JWTs are rejected. `/api/auth/login/ldap` is registered as an explicit `501` placeholder until a real LDAP bind/search flow is ported.
- Public/API discovery: `/api/public/api`, `/api/public/routes`, `/api/public/settings`, `/api/public/offline_download_tools`, `/api/public/archive_extensions`. Archive extension discovery mirrors OpenList archive tool registration keys, including multipart entries such as `.zip.001`, `.7z.001`, and `.part1.rar`; `/api/public/api` now advertises ZIP stored/deflate extract, ZIP encrypted detection, virtual/mounted decompress upload, tar/tgz list/extract, share archive meta/list/extract, `/ad`/`/ap` archive path support, torrent parse, torrent generate, and torrent rapid-upload driver-boundary support. RAR/7z remain explicit unsupported readers until a JS/wasm reader can be packaged with verified fixtures.
- FS read/manage: `/api/fs/list`, `/api/fs/get`, `/api/fs/dirs`, `/api/fs/search`, `/api/fs/other`, `/api/fs/mkdir`, `/api/fs/rename`, `/api/fs/batch_rename`, `/api/fs/regex_rename`, `/api/fs/move`, `/api/fs/recursive_move`, `/api/fs/copy`, `/api/fs/remove`, `/api/fs/remove_empty_directory`, `/api/fs/link`, `/api/fs/put`, `/api/fs/form`, `/api/fs/get_direct_upload_info`, plus archive compatibility routes `/api/fs/archive/meta`, `/api/fs/archive/list`, `/api/fs/archive/decompress`. Ordinary FS read/manage routes now mirror the OpenList `user.JoinPath` and `server/common/check.go` entry checks: read routes apply `base_path` and nearest-meta `CanAccess`, write routes apply the relevant `model.User` permission bits plus source/target `CanRead`/`CanWrite`; batch manage routes keep OpenList's performance boundary and do not deeply validate every child path. `/api/fs/search` checks parent `base_path` first and filters results by `base_path` plus nearest-meta `CanAccess`. `/api/fs/other` now follows OpenList `FsOther -> fs.Other -> op.Other -> driver.Other`: mounted paths are rewritten to the storage actual path before calling driver `other`, OpenList/AListV3 forwards to the upstream `/api/fs/other`, and drivers without `other` return `not implement`. Archive meta/list now mirror OpenList's `/@s` split boundary for share paths and require `CanReadArchives`, `base_path`, and nearest-meta `CanAccess` for ordinary archive paths; `/ae`, `/ad`, `/ap`, and `/sad` can extract ZIP stored/deflate plus tar/tgz entries; `/api/fs/archive/decompress` requires `CanDecompress`, source `base_path`, and destination `CanWrite`, then can unpack into virtual FS or a mounted target whose driver exposes `put()` and returns the OpenList-style `task` array. ZIP encrypted entries are detected but not decrypted; `pass` / `archive_pass` currently return `501 wrong archive password`. Unsupported RAR/7z and other archive types still return explicit placeholders. `/api/fs/search` now queries a persisted local `search_nodes` index built by `/api/admin/index/build` or `/api/admin/index/update`, with OpenList `SearchNode` fields and PageResp shape; it remains a JavaScript `db_non_full_text`-style subset, not the full OpenList Bleve/Meilisearch/database searcher matrix.
- Offline/protocol placeholders: `/api/fs/add_offline_download` returns explicit not-implemented responses instead of falling through to 404 and now requires `CanAddOfflineDownloadTasks`. Offline download preserves OpenList's `urls` trim/empty-line skip and `{ tasks: [...] }` response shape while real aria2/qbit/transmission tools remain unported. Torrent `parse` and `upload_parse` now use a JS bencode reader, return file list/piece/CAS metadata, and preserve OpenList-style `info_hash`; torrent `generate` reads a virtual/workspace/mounted-driver file when bytes are available, requires path `base_path` plus `CanRead`, creates a single-file bencoded torrent with piece SHA1 and MD5, and can inject OpenList 189 `x-cas` metadata for 189 storage. Torrent `rapid_upload` validates CAS torrents, requires target path `base_path` plus `CanWrite`, and delegates to driver `rapidUploadFromTorrent` when present; drivers without that method return a clear capability error. Archive ZIP/tar/tgz meta/list/extract/decompress and `/ad`/`/ap`/`/sad` routes are wired for supported unencrypted entries; ZIP encrypted entries are detected and return a clear 501 until real decryption is ported. RAR/7z and other OpenList archive tools remain placeholders until a real JS/wasm reader can be packaged and smoke-tested.
- WebDAV surface: `/dav` supports `OPTIONS`, `PROPFIND`, `GET`, `HEAD`, `MKCOL`, `PUT`, `DELETE`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`, and `PROPPATCH` over the virtual FS. Entry permission now mirrors OpenList `server/webdav.go`: non-OPTIONS requests require `CanWebdavRead`, and `PUT/MKCOL/MOVE/COPY/DELETE/PROPPATCH` require `CanWebdavManage`. `@workspace` remains read-only until SiYuan upload/move behavior is proven.
- S3 surface: `/s3` exposes OpenList-style buckets from `s3_buckets`, falling back to the default `siyuan-cloud -> /` bucket when the setting is empty. It supports bucket listing, object listing, prefix/delimiter grouping, `GET`, `HEAD`, `PUT`, `DELETE`, copy via `x-amz-copy-source`, multi-delete via `POST ?delete`, and a lightweight multipart init/upload-part/list-parts/list-uploads/abort/complete path. OpenList upstream S3 uses `s3_access_key_id` / `s3_secret_access_key` through `server/s3/utils.go` rather than `UserKey`; this port now enforces AWS SigV4 header/query signing when those settings are configured, while keeping the existing no-key compatibility path. Explicit `siyuan-cloud-port:<id>` token requests remain an integration shortcut and apply WebDAV read/manage permission checks.
- Auth compatibility placeholders: SSO and WebAuthn routes are registered so OpenList-compatible clients can detect unsupported features cleanly.
- Admin compatibility: setting list/get/save/default/delete/reset token, offline download tool setting routes (`set_aria2`, `set_qbit`, `set_transmission`, `set_115`, `set_115_open`, `set_123_pan`, `set_123_open`, `set_pikpak`, `set_thunder`, `set_thunderx`, `set_thunder_browser`), config export/import (`/api/admin/config/export`, `/api/admin/config/import`), storage list/get/create/update/delete/enable/disable/load all, driver list/names/info, user list/get/create/update/delete/cancel_2fa, meta CRUD, message get/send, index build/update/stop/clear/progress, and scan progress. Admin routes now share an OpenList `AuthAdmin`-style request context check instead of assuming the private route caller is admin. User responses are sanitized, list uses OpenList `PageResp`, admin/guest role creation is rejected, role updates are rejected, admin cannot be disabled, and admin/guest cannot be deleted. Storage create is idempotent by mount path so the Dock verification tab can be rerun without duplicating mounts.
- FS batch rename now keeps `src_name` and `new_name` untouched instead of trimming them; this preserves OpenList's exact filename semantics for trailing-space files and matches the current smoke coverage.
- FS batch handlers now dispatch to mounted drivers where the OpenList boundary uses generic FS ops: `batch_rename` / `regex_rename` call driver `rename`, `recursive_move` walks driver `list` and calls driver `move`, and `remove_empty_directory` walks driver `list` and calls driver `remove`. Cross-mount recursive move remains an explicit unsupported edge.
- Driver runtime: storage mounts now resolve by longest `mount_path` before falling back to the virtual FS. Driver files now use OpenList-style directories under `src/kernel/internal/driver/<driver>/driver.js`, so future migration can compare directly with `docs/OpenList-main/drivers/<driver>/driver.go`. `OpenList`, `AListV3`/`AList V3`, `WebDav`, `S3`/`Doge`, `115 Cloud`, `Onedrive`/`OneDrive`, `123Pan`/`123`, `BaiduNetdisk`, `AliyundriveOpen`, `189Cloud`, `189CloudPC`, `189CloudTV`, `Quark`/`UC`, `QuarkOpen`, and `QuarkTV`/`UCTV` have kernel runtime adapters. `Local` is a desktop frontend runtime: FileTab/Dock detect Local mounts from config and use Electron `window.require('fs')` directly for list/get/mkdir/upload/rename/remove/copy/move, while the kernel OpenList HTTP runtime keeps only Local metadata and never proxies local disks. `/api/admin/driver/names` exposes Local for the Dock mount form because the frontend can service it; `/api/admin/driver/list` and `/api/admin/driver/info` still keep metadata-only OpenList fields for future migration. Common driver fields copied from OpenList `meta.go` now include Baidu, AliyunDrive/Open/Share, 123Pan/Open, 115 Cloud/Open, OneDrive/App, GoogleDrive/Photo, 189Cloud/189CloudPC/189CloudTV, Quark/UC/QuarkOpen/QuarkTV/UCTV, S3/Doge, WebDav, OpenList, and Local variants, including config flags such as `PreferProxy`, `OnlyProxy`, `NoUpload`, `CheckStatus`, `ProxyRangeOption`, `LinkCacheMode`, `NoOverwriteUpload`, `NoCache`, and `NoLinkURL` where the JS metadata layer can represent them. The 115 Cloud adapter ports OpenList `drivers/115` cookie/QR-token login, paged list, path resolution, get/read/link, mkdir/move/copy/remove/rename, storage details, and the `m115` download URL request/response codec into `src/kernel/internal/driver/115/*`; upload/offline download remain explicit placeholders because upstream depends on 115 ECDH rapid-upload and OSS multipart behavior. The OneDrive adapter ports the OpenList Graph token refresh, path URL mapping, list/get/link/read, mkdir/remove/rename, `Put` small-file `/content`, big-file `createUploadSession`/`Content-Range` upload, and `HttpDirect` direct-upload info into `src/kernel/internal/driver/onedrive/driver.js`. The 123Pan adapter ports OpenList's signed API URL generation, bearer-token login retry, paged list, download-info link resolution, final redirect URL resolution, mkdir/trash/rename, and `Put -> upload_request -> S3 upload -> upload_complete` flow into `src/kernel/internal/driver/123/driver.js`; non-reuse uploads support the OpenList 16MiB presigned chunk path and the temporary S3 credential path, with smoke coverage on the presigned branch. The AliyundriveOpen adapter ports list/get/read/link, basic mkdir/remove/rename/move/copy, short-lived list/file/link caches, OpenList `Other(video_preview) -> openFile/getVideoPreviewPlayInfo`, and the OpenList upload path `openFile/create -> upload_url PUT -> openFile/complete`; rapid upload supports the `PreHashMatched` branch with `pre_hash`, SHA1 `content_hash`, `proof_version=v1`, and access-token proof code. The QuarkOpen adapter ports OpenList signed requests, online token refresh, list/get/read/link, basic mkdir/remove/rename/move, and `Put -> upload_pre -> get_upload_urls -> OSS PUT -> upload_finish`, including MD5/SHA1 and proof fields. Quark/UC now ports OpenList `Put -> upPre -> upHash -> upPart -> upCommit -> upFinish`, including `file/upload/auth` canonical `auth_meta`, OSS part `PUT`, multipart complete XML, and `file/upload/finish`. The BaiduNetdisk adapter ports OpenList token refresh, paged list, official/crack/crack_video link branches, mkdir/delete/rename, and `PutRapid/create -> precreate -> locateupload -> superfile2 -> create` upload flow into `src/kernel/internal/driver/baidu_netdisk/driver.js`; it keeps short-lived list, resolved-file, and `Link()` caches so repeated `/p` Range requests for the same media file reuse the OpenList object/link resolution instead of walking deep paths again. S3/Doge now exposes OpenList-style direct upload info with SigV4 query presign and `direct_upload_host`; WebDav `Put` sets `Content-Type` and `Content-Length` like upstream `WriteStream`. `src/kernel/internal/driver/common.js` now exposes a storage-scoped list/file/link cache matching OpenList `dirCache` and `linkCache` timing closely enough for JS runtime drivers; AliyundriveOpen and the Quark family use it to avoid repeated path walking and link resolution on every player Range probe. 189Cloud, 189CloudPC, 189CloudTV, and Quark/UC currently cover list/get/read/link plus basic mkdir/remove/rename/move/copy where upstream exposes matching HTTP APIs; 189CloudTV additionally ports OpenList TV QR login UUID, QR display, `qrcodeLoginResult` access-token polling, and `loginFamilyMerge` session refresh. Ordinary 189Cloud now has `src/kernel/internal/driver/189/upload.js` for the OpenList `getSessionKey -> uploadRequest -> initMultiUpload/getMultiUploadUrls/commitMultiUploadFile` boundary, with `drivers/189/help.go` AES-ECB/PKCS7, RSA PKCS#1 v1.5, `b64tohex`, and HMAC-SHA1 basics copied into the same helper; remote upload still needs mock coverage and real-account validation. QuarkTV/UCTV cover list/get/read/link and preserve OpenList's `NotImplement` boundary for management/upload methods. Remaining upload, direct upload, and multipart details for other drivers stay as structured next steps. 189CloudPC is copied from `docs/OpenList-main/drivers/189pc` at the method-boundary level first: signed session requests, list/download link/basic management are present, while full password/QR login, PC AES `params`, family transfer, upload, and CAS/torrent flows remain explicit placeholders. Baidu `download_api=crack_video` is aligned with OpenList `linkCrackVideo`: it requests `https://pan.baidu.com/api/mediainfo` with `type=VideoURL`, `nom3u8=1`, `dlink=1`, `media=1`, and `origin=dlna`, then returns the resulting `model.Link` through the generic `internal/model.Link -> server/common/proxy.js -> body.proxy` streaming path. 115 Cloud, OneDrive, 123Pan, WebDav, and the Quark runtime adapters now also return `model.Link`-style data instead of downloading file bodies inside the driver, matching OpenList's `Link() -> common.Proxy` boundary.
- 189Cloud login/upload coverage note: ordinary 189Cloud now ports the OpenList `newLogin` username/password flow and persists cookies collected from `Set-Cookie` because SiYuan `forwardProxy` does not provide a resty-style cookie jar. Smoke coverage verifies RSA-wrapped login submit fields, persisted login cookies on subsequent list requests, SMS second verification (`-133 -> sendSmsCodeForSecondAuth.do -> submitForSecondAuth.do`), mocked upload request headers, encrypted `params`, part `PUT`, and commit flow. The remaining validation gap is real 189 account testing, especially captcha cases and large-file remote multipart behavior.
- Security compatibility: SSH key list/add/delete and 2FA generate/verify are persisted as compatibility state. They do not yet enforce real cryptographic login challenges.
- Share compatibility: `/api/share/list`, `/api/share/get`, `/api/share/create`, `/api/share/update`, `/api/share/delete`, `/api/share/enable`, and `/api/share/disable` now use OpenList `model.Sharing` fields (`id`, `files`, `pwd`, `accessed`, `max_accessed`, `expires`, `disabled`, `remark`, `readme`, `header`, sort fields, creator fields). Public share reads go through `/api/fs/list` and `/api/fs/get` when the first path segment matches a share `id`, multi-file share roots list the shared objects, access count is persisted with OpenList-style share id + client IP de-duplication, and `/sd/:id/*path` downloads the unwrapped file. Protected `/sd` links can be copied without `pwd`; opening them shows a lightweight password form and then retries with `?pwd=...`, matching OpenList's link-plus-share-code flow more closely. Share create/update preserves OpenList's path-save boundary instead of requiring local `state.entries`, so mounted driver paths such as 123Pan can be shared and later resolved through `driverRuntime`. `/sd` download now follows the storage/driver proxy decision and may return plugin proxy or driver redirect; the temporary force-proxy setting has been removed. Share management accepts OpenList query `id` on enable/disable/delete, update rejects `new_id` collisions, delete returns 404 for missing shares, config import preserves string/CJK share IDs, archive meta/list recognizes OpenList's `/@s` share split and resolves the shared target before using the common archive reader, and `/sad/:id` can validate share password then delegate archive entry extract. Explicit token requests apply the OpenList `server/handles/sharing.go` management boundary: non-admin users only see and mutate their own shares, create/update require share/custom-ID permission bits, and shared paths must stay under `base_path` and pass nearest meta read/password/hide checks. Public share reads, `/sd`, `@s` archive meta/list, and `/sad` now also re-check the share creator's current enabled state, `base_path`, and nearest meta read/password/hide permission before resolving the target, so later user/meta changes can invalidate old public shares. This is still not full OpenList `internal/sharing`, but request context and task/WebDAV/S3/archive/torrent/search entry permissions have been wired.
- Task compatibility: lightweight persistent task records for OpenList task groups, including move, copy, upload, offline download, aria2/qbit transfer, decompress, and decompress upload. The HTTP shape now follows OpenList `server/handles/task.go`: `TaskInfo` fields, `done`/`undone` arrays, `info`/`cancel`/`delete`/`retry`, batch error maps, JSON-array-only `cancel_some`/`delete_some`/`retry_some`, `clear_done`, `clear_succeeded`, and `retry_failed`. Records created by the current move/copy/offline/decompress routes carry `creator`, `creator_id`, and `creator_role`; non-admin task API requests only see and mutate their own tasks, while admin requests see the full set. This is still not OpenList `internal/task` plus `tache`: real asynchronous managers, cancellation propagation, retry scheduling, task group coordination, and accurate progress/state transitions remain future work.

Completeness warning:

- This plugin is not yet a full OpenList clone. It is an OpenList-compatible SiYuan kernel runtime subset with route compatibility and selected driver runtime ports.
- OpenList upstream contains many more driver directories than the runtime-backed set exposed by `/api/admin/driver/names`; metadata-only drivers must stay hidden from Dock mounting until their actual `drivers/<name>` runtime is copied.
- Future planning should prioritize OpenList mainline capability surfaces first: sharing, archive/offline/torrent, then task async-manager completeness, search/index async/backend completeness, and broader driver coverage.

The default FS implementation is a virtual tree stored in SiYuan kernel plugin storage under `runtime.json`. It is useful for route compatibility and UI/client integration tests. Syncable OpenList-compatible configuration is stored separately in `config.json`, and search nodes are stored in `search-index.json`.

`/@workspace` is the first real SiYuan adapter. It maps OpenList paths to SiYuan workspace-relative paths and calls official kernel APIs through `siyuan.client.fetch`:

- `/api/file/readDir` for OpenList list/dirs/search.
- `/api/file/getFile` for OpenList download/proxy.
- `/api/file/removeFile` for OpenList remove.
- `/api/file/renameFile` for OpenList rename.

Workspace upload is intentionally left disabled until multipart form support is handled correctly for `/api/file/putFile`.

Workspace batch rename and regex rename use `/api/file/renameFile`. Workspace recursive move is intentionally returned as not implemented until workspace upload/move behavior is proven.

## Dock Panel

The frontend registers one dock with `plugin.addDock`, type `openlist`, displayed as `siyuan-cloud` internally by SiYuan. The dock is now the Siyuan Cloud management surface: account login/current user/logout, storage mount management, config import/export, task checks, share management, and about/API actions.

The main file manager is registered as a SiYuan custom tab through `plugin.addTab({ type: "file-manager" })` and opened with `openTab({ custom: { id: plugin.name + "file-manager", data: { singleton: true } } })`. SiYuan reuses custom tabs by matching both `custom.id` and `custom.data`, so the file manager keeps a stable singleton identity and repeated open actions focus the same tab instead of creating duplicates. Dock file clicks, mount card clicks, and `siyuan://plugins/siyuan-cloud/open?path=...` links all call the same `openFileManager(path)` entry. When a path is present, the mounted FileTab opens the parent directory and reuses the loaded list item: directory paths enter that directory, while file paths select the target file.

Dock source:

- `src/App.vue`: registers top bar, custom file-manager tab, and dock lifecycle.
- `src/components/Dock.vue`: renders the Siyuan Cloud management panel template with OpenList-compatible icon navigation, account login, mount management with dynamic driver names, concrete driver parameter forms, addition JSON import/edit, config import/export, lightweight task checks, share list/copy/enable/disable/delete, storage/sync facts, API/about actions, and the lightweight Dock file tree. Files are the first Dock tab and mounts are second. Files, mounts, settings, tasks, shares, and about use one shared native `b3-list-item` page header directly below the top navigation row; the files header owns refresh-tree and open-file-manager actions, so the top navigation only switches pages. The file tree is rendered in this component with SiYuan's native `layout/dock/Files.ts` document-tree structure/classes (`file-tree`, `sy__file`, one root `ul.b3-list.b3-list--background` per top-level item, adjacent child `ul`, `--file-toggle-width`, toggle `padding-left`, and `--QYL-indent-1`) and stays as a direct Dock child so the tree keeps SiYuan spacing and theme behavior without stacked horizontal padding. Dock file-tree right-click uses the shared `src/utils/file_actions.ts` menu builder used by FileTab; delete uses the same `/api/fs/remove` path and confirmation. Other pages use `ol-body` as the shared scroll/content inset layer; list item horizontal margins are reset inside it so shares, settings, tasks, about, and mount cards align to the same left/right edge. Mounts keep the existing compact mount cards and form card, mount card clicks reuse `openFileManager(mount_path)`, editing loads full plaintext addition from `/api/admin/storage/get`, and mount/user/share deletes require confirmation. The about status row is a normal list item, so long route/status text uses the same ellipsis behavior and does not create a horizontal scrollbar. Compatible API calls and state are centralized in `src/utils/dock.ts`; shared UI styling lives in `src/index.scss`; semantic icon names are centralized in `src/utils/icon.ts` and map to SiYuan's existing Material-style symbols.
- Dock user management now has its own top-level tab, but intentionally reuses the same compact mount-row/form rhythm and SiYuan native classes. It calls `/api/admin/user/list/get/create/update/delete/cancel_2fa`, shows role/status chips, and keeps `/api/me` synchronized with the login verification username after the default admin is renamed to the current SiYuan account.
- `src/components/FileTab.vue`: renders the Siyuan Cloud file manager tab with path navigation, upload, download, create folder/file, rename, copy, move, delete, media/image open, markdown link copy, and on-demand text preview dialogs. Its file-operation calls go through OpenList-style `fs*` helpers in `src/utils/api.ts` and response handling in `src/utils/handle_resp.ts`; right-click menu construction and delete grouping/confirmation are shared with Dock through `src/utils/file_actions.ts`.

The verification tab is the main manual acceptance surface for now. It now performs non-mutating checks only: login, storage list, task list, and status refresh. It must not create default mounts or write FS/WebDAV/S3 probe files in a real workspace; write-capability checks belong in smoke tests or explicit user-triggered flows.

The mount panel is the manual driver-field acceptance surface. Select a runtime-backed driver, fill the generated fields, click "Update JSON" if you want to inspect the OpenList-compatible addition payload, then create the mount. Use config export/import to move a whole test setup between devices or conversations. Metadata-only drivers such as 115 Open and 115 Share remain available through `/api/admin/driver/list` for field reference but are hidden from `/api/admin/driver/names` until their runtime adapter is ported.

Driver form labels and help text are localized in the Dock through `driverField.*` and `driverFieldHelp.*` i18n keys. The visible label can be translated, but the original OpenList addition key is preserved as the input binding and title text so configs remain compatible with upstream field names.

The Dock mount form now follows the OpenList-style storage management flow. Add first tries `/api/admin/driver/test`; drivers with a test method, such as `123Pan`, can validate credentials and return an updated addition JSON before storage creation. Existing storages in the mount list can be loaded back into the same form for `/api/admin/storage/update`, enabled/disabled, or deleted by id, matching OpenList's create/update/enable/disable/delete split. Storage account fields such as 123Pan `username`/`password` live in `storage.addition` inside config and are returned by `/api/admin/storage/get`; admin storage reads refresh the syncable `config.json` domain before responding, so Dock edit sees config synced from disk instead of stale in-memory storage. Sensitive driver fields are hidden by default and can be revealed with the eye button beside the input. Export and import operate on the current driver's addition JSON only, separate from full config export/import.

The file manager tab keeps OpenList's playback/link boundary: `/api/fs/get` resolves object data and `raw_url`; `/d/<path>?sign=...` is the OpenList-style download route; `/p/<path>` is the proxy route when storage `web_proxy`, driver `prefer_proxy`, driver `only_proxy`, or `no_link_url` is active. External tools should use `/plugin/private/siyuan-cloud` as an OpenList-compatible base URL and call the HTTP routes directly, for example `POST /plugin/private/siyuan-cloud/api/fs/get`. `/api/public/api` and `/api/public/routes` return the current machine-readable route index, including `/api/*`, `/d`, `/p`, `/dav`, and `/s3` entry points. The built-in fallback opens images with SiYuan Viewer; audio/video playback is left to companion plugins or URL Scheme entries, which should treat `/plugin/private/siyuan-cloud/p` and `/d` URLs as final playback URLs and must not re-resolve them through their own cloud-drive drivers. `123Pan`, `BaiduNetdisk`, and `WebDav` default to proxied raw URLs where OpenList metadata says they should; `OneDrive` and `S3` can expose direct link URLs unless storage-level proxying is enabled.

For companion plugin integration, FileTab now reuses the same shape as document links: media and ebook filenames expose the OpenList-compatible `/p/<path>` URL as DOM `data-href`. Siyuan Media Player and SiReader already intercept playable/readable document links, so no `window.siyuanMediaPlayer`, `window.sireader`, custom event bridge, or `siyuan://plugins/<plugin>/...` hop is needed inside FileTab's own DOM click flow. Other companion plugins can reuse the same plain HTTP link metadata or call the OpenList-compatible HTTP surface directly.

OpenList `common.Proxy` is a generic streaming boundary: `fs.Link` returns a URL plus required headers, `common.Proxy` merges browser request headers with link headers, asks upstream, copies normal response headers/status, and streams the body. This port mirrors that shape in JavaScript with `src/kernel/internal/model/args.js` and `src/kernel/server/common/proxy.js`: `/d` and `/p` call driver `read`/`Link`, normalize `model.Link`-style data, merge incoming player headers such as `Range` and `If-Range` with driver headers such as `Referer` or `User-Agent`, filter hop-by-hop headers and browser-origin `Cookie`, and hand the final request to SiYuan `body.proxy`. Driver-provided `Cookie` headers are still allowed for cookie-based storage adapters. Do not add per-driver playback proxy patches unless OpenList has the same behavior.

`body.proxy` is the only streaming path for cloud driver playback. `forwardProxy` remains useful for JSON API calls, link resolution, login/token refresh, HEAD probes, and small metadata fetches, but it should not be used to pull full media bodies for playback. When a driver can produce a `model.Link`, prefer returning that link and let `/d` or `/p` stream it through the kernel proxy.

Driver `read()` implementations should now return one internal shape only: `{ link: { url, header, method, content_length } }` for streamable remote files, or `{ body, bodyEncoding, headers, contentType }` for small buffered fallbacks. Do not reintroduce local compatibility aliases such as `proxy_url`, `proxy_headers`, `proxy_method`, `Link`, or `URL`; keep OpenList compatibility at the HTTP/API boundary, not inside the runtime adapter contract.

Driver addition persistence follows OpenList's `internal/op/storage.go` boundary: `MustSaveDriverStorage` marshals `driver.GetAddition()` back to `storage.Addition`. The JS port mirrors this with a storage-scoped `saveDriverStorage` callback attached by `driverRuntime.resolve`. Migrated drivers call it where upstream calls `op.MustSaveDriverStorage`: OpenList/AListV3 login token saves, OneDrive/Baidu/AliyundriveOpen token refresh saves, 189CloudPC/189CloudTV session field saves, Quark cookie/addition updates, QuarkOpen token refresh saves, and QuarkTV/UCTV device/query/refresh token saves. QuarkTV/UCTV access tokens mirror OpenList's `QuarkUCTVCommon.AccessToken` runtime field and are not persisted as addition JSON.

## 2026-05-30 189Cloud PC/TV Method-Boundary Port

- Added runtime-backed `189CloudPC` and `189CloudTV` entries to `/api/admin/driver/names`, `/api/admin/driver/info`, and `/siyuan-cloud/status.adapters`.
- The first port follows OpenList `drivers/189pc` and `drivers/189_tv` method names and request flow where the SiYuan JS runtime can carry it: signed `List`, `Link`, `MakeDir`, `Move`, `Copy`, `Remove`, and `Rename` calls, with `Link()` returning the shared `model.Link -> common.Proxy -> body.proxy` shape.
- 189CloudTV now ports OpenList TV QR polling: `getQrCodeUUID.action` returns a UUID login URL, Dock generates a data-URL QR image from that `qr_text`, `qrcodeLoginResult.action` writes `access_token`, and `loginFamilyMerge.action` writes session fields back to addition. QR image generation stays in the frontend so SiYuan 3.6.5 kernel runtime does not need `TextEncoder`. Full 189CloudPC password/QR login, RSA/verification/OCR, AES-ECB encrypted `params`, upload/family-transfer/rapid/CAS/torrent paths are not silently replaced; they remain explicit compatibility placeholders for the next migration batch.
- Dock keeps the QR image visible during pending poll responses and saves/updates the storage automatically after QR login succeeds. 189CloudTV also mirrors OpenList `Init` root handling for personal/family modes and auto-fills `family_id` from `getFamilyList.action` when family mode is selected.
- 189CloudTV/189CloudPC now preserve large numeric cloud IDs as strings before JSON parsing, matching OpenList `drivers/189_tv/types.go` and `drivers/189pc/types.go` custom `String` unmarshalling. Smoke coverage verifies a third-level 189CloudTV directory keeps parent id `423733170035514321` exactly instead of sending a rounded JavaScript number.
- The 189 session helper is no longer kept as a root-level shared file. The current structure keeps duplicated method-boundary session code in `src/kernel/internal/driver/189pc/session.js` and `src/kernel/internal/driver/189_tv/session.js`, so future work can continue by comparing each directory directly with its matching OpenList source folder.
- AliyundriveOpen now keeps short-lived list/file/link caches so repeated `/p` playback Range requests do not re-walk the same path and re-request the same download URL on every player probe. This is the current local difference most likely to explain slow Aliyun playback versus OpenList's cached `op.Link` flow.

## 2026-05-30 Quark Family Runtime

- `src/kernel/internal/driver/quark_uc/driver.js` now matches OpenList `drivers/quark_uc` for both `Quark` and `UC`; `/api/fs/list` is normalized at the FS handler boundary to OpenList `ObjResp`, so list items do not expose a `path` field. This mirrors OpenList `server/handles/fsread.go`: child navigation is derived from the current request path plus `ObjResp.name`, not from driver private `GetPath()`.
- Added `src/kernel/internal/driver/quark_open/driver.js` from OpenList `drivers/quark_open`: signed `x-pan-*` requests, online API token refresh, `List`, `Link`, `MakeDir`, `Move`, `Rename`, `Remove`, and upload proof/multipart/OSS completion are wired.
- Added `src/kernel/internal/driver/quark_uc_tv/driver.js` from OpenList `drivers/quark_uc_tv`: `QuarkTV` and `UCTV` expose device/query token persistence, refresh-token login, `List`, and `Link`. Management and upload methods intentionally return explicit not-implemented errors because OpenList does the same for this driver.
- Quark/UC, QuarkOpen, and QuarkTV/UCTV now use the shared storage-scoped list/file/link cache, matching OpenList `op.List/Get/Link` cache behavior. Repeated `/p` Range requests for the same media file reuse the already resolved object and direct link instead of repeatedly calling Quark list/download APIs.
- Ordinary `Quark` proxy defaults match OpenList `QuarkOrUC.Init`: new or updated mounts default to `web_proxy=true` only when `use_transcoding_address` is false and no explicit proxy setting was supplied; `UC` and `QuarkOpen` still keep upstream `OnlyProxy`.
- Dock driver forms bias new mounts toward faster playback defaults: BaiduNetdisk `download_api` defaults to `crack_video`, ordinary `Quark` defaults `use_transcoding_address=true`, and QuarkTV/UCTV default `link_method=streaming`. Existing storage additions are not migrated automatically.
- Smoke coverage now mounts `Quark`, `QuarkOpen`, and `QuarkTV`, checks that list responses keep OpenList `ObjResp` shape without driver `path`, verifies `/api/fs/link` returns the driver `model.Link` URL while proxied raw URLs remain on `/p/<path>` where driver config says `PreferProxy`/`OnlyProxy`, asserts repeated `/p` Range reads do not increase Quark list/link request counters, covers Quark transcoding raw URL defaults, and covers the QuarkTV QR login `need verify -> query_token -> refresh_token` flow.

The long-form migration plan is kept in `docs/siyuan-cloud-migration-plan.md`.

## 2026-06-07 115 Cloud Form And Rate Alignment

- 115 Cloud keeps the OpenList addition schema exactly at the login boundary: `cookie` and `qrcode_token` are not marked as independent required fields, because upstream treats them as conditional alternatives and reports `missing cookie or qrcode account` in login/init. Dock now promotes `root_folder_id`, `cookie`, `qrcode_token`, and `qrcode_source` into the primary 115 form area, with localized help text and QR source option labels, while preserving the original addition keys.
- The 115 runtime now mirrors OpenList `LimitRate -> WaitLimit` at the public operation boundary for list/get/read/mkdir/move/copy/remove/rename/details. Upload and offline download remain explicit placeholders until the OpenList ECDH rapid-upload and OSS multipart path is ported.

## 2026-06-25 Archive Range And GBK Notes

- Mounted ZIP archive preview follows OpenList's range-reader shape rather than pulling the whole remote body. `src/kernel/server/handles/archive.js` converts a driver `read()` link into a seekable reader for ZIP central directory parsing and entry extraction. This is currently used for Baidu mounted ZIP and any other driver that exposes a readable link.
- ZIP filename decoding is intentionally local and deterministic. SiYuan's kernel JS runtime cannot be assumed to support `TextDecoder("gbk")`, so `src/kernel/internal/fs/gbk.js` contains a generated GBK table and `archive.js` uses it for non-EFS ZIP names. Do not reintroduce `non_efs_zip_encoding` guessing or replacement-character fallback logic unless there is a full OpenList-compatible settings migration and test matrix.
- `/api/network/forwardProxy` request shape matters for signed URLs. No-body GET/HEAD calls must omit `contentType`, `payload`, and `payloadEncoding`; this matches OpenList `net.RequestHttp(ctx, "GET", header, link.URL)` more closely and avoids OSS-style `SignatureDoesNotMatch` errors caused by polluted request bodies/headers.
- OpenList alignment checks for signed links: AliyundriveOpen `Link` returns URL only; QuarkOpen `Link` returns URL plus auth Cookie; common proxy/range code should preserve link headers and add only `Range` for range reads.
- Archive entry media playback is not currently equivalent to normal driver playback. Normal Baidu video playback uses `Link() -> /p -> body.proxy` and can use Baidu's fast video/direct link branch. Video inside a ZIP uses `/ae?...inner=...` and currently extracts entry bytes rather than exposing a fully seekable Range proxy. If users report archive video "always loading", treat it as a known archive-entry streaming gap, not as a Baidu video-link regression.

## 2026-05-30 Torrent Placeholder And FS Manage Alignment

- Added OpenList-compatible torrent routes from current `docs/OpenList-main/server/handles/torrent.go`: `/api/fs/torrent/parse` and `/api/fs/torrent/upload_parse` parse torrent bencode in JS and expose file/CAS metadata; `/api/fs/torrent/generate` now creates real single-file torrent data for readable files; `/api/fs/torrent/rapid_upload` keeps the OpenList 189/189PC CAS driver boundary and delegates only when a runtime driver exposes `rapidUploadFromTorrent`.
- `/api/public/api` now advertises `openlist.fs.torrent.parse`, `openlist.fs.torrent.generate`, and `openlist.fs.torrent.rapid-upload.driver-boundary`, and `/siyuan-cloud/status.stages` exposes an active `torrent` stage for the Dock progress panel.
- Virtual FS copy/move conflict handling is aligned with the latest OpenList `server/handles/fsmanage.go` behavior: when `skip_existing` is enabled, existing targets are skipped and later names continue to process instead of aborting the whole batch. Copy `merge` continues only for existing directory targets.
- Smoke coverage now asserts torrent parse/upload_parse, generated torrent round-trip parse, rapid upload driver-boundary behavior, the public capability flags, the Dock torrent stage, and copy/move `skip_existing` continuation behavior.

## 2026-05-30 SiYuan Status Alignment

- The Dock status card now uses the private HTTP status route directly through `src/utils/status.ts`, keeping OpenList-compatible HTTP as the primary integration surface and avoiding user-visible noise from SiYuan's `/ws/plugin/rpc` notification channel when that WebSocket handshake fails.
- `src/kernel/server/handles/status.js` still exports `createStatusPayload`, so the HTTP status route and `siyuan-cloud.status` RPC return the same complete payload: counters, adapters, storage sync facts, routes, and migration stages.
- Dock status refreshes use the shared `fetchKernelStatus` helper, avoiding duplicated status parsing while keeping the OpenList-compatible HTTP surface unchanged.
- Smoke tests now capture the registered kernel RPC handler and assert that `siyuan-cloud.status` exposes the same torrent route/stage coverage as the HTTP status route.

## 2026-06-05 User Baseline

- Added `src/kernel/internal/model/user.js` for OpenList-compatible role constants, default admin/guest users, permission defaults, import normalization, and response sanitization.
- Kernel startup reads SiYuan `/api/system/getConf` and maps the current SiYuan account nickname/name onto the default admin username, while keeping the OpenList disabled guest user. The account metadata is stored as `siyuan_account` for UI/context only.
- `/api/auth/login` and `/api/auth/login/hash` now require a matching non-disabled user instead of unconditionally returning the admin token. They return an OpenList-style JWT and validate `pwd_ts` on later requests; password storage is still the lightweight JS runtime compatibility field, not OpenList's full hash/salt model. `/api/auth/login/ldap` deliberately returns `501` because the current runtime has not ported OpenList's LDAP server bind/search authentication.
- `/api/admin/user/*` now mirrors OpenList's user CRUD guardrails: paged list, sanitized get/list/create responses, no creating admin/guest, no role mutation, no disabling admin, and no deleting admin/guest.
- Dock adds a Users tab for refresh/add/edit/enable/disable/delete/cancel-2FA using existing `ol-mount-row`, `ol-mount-form`, and `b3-*` styling. Full permission enforcement across FS/task/share/protocol handlers remains a future security batch.

## Smoke Test

`pnpm test:kernel` runs `scripts/kernel-route-smoke.mjs`. It mocks the SiYuan kernel plugin globals, loads `src/kernel/index.js`, runs `onload`, and verifies representative OpenList-compatible routes including status HTTP/RPC parity, FS list/put/mkdir/copy/move skip handling, ordinary FS permission/base-path checks, search index build/progress/search/clear/update, task done/info/not-found/batch error-map shapes and creator filtering, share create/list/multi-file root/password/disable/download, Quark directory names with trailing spaces and repeated `/p` Range cache reuse, meta CRUD, messages, scan progress, WebDAV PROPFIND/PUT/MOVE/LOCK plus read/manage permission checks, S3 bucket/object list/get/put/delete/copy/multi-delete/prefix-delimiter/multipart list and abort flows plus token read/manage permission checks, SSH keys, 2FA generation, virtual-FS ZIP/tar/tgz archive list/extract/decompress, ZIP encrypted detect/501 boundary, `/ad`/`/ap` extract, Baidu mounted zip archive list/extract, share archive meta/list and `/sad` extract, remaining offline/torrent structured placeholders, and `/d`/`/p` streaming proxy request construction with Range/header forwarding.

## 2026-05-26 Streaming Proxy Batch

- SiYuan PR #17748 adds kernel plugin `body.proxy` responses. The kernel side accepts `ResponseProxy{url, method, headers}`, permits only `http`/`https` and `GET`/`HEAD`, filters hop-by-hop headers, disables automatic compression, follows up to 10 download redirects while preserving proxy headers such as `Range` and `User-Agent`, uses `util.SSRFSafeDialer`, forwards final upstream status and safe response headers, drops upstream `Set-Cookie`, and streams the body instead of buffering it.
- `src/kernel/server/common/proxy.js` is the plugin-side mirror of OpenList `server/common/proxy.go`: it merges incoming browser/player request headers with driver `model.Link` headers, deduplicates header names case-insensitively, filters hop-by-hop headers and browser-origin `Cookie`, and returns `body.proxy`.
- SiYuan `/api/network/forwardProxy` now accepts `redirect: false` so drivers can do OpenList-style no-redirect link probes. BaiduNetdisk official downloads use this to `HEAD` the first `d.pcs.baidu.com` dlink, read its `Location`, and pass the final `appall*.baidupcs.com` URL to `body.proxy` instead of surfacing a 302 to the browser.
- `/d` and `/p` are now the shared playback/download surface for runtime drivers. Drivers should return `model.Link`-style data from `read()` rather than downloading media through `/api/network/forwardProxy`.
- `/api/fs/get.raw_url` and `/api/fs/link.raw_url` now follow OpenList proxy selection: proxy-required storages return `/plugin/private/siyuan-cloud/p/<path>`, while non-proxied storages can return the driver link URL.

Frontend UI settings should use the regular SiYuan plugin API `plugin.loadData/saveData`. The kernel runtime cannot access the frontend `Plugin` instance; it uses the kernel plugin API `siyuan.storage.get/put/list/remove`, which is scoped to the kernel plugin storage directory. Keep these two layers separate:

- Frontend/Dock preferences: `plugin.loadData/saveData`.
- Kernel OpenList data: `siyuan.storage`. Syncable config lives in `config.json` (`settings`, `users`, `storages`, `metas`, `sharings`, `ssh_keys`), local/runtime data lives in `runtime.json`, and search nodes live in `search-index.json`. Old `siyuan-cloud/state.json` is read only as a migration source.

## Storage And Sync Finding

Source analysis:

- `kernel/plugin/plugin.go`: `KernelPlugin.storageDir` is `filepath.Join(util.DataDir, "storage", "petal", petal.Name)`.
- `kernel/plugin/api_storage.go`: `siyuan.storage` resolves every relative path inside `p.storageDir`.
- `kernel/model/repository.go`: sync repository is created with `dejavu.NewRepo(util.DataDir, ...)`, so `data/storage/petal/<plugin>` is inside the synchronized data repo unless ignored.
- `kernel/model/sync.go`: `getSyncIgnoreLines()` reads `data/.siyuan/syncignore`; there is no default ignore for `/storage/petal`.
- `kernel/model/repository.go`: merge handling explicitly checks `/storage/petal/` and pushes plugin data-change reload events.

Conclusion: `siyuan.storage` is persistent and syncable by default. Users can still exclude it by adding `/storage/petal/**` or `/storage/petal/siyuan-cloud/**` to `.siyuan/syncignore`.


## 2026-05-25 Document Embed Links

- FileTab can copy document-ready snippets with root-relative plugin URLs, avoiding fixed 127.0.0.1:6806 origins: images use ![](/plugin/private/siyuan-cloud/p/<path>), audio/video use native audio/video tags, and generic files use siyuan://plugins/siyuan-cloud/open?... links.
- The frontend plugin handles siyuan://plugins/siyuan-cloud/open?... via SiYuan's open-siyuan-url-plugin event and opens the proxy URL directly. Companion plugins that need audio/video playback should call the OpenList-compatible HTTP API themselves, preserving the `raw_url` and `/d`/`/p` boundary without adding a hard dependency here.

## 2026-06-28 Native Plugin Docs

- Dock status/info can open plugin documentation as normal SiYuan documents. The frontend uses SiYuan `fetchSyncPost` plus `openTab({ doc: { id } })`: find/create the dedicated notebook `Siyuan OpenList`, find/create the target doc by hpath, update existing docs with current Markdown, and open the doc tab.
- Packaged docs are static plugin assets. Keep marketplace `README.md` and `README_zh_CN.md` at the plugin root. Put maintained extra docs under `assets/docs/*.md`; language variants use the same base name plus suffix, for example `CHANGELOG.md` and `CHANGELOG_zh_CN.md`.
- `scripts/docs-manifest.mjs` scans `assets/docs/*.md` and writes `assets/docs/index.json`; `pnpm dev` and `pnpm build` run it before Vite. Runtime reads the JSON manifest through `/plugins/siyuan-cloud/assets/docs/index.json` and fetches Markdown files directly. This avoids Vite `import.meta.glob` chunks, which produced `Cannot find module './CHANGELOG-*.cjs'` in SiYuan/Electron.
- Language selection uses the loaded plugin i18n result instead of `window.siyuan.config.appearance.lang`, because the latter was unreliable in the plugin runtime. Chinese UI picks `*_zh_CN.md` when present and falls back to the default file otherwise.
- Opening a doc after the packaged Markdown changes will sync the existing SiYuan document on click. Newly created docs are written once by `/api/filetree/createDocWithMd`; existing docs are refreshed with `/api/block/updateBlock`.

## 2026-06-29 Capability Contract Freeze

- `/api/public/api` now distinguishes legacy capability names from structured capability facts. The response includes `capability_summary`, `capability_matrix`, and `driver_capabilities` while preserving the old `capabilities` array for existing callers.
- Capability statuses are deliberately conservative: route-compatible but unfinished surfaces are `partial`, structural stubs are `placeholder`, and known unavailable behavior is `unsupported`. Examples covered by smoke tests include task manager `partial`, offline download `placeholder`, ZIP decrypt `unsupported`, 115 upload `placeholder`, 189CloudPC rapid upload `placeholder`, and QuarkTV upload `unsupported`.
- `/siyuan-cloud/status` exposes the same summary and driver matrix so Dock/status consumers can render progress from one machine-readable source instead of inferring from route names.

## 2026-06-29 Task Queue Base

- `createTaskStore` now exposes `enqueueTask(type, input, worker)` in addition to the existing `addTask`. Existing callers of `addTask` still get immediate succeeded/failed records, preserving current FS/archive/offline response shapes.
- Queued tasks persist the OpenList-style task fields plus `queued_time`, `updated_time`, and `cancel_requested`. The in-memory worker updates persisted state to `running`, lets workers report progress, then finalizes to `succeeded`, `failed`, or `canceled`.
- `/api/task/{type}/cancel` now requests cancellation for pending/running queued tasks. Pending queued tasks are removed from the in-memory queue and marked canceled; running tasks become `canceling` until the worker observes the cancel token.
- `index` is now a task group. `/api/admin/index/build` and `/api/admin/index/update` accept `async: true` / `task: true` / `queued: true` to queue a background index task. Default synchronous behavior is unchanged for existing callers and tests.
- `/api/admin/index/stop` now cancels the current undone `index` task and writes `index canceled` progress. `searchIndex.build` accepts a cancel predicate and checks it while walking paths.
- Remaining gap: queued workers are not persisted across plugin reload, retry does not restore the original worker, and heavier FS/archive/offline/upload operations still need to be moved from immediate task records onto the queue.

## 2026-06-29 Password Hash And Logout Token Cache

- User password storage now follows OpenList's `StaticHash` / `HashPwd` shape. New passwords and password updates write `pwd_hash`, `pwd_salt` / `salt`, and `pwd_ts`; new plaintext `password` values are not retained.
- Legacy plaintext passwords remain readable for migration. On successful raw-password login, the user is upgraded to hash/salt storage. `/api/auth/login/hash` now verifies the submitted OpenList static hash.
- `/api/auth/logout` records the current JWT fingerprint in `logout_tokens`; JWT auth rejects those fingerprints. This avoids the timestamp race where logging out and immediately logging back in during the same second could invalidate the new token.
- `sanitizeUser` removes password hash, salt, and logout fingerprint fields from user responses. Smoke coverage verifies raw login, hash login, logout invalidation, re-login, and password-change `pwd_ts` invalidation.

## 2026-07-01 WebDAV And File UI Consolidation

- WebDav runtime has been compared against `docs/OpenList-main/drivers/webdav` and `docs/OpenList-main/pkg/gowebdav`. The JS driver now keeps the same main helper shape: `readDir`, `stat`, `link`, `mkdirAll`, `renamePath`, `copyPath`, `removeAll`, and `writeStream`.
- `readDir` uses `PROPFIND Depth:1`, skips the self collection response, and names children from href basename before falling back to `displayname`. `stat` uses `PROPFIND Depth:0`; the old HEAD-based get path was removed. `read()` returns a link/header object only, leaving `/d` and `/p` to produce preview/download URLs.
- Remaining WebDAV parity gaps are explicit: persistent cookie jar, SharePoint `odrvcookie`, `tls_insecure_skip_verify`, Basic/Digest 401 negotiation, 409 parent retry for create/copy/move, and OpenList's no-redirect `Link(args.Redirect)` probe.
- FileTab and Dock no longer maintain separate image viewer, download, copy-link, share, delete, prompt, size formatting, or context-menu logic. Shared behavior lives in `src/utils/file_ui.ts` and `src/utils/file_actions.ts`; component code should only provide current item lists and path resolvers.
- The image viewer lazy-loads siblings and explicitly selects the clicked item after Viewer is shown, fixing the regression where preview opened from the first image instead of the clicked one. Error handling now uses shared `showErrorMessage`, fixing the previous Dock/FileTab `handleError is not defined` failures.

## 2026-05-25 FS Manage Batch

- `src/kernel/server/handles/fs.js` now routes the common OpenList-style manage path through shared upload and same-mount transfer helpers instead of per-button frontend logic: raw `PUT /api/fs/put`, multipart `PUT /api/fs/form`, `POST /api/fs/get_direct_upload_info`, and same-storage `POST /api/fs/copy` / `POST /api/fs/move` all share the same normalized path, overwrite, and driver dispatch flow.
- Virtual storage binary uploads now round-trip through the OpenList-compatible `/api/fs/put` and `/api/fs/form` boundary: uploaded bytes are stored with `body_encoding=base64`, and `/d/...` returns raw bytes instead of base64 text.
- `OpenList`, `WebDav`, `Onedrive`, and `S3` runtime adapters now expose `move`/`copy`; their `put` path also accepts the upload metadata needed by the shared fs handler layer, including base64 payload forwarding where required by SiYuan `forwardProxy`.
- `src/components/FileTab.vue` now uses these shared fs routes for upload, download, create folder/file, rename, copy, move, and delete. The top toolbar and right-click menu are wired against `/api/fs/*` routes rather than frontend-local mutations, keeping the management flow aligned with OpenList handler semantics.
- `pnpm test:kernel` now covers direct-upload info, raw binary `PUT /api/fs/put`, multipart `PUT /api/fs/form`, binary `/d/...` readback, and virtual-fs `copy` / `move` task creation in addition to the earlier route smoke coverage.

## 2026-05-26 OpenList FS Source Alignment

- Frontend file-management calls now follow `docs/OpenList-Frontend-main/src/utils/api.ts`: `fsGet`, `fsList`, `fsMkdir`, `fsRename`, `fsMove`, `fsCopy`, `fsRemove`, and `fsNewFile` call a local `r.post` / `r.put` adapter with the same route names and payload fields.
- Frontend response handling is split into `src/utils/handle_resp.ts`, matching OpenList's `handle_resp.ts` flow while mapping `notify` to SiYuan `showMessage`.
- Upload paths now follow OpenList `server/handles/fsup.go`: multipart uploads use the `File-Path` header, and `File-Path` is URL-decoded in the kernel handler.
- `POST /api/fs/get_direct_upload_info` now follows OpenList `server/handles/direct_upload.go`: unsupported direct upload returns `data: null` instead of a local fallback to `/api/fs/form`.
- FileTab's top toolbar now uses SiYuan's native `protyle-breadcrumb` and `block__icon fn__flex-center ariaLabel` class pattern, with the path input using `b3-text-field` directly instead of plugin-specific sizing styles.
- FileTab selection now follows the OpenList frontend interaction shape more closely: a toolbar selection toggle controls whether row/header checkboxes are visible, row/header checkboxes control selection, row click opens the file/folder, and the desktop-style single-click-select/double-click-open path has been removed.
- External-player opening follows OpenList Frontend instead of adding a new backend API: `docs/OpenList-Frontend-main/src/pages/home/previews/video_box.tsx` defines players such as PotPlayer with `scheme: "potplayer://$durl"`, and `src/pages/home/file/open-with.tsx` combines `getExternalPreviews` with `convertURL`. The SiYuan port keeps Dock-managed `external_previews`; FileTab does not implement an external-player menu, and companion plugins should use the HTTP API plus OpenList Frontend URL conversion rules themselves.
