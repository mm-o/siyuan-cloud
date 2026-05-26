# Siyuan Cloud

Siyuan Cloud is a standalone cloud-drive aggregation manager for SiYuan, rebuilt from OpenList and adapted for SiYuan. It does not depend on or launch the OpenList backend; instead, it brings multi-cloud mounting, cloud file management, cloud file viewing, media playback, image-hosting links, WebDAV/S3 access, and plugin APIs into SiYuan, mounting Baidu Netdisk, OneDrive, 123Pan, 189Cloud, Quark, AliyundriveOpen, WebDAV, S3, local workspace files, and remote OpenList/AList servers into one file tree.

In one sentence: **Siyuan Cloud is a SiYuan-native cloud-drive aggregation manager for cloud file management and viewing, media playback, image-hosting links, reading annotations, and more workflows waiting to be explored.**

## What It Can Do

- Browse and manage multiple cloud drives and storage backends inside SiYuan.
- View cloud files directly and bring remote materials into SiYuan reading, playback, and note-taking workflows.
- Use cloud images as image-hosting links, and insert audio, video, and download links directly into documents.
- Integrated companion player workflows can play cloud videos directly for media notes.
- Integrated companion reader workflows can read cloud PDFs, EPUBs, and books directly for annotations and reading notes.
- Provide stable file APIs for player, reader, gallery, publishing, and automation plugins, with more integrations expected.
- Stream playable/downloadable URLs through `/d` and `/p` with Range support.
- Expose the same file tree through WebDAV and S3-compatible surfaces.
- Import/export configuration and keep adding driver behavior inside the standalone plugin.

## Supported Storage

Runtime adapters currently available in the Dock mount list:

| Storage | Current capability |
| --- | --- |
| OpenList / AList V3 | Connect to remote OpenList/AList-compatible servers |
| Baidu Netdisk | List/get/link, Range playback, official/crack/crack_video link paths, basic folder management |
| OneDrive | List/get/link, token refresh, basic folder management, small-file upload |
| 123Pan | Signed requests, list/get/link, basic folder management |
| 189Cloud | List/get/link and basic management |
| Quark | List/get/link and basic management |
| AliyundriveOpen | List/get/link and basic management |
| WebDAV | List, read/write, proxy playback, basic management |
| S3 / Doge | Bucket/object list, read/write/delete/copy, lightweight multipart skeleton |
| Local | SiYuan workspace-relative `/api/file` access |
| Virtual storage | Built-in compatibility and testing file system |

Drivers such as 115, Google Drive, Google Photos, AliyunDrive Share, OneDrive Sharelink, PikPak, SFTP, SMB, and Lanzou are still being ported. Drivers without runtime adapters are hidden from the Dock mount picker.

## Document-Ready Links

Base route:

Companion reader/player plugins can consume the returned `raw_url` directly, turning cloud videos, PDFs, EPUBs, and other files into playable, readable, annotatable SiYuan content.

```text
/plugin/private/siyuan-cloud
```

Image:

```markdown
![](/plugin/private/siyuan-cloud/p/Baidu/photos/image.png)
```

Video:

```html
<video controls src="/plugin/private/siyuan-cloud/p/Baidu/videos/movie.mp4"></video>
```

Audio:

```html
<audio controls src="/plugin/private/siyuan-cloud/p/Music/song.flac"></audio>
```

Download link:

```markdown
[Download](/plugin/private/siyuan-cloud/d/OneDrive/docs/report.pdf)
```

Notes:

- `/d/<path>` is the download route.
- `/p/<path>` is the proxy route for storages that need hidden links, Range playback, or driver-specific headers.
- `/api/fs/get` and `/api/fs/link` return `raw_url`; companion plugins should use that field instead of guessing the final URL.

## Reviewer Verification

Recommended quick path:

1. Use SiYuan 3.7.0 or later.
2. Open the Dock panel, go to Mounts, and add a storage. `123Pan` is recommended for the first playback test because its direct playback path is simpler.
3. Browse the mounted files from the top bar file manager.
4. Right-click a media file, choose Copy Link, then paste the generated Markdown link into a SiYuan document.
5. Preview the document. Images should render directly, and videos can be played by the browser/player surface or companion media plugins.

Baidu Netdisk notes:

- For video playback, set the Baidu driver download API to a crack-capable option such as `crack` or `crack_video`; the ordinary official link path may not be playable for every account/file.
- Keep network/system proxies disabled during playback verification. Baidu download links are sensitive to proxy egress IP changes and may fail to preview or play when a proxy is enabled.
- Baidu video playback depends on SiYuan's kernel `body.proxy` streaming proxy capability. Without the streaming proxy changes from SiYuan PR #17748, Baidu Range playback may fail even if listing and link resolution work.

## API For Plugins And Tools

Siyuan Cloud exposes a unified HTTP API for companion plugins and tools. Use this route as the file-service base URL:

```text
/plugin/private/siyuan-cloud
```

Machine-readable API index:

```text
GET /plugin/private/siyuan-cloud/api/public/api
GET /plugin/private/siyuan-cloud/api/public/routes
```

Common file APIs:

```text
POST /plugin/private/siyuan-cloud/api/fs/list
POST /plugin/private/siyuan-cloud/api/fs/get
POST /plugin/private/siyuan-cloud/api/fs/link
POST /plugin/private/siyuan-cloud/api/fs/mkdir
POST /plugin/private/siyuan-cloud/api/fs/rename
POST /plugin/private/siyuan-cloud/api/fs/move
POST /plugin/private/siyuan-cloud/api/fs/copy
POST /plugin/private/siyuan-cloud/api/fs/remove
PUT  /plugin/private/siyuan-cloud/api/fs/put
PUT  /plugin/private/siyuan-cloud/api/fs/form
```

Admin APIs:

```text
GET  /plugin/private/siyuan-cloud/api/admin/driver/names
GET  /plugin/private/siyuan-cloud/api/admin/driver/list
GET  /plugin/private/siyuan-cloud/api/admin/driver/info?driver=BaiduNetdisk
POST /plugin/private/siyuan-cloud/api/admin/storage/create
POST /plugin/private/siyuan-cloud/api/admin/storage/update
POST /plugin/private/siyuan-cloud/api/admin/storage/delete
GET  /plugin/private/siyuan-cloud/api/admin/config/export
POST /plugin/private/siyuan-cloud/api/admin/config/import
```

Download, proxy, and protocol surfaces:

```text
GET /plugin/private/siyuan-cloud/d/<path>
GET /plugin/private/siyuan-cloud/p/<path>
/plugin/private/siyuan-cloud/dav
/plugin/private/siyuan-cloud/s3
```

Example:

```js
const resp = await fetch("/plugin/private/siyuan-cloud/api/fs/get", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path: "/Baidu/videos/movie.mp4" }),
});
const { data } = await resp.json();
console.log(data.raw_url);
```

## Extensibility

Siyuan Cloud is a file capability layer, not just a single-drive client:

- Unified routes and response envelopes make it easy for plugins, scripts, and external tools to reuse.
- Longest-prefix mount dispatch combines different storage providers into one tree.
- Kernel `body.proxy` streaming supports large files, media Range requests, and download redirects.
- Runtime drivers return one internal `link` shape; the shared proxy layer handles headers, cookies, Range, and playback.
- WebDAV, S3, and HTTP APIs reuse the same file tree.
- Runtime state lives in SiYuan plugin storage and can follow the workspace sync policy.

## Entry Points

- Top bar button: opens the Siyuan Cloud file manager tab.
- Dock: manages accounts, mounts, driver fields, config import/export, and migration progress.
- File manager: browse, upload, download, create, rename, copy, move, delete, and copy document-ready links.

## Current Limits

- Requires SiYuan 3.7.0 or later with kernel plugin HTTP `body.proxy` support, tracked by SiYuan PR #17748.
- Some drivers are still being ported or are early runtime adapters. Upload, multipart upload, offline download, and full share behavior will continue to be completed.
- Local storage is limited to SiYuan workspace-relative paths and does not expose arbitrary host absolute paths.
- Network proxies may break some cloud-drive media links, especially Baidu Netdisk playback URLs.

## Development

```bash
pnpm install
pnpm build
pnpm test:kernel
```

Kernel plugin source lives in `src/kernel/**`; `pnpm dev` and `pnpm build` generate `kernel.js` directly into the target plugin output directory. Do not hand-edit generated output.
