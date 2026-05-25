# SiYuan Kernel Plugin Notes

## Local Reference Trees

- `docs/siyuan-master`
  - Upstream: `https://github.com/siyuan-note/siyuan.git`
  - Branch: `dev`
  - Current local commit: `c6662f2`
- `docs/OpenList-main`
  - Upstream: `https://github.com/OpenListTeam/OpenList.git`
  - Branch: `main`
  - Current local commit: `7cfb255`

## Why SiYuan `dev`

Kernel plugin support was introduced by SiYuan PR #17487, merged into `dev`. The visible app version in local dev builds may not be bumped yet, so this plugin keeps `minAppVersion` loose and relies on feature availability.

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
- Public settings: `/api/public/settings`, `/api/public/offline_download_tools`, `/api/public/archive_extensions`.
- FS read/manage: `/api/fs/list`, `/api/fs/get`, `/api/fs/dirs`, `/api/fs/search`, `/api/fs/mkdir`, `/api/fs/rename`, `/api/fs/batch_rename`, `/api/fs/regex_rename`, `/api/fs/move`, `/api/fs/recursive_move`, `/api/fs/copy`, `/api/fs/remove`, `/api/fs/remove_empty_directory`, `/api/fs/link`, `/api/fs/put`, `/api/fs/form`, `/api/fs/get_direct_upload_info`, plus archive compatibility placeholders `/api/fs/archive/meta`, `/api/fs/archive/list`, `/api/fs/archive/decompress`.
- Offline/protocol placeholders: `/api/fs/add_offline_download` and archive download paths `/ad/*`, `/ap/*`, `/ae/*` return explicit not-implemented responses instead of falling through to 404.
- WebDAV surface: `/dav` supports `OPTIONS`, `PROPFIND`, `GET`, `HEAD`, `MKCOL`, `PUT`, `DELETE`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`, and `PROPPATCH` over the virtual FS. `@workspace` remains read-only until SiYuan upload/move behavior is proven.
- S3 surface: `/s3` exposes a default `siyuan-cloud` bucket mapped to the virtual FS. It supports bucket listing, object listing, prefix/delimiter grouping, `GET`, `HEAD`, `PUT`, `DELETE`, copy via `x-amz-copy-source`, multi-delete via `POST ?delete`, and a lightweight multipart init/upload-part/list-parts/list-uploads/abort/complete path; signature validation and full multipart compatibility still need work.
- Auth compatibility placeholders: SSO and WebAuthn routes are registered so OpenList-compatible clients can detect unsupported features cleanly.
- Admin compatibility: setting list/get/save/default/delete/reset token, offline download tool setting routes (`set_aria2`, `set_qbit`, `set_transmission`, `set_115`, `set_115_open`, `set_123_pan`, `set_123_open`, `set_pikpak`, `set_thunder`, `set_thunderx`, `set_thunder_browser`), config export/import (`/api/admin/config/export`, `/api/admin/config/import`), storage list/get/create/update/delete/enable/disable/load all, driver list/names/info, user list/get/update, meta CRUD, message get/send, index progress, and scan progress. Storage create is idempotent by mount path so the Dock verification tab can be rerun without duplicating mounts.
- Driver runtime: storage mounts now resolve by longest `mount_path` before falling back to the virtual FS. `OpenList`, `AListV3`/`AList V3`, `WebDav`, `S3`/`Doge`, `Onedrive`/`OneDrive`, `123Pan`/`123`, and `BaiduNetdisk` have initial runtime adapters using SiYuan `/api/network/forwardProxy`; the remaining OpenList driver names are exposed as metadata-only mounts so the UI can create and persist their settings while behavior is ported. Common driver fields copied from OpenList `meta.go` now include Baidu, AliyunDrive/Open/Share, 123Pan/Open, 115 Cloud/Open, OneDrive/App, GoogleDrive/Photo, and 189Cloud variants. The OneDrive adapter ports the OpenList Graph token refresh, path URL mapping, list/get/link/read, mkdir/remove/rename, and small-file put control flow into `src/kernel/internal/driver/onedrive.js`. The 123Pan adapter ports OpenList's signed API URL generation, bearer-token login retry, paged list, download-info link resolution, final redirect URL resolution, mkdir/trash/rename flow into `src/kernel/internal/driver/123/driver.js`; upload remains a structured next step because OpenList's S3 multipart complete path still needs migration. The BaiduNetdisk adapter ports OpenList token refresh, paged list, official/crack/crack_video link branches, mkdir/delete/rename flow into `src/kernel/internal/driver/baidu_netdisk.js`; it keeps short-lived list, resolved-file, and `Link()` caches so repeated `/p` Range requests for the same media file reuse the OpenList object/link resolution instead of walking deep paths again. Baidu `download_api=crack_video` is aligned with OpenList `linkCrackVideo`: it requests `https://pan.baidu.com/api/mediainfo` with `type=VideoURL`, `nom3u8=1`, `dlink=1`, `media=1`, and `origin=dlna`, then returns the resulting `model.Link` through the generic `internal/model.Link -> server/common/proxy.js -> body.proxy` streaming path. Upload and multipart details remain pending.
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
- `src/components/MigrationPanel.vue`: keeps the old migration progress, plan table, and route diagnostics isolated from the dock so the development-only UI can be removed later in one step.
- `src/components/FileTab.vue`: renders the Siyuan Cloud file manager tab with path navigation, create folder/file, delete, and text preview.

The verification tab is the main manual acceptance surface for now. It can call login, create/list storage mounts, run FS read/write checks, run WebDAV read/write checks, run S3 read/write checks, and read the task list from inside SiYuan. Keep this tab updated whenever a new capability batch becomes user-verifiable.

The mount panel is the manual driver-field acceptance surface. Select a driver, fill the generated fields, click "Update JSON" if you want to inspect the OpenList-compatible addition payload, then create the mount. Use config export/import to move a whole test setup between devices or conversations.

Driver form labels and help text are localized in the Dock through `driverField.*` and `driverFieldHelp.*` i18n keys. The visible label can be translated, but the original OpenList addition key is preserved as the input binding and title text so configs remain compatible with upstream field names.

The Dock mount form now follows the OpenList-style storage management flow. Add first tries `/api/admin/driver/test`; drivers with a test method, such as `123Pan`, can validate credentials and return an updated addition JSON before storage creation. Existing storages in the mount list can be loaded back into the same form for `/api/admin/storage/update`, enabled/disabled, or deleted by id, matching OpenList's create/update/enable/disable/delete split. Export and import operate on the current driver's addition JSON only, separate from full config export/import.

The file manager tab follows OpenList's playback flow at the API boundary: for media files it calls `/api/fs/get`, uses `raw_url` when present, otherwise falls back to the OpenList `/d/<path>?sign=...` download route, and hands that URL to `window.siyuanMediaPlayer.playMediaItem`. The OpenList rule is generic: if storage `web_proxy` or driver `only_proxy` is active, `raw_url` is `/p/<path>`; otherwise it is the object URL or `Link()` URL. `123Pan` mirrors OpenList's non-proxy link flow by requesting `download_info`, decoding the `params` URL when present, then resolving `data.redirect_url` from the `auto_redirect=0` response before exposing `raw_url`. `BaiduNetdisk` has `PreferProxy: true`, so new or imported mounts default to `web_proxy` and `/api/fs/get.raw_url` is `/p/<path>` rather than a direct CDN URL. Direct Baidu `Link()` is still implemented for `/d`/`/p`: `filemetas`, `dlink + access_token`, `User-Agent: pan.baidu.com`, and the HEAD `Location` attempt. Do not pass `/api/network/proxy` to the player; SiYuan's network proxy prefixes response headers and is not suitable as a media URL. Companion players such as SiYuan Media Player must treat `/plugin/private/siyuan-cloud/p` and `/d` URLs as final playback URLs and must not re-resolve them through their own cloud-drive drivers. `OneDrive` resolves `raw_url` to the Graph download URL during `/api/fs/get`. Image files use SiYuan's native Viewer.js preview path with same-directory image queueing.

OpenList `common.Proxy` is a generic streaming boundary: `fs.Link` returns a URL plus required headers, `common.Proxy` merges browser request headers with link headers, asks upstream, copies normal response headers/status, and streams the body. This port mirrors that shape in JavaScript with `src/kernel/internal/model/args.js` and `src/kernel/server/common/proxy.js`: `/d` and `/p` call driver `read`/`Link`, normalize `model.Link`-style data, and hand the final URL plus merged headers to SiYuan `body.proxy`. Do not add per-driver playback proxy patches unless OpenList has the same behavior.

Driver addition persistence follows OpenList's `internal/op/storage.go` boundary: `MustSaveDriverStorage` marshals `driver.GetAddition()` back to `storage.Addition`. The JS port mirrors this with a storage-scoped `saveDriverStorage` callback attached by `driverRuntime.resolve`. Migrated drivers call it where upstream calls `op.MustSaveDriverStorage`: OpenList/AListV3 login token saves and OneDrive/Baidu token refresh saves.

The long-form migration plan is kept in `docs/siyuan-cloud-migration-plan.md`.

## Smoke Test

`pnpm test:kernel` runs `scripts/kernel-route-smoke.mjs`. It mocks the SiYuan kernel plugin globals, loads `src/kernel/index.js`, runs `onload`, and verifies representative OpenList-compatible routes including status, FS list/put/mkdir, task records, meta CRUD, messages, index/scan progress, WebDAV PROPFIND/PUT/MOVE/LOCK, S3 bucket/object list/get/put/delete/copy/multi-delete/prefix-delimiter/multipart list and abort flows, SSH keys, 2FA generation, and archive structured placeholders.

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

