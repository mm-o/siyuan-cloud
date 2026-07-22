# Siyuan Cloud

**Siyuan Cloud** is an OpenList-compatible file capability layer for SiYuan. It does not start or depend on the OpenList Go backend; it ports compatible routes, response shapes, mount dispatch, driver runtime, proxy playback, sharing, search, archive, torrent, WebDAV, and S3 behavior into a standalone SiYuan kernel plugin.

> [!IMPORTANT]
> Requires **SiYuan 3.7.0** or later.

## Recent Updates

### 0.6.0

#### Added

- Added the `/` command insertion entry. Type `/`, choose Siyuan Cloud, then search or browse the cloud file tree and insert a file link into the document.
- `/` insertion now reuses the same link-generation path as the context-menu Copy Link action: images insert Markdown images, audio inserts `<audio>`, video inserts `<video>`, and all other files or folders insert stable `siyuan://plugins/siyuan-cloud/open?path=...` links.
- Added index-building entry points in the file-manager More menu and Dock Tools page. Empty search results now explain that an index may need to be built first, and build time depends on file count.
- Added the GitHub Releases runtime driver, with browsing for release assets, README/LICENSE files, source archives, all-version mode, GitHub token configuration, and GitHub proxy support.
- Added Chinese and English GitHub Releases driver guides.
- Added `pnpm docs:feishu` and `release:with-docs` so README, API, changelog, and driver guides can be synced from local Markdown to Feishu.

#### Improved

- Simplified search-index progress and execution: index builds run in the background, progress is stored directly in runtime state, and stop, clear, and progress routes remain available.
- Improved preview and document insertion formats: images, audio, and video keep directly previewable/playable resource links; PDF, EPUB, TXT, archives, ordinary files, and folders use `siyuan://` to open Siyuan Cloud.
- Document insertion supports image formats `jpg/tiff/jpeg/png/gif/bmp/svg/ico/swf/webp/avif`, audio formats `mp3/wav/aac/m4a/flac/ogg`, video formats `mp4/mkv/avi/mov/rmvb/webm/flv/m3u8/m4v`, and text-preview formats `txt/log/md/markdown/json/xml/yml/yaml/toml/ini/conf/js/ts/jsx/tsx/vue/css/scss/less/html/htm/go/py/java/rb/rs/php/c/cpp/h`; only image/audio/video get embedded preview snippets, and everything else uses `siyuan://`.
- Unified link generation across FileTab, Dock, drag-and-drop, and `/` insertion to reduce drift between copied and inserted links.
- Dock status documentation entries now open Feishu Wiki links directly in the browser for README, API, changelog, and driver guides.
- Removed the old packaged-doc manifest and SiYuan document-writing path. Runtime docs now use generated Feishu links and no longer create or update SiYuan notebook documents.
- Added lightweight frontend request retries for rate-limit responses, reducing occasional TooManyRequests failures.
- Added lightweight kernel storage retries for TooManyRequests responses during plugin-state reads and writes.
- Added `github_releases` to the status adapter list and runtime capability matrix, and exposed GitHub Releases only as a runtime-backed mount option.
- Simplified packaging so only the root English and Chinese README files are copied into the plugin package, instead of the whole `assets/docs` tree.

#### Fixed

- Fixed Docker deployments failing to verify and create cloud-drive mounts, avoiding `Auth failed [session]` during driver tests.
- Fixed compatibility for older search progress data that was stored as a JSON string under settings by migrating it into the dedicated `index_progress` runtime state.

### 0.5.5

- Documentation now opens from Feishu Wiki links in the Dock status page: README, API, changelog, and driver guides are direct browser links.
- The old packaged SiYuan docs manifest and document-writing path were removed; local Markdown remains the source for release sync to Feishu.
- Fixed Docker deployments failing to verify and create cloud-drive mounts, avoiding `Auth failed [session]` during driver tests.

### 0.5.4

- Fixed 123Pan connectivity on networks that cannot reach the current `yun.123pan.com` B API by falling back to `api.123278.com` with `www.123pan.com` web headers.
- Merged mm-o/siyuan-cloud#1 and kept its compatibility path as a fallback instead of replacing the default official 123Pan API host.

### 0.5.3

- Fixed 123Pan PDF/EPUB/book preview links by aligning proxied storage `raw_url` handling with OpenList: `PreferProxy`, `WebProxy`, and `OnlyProxy` mounts now expose stable `/p/<path>` links from `/api/fs/get`.
- Fixed 123Pan file rows to use the stable `/p` proxy entry for previews, so companion reader plugins do not receive fragile upstream direct URLs.

## What It Is

- A SiYuan-native cloud-drive manager for browsing, mounting, uploading, downloading, sharing, and linking files.
- An OpenList-compatible HTTP surface for companion plugins, local automation, WebDAV clients, and S3-compatible tools.
- A bridge from cloud files into SiYuan workflows: documents, media notes, reading, image links, attachments, AI context, and future automation.

> [!TIP]
> For detailed release changes, open [[CHANGELOG]] in the plugin docs. For the live route list, use [[API]] from the Dock/About panel; it is generated from the running `/api/public/api` index.

| Area | Status |
| --- | --- |
| File browsing and links | Available |
| Runtime API discovery | Generated from `/api/public/api` |
| Driver guides | See [[Drivers]] |
| OpenList/AList local mounting | See [[OpenList AList Local Mounting and Proxy]] |
| Local storage | See [[Local Storage]] |
| Release notes | See [[CHANGELOG]] |

---

## Quick Start

> [!TIP]
> Use <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>, then browse from the Dock file tree or the top-bar file manager.

- [ ] Open the Dock panel.
- [ ] Add a mount with a runtime-backed driver.
- [ ] Browse a file or folder.
- [ ] Copy Markdown links, proxy links, download links, or share links from the context menu.
- [ ] Use [[API]] when another plugin or local automation needs the runtime surface.

## Current Capabilities

- File manager tab and Dock file tree for mounted storages.
- OpenList-style FS routes for list/get/link/upload/manage operations.
- Shared `/p` and `/d` playback/download paths using SiYuan kernel `body.proxy`.
- User, permission, meta, share, task-shape, search-index, archive, torrent, WebDAV, and S3 compatibility surfaces.
- Native SiYuan document links such as Markdown images, audio/video tags, download links, and `siyuan://plugins/siyuan-cloud/open?...`.
- Local desktop storage through the frontend Electron runtime. The kernel HTTP layer keeps Local metadata only.

## Runtime Adapters

Runtime adapters currently exposed in the Dock include:

- [[OpenList Compatible]]
- [[OpenList AList Local Mounting and Proxy]]
- [[WebDAV]]
- [[S3 Compatible]]
- [[DogeCloud]]
- [[115 Cloud]]
- [[115 Open]]
- [[115 Share]]
- [[OneDrive]]
- [[123Pan]]
- [[Baidu Netdisk]]
- [[GitHub Releases]]
- [[Aliyundrive Open]]
- [[189Cloud Series]]
- [[Quark UC Series]]
- [[Local Storage]]
- [[SiYuan Workspace]]
- Built-in virtual storage

> [!NOTE]
> Other OpenList drivers may exist as metadata/config references, but drivers without real runtime behavior are not shown in the normal mount picker.

## Recommended Use

| Goal | Action |
| --- | --- |
| Browse cloud files | Use the Dock file tree or top-bar file manager |
| Manage files | Upload, download, rename, copy, move, remove from the context menu |
| Manage users | Built-in `admin` and `guest` users follow OpenList behavior and cannot be deleted, so Dock user management does not show a delete action for them |
| Use in documents | Copy Markdown image/audio/video tags, download links, or `siyuan://` links |
| Share files | Create `/sd/{id}` private-route share links |
| Integrate plugins | Consume `raw_url`, `/p/<path>`, `/d/<path>`, or OpenList-compatible HTTP APIs |

## Boundaries

> [!WARNING]
> `/plugin/private/siyuan-cloud/*` is protected by SiYuan private-route auth. It is not a public anonymous OpenList server.

- `/sd/{id}` share links are still private-route links unless you build an external bridge.
- Search uses a local persisted index; it is not the full OpenList search backend matrix yet.
- Task routes follow OpenList shapes, but real async queues, cancellation propagation, retry scheduling, and progress reporting are still pending.
- ZIP/tar/tgz archive support is available; RAR/7z/ISO remain placeholders until reader, license, packaging, and fixture coverage are settled.
- Archive-entry media through `/ae` is extraction-oriented and is not equivalent to normal seekable `/p` playback yet.
- Offline download tools and real 189/189PC CAS rapid-upload still need deeper migration.

## Data And Sync

Kernel data is stored in SiYuan plugin storage:

- `config.json`: settings, users, storages, metas, sharings, SSH keys.
- `runtime.json`: virtual FS, tasks, messages, scan state, WebDAV locks, S3 multipart state.
- `search-index.json`: local search nodes.

> [!NOTE]
> SiYuan normally syncs `data/storage/petal/<plugin>` unless the user excludes it with `.siyuan/syncignore`.

## Development

```bash
pnpm install
pnpm test:kernel
pnpm build
```

Kernel source lives in `src/kernel/**`. Do not hand-edit generated `kernel.js`; `pnpm dev` and `pnpm build` generate it into the plugin output directory.
