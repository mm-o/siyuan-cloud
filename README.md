# Siyuan Cloud

**Siyuan Cloud** is a cloud-drive aggregation manager for SiYuan. It mounts 25+ cloud drives and disks, previews 300+ file formats, works with SiYuan Reader and SiYuan Media Player, and brings remote files, media, reading, sharing, and document links into one SiYuan workflow. Keep files in the cloud, keep the workspace light, and browse or reuse remote files whenever you need them.

## Recent Updates

### 0.7.1

#### Improved

- Refined preview-module categories: Open File Viewer stays lightweight, while Flyfish File Viewer now uses its independent full-category support matrix.
- Moved `.xmind` support to Flyfish File Viewer and added clearer Lucide-style category icons for Office, diagrams, ebooks, and mail.

#### Fixed

- Fixed PDF/EPUB fallback opening when SiReader is not installed or loaded, allowing preview modules to handle those files.

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

For detailed release changes, open [CHANGELOG](https://my.feishu.cn/wiki/AZHFwEdnrij8sSk2JNfcLrOqnNg).

## What It Does

| Capability | Details |
| --- | --- |
| Drive aggregation | Mount 115, 123Pan, 189Cloud, Aliyundrive, Baidu Netdisk, Quark/UC, OneDrive, WPS, GitHub Releases, OpenList/AList, WebDAV, S3, local disks, SiYuan Workspace, and more |
| File management | Browse, upload, download, copy, move, rename, and remove files from the Dock tree or top-bar file manager |
| Rich preview | Install preview modules on demand for Office, PDF, Markdown, code, text, archives, email, engineering drawings, 3D/GIS, XMind, and 300+ formats |
| Media and reading | Images use SiYuan image preview, audio/video prefer SiYuan Media Player, PDF/EPUB prefer SiYuan Reader, and preview modules act as fallback when companion plugins are unavailable |
| Document links | Copy Markdown images, audio, video, download links, or `siyuan://plugins/siyuan-cloud/open?...`; insert file links with the `/` command |
| Online sharing | Create `/sd/{id}` share links for quick file or folder sharing in trusted environments |
| Image/video beds | Use cloud files as image, audio, and video resources in notes without filling the SiYuan workspace with attachments |
| Compatible APIs | Expose OpenList-style file APIs, WebDAV, and S3-compatible surfaces for local tools, automation, and companion plugins |

## Capability Overview

Siyuan Cloud has grown from a file-manager entry into an OpenList-compatible runtime inside SiYuan:

- **Mounts and drivers**: runtime-backed adapters for 115, 123Pan, 189Cloud, Aliyundrive, Baidu Netdisk, Quark/UC, OneDrive, WPS, GitHub Releases, S3/Doge, WebDAV, OpenList/AList, local disks, and SiYuan Workspace, with matching driver guides.
- **Files and transfers**: list, get, link, upload, download, copy, move, remove, rename, batch download, Motrix Next handoff, drag-and-drop upload, and visible transfer states.
- **Preview and playback**: images, audio, video, PDF, EPUB, Office, Markdown, code, archives, email, engineering drawings, 3D/GIS, XMind, and more open through native SiYuan viewers, SiYuan Reader/Media Player, or downloadable preview modules.
- **Document workflow**: copy links from context menus, drag files into documents, or use the `/` command to insert file links; images, audio, and video can become directly previewable Markdown or HTML snippets.
- **Sharing and permissions**: OpenList-style users, sessions, permissions, meta rules, share links, access control, passwords, expiry, access limits, and public-read rechecks.
- **Search and tasks**: persisted local search indexes, build/stop/clear/progress routes, and OpenList-shaped task state, cancel, and retry foundations.
- **Protocols and automation**: `/api/public/api`, `/api/public/routes`, status capability matrices, OpenList-style FS APIs, WebDAV, S3, and companion-plugin resource paths such as `/p` and `/d`.
- **UI and experience**: Dock, file manager, tools, status, users, shares, tasks, and icons have been consolidated; SiYuan Workspace mounts now open faster and preserve user-created folders, dot-prefixed files, and stable file sizes.

## Quick Start

- Open the Dock panel and go to **Mounts**.
- Add a mount with a runtime-backed driver.
- Browse files from the Dock file tree or the top-bar file manager.
- Right-click a file to preview, copy links, insert into documents, share, download, or manage it.
- For Office, code, XMind, archives, and other enhanced previews, open **Tools -> Preview Modules** and install the module you need.

## Documentation

| Area | Link |
| --- | --- |
| Release notes | [CHANGELOG](https://my.feishu.cn/wiki/AZHFwEdnrij8sSk2JNfcLrOqnNg) |
| API docs | [Feishu API](https://my.feishu.cn/wiki/UOk4wIyQIimNjekD5LpcwO1Hnfd) |
| Driver guides | [Drivers](https://my.feishu.cn/wiki/BK8BwW7eSiRFzOkuLzoc4zbLnXe) |
| OpenList/AList local mounting | [OpenList AList Local Mounting and Proxy](https://my.feishu.cn/wiki/LcGGwTSDji3TmgkR4XpcGjYgnZg) |
| Baidu Netdisk | [Baidu Netdisk](https://my.feishu.cn/wiki/Jer8wZBafiFEqKktiabciX6anIc) |
| Local storage | [Local Storage](https://my.feishu.cn/wiki/PsdzwWqDbiUqAakFw1Ec1URVnYb) |

The Dock/About API entry opens the live `/api/public/api` route with the preview module. README API links point to the Feishu documentation.

## Runtime Adapters

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
- [WPS](https://my.feishu.cn/wiki/S5ovwL0bSiD7TNkwFmtcZwDqnXb)
- [Local Storage](https://my.feishu.cn/wiki/PsdzwWqDbiUqAakFw1Ec1URVnYb)
- [SiYuan Workspace](https://my.feishu.cn/wiki/LUo2wmM67ixlQ5k2RXLcecngnfe)
- Built-in virtual storage

Other OpenList drivers may exist as metadata/config references, but drivers without real runtime behavior are not shown in the normal mount picker.

## Boundaries

- `/plugin/private/siyuan-cloud/*` is protected by SiYuan private-route auth. It is not a public anonymous OpenList server.
- `/sd/{id}` share links are still private-route links unless you provide a reverse proxy, tunnel, or external bridge.
- Search uses a local persisted index; it is not the full OpenList search backend matrix yet.
- Task routes follow OpenList shapes, but real async queues, cancellation propagation, retry scheduling, and progress reporting are still pending.
- ZIP/tar/tgz archive support is available; more complex archive formats such as RAR/7z/ISO are handled by preview modules or future reader work.
- Archive-entry media through `/ae` is extraction-oriented and is not equivalent to normal seekable `/p` playback yet.

## Data And Sync

Kernel data is stored in SiYuan plugin storage:

- `config.json`: settings, users, storages, metas, sharings, SSH keys.
- `runtime.json`: virtual FS, tasks, messages, scan state, WebDAV locks, S3 multipart state.
- `search-index.json`: local search nodes.

SiYuan normally syncs `data/storage/petal/<plugin>` unless the user excludes it with `.siyuan/syncignore`.

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
