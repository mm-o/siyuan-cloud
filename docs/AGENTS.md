# AGENTS.md

## Purpose

This is a standalone SiYuan plugin named `siyuan-cloud`, with the user-facing product name Siyuan Cloud / 思盘. It is based on `siyuan-note/plugin-sample-vite-vue`.

It is separate from `siyuan-sireader`.

## Goal

Port OpenList-compatible behavior into SiYuan's kernel plugin system.

Do not import or launch the OpenList Go backend. Recreate compatible APIs and behavior in JavaScript using the SiYuan kernel plugin runtime.

The porting preference is:

1. Keep the directory and module names aligned with OpenList wherever practical.
2. Copy OpenList request/response structs, route names, status messages, field names, and control flow as directly as the JavaScript kernel runtime allows.
3. Only rewrite behavior when Go-only dependencies, external processes, databases, or unsupported kernel APIs make a direct port impossible.
4. When a direct port is blocked, create a structured compatibility placeholder instead of silently changing behavior.
5. Update `docs/siyuan-cloud-migration-plan.md`, `docs/kernel-architecture.md`, `docs/kernel-plugin-notes.md`, and the Dock progress after each completed capability batch.

This is important for conversation continuity: future agents should be able to compare a module under `src/kernel/**` with the matching OpenList source file and continue migration by copying/adapting nearby code instead of inventing a new design.

## Entry Points

- Front-end lifecycle: `src/index.ts`
- Vue management panel: `src/App.vue`
- Dock account/mount/settings panel: `src/components/Dock.vue`
- Main file manager custom tab: `src/components/FileTab.vue`
- Kernel source entry: `src/kernel/index.js`
- Generated kernel bundle: `dist/kernel.js` for release, or the configured dev plugin directory during `pnpm dev`
- Manifest: `plugin.json`
- Build config: `vite.config.ts`

Do not keep or hand-edit a generated root `kernel.js`; edit `src/kernel/**`, then run `pnpm dev` or `pnpm build`. The build writes `kernel.js` directly into the target plugin output directory.

## Reference Source Locations

- SiYuan dev source: `docs/siyuan-master`
- OpenList latest local source: `docs/OpenList-main`
- OpenList router reference: `docs/OpenList-main/server/router.go`
- OpenList common response reference: `docs/OpenList-main/server/common/common.go`
- OpenList handlers: `docs/OpenList-main/server/handles`
- OpenList internal FS/op/archive/task references: `docs/OpenList-main/internal/fs`, `docs/OpenList-main/internal/op`, `docs/OpenList-main/internal/archive`
- SiYuan kernel plugin references: `docs/siyuan-master/kernel/plugin`
- SiYuan file API references: `docs/siyuan-master/kernel/api/file.go`

## Current Architecture Mapping

- `src/kernel/server/common` mirrors OpenList `server/common`.
- `src/kernel/server/handles` mirrors OpenList `server/handles`.
- `src/kernel/server/router.js` mirrors OpenList `server/router.go`.
- `src/kernel/server/webdav.js` mirrors OpenList `server/webdav.go` and `server/webdav/*`.
- `src/kernel/server/s3.js` mirrors OpenList `server/s3.go` and `server/s3/*`.
- `src/kernel/internal/conf` mirrors OpenList `internal/conf`.
- `src/kernel/internal/model` mirrors OpenList `internal/model` where useful.
- `src/kernel/internal/fs` mirrors OpenList `internal/fs`.
- `src/kernel/internal/driver` mirrors OpenList `internal/driver` and `drivers/*`; runtime adapters should keep copying OpenList addition fields and behavior as directly as possible.
- `src/kernel/internal/bootstrap/data` mirrors OpenList `internal/bootstrap/data`.
- Frontend management helpers use the current short names: `src/utils/dock.ts` for Dock API flow and `src/utils/icon.ts` for file icon mapping.

## Runtime

Requires a SiYuan build with kernel plugin support from PR #17487. Do not rely on the visible version number; some dev builds contain the feature before the version is bumped.

Private routes are under:

```text
/plugin/private/siyuan-cloud/*
```

Current RPC:

```text
siyuan-cloud.status
```

Frontend split:

- Top bar opens the Siyuan Cloud file manager as a SiYuan custom tab.
- Dock is for account login, user management, mount management, settings/progress/verification.
- The Siyuan Cloud kernel plugin exposes OpenList-compatible HTTP APIs under `/plugin/private/siyuan-cloud`. Companion tools and plugins should call the HTTP surface directly, for example `/plugin/private/siyuan-cloud/api/fs/get`, `/api/fs/list`, `/d`, `/p`, `/dav`, and `/s3`, just as they would call a normal OpenList server with a different base URL. `/api/public/api` returns a machine-readable API index. The frontend file manager must not hardcode `window.siyuanMediaPlayer` or other player-specific integrations. Image files use SiYuan's native Viewer.js image preview path.
- Use SiYuan native `b3-*` classes and `var(--b3-*)` theme variables for plugin UI before adding custom visual styling.
- Dock mount input labels are localized with `driverField.*` and `driverFieldHelp.*`; keep the actual addition JSON keys unchanged so imported OpenList configs remain compatible. The mount form keeps OpenList-style storage management actions for every driver: add, update by existing storage id, enable/disable, delete, export addition JSON, and import addition JSON, with `/api/admin/driver/test` used before add/update when a runtime adapter exposes validation.
- Dock user management uses the same compact `ol-mount-row` / `ol-mount-form` shape as mounts and calls OpenList-compatible `/api/admin/user/*` routes. The default admin user is synchronized from the current SiYuan account nickname/name via `/api/system/getConf`; disabled guest is retained for OpenList compatibility. User CRUD fields are normalized in `src/kernel/internal/model/user.js`. Do not assume permissions are fully enforced yet; wire future FS/task/share/protocol permission batches against OpenList `model.User` and `server/common/check.go`.

Driver status:

- Storage mounts now dispatch by longest `mount_path`.
- `OpenList`, `AListV3`/`AList V3`, `WebDav`, `S3`/`Doge`, `115 Cloud`, `Onedrive`/`OneDrive`, `123Pan`/`123`, and `BaiduNetdisk` have first runtime adapters through SiYuan `/api/network/forwardProxy`; Baidu proxy fallback is served by the plugin's own `/d`/`/p` routes so standard media headers are preserved.
- Other OpenList driver names are exposed as metadata/config-only placeholders in `src/kernel/internal/driver/info.js`; continue porting real behavior from `docs/OpenList-main/drivers/*`.
- Common driver fields have been copied first for mount testing: `115 Cloud`, `115 Open`, `123Pan`, `123 Open`, `189Cloud`, `Aliyundrive`, `AliyundriveOpen`, `AliyundriveShare`, `BaiduNetdisk`, `Onedrive`, `OnedriveAPP`, `GoogleDrive`, and `GooglePhoto`. `115 Cloud` now has initial cookie/QR-token login, list/get/read/link, mkdir/move/copy/remove/rename, storage details, `LimitRate -> WaitLimit`, and `m115` download URL codec copied/adapted from `docs/OpenList-main/drivers/115/*` plus OpenList's `github.com/SheltonZhu/115driver` dependency; Dock keeps OpenList's `cookie`/`qrcode_token` conditional-login schema while showing those 115 fields in the primary form with i18n help/options. 115 upload/offline download remain explicit placeholders because upstream depends on ECDH rapid-upload and OSS multipart behavior. `Onedrive` now has initial list/get/read/mkdir/remove/rename/small-put behavior copied from `docs/OpenList-main/drivers/onedrive/*`; `123Pan` has initial signed request/login/list/get/read/mkdir/remove/rename behavior copied from `docs/OpenList-main/drivers/123/*`, including final redirect URL resolution for playback. Playback rule: `/api/fs/get.raw_url` follows OpenList's generic format: proxied storages return `/p/<path>`, non-proxied storages return object or `Link()` URLs, and companion player plugins consume this through the OpenList-compatible HTTP API. `BaiduNetdisk` has initial list/get/read/mkdir/remove/rename behavior copied from `docs/OpenList-main/drivers/baidu_netdisk/*`; its driver config keeps OpenList `PreferProxy: true`, so mounts default to `web_proxy` and `/api/fs/get.raw_url` becomes `/p/<path>`. Baidu `Link()` mirrors official `filemetas`/`dlink`/`access_token`, `crack` `api/filemetas`, and `crack_video` `api/mediainfo type=VideoURL` branches from OpenList, with short-lived list/resolved-file/link caches to avoid repeating deep path and dlink resolution for every player Range request. `/d`/`/p` route driver read results through `internal/model.Link`-style data and `server/common/proxy.js`, matching OpenList's `fs.Link -> common.Proxy` boundary before handing streamable URLs to SiYuan `body.proxy`. Upload is still pending. Reference files are under `docs/OpenList-main/drivers/*/meta.go`.
- Streaming note: OpenList `common.Proxy` is true Go streaming. With the local SiYuan kernel `body.proxy` response type, `/d`/`/p` use the OpenList-like transparent proxy path and forward the player Range header through the generic common proxy layer. Do not restore custom bounded Range playback patches or per-driver media proxy hacks; keep normal playback on the `fs.Link -> common.Proxy -> body.proxy` path.
- Driver-save note: migrated drivers that update addition fields must persist through the runtime `saveDriverStorage` callback, mirroring OpenList `internal/op/storage.go` `MustSaveDriverStorage -> saveDriverStorage` (`driver.GetAddition()` marshaled back to `storage.Addition`). This currently covers OpenList/AListV3 login token saves and OneDrive/Baidu token refresh saves; do not add one-off per-driver persistence paths.
- Keep the long-term rule explicit: align the architecture with OpenList and copy/adapt OpenList source as directly as the SiYuan kernel JS runtime allows, instead of redesigning behavior from scratch.

## Current Kernel API Surface

See `docs/kernel-plugin-notes.md` for the current route surface. The Dock route tab reads `/siyuan-cloud/status`, so keep that status payload current.

Kernel data is stored with `siyuan.storage` in split files under `/storage/petal/siyuan-cloud`: syncable config in `config.json`, runtime state in `runtime.json`, and search nodes in `search-index.json`. Old installs may still have `siyuan-cloud/state.json`; load must migrate it into the split files instead of creating another nested directory.

Config import/export routes:

- `GET /api/admin/config/export`
- `POST /api/admin/config/import`

These routes export/import settings, users, storages, metas, and shares for quick mount testing.

## Porting Order

1. Maintain OpenList-compatible routing and response shapes.
2. Keep splitting `src/kernel/index.js` into OpenList-like modules.
3. Fill virtual FS behavior first because it is deterministic and portable.
4. Add SiYuan-backed adapters only after matching the official SiYuan API format.
5. Use structured placeholders for archive, offline download, S3, WebDAV lock, and other blocked behavior.
6. Add smoke tests after each route family stabilizes.
7. Update plan/docs/Dock progress before finishing a turn.
