# Siyuan Cloud

**Siyuan Cloud** is an OpenList-compatible file capability layer for SiYuan. It does not start or depend on the OpenList Go backend; it ports compatible routes, response shapes, mount dispatch, driver runtime, proxy playback, sharing, search, archive, torrent, WebDAV, and S3 behavior into a standalone SiYuan kernel plugin.

> [!IMPORTANT]
> Requires **SiYuan 3.7.0** or later.

## Recent Updates

### 0.7.0

#### Added

- Added optional downloadable preview modules. Install `open-file-viewer` and Flyfish File Viewer from Tools into `/data/public/preview-modules`; the plugin loads module resources only when needed.
- Added a dedicated preview tab for Office, PDF, Markdown, code, text, archives, email, engineering, 3D/GIS, and related formats.
- Added native `.sy` document opening for SiYuan workspace mounts when the filename is a valid SiYuan document ID.

#### Improved

- Reworked Tools into launcher-style subpages for index, config, preview modules, external previews, and torrent tools.
- Unified file opening: images keep SiYuan image preview, audio/video prefer the SiYuan media player, and other supported files use preview modules.
- SiYuan workspace mounts now use `/api/file/readDir` directly for faster listing, visible user-created folders, dot-prefixed entries, and normalized file sizes.
- Preview-module UI now follows SiYuan theme variables, with refreshed OpenList/Lucide-style icons across Dock and tool pages.

#### Removed

- Removed the old text-preview, archive-browser, and native media `Dialog` fallback paths in favor of the unified preview module.

## What It Is

- A SiYuan-native cloud-drive manager for browsing, mounting, uploading, downloading, sharing, and linking files.
- An OpenList-compatible HTTP surface for companion plugins, local automation, WebDAV clients, and S3-compatible tools.
- A bridge from cloud files into SiYuan workflows: documents, media notes, reading, image links, attachments, AI context, and future automation.

> [!TIP]
> For detailed release changes, open [CHANGELOG](https://my.feishu.cn/wiki/AZHFwEdnrij8sSk2JNfcLrOqnNg). API docs are available in [Feishu API](https://my.feishu.cn/wiki/UOk4wIyQIimNjekD5LpcwO1Hnfd), while the Dock/About API entry opens the live `/api/public/api` route with the preview module.

| Area | Status |
| --- | --- |
| File browsing and links | Available |
| Runtime API discovery | [Feishu API](https://my.feishu.cn/wiki/UOk4wIyQIimNjekD5LpcwO1Hnfd) |
| Driver guides | [Drivers](https://my.feishu.cn/wiki/BK8BwW7eSiRFzOkuLzoc4zbLnXe) |
| OpenList/AList local mounting | [OpenList AList Local Mounting and Proxy](https://my.feishu.cn/wiki/LcGGwTSDji3TmgkR4XpcGjYgnZg) |
| Local storage | [Local Storage](https://my.feishu.cn/wiki/PsdzwWqDbiUqAakFw1Ec1URVnYb) |
| Release notes | [CHANGELOG](https://my.feishu.cn/wiki/AZHFwEdnrij8sSk2JNfcLrOqnNg) |

---

## Quick Start

> [!TIP]
> Use <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>, then browse from the Dock file tree or the top-bar file manager.

- [ ] Open the Dock panel.
- [ ] Add a mount with a runtime-backed driver.
- [ ] Browse a file or folder.
- [ ] Copy Markdown links, proxy links, download links, or share links from the context menu.
- [ ] Use [Feishu API](https://my.feishu.cn/wiki/UOk4wIyQIimNjekD5LpcwO1Hnfd), or open the live `/api/public/api` from Dock/About when another plugin or local automation needs the runtime surface.

## Current Capabilities

- File manager tab and Dock file tree for mounted storages.
- OpenList-style FS routes for list/get/link/upload/manage operations.
- Shared `/p` and `/d` playback/download paths using SiYuan kernel `body.proxy`.
- User, permission, meta, share, task-shape, search-index, archive, torrent, WebDAV, and S3 compatibility surfaces.
- Native SiYuan document links such as Markdown images, audio/video tags, download links, and `siyuan://plugins/siyuan-cloud/open?...`.
- Local desktop storage through the frontend Electron runtime. The kernel HTTP layer keeps Local metadata only.

## Runtime Adapters

Runtime adapters currently exposed in the Dock include:

- [OpenList Compatible](https://my.feishu.cn/wiki/OvQSw8RuniGiEikeU7ecg3BZn8g)
- [OpenList AList Local Mounting and Proxy](https://my.feishu.cn/wiki/LcGGwTSDji3TmgkR4XpcGjYgnZg)
- [WebDAV](https://my.feishu.cn/wiki/LIOBw9j2uiSpaqkXGw5c9wvRnOh)
- [S3 Compatible](https://my.feishu.cn/wiki/SNubwotSci9qIqkHFiTccr7vnib)
- [DogeCloud](https://my.feishu.cn/wiki/IlW1wNKqUiMnyWky1FBcWze1n1f)
- [115 Cloud](https://my.feishu.cn/wiki/TURwwfE62idVYekd9oUcB86YnLd)
- [115 Open](https://my.feishu.cn/wiki/P8uDw6cwIiaLenkCJVtcI2YOnZc)
- [115 Share](https://my.feishu.cn/wiki/F5vQw26wEiY40Qkm0D2cW3qSn40)
- [OneDrive](https://my.feishu.cn/wiki/REGUwk92ZiDFWVkHb1yctsQOnPb)
- [123Pan](https://my.feishu.cn/wiki/SV3wwY2u1iPdR0kdQYiccCSNnoh)
- [Baidu Netdisk](https://my.feishu.cn/wiki/Jer8wZBafiFEqKktiabciX6anIc)
- [GitHub Releases](https://my.feishu.cn/wiki/WEa0wemgEi1vnxkqzrOcIB9snDZ)
- [Aliyundrive Open](https://my.feishu.cn/wiki/S5iVwPw2ViXxRzkFgmfcE5yfn3c)
- [189Cloud Series](https://my.feishu.cn/wiki/QKtzw9sY2icSakkyy2eciqtunrb)
- [Quark UC Series](https://my.feishu.cn/wiki/T8sXwj0oDioIurk2eWmc1MbNnLg)
- [Local Storage](https://my.feishu.cn/wiki/PsdzwWqDbiUqAakFw1Ec1URVnYb)
- [SiYuan Workspace](https://my.feishu.cn/wiki/LUo2wmM67ixlQ5k2RXLcecngnfe)
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

## Credits And Licenses

This project is released under the MIT license, with thanks to these upstream projects:

- [OpenList](https://github.com/OpenListTeam/OpenList): core reference for compatible routes, response shapes, and driver behavior. OpenList is AGPL-3.0; OpenList Frontend is MIT.
- [open-file-viewer](https://github.com/xushanpei/open-file-viewer): optional preview module, MIT.
- [Flyfish File Viewer](https://github.com/flyfish-dev/file-viewer): optional Office preview module, Apache-2.0. Its on-demand worker, WASM, font, and vendor assets keep their bundled upstream notices.
- [SiYuan plugin sample](https://github.com/siyuan-note/plugin-sample) and Monaco-editor-style SiYuan plugin projects: references for plugin structure, tab opening, and editor integration; their upstream licenses remain in effect.
- [zip.js](https://github.com/gildas-lormeau/zip.js): archive capability reference and development dependency, BSD-3-Clause.

## Development

```bash
pnpm install
pnpm test:kernel
pnpm build
```

Kernel source lives in `src/kernel/**`. Do not hand-edit generated `kernel.js`; `pnpm dev` and `pnpm build` generate it into the plugin output directory.
