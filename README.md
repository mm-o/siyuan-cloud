# Siyuan Cloud

**Siyuan Cloud** is an OpenList-compatible file capability layer for SiYuan. It does not start or depend on the OpenList Go backend; it ports compatible routes, response shapes, mount dispatch, driver runtime, proxy playback, sharing, search, archive, torrent, WebDAV, and S3 behavior into a standalone SiYuan kernel plugin.

> [!IMPORTANT]
> Requires **SiYuan 3.7.0** or later.

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

- OpenList / AList V3
- WebDAV
- S3 / Doge
- 115 Cloud
- OneDrive
- 123Pan
- [[Baidu Netdisk]]
- AliyundriveOpen
- 189Cloud / 189CloudPC / 189CloudTV
- Quark / UC / QuarkOpen / QuarkTV / UCTV
- Local desktop storage
- Built-in virtual storage

> [!NOTE]
> Other OpenList drivers may exist as metadata/config references, but drivers without real runtime behavior are not shown in the normal mount picker.

## Recommended Use

| Goal | Action |
| --- | --- |
| Browse cloud files | Use the Dock file tree or top-bar file manager |
| Manage files | Upload, download, rename, copy, move, remove from the context menu |
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
