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
- OpenList `main` is now `9cc5dd9`. New useful upstream behavior includes `/api/fs/torrent/parse`, `/api/fs/torrent/upload_parse`, `/api/fs/torrent/rapid_upload`, and `/api/fs/torrent/generate`; these should be added as structured placeholders first, then ported if/when offline download and 189PC rapid upload are migrated.
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

Implemented areas:

- Progress/status: `/siyuan-cloud/status` returns version, counters, route coverage, and migration stage states for the dock panel.
- Auth/session: `/api/auth/login`, `/api/auth/login/hash`, `/api/me`, `/api/auth/logout`.
- Public/API discovery: `/api/public/api`, `/api/public/routes`, `/api/public/settings`, `/api/public/offline_download_tools`, `/api/public/archive_extensions`.
- FS read/manage: `/api/fs/list`, `/api/fs/get`, `/api/fs/dirs`, `/api/fs/search`, `/api/fs/mkdir`, `/api/fs/rename`, `/api/fs/batch_rename`, `/api/fs/regex_rename`, `/api/fs/move`, `/api/fs/recursive_move`, `/api/fs/copy`, `/api/fs/remove`, `/api/fs/remove_empty_directory`, `/api/fs/link`, `/api/fs/put`, `/api/fs/form`, `/api/fs/get_direct_upload_info`, plus archive compatibility placeholders `/api/fs/archive/meta`, `/api/fs/archive/list`, `/api/fs/archive/decompress`.
- Offline/protocol placeholders: `/api/fs/add_offline_download`, torrent routes `/api/fs/torrent/parse`, `/api/fs/torrent/upload_parse`, `/api/fs/torrent/rapid_upload`, `/api/fs/torrent/generate`, and archive download paths `/ad/*`, `/ap/*`, `/ae/*` return explicit not-implemented responses instead of falling through to 404.
- WebDAV surface: `/dav` supports `OPTIONS`, `PROPFIND`, `GET`, `HEAD`, `MKCOL`, `PUT`, `DELETE`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`, and `PROPPATCH` over the virtual FS. `@workspace` remains read-only until SiYuan upload/move behavior is proven.
- S3 surface: `/s3` exposes a default `siyuan-cloud` bucket mapped to the virtual FS. It supports bucket listing, object listing, prefix/delimiter grouping, `GET`, `HEAD`, `PUT`, `DELETE`, copy via `x-amz-copy-source`, multi-delete via `POST ?delete`, and a lightweight multipart init/upload-part/list-parts/list-uploads/abort/complete path; signature validation and full multipart compatibility still need work.
- Auth compatibility placeholders: SSO and WebAuthn routes are registered so OpenList-compatible clients can detect unsupported features cleanly.
- Admin compatibility: setting list/get/save/default/delete/reset token, offline download tool setting routes (`set_aria2`, `set_qbit`, `set_transmission`, `set_115`, `set_115_open`, `set_123_pan`, `set_123_open`, `set_pikpak`, `set_thunder`, `set_thunderx`, `set_thunder_browser`), config export/import (`/api/admin/config/export`, `/api/admin/config/import`), storage list/get/create/update/delete/enable/disable/load all, driver list/names/info, user list/get/update, meta CRUD, message get/send, index progress, and scan progress. Storage create is idempotent by mount path so the Dock verification tab can be rerun without duplicating mounts.
- Driver runtime: storage mounts now resolve by longest `mount_path` before falling back to the virtual FS. Driver files now use OpenList-style directories under `src/kernel/internal/driver/<driver>/driver.js`, so future migration can compare directly with `docs/OpenList-main/drivers/<driver>/driver.go`. `OpenList`, `AListV3`/`AList V3`, `WebDav`, `S3`/`Doge`, `Onedrive`/`OneDrive`, `123Pan`/`123`, `BaiduNetdisk`, `AliyundriveOpen`, `189Cloud`, `189CloudPC`, `189CloudTV`, `Quark`/`UC`, `QuarkOpen`, `QuarkTV`/`UCTV`, and `Local` have initial runtime adapters. `/api/admin/driver/names` only exposes runtime-backed drivers for Dock mounting; `/api/admin/driver/list` and `/api/admin/driver/info` still keep metadata-only OpenList fields for future migration. Common driver fields copied from OpenList `meta.go` now include Baidu, AliyunDrive/Open/Share, 123Pan/Open, 115 Cloud/Open, OneDrive/App, GoogleDrive/Photo, 189Cloud/189CloudPC/189CloudTV, Quark/UC/QuarkOpen/QuarkTV/UCTV, S3/Doge, WebDav, OpenList, and Local variants, including config flags such as `PreferProxy`, `OnlyProxy`, `NoUpload`, `CheckStatus`, `ProxyRangeOption`, `LinkCacheMode`, `NoOverwriteUpload`, `NoCache`, and `NoLinkURL` where the JS metadata layer can represent them. The OneDrive adapter ports the OpenList Graph token refresh, path URL mapping, list/get/link/read, mkdir/remove/rename, and small-file put control flow into `src/kernel/internal/driver/onedrive/driver.js`. The 123Pan adapter ports OpenList's signed API URL generation, bearer-token login retry, paged list, download-info link resolution, final redirect URL resolution, mkdir/trash/rename flow into `src/kernel/internal/driver/123/driver.js`; upload remains a structured next step because OpenList's S3 multipart complete path still needs migration. The BaiduNetdisk adapter ports OpenList token refresh, paged list, official/crack/crack_video link branches, mkdir/delete/rename flow into `src/kernel/internal/driver/baidu_netdisk/driver.js`; it keeps short-lived list, resolved-file, and `Link()` caches so repeated `/p` Range requests for the same media file reuse the OpenList object/link resolution instead of walking deep paths again. `src/kernel/internal/driver/common.js` now exposes a storage-scoped list/file/link cache matching OpenList `dirCache` and `linkCache` timing closely enough for JS runtime drivers; AliyundriveOpen and the Quark family use it to avoid repeated path walking and link resolution on every player Range probe. AliyundriveOpen, 189Cloud, 189CloudPC, 189CloudTV, Quark/UC, and QuarkOpen currently cover list/get/read/link plus basic mkdir/remove/rename/move/copy where upstream exposes matching HTTP APIs; QuarkTV/UCTV cover list/get/read/link and preserve OpenList's `NotImplement` boundary for management/upload methods. Upload, direct upload, and multipart paths remain structured next steps. 189CloudPC and 189CloudTV are copied from `docs/OpenList-main/drivers/189pc` and `docs/OpenList-main/drivers/189_tv` at the method-boundary level first: signed session requests, list/download link/basic management are present, while full password/QR login, PC AES `params`, family transfer, upload, and CAS/torrent flows remain explicit placeholders. Local maps OpenList's `drivers/local` shape to SiYuan workspace-relative `/api/file` access because the kernel plugin runtime must not directly read arbitrary host absolute paths. Baidu `download_api=crack_video` is aligned with OpenList `linkCrackVideo`: it requests `https://pan.baidu.com/api/mediainfo` with `type=VideoURL`, `nom3u8=1`, `dlink=1`, `media=1`, and `origin=dlna`, then returns the resulting `model.Link` through the generic `internal/model.Link -> server/common/proxy.js -> body.proxy` streaming path. OneDrive, 123Pan, WebDav, and the Quark runtime adapters now also return `model.Link`-style data instead of downloading file bodies inside the driver, matching OpenList's `Link() -> common.Proxy` boundary. Upload and multipart details remain pending.
- Security compatibility: SSH key list/add/delete and 2FA generate/verify are persisted as compatibility state. They do not yet enforce real cryptographic login challenges.
- Share compatibility: basic `/api/share/list`, `/api/share/get`, `/api/share/create`, `/api/share/update`, `/api/share/delete`, `/api/share/enable`, `/api/share/disable`, public share reads through `/api/fs/list` and `/api/fs/get` when the first path segment matches a share `sid`, and simplified `/sd/:sid/*path` downloads.
- Task compatibility: lightweight persistent task records for OpenList task groups, including move, copy, upload, offline download, aria2/qbit transfer, decompress, and decompress upload. Current virtual FS copy/move and unsupported offline/archive operations write task records.

The default FS implementation is a virtual tree stored in SiYuan kernel plugin storage under `siyuan-cloud/state.json`. It is useful for route compatibility and UI/client integration tests.

`/@workspace` is the first real SiYuan adapter. It maps OpenList paths to SiYuan workspace-relative paths and calls official kernel APIs through `siyuan.client.fetch`:

- `/api/file/readDir` for OpenList list/dirs/search.
- `/api/file/getFile` for OpenList download/proxy.
- `/api/file/removeFile` for OpenList remove.
- `/api/file/renameFile` for OpenList rename.

Workspace upload is intentionally left disabled until multipart form support is handled correctly for `/api/file/putFile`.

Workspace batch rename and regex rename use `/api/file/renameFile`. Workspace recursive move is intentionally returned as not implemented until workspace upload/move behavior is proven.

## Dock Panel

The frontend registers one dock with `plugin.addDock`, type `openlist`, displayed as `siyuan-cloud` internally by SiYuan. The dock is now the Siyuan Cloud management surface: account login/current user/logout, storage mount management, config import/export, task checks, user/share/meta placeholders, and about/API actions.

The main file manager is registered as a SiYuan custom tab through `plugin.addTab({ type: "file-manager" })` and opened with `openTab({ custom: { id: plugin.name + "file-manager" } })`. This matches SiYuan's custom tab model in `app/src/plugin/index.ts` and keeps the file browser in the editor tab area instead of squeezing it into the dock.

Dock source:

- `src/App.vue`: registers top bar, custom file-manager tab, and dock lifecycle.
- `src/components/Dock.vue`: renders the Siyuan Cloud management panel template with OpenList-compatible icon navigation, account login, mount management with dynamic driver names, concrete driver parameter forms, addition JSON import/edit, config import/export, lightweight task checks, storage/sync facts, and API/about actions. Compatible API calls and state are centralized in `src/utils/dock.ts`; shared UI styling lives in `src/index.scss`; semantic icon names are centralized in `src/utils/icon.ts` and map to SiYuan's existing Material-style symbols.
- `src/components/FileTab.vue`: renders the Siyuan Cloud file manager tab with path navigation, upload, download, create folder/file, rename, copy, move, delete, media/image open, markdown link copy, and on-demand text preview dialogs. Its file-operation calls go through OpenList-style `fs*` helpers in `src/utils/api.ts` and response handling in `src/utils/handle_resp.ts`.

The verification tab is the main manual acceptance surface for now. It can call login, create/list storage mounts, run FS read/write checks, run WebDAV read/write checks, run S3 read/write checks, and read the task list from inside SiYuan. Keep this tab updated whenever a new capability batch becomes user-verifiable.

The mount panel is the manual driver-field acceptance surface. Select a runtime-backed driver, fill the generated fields, click "Update JSON" if you want to inspect the OpenList-compatible addition payload, then create the mount. Use config export/import to move a whole test setup between devices or conversations. Metadata-only drivers such as 115 Cloud remain available through `/api/admin/driver/list` for field reference but are hidden from `/api/admin/driver/names` until their runtime adapter is ported.

Driver form labels and help text are localized in the Dock through `driverField.*` and `driverFieldHelp.*` i18n keys. The visible label can be translated, but the original OpenList addition key is preserved as the input binding and title text so configs remain compatible with upstream field names.

The Dock mount form now follows the OpenList-style storage management flow. Add first tries `/api/admin/driver/test`; drivers with a test method, such as `123Pan`, can validate credentials and return an updated addition JSON before storage creation. Existing storages in the mount list can be loaded back into the same form for `/api/admin/storage/update`, enabled/disabled, or deleted by id, matching OpenList's create/update/enable/disable/delete split. Export and import operate on the current driver's addition JSON only, separate from full config export/import.

The file manager tab keeps OpenList's playback/link boundary: `/api/fs/get` resolves object data and `raw_url`; `/d/<path>?sign=...` is the OpenList-style download route; `/p/<path>` is the proxy route when storage `web_proxy`, driver `prefer_proxy`, driver `only_proxy`, or `no_link_url` is active. External tools should use `/plugin/private/siyuan-cloud` as an OpenList-compatible base URL and call the HTTP routes directly, for example `POST /plugin/private/siyuan-cloud/api/fs/get`. `/api/public/api` and `/api/public/routes` return the current machine-readable route index, including `/api/*`, `/d`, `/p`, `/dav`, and `/s3` entry points. The built-in fallback opens images with SiYuan Viewer; audio/video playback is left to companion plugins or URL Scheme entries, which should treat `/plugin/private/siyuan-cloud/p` and `/d` URLs as final playback URLs and must not re-resolve them through their own cloud-drive drivers. `123Pan`, `BaiduNetdisk`, `WebDav`, and `Local` default to proxied raw URLs where OpenList metadata says they should; `OneDrive` and `S3` can expose direct link URLs unless storage-level proxying is enabled.

For companion plugin integration, FileTab now reuses the same shape as document links: media and ebook filenames expose the OpenList-compatible `/p/<path>` URL as DOM `data-href`. Siyuan Media Player and SiReader already intercept playable/readable document links, so no `window.siyuanMediaPlayer`, `window.sireader`, custom event bridge, or `siyuan://plugins/<plugin>/...` hop is needed inside FileTab's own DOM click flow. Other companion plugins can reuse the same plain HTTP link metadata or call the OpenList-compatible HTTP surface directly.

OpenList `common.Proxy` is a generic streaming boundary: `fs.Link` returns a URL plus required headers, `common.Proxy` merges browser request headers with link headers, asks upstream, copies normal response headers/status, and streams the body. This port mirrors that shape in JavaScript with `src/kernel/internal/model/args.js` and `src/kernel/server/common/proxy.js`: `/d` and `/p` call driver `read`/`Link`, normalize `model.Link`-style data, merge incoming player headers such as `Range` and `If-Range` with driver headers such as `Referer` or `User-Agent`, filter hop-by-hop headers and browser-origin `Cookie`, and hand the final request to SiYuan `body.proxy`. Driver-provided `Cookie` headers are still allowed for cookie-based storage adapters. Do not add per-driver playback proxy patches unless OpenList has the same behavior.

`body.proxy` is the only streaming path for cloud driver playback. `forwardProxy` remains useful for JSON API calls, link resolution, login/token refresh, HEAD probes, and small metadata fetches, but it should not be used to pull full media bodies for playback. When a driver can produce a `model.Link`, prefer returning that link and let `/d` or `/p` stream it through the kernel proxy.

Driver `read()` implementations should now return one internal shape only: `{ link: { url, header, method, content_length } }` for streamable remote files, or `{ body, bodyEncoding, headers, contentType }` for small buffered fallbacks. Do not reintroduce local compatibility aliases such as `proxy_url`, `proxy_headers`, `proxy_method`, `Link`, or `URL`; keep OpenList compatibility at the HTTP/API boundary, not inside the runtime adapter contract.

Driver addition persistence follows OpenList's `internal/op/storage.go` boundary: `MustSaveDriverStorage` marshals `driver.GetAddition()` back to `storage.Addition`. The JS port mirrors this with a storage-scoped `saveDriverStorage` callback attached by `driverRuntime.resolve`. Migrated drivers call it where upstream calls `op.MustSaveDriverStorage`: OpenList/AListV3 login token saves, OneDrive/Baidu/AliyundriveOpen token refresh saves, 189CloudPC/189CloudTV session field saves, Quark cookie/addition updates, QuarkOpen token refresh saves, and QuarkTV/UCTV device/query/refresh token saves. QuarkTV/UCTV access tokens mirror OpenList's `QuarkUCTVCommon.AccessToken` runtime field and are not persisted as addition JSON.

## 2026-05-30 189Cloud PC/TV Method-Boundary Port

- Added runtime-backed `189CloudPC` and `189CloudTV` entries to `/api/admin/driver/names`, `/api/admin/driver/info`, and `/siyuan-cloud/status.adapters`.
- The first port follows OpenList `drivers/189pc` and `drivers/189_tv` method names and request flow where the SiYuan JS runtime can carry it: signed `List`, `Link`, `MakeDir`, `Move`, `Copy`, `Remove`, and `Rename` calls, with `Link()` returning the shared `model.Link -> common.Proxy -> body.proxy` shape.
- Full PC password/QR login, RSA/verification/OCR, AES-ECB encrypted `params`, TV QR polling, upload/family-transfer/rapid/CAS/torrent paths are not silently replaced; they remain explicit compatibility placeholders for the next migration batch.
- The 189 session helper is no longer kept as a root-level shared file. The current structure keeps duplicated method-boundary session code in `src/kernel/internal/driver/189pc/session.js` and `src/kernel/internal/driver/189_tv/session.js`, so future work can continue by comparing each directory directly with its matching OpenList source folder.
- AliyundriveOpen now keeps short-lived list/file/link caches so repeated `/p` playback Range requests do not re-walk the same path and re-request the same download URL on every player probe. This is the current local difference most likely to explain slow Aliyun playback versus OpenList's cached `op.Link` flow.

## 2026-05-30 Quark Family Runtime

- `src/kernel/internal/driver/quark_uc/driver.js` now matches OpenList `drivers/quark_uc` for both `Quark` and `UC`; `/api/fs/list` is normalized at the FS handler boundary to OpenList `ObjResp`, so list items do not expose a `path` field. This mirrors OpenList `server/handles/fsread.go`: child navigation is derived from the current request path plus `ObjResp.name`, not from driver private `GetPath()`.
- Added `src/kernel/internal/driver/quark_open/driver.js` from OpenList `drivers/quark_open`: signed `x-pan-*` requests, online API token refresh, `List`, `Link`, `MakeDir`, `Move`, `Rename`, and `Remove` are wired; upload proof/multipart/OSS completion remains a structured placeholder.
- Added `src/kernel/internal/driver/quark_uc_tv/driver.js` from OpenList `drivers/quark_uc_tv`: `QuarkTV` and `UCTV` expose device/query token persistence, refresh-token login, `List`, and `Link`. Management and upload methods intentionally return explicit not-implemented errors because OpenList does the same for this driver.
- Quark/UC, QuarkOpen, and QuarkTV/UCTV now use the shared storage-scoped list/file/link cache, matching OpenList `op.List/Get/Link` cache behavior. Repeated `/p` Range requests for the same media file reuse the already resolved object and direct link instead of repeatedly calling Quark list/download APIs.
- Ordinary `Quark` proxy defaults match OpenList `QuarkOrUC.Init`: new or updated mounts default to `web_proxy=true` only when `use_transcoding_address` is false and no explicit proxy setting was supplied; `UC` and `QuarkOpen` still keep upstream `OnlyProxy`.
- Dock driver forms bias new mounts toward faster playback defaults: BaiduNetdisk `download_api` defaults to `crack_video`, ordinary `Quark` defaults `use_transcoding_address=true`, and QuarkTV/UCTV default `link_method=streaming`. Existing storage additions are not migrated automatically.
- Smoke coverage now mounts `Quark`, `QuarkOpen`, and `QuarkTV`, checks that list responses keep OpenList `ObjResp` shape without driver `path`, verifies `/api/fs/link` returns the driver `model.Link` URL while proxied raw URLs remain on `/p/<path>` where driver config says `PreferProxy`/`OnlyProxy`, asserts repeated `/p` Range reads do not increase Quark list/link request counters, covers Quark transcoding raw URL defaults, and covers the QuarkTV QR login `need verify -> query_token -> refresh_token` flow.

The long-form migration plan is kept in `docs/siyuan-cloud-migration-plan.md`.

## 2026-05-30 Torrent Placeholder And FS Manage Alignment

- Added OpenList-compatible torrent route placeholders from current `docs/OpenList-main/server/handles/torrent.go`: `/api/fs/torrent/parse`, `/api/fs/torrent/upload_parse`, `/api/fs/torrent/rapid_upload`, and `/api/fs/torrent/generate`. They return structured `501` compatibility data with upstream source and next-step notes until a JavaScript bencode/torrent reader and 189/189PC CAS rapid-upload flow are ported.
- `/api/public/api` now advertises `openlist.fs.torrent.placeholder`, and `/siyuan-cloud/status.stages` exposes an active `torrent` stage for the Dock progress panel.
- Virtual FS copy/move conflict handling is aligned with the latest OpenList `server/handles/fsmanage.go` behavior: when `skip_existing` is enabled, existing targets are skipped and later names continue to process instead of aborting the whole batch. Copy `merge` continues only for existing directory targets.
- Smoke coverage now asserts the four torrent placeholders, the public capability flag, the Dock torrent stage, and copy/move `skip_existing` continuation behavior.

## 2026-05-30 SiYuan Status Alignment

- The Dock status card now uses the private HTTP status route directly through `src/utils/status.ts`, keeping OpenList-compatible HTTP as the primary integration surface and avoiding user-visible noise from SiYuan's `/ws/plugin/rpc` notification channel when that WebSocket handshake fails.
- `src/kernel/server/handles/status.js` still exports `createStatusPayload`, so the HTTP status route and `siyuan-cloud.status` RPC return the same complete payload: counters, adapters, storage sync facts, routes, and migration stages.
- Dock status refreshes use the shared `fetchKernelStatus` helper, avoiding duplicated status parsing while keeping the OpenList-compatible HTTP surface unchanged.
- Smoke tests now capture the registered kernel RPC handler and assert that `siyuan-cloud.status` exposes the same torrent route/stage coverage as the HTTP status route.

## Smoke Test

`pnpm test:kernel` runs `scripts/kernel-route-smoke.mjs`. It mocks the SiYuan kernel plugin globals, loads `src/kernel/index.js`, runs `onload`, and verifies representative OpenList-compatible routes including status HTTP/RPC parity, FS list/put/mkdir/copy/move skip handling, Quark directory names with trailing spaces and repeated `/p` Range cache reuse, task records, meta CRUD, messages, index/scan progress, WebDAV PROPFIND/PUT/MOVE/LOCK, S3 bucket/object list/get/put/delete/copy/multi-delete/prefix-delimiter/multipart list and abort flows, SSH keys, 2FA generation, archive/torrent structured placeholders, and `/d`/`/p` streaming proxy request construction with Range/header forwarding.

## 2026-05-26 Streaming Proxy Batch

- SiYuan PR #17748 adds kernel plugin `body.proxy` responses. The kernel side accepts `ResponseProxy{url, method, headers}`, permits only `http`/`https` and `GET`/`HEAD`, filters hop-by-hop headers, disables automatic compression, follows up to 10 download redirects while preserving proxy headers such as `Range` and `User-Agent`, uses `util.SSRFSafeDialer`, forwards final upstream status and safe response headers, drops upstream `Set-Cookie`, and streams the body instead of buffering it.
- `src/kernel/server/common/proxy.js` is the plugin-side mirror of OpenList `server/common/proxy.go`: it merges incoming browser/player request headers with driver `model.Link` headers, deduplicates header names case-insensitively, filters hop-by-hop headers and browser-origin `Cookie`, and returns `body.proxy`.
- SiYuan `/api/network/forwardProxy` now accepts `redirect: false` so drivers can do OpenList-style no-redirect link probes. BaiduNetdisk official downloads use this to `HEAD` the first `d.pcs.baidu.com` dlink, read its `Location`, and pass the final `appall*.baidupcs.com` URL to `body.proxy` instead of surfacing a 302 to the browser.
- `/d` and `/p` are now the shared playback/download surface for runtime drivers. Drivers should return `model.Link`-style data from `read()` rather than downloading media through `/api/network/forwardProxy`.
- `/api/fs/get.raw_url` and `/api/fs/link.raw_url` now follow OpenList proxy selection: proxy-required storages return `/plugin/private/siyuan-cloud/p/<path>`, while non-proxied storages can return the driver link URL.

Frontend UI settings should use the regular SiYuan plugin API `plugin.loadData/saveData`. The kernel runtime cannot access the frontend `Plugin` instance; it uses the kernel plugin API `siyuan.storage.get/put/list/remove`, which is scoped to the kernel plugin storage directory. Keep these two layers separate:

- Frontend/Dock preferences: `plugin.loadData/saveData`.
- Kernel OpenList runtime state, virtual FS tree, shares, users: `siyuan.storage`.

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
