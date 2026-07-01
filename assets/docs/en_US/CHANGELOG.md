# CHANGELOG

## 0.3.8

### Added

- Added the `115 Open` and `115 Share` runtimes and their mount guides. 115 Open covers token refresh, browse/read/link, basic management, and storage details; 115 Share follows OpenList's read-only share mount boundary.
- Added the QR-code login entry for `115 Cloud` / `115 Share` mount forms: refresh a QR code, poll scan status, and exchange confirmed scans for `cookie` automatically.

### Fixed

- Fixed 115 Cloud playback/download link resolution by aligning the `downurl` request with OpenList's 115 driver: the encrypted `data` form field is now encoded with `encodeURIComponent` instead of `URLSearchParams`, avoiding `+` being interpreted as a space and causing "pickcode cannot be empty"; the same form encoding is used for 115 Share requests.
- Fixed OpenList/AList local and LAN mounting on SiYuan v3.7.0 by adding a desktop frontend direct path for private upstreams such as `127.0.0.1:5244` and `192.168.x.x:5244`, while keeping the standard backend OpenList-compatible driver path unchanged.
- Fixed OpenList/AList media preview for private direct mounts by lazily resolving the playable link with `/api/fs/get` when a file is opened, avoiding the old fallback to backend `/p` proxy URLs.
- Fixed media file clicks in FileTab and Dock tree so audio/video opens the media player or an inline preview instead of showing the download-only hint.
- Fixed copied file links so Siyuan Cloud file paths use readable `siyuan://plugins/siyuan-cloud/open?path=...` links and open back into Siyuan Cloud with the target row highlighted.
- Fixed OpenList/AList API base normalization by stripping `/admin` and `/@manage` from configured upstream URLs.
- Fixed OpenList/AList readable file handling by completing relative `raw_url` values and returning OpenList-style link data for `/d`, `/p`, archive, and download flows.
- Fixed packaged docs links so `[[...]]` references inside driver guides are converted to real SiYuan document references, not only inside README.

### Improved

- Added Chinese and English OpenList/AList local mounting and proxy guides under packaged driver docs.
- Documented the SiYuan v3.7.0 SSRF proxy boundary, frontend direct mode, and reverse-proxy/tunnel options such as Caddy and Cloudflare Tunnel.
- Expanded the S3-compatible storage guide with the absolute endpoint URL requirement, Qiniu region examples, and common formats for Bitiful S4, Tencent Cloud COS, Alibaba Cloud OSS, Huawei Cloud OBS, Volcengine TOS, UPYUN, R2, MinIO, B2, and DigitalOcean Spaces.
- Added the DogeCloud mount guide, documenting how OpenList `Doge` exchanges DogeCloud credentials for temporary S3 credentials and the current runtime boundary where Doge is still handled as generic S3.
- Fixed 115 QR-code source selection, status handling, and save flow: `qrcode_source` stays visible, is used by the OpenList-style final QR confirmation endpoint, numeric and string confirmation states are both recognized, and clicking Add during a QR session confirms the scan and writes `cookie` before saving instead of staying on "waiting" or failing with a SiYuan v3.7.0 parameter error.
- Unified frontend file-manager dispatch order for file operations: Local desktop path, OpenList/AList frontend direct path, then standard backend API.

## 0.3.7

### Fixed

- Hid the delete action for built-in `admin` and `guest` users in Dock user management.
- Changed share row actions to show Copy Link directly and move Edit Share into the More menu.
- Fixed Local image preview and copied links for Chinese filenames by applying the shared resource URL normalization path, and kept Chinese paths readable in copied cloud-drive/proxy links.
- Show a SiYuan message when opening Siyuan Cloud docs to remind users not to edit packaged docs directly.
- Added Chinese and English mount guides for runtime drivers exposed in the Dock, with README links to each guide.
- Added the SiYuan Workspace driver guide, including workspace root mounting, native public resource links, and stable copied-link behavior.
- Fixed the `assets/docs` packaging copy rule to avoid duplicated root, language, and category copies of driver guides in the release package.
- Fixed SiYuan Workspace media, image, and PDF previews by routing workspace `data/<name>/...` files to their native SiYuan public URLs instead of proxying them through plugin-private `/p` links.
- Fixed WebDAV image preview and folder navigation edge cases by aligning list/get with OpenList's PROPFIND flow, avoiding the previous first-image selection, undefined error handler, and duplicated self-directory response problems.

### Improved

- Replaced the Mounts page header Add action with a Help action that opens the packaged driver guide index; the bottom Add entry remains the mount creation path.
- Added the OpenList token helper link to the OpenList-compatible mount guide.
- Rewrote the Baidu Netdisk driver guide from the OpenList upstream documentation, including refresh-token setup, `download_api` choices, upload fields, and a step-by-step test checklist.
- Stopped exposing `SiYuanKernel` as an addable driver; the virtual FS remains an internal root capability, `SiYuanWorkspace` is the only addable SiYuan-native mount, and legacy `/` kernel mounts are cleaned from config.
- Unified stable copied links for SiYuan Workspace public files, so copied links use portable relative paths such as `/assets/...` rather than changing localhost origins.
- Reworked the WebDAV runtime around OpenList/gowebdav naming and behavior: `ReadDir` uses `PROPFIND Depth:1`, `Stat` uses `PROPFIND Depth:0`, href basenames are used for object names, and the driver no longer injects UI-only `raw_url` fields.
- Consolidated FileTab and Dock file UI behavior into shared `file_ui` and `file_actions` helpers, so image viewer, download, copy-link, share, delete, and right-click menu behavior are maintained in one place.

## 0.3.6

### Fixed

- Removed SiYuan superblock markers from packaged docs because the rendered layout was too noisy.
- Rebuilt `package.zip` so the release artifact contains the cleaned documentation.

## 0.3.5

> [!INFO]
> This release consolidates the OpenList-compatible runtime work, native documentation packaging, and the latest 123Pan web API compatibility fix.

### Added

- Added packaged native SiYuan docs under `assets/docs`, with a generated docs manifest and Dock entry points for opening README, changelog, API docs, and driver guides as normal SiYuan documents.
- Added the Baidu Netdisk driver guide, plus localized documentation trees for English and Chinese.
- Added structured public capability discovery through `/api/public/api`, `/api/public/routes`, `/siyuan-cloud/status`, capability summaries, capability matrices, and per-driver method status.
- Added the first real queued task foundation with persisted pending/running/succeeded/failed/canceled states, cancel requests, progress updates, and async index build/update support.
- Added OpenList-style password hashing, static hash login validation, legacy plaintext password migration, current-token logout invalidation, and sanitized user responses.
- Added broader smoke coverage for capability metadata, queued index tasks and stop behavior, password hash/login/logout flows, WebDAV/S3 permission boundaries, archive/torrent paths, and driver method matrices.

### Improved

- Refreshed marketplace README content and build scripts so packaged docs are generated before `dev` and `build`.
- Improved Dock docs/status/tools integration, mount form behavior, and native-doc opening flow.
- Improved task, index, share, archive, FS, WebDAV, S3, security, message, meta, scan, and public API handlers around permission boundaries and OpenList-compatible response shapes.
- Improved S3 compatibility with stricter SigV4 handling, bucket/object behavior, and redirect support.
- Updated internal project notes and roadmap documents to match the current runtime architecture and migration status.

### Fixed

- Fixed 123Pan login/list/test failures caused by the old `www.123pan.com/b/api` host returning `200 text/html`; the runtime now uses the current web API host `https://api.123278.com/b/api` while keeping the web origin/referer headers.
- Fixed Dock mount save notifications by replacing the undefined `pushVerify` call with the existing SiYuan `showMessage` path.
- Fixed stale generated package output by rebuilding `dist` and `package.zip` after the runtime and documentation changes.
- Prepared and submitted an upstream OpenList PR for the same 123Pan API host change: OpenListTeam/OpenList#2677.

## 0.3.4

> [!INFO]
> This release turns Siyuan Cloud from a file-manager shell into a broader SiYuan-native OpenList-compatible runtime.

## Reading Path

- Start with the area summary below.
- Use Added / Improved / Fixed for details.
- Return to [[Drivers]] for guide structure changes.
- Use [[API]] as the live route source.

## Keywords

- Permissions
- Sharing
- Search
- Archive
- Upload paths
- Native SiYuan docs

| Area | Main change |
| --- | --- |
| Accounts and permissions | User/session model, admin/user CRUD, permission checks |
| Sharing and search | Multi-file shares, public read checks, local persisted search index |
| Archive and torrent | ZIP/tar/tgz, torrent parse/generate, share archive paths |
| Drivers | 115 Cloud, 189Cloud, Local desktop storage, more upload paths |
| Docs | Native SiYuan docs, runtime API document, driver guide tree |

### Added

- Added OpenList-compatible user/session support: SiYuan account sync for the default admin, disabled guest baseline, JWT login/hash login, password timestamp invalidation, `/api/me`, admin/user CRUD, sanitized user responses, and Dock user management.
- Added permission checks across the main runtime surfaces: FS read/manage, search, archive, torrent generate/rapid-upload entry, share management/public reads, WebDAV, and S3.
- Added multi-file shares with custom IDs, password/expiry/access-limit checks, Readme/Header fields, enable/disable/delete flows, access counting, `/sd` downloads, and share archive metadata/extract routes.
- Added local search index APIs: build, update, stop, clear, progress, `/api/fs/search`, ignore-path handling, storage-level `disable_index`, and OpenList-style PageResp search results.
- Added torrent support for parse, upload_parse, single-file generate, optional 189 `x-cas` metadata, and rapid-upload driver-boundary validation.
- Added archive support for ZIP stored/deflate, tar, and tgz/tar.gz metadata/list/extract/decompress, including `/ae`, `/ad`, `/ap`, share `@s` archive paths, and `/sad` share archive extraction.
- Added mounted ZIP range reading and deterministic GBK filename decoding for remote archives such as Baidu Netdisk ZIP files.
- Added 115 Cloud runtime support for Cookie/QR-token login, paged list, get/read/link, basic mkdir/move/copy/remove/rename, storage details, rate limiting, and Dock form fields.
- Added more driver upload paths: 123Pan presigned/S3 upload, OneDrive small and large upload sessions, Baidu Netdisk multipart upload, AliyundriveOpen normal/rapid upload branch, Quark/UC multipart upload, QuarkOpen upload, S3 direct-upload presign, WebDAV PUT, and 189Cloud upload request/multipart foundations.
- Added 189Cloud account login with cookie persistence, SMS second verification, verify-only Dock flow, and safer browsing behavior when verification is required.
- Added Local desktop storage support through the frontend Electron runtime, including drive enumeration, scoped root folders, timeout guards, and cross-device move fallback.
- Added native SiYuan document opening for plugin docs. Packaged docs now live under `assets/docs`, and the API document is generated from the running `/api/public/api` index.

### Improved

- Aligned kernel source layout, route names, request fields, response envelopes, and handler boundaries more closely with OpenList backend and frontend references.
- Split persisted kernel data into `config.json`, `runtime.json`, and `search-index.json`, with legacy state migration and targeted config/runtime/search saves.
- Improved Dock mount editing, FileTab actions, shared context menus, archive browsing, current-tree search, Markdown/proxy link copying, and driver configuration forms.
- Improved `/api/public/api`, `/api/public/routes`, and `/siyuan-cloud/status` as lightweight machine-readable discovery surfaces for companion plugins and local automation.
- Improved streaming playback consistency by keeping media/download paths on `fs.Link -> /p or /d -> common proxy -> body.proxy`.
- Improved WebDAV and S3 compatibility with permission boundaries, bucket/path mapping, SigV4 signing when configured, and core object/list/multipart flows.
- Improved package docs: docs are opened as normal SiYuan documents, API docs are generated at runtime, and driver guides live under the `Drivers` parent document.

### Fixed

- Fixed share authorization gaps by rechecking creator status, creator base_path, and nearest meta rules during public list/get/download/archive access.
- Fixed task ownership leaks by recording task creator data and filtering task list/info/cancel/delete/retry/clear for non-admin users.
- Fixed ordinary FS permission gaps for base_path, nearest meta access, and write/copy/move/remove/rename/offline permission bits.
- Fixed WebDAV and S3 read/manage permission handling, including token shortcut behavior and configured S3 signature validation.
- Fixed archive permission checks for read/decompress, torrent base_path checks, and search result filtering by base_path/meta access.
- Fixed ZIP archive behavior for remote Baidu ZIP files by avoiding full-file pulls, supporting range reads, and decoding non-EFS Chinese filenames correctly.
- Fixed signed-link proxy requests by omitting body-related fields on no-body GET/HEAD forwardProxy calls.
- Fixed 189Cloud SMS verification loops and Dock mount edit/add timing around driver metadata refresh.
- Fixed Local storage mismatch by keeping host filesystem access in the desktop frontend instead of the kernel HTTP layer.
- Fixed API documentation bloat by removing static API Markdown templates and generating a minimal runtime API document directly from `/api/public/api`.

### Known Limitations

> [!WARNING]
> Siyuan Cloud remains a compatibility runtime inside SiYuan, not a public standalone OpenList server.

- This release is still an OpenList-compatible SiYuan kernel runtime subset, not a full OpenList server.
- Task records follow OpenList route shapes, but real async queues, cancellation propagation, retry scheduling, and progress reporting are still pending.
- Search uses a local persisted index and is not yet the full OpenList search backend matrix.

- RAR/7z/ISO archive readers remain placeholders until reader, license, packaging, and fixture coverage are settled.
- Archive-entry media playback through `/ae` is extraction-oriented and is not equivalent to normal seekable `/p` playback yet.
- Offline download tools and real 189/189PC CAS rapid-upload still need deeper driver/tool migration.
