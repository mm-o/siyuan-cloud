# CHANGELOG

## 0.5.4

### Fixed

- Fixed 123Pan connectivity on networks that cannot reach the current `yun.123pan.com` B API by falling back to `api.123278.com` with `www.123pan.com` web headers.
- Merged mm-o/siyuan-cloud#1 and kept its compatibility path as a fallback instead of replacing the default official 123Pan API host.

## 0.5.3

### Fixed

- Fixed 123Pan PDF/EPUB/book preview links by aligning proxied storage `raw_url` handling with OpenList: `PreferProxy`, `WebProxy`, and `OnlyProxy` mounts now expose stable `/p/<path>` links from `/api/fs/get`, while direct download links remain available through `/api/fs/link`.
- Fixed 123Pan file rows to use the stable `/p` proxy entry for previews, so companion reader plugins do not receive fragile upstream direct URLs.

## 0.5.2

### Added

- Added an image masonry view to the file manager, with list/image switching and compact filename plus size display.
- Added Ctrl/Shift multi-select and keyboard shortcuts such as Ctrl+A, Esc, Delete, and Enter in the file manager.
- Added batch download and batch handoff to Motrix Next for selected files.
- Added dragging files from the file manager and Dock file tree into documents to insert the same link snippet as Copy Link.

### Fixed

- Fixed S3-compatible presigned-link SigV4 query ordering by using AWS byte-order sorting and preserving RFC 3986 encoded output, avoiding `SignatureDoesNotMatch` 403 errors for Chinese filenames with `response-content-disposition`.
- Fixed S3-compatible uploads creating 0-byte files: uploads now prefer OpenList `HttpDirect` presigned PUT, and the fallback path uses an explicit base64 body to avoid multipart file content being lost in the SiYuan JavaScript kernel.
- Fixed audio files inserted by drag-and-drop failing to play: audio now inserts as a playable `<audio>` control instead of an unhandled plugin-protocol link.
- Fixed WPS upload freezing SiYuan by keeping WPS upload disabled in the JavaScript kernel runtime, avoiding base64 decoding, hashing, and proxy upload on the SiYuan runtime path.

## 0.5.1

### Added

- Added a Motrix Next handoff for file downloads. File context menus can now send downloads through a configurable Extension HTTP API URL, kernel-side forwarding avoids browser CORS issues, and the API secret plus external Siyuan Cloud URL are saved in plugin data.
- Added a clean hover-only transfer area in the file manager: drag files onto the lower-right drop zone to upload, then view recent upload/download progress, success, and error states without keeping extra UI visible.

### Fixed

- Fixed the built-in transfer flow by replacing fake download progress with real stream progress, keeping finished/error states visible, throttling concurrent built-in downloads, and using temporary files until downloads complete.
- Fixed OpenList/AList connection compatibility for private and LAN mounts by preserving the frontend-direct path where SiYuan blocks backend SSRF-style requests, while keeping the standard OpenList-compatible backend route for normal mounts.
- Fixed 115 and S3 download parity with OpenList: 115 downloads now keep browser/player `User-Agent` alignment, and S3/Doge downloads use backend AWS-signed proxy reads with Range support instead of fragile presigned redirects.
- Fixed 115 playback header parity: `/d` and `/p` now pass the player/browser `User-Agent` into 115 Cloud / 115 Open link resolution and forward the same header to the upstream download URL, reducing `115cdn.net` 403 responses caused by mismatched or stale direct links.
- Fixed 115 Open token refresh bursts by sharing one refresh operation per mount when concurrent API or Range requests hit an expired token.
- Clarified the 115 Open upstream `refresh frequently` prompt so the UI explains token-refresh rate limiting and tells users to wait or replace the existing mount tokens instead of recreating the mount.
- Fixed mount creation and update safety: adding a storage at an existing mount path now returns a conflict instead of silently overwriting the old mount, and storage mutations refresh the latest config before saving.
- Fixed S3-compatible object URLs for Chinese names and other special characters by using AWS RFC 3986 path encoding before signing, avoiding `SignatureDoesNotMatch` on upload and management operations.
- Fixed companion-plugin file links and explicit downloads: PDF/EPUB/audio links now use absolute plugin URLs instead of `file:///plugin/...`, `/d` responses declare attachment downloads, and download actions temporarily bypass companion preview interception.

## 0.5.0

### Added

- Added the WPS runtime driver: ported Cookie login checks, Personal/Business mode, root/group listing, download links, shared `/p` proxy reads, basic management operations, and storage details from OpenList `drivers/wps`; upload remains an explicit placeholder, and English/Chinese WPS driver guides were added.
- Completed WPS frontend details: the driver help shortcut now opens the WPS guide, the Cookie field uses WPS-specific guidance instead of the 115 QR-login text, and mount cards use the dedicated WPS icon.

### Fixed

- Aligned the 123Pan runtime with the broader upstream fix in OpenListTeam/OpenList#2678: API calls, web origin/referer headers, and download redirect Referer now use `https://yun.123pan.com` instead of the earlier #2677 `api.123278.com` / `api.123pan.cn` host split.
- Aligned Quark/UC runtime details: `use_transcoding_address` now defaults to disabled like OpenList, and transcoding falls back to normal download links when no usable transcoded URL is returned; list requests now absorb and persist refreshed upstream `__puus` cookies, plus `__pus` in transcoding-link scenarios; storage details report total, used, and free space; QuarkTV/UCTV QR login now treats "user has not confirmed authorization" as a pending confirmation state and keeps polling; QuarkOpen refreshes `access_token` first when the online API is enabled and uses built-in public parameters when `app_id` / `sign_key` are empty without showing them by default, while upload proof generation stores and reuses `user_id` reliably.
- Fixed Dock driver-form status text so driver notes, QR/SMS prompts, and red error messages wrap long content and can be selected/copied.
- Fixed 189CloudPC / 189CloudTV QR login details: PC QR login now preserves upstream cookies across the login/session exchange, both PC and TV reuse the shared QR-login state helper, and TV `qrCodeRollLogin()` / `QrCodeRollLoginFail` responses are treated as pending QR states with a clean user prompt instead of leaking raw upstream text.
- Completed 189CloudPC family-cloud integration: PC session refresh now normalizes the family-cloud root like the TV driver and auto-fills `family_id` from the family list when `type=family`; the English/Chinese 189Cloud Series guides now clarify that family cloud should use the PC/TV drivers.
- Fixed and aligned S3-compatible reads and management: `/p` proxying keeps using plugin-side signed reads and now forwards Range requests to avoid upstream presigned 403 responses during SiYuan Reader / PDF.js previews, while `/api/fs/link` has a separate OpenList-style GET presigned link path; `force_path_style` now defaults to disabled like OpenList, list pagination/directory detection follow OpenList, directory marker objects are filtered, recursive directory copy/move/remove/rename is supported, and the default placeholder file is `.siyuan-cloud`.
- Fixed playback for AliyundriveOpen and other non-forced-proxy mounts: `/d` now follows OpenList semantics and redirects to the direct link when proxying is not required, while `/p` remains the forced proxy entry.
- Fixed the AliyundriveOpen URL handed to SiYuan Media Player: video clicks now prefer `/api/fs/other` `video_preview` transcoding streams and fall back to the `/d` original-file link only when preview data is unavailable.

### Improved

- Improved driver-form guidance with a direct help button beside each driver title. It now opens the matching driver guide when available and falls back to the driver-guide index otherwise, reducing the need to browse the docs tree manually.
- Added branded driver icons for common cloud-drive mounts, including 115, 123Pan, 189Cloud, Aliyundrive, Baidu Netdisk, Quark, UC, and OneDrive, so mount cards are easier to scan at a glance.
- Added a per-page compact Dock view for mounts, users, shares, tasks, tools, and status pages, with each page remembering its own view preference.
- Reworked the Quark UC Series guide from the OpenList upstream documentation, covering Quark/UC, QuarkTV/UCTV, and QuarkOpen setup fields, cookies, root folders, QR login, link modes, device-limit handling, and known limits.
- Completed the AliyundriveOpen guide from OpenList upstream docs and local `docs/OpenList-main` sources, covering token refresh, drive type, `alipan_type`, delete mode, rapid upload, internal upload, `.livp` format, video preview, storage details, and current runtime differences.
- Improved AliyundriveOpen runtime parity with OpenList by adding `user/getSpaceInfo` storage details and upstream-style large-file upload part sizing.
- Aligned default proxy file types with OpenList (`m3u8,url`), leaving `web_proxy` / `only_proxy` / `no_link_url` mounts proxied while letting high-quality direct links such as AliyundriveOpen ordinary mp4 playback reach the player faster.
- Unified FileTab and Dock companion-plugin opening through shared helpers: file-type detection, `data-href` generation, and media playback URL resolution now live in one place; videos no longer expose a `/d` DOM link that SiYuan Media Player can intercept early and instead actively open the resolved preview stream; PDF/EPUB/books use stable `/p` links that keep Chinese filenames readable, avoiding garbled SiYuan Reader titles from signed upstream URLs or premature percent encoding.
- Added a dedicated S3/Doge mount icon and expanded the S3-compatible guide with Bitiful S4, `custom_host`, `remove_bucket`, `add_filename_to_disposition`, and PDF/SiYuan Reader troubleshooting notes.

## 0.4.0

### Added

- Added the `115 Open` and `115 Share` runtimes and completed the `115 Cloud`, `115 Open`, and `115 Share` mount guides. 115 Open covers token refresh, browse/read/link, basic management, and storage details; 115 Share follows OpenList's read-only share mount boundary.
- Added the QR-code login entry for `115 Cloud` / `115 Share` mount forms: refresh a QR code, poll scan status, and exchange confirmed scans for `cookie` automatically.
- Added Chinese and English OpenList/AList local mounting and proxy guides under packaged driver docs.
- Added the DogeCloud mount guide, documenting how OpenList `Doge` exchanges DogeCloud credentials for temporary S3 credentials and the current runtime boundary where Doge is still handled as generic S3.

### Fixed

- Fixed 115 Cloud playback/download link resolution by aligning the `downurl` request with OpenList's 115 driver: the encrypted `data` form field is now encoded with `encodeURIComponent` instead of `URLSearchParams`, avoiding `+` being interpreted as a space and causing "pickcode cannot be empty"; the same form encoding is used for 115 Share requests.
- Fixed 115 QR-code source selection, status handling, and save flow: `qrcode_source` stays visible, is used by the OpenList-style final QR confirmation endpoint, numeric and string confirmation states are both recognized, and clicking Add during a QR session confirms the scan and writes `cookie` before saving instead of staying on "waiting" or failing with a SiYuan v3.7.0 parameter error.
- Fixed OpenList/AList local and LAN mounting on SiYuan v3.7.0 by adding a desktop frontend direct path for private upstreams such as `127.0.0.1:5244` and `192.168.x.x:5244`, while keeping the standard backend OpenList-compatible driver path unchanged.
- Fixed OpenList/AList media preview for private direct mounts by lazily resolving the playable link with `/api/fs/get` when a file is opened, avoiding the old fallback to backend `/p` proxy URLs.
- Fixed media file clicks in FileTab and Dock tree so audio/video opens the media player or an inline preview instead of showing the download-only hint.
- Fixed copied file links so Siyuan Cloud file paths use readable `siyuan://plugins/siyuan-cloud/open?path=...` links and open back into Siyuan Cloud with the target row highlighted.
- Fixed OpenList/AList API base normalization by stripping `/admin` and `/@manage` from configured upstream URLs.
- Fixed OpenList/AList readable file handling by completing relative `raw_url` values and returning OpenList-style link data for `/d`, `/p`, archive, and download flows.
- Fixed packaged docs links so `[[...]]` references inside driver guides are converted to real SiYuan document references, not only inside README.

### Improved

- Documented the SiYuan v3.7.0 SSRF proxy boundary, frontend direct mode, and reverse-proxy/tunnel options such as Caddy and Cloudflare Tunnel.
- Expanded the S3-compatible storage guide with the absolute endpoint URL requirement, Qiniu region examples, and common formats for Bitiful S4, Tencent Cloud COS, Alibaba Cloud OSS, Huawei Cloud OBS, Volcengine TOS, UPYUN, R2, MinIO, B2, and DigitalOcean Spaces.
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
