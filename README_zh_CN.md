# 思盘

思盘是基于 OpenList 改造迁移而来的独立思源网盘聚合管理器：它不依赖、不启动 OpenList 后端，而是为思源重新适配多网盘挂载、网盘文件管理、网盘文件查看、媒体播放、图床直链、WebDAV/S3 和插件 API 能力，把百度网盘、OneDrive、123 网盘、天翼云盘、夸克网盘、阿里云盘开放平台、WebDAV、S3、本地工作空间和远端 OpenList/AList 挂载成统一文件系统。

一句话：**思盘是为思源深度适配的网盘聚合管理器，支持网盘文件管理与查看、媒体播放、图床直链、读书批注等能力，更多玩法期待你的探索。**

## 可以用来做什么

- 在思源里统一浏览和管理多个网盘、对象存储、WebDAV 和本地工作空间文件。
- 直接查看网盘文件，让云端资料进入思源的阅读、播放和笔记工作流。
- 把云端图片作为图床直链使用，把音频、视频、普通文件链接直接放进文档。
- 已接入思播插件，可直接播放网盘视频并做媒体笔记。
- 已接入思阅插件，可直接阅读网盘 PDF、EPUB 等文件和书籍，并做批注笔记、读书笔记。
- 为播放器插件、阅读插件、图库插件、发布工具、自动化脚本提供稳定的文件 API，期待更多插件接入。
- 通过 `/d` 和 `/p` 获取可播放、可下载、支持 Range 的真实流式链接。
- 通过 WebDAV 或 S3 兼容入口让外部工具访问思盘文件树。
- 导入、导出配置，迁移挂载信息，在独立插件内继续扩展更多网盘驱动。

## 当前支持的存储

已接入运行时适配器，可在 Dock 挂载列表中直接使用：

| 类型 | 当前能力 |
| --- | --- |
| OpenList / AList V3 | 连接远端 OpenList/AList 服务，复用其文件列表和下载链接 |
| 百度网盘 | 列表、详情、下载/播放链接、Range 播放、基础目录管理，支持官方/crack/crack_video 链路 |
| OneDrive | 列表、详情、下载/播放链接、令牌刷新、基础目录管理、小文件上传 |
| 123 网盘 | 登录/签名请求、列表、详情、下载链接、基础目录管理 |
| 天翼云盘 189Cloud | 列表、详情、下载/播放链接、基础管理 |
| 夸克网盘 Quark | 列表、详情、下载/播放链接、基础管理 |
| 阿里云盘开放平台 AliyundriveOpen | 列表、详情、下载/播放链接、基础管理 |
| WebDAV | 列表、读写、下载/播放代理、基础管理 |
| S3 / Doge | bucket/object 列表、读写、删除、复制、multipart 骨架 |
| Local 本地存储 | 映射到思源工作空间相对 `/api/file` 访问 |
| 思盘虚拟存储 | 用于测试和兼容的内置虚拟文件系统 |

115、Google Drive、Google Photo、阿里云盘分享、OneDrive 分享、PikPak、SFTP、SMB、蓝奏云等驱动仍在迁移中；未完成运行时适配的驱动不会出现在 Dock 可挂载列表中。

## 文档中直接引用文件

挂载后，文件可以通过思盘私有路由直接引用。推荐优先在文件管理页使用复制链接/复制 Markdown 操作，避免手动编码路径。

思播、思阅等插件可以直接消费思盘返回的 `raw_url`，把网盘视频、PDF、EPUB 等文件变成可播放、可阅读、可批注、可沉淀笔记的思源内容。

基础路径：

```text
/plugin/private/siyuan-cloud
```

图片：

```markdown
![](/plugin/private/siyuan-cloud/p/百度/我的资源/image.png)
```

视频：

```html
<video controls src="/plugin/private/siyuan-cloud/p/百度/我的资源/video.mp4"></video>
```

音频：

```html
<audio controls src="/plugin/private/siyuan-cloud/p/音乐/song.flac"></audio>
```

普通下载链接：

```markdown
[下载文件](/plugin/private/siyuan-cloud/d/OneDrive/docs/report.pdf)
```

说明：

- `/d/<path>` 是下载入口。
- `/p/<path>` 是代理入口，适合需要隐藏真实链接、需要 Range 播放、需要网盘专用 Header 的文件。
- `/api/fs/get` 和 `/api/fs/link` 会返回 `raw_url`，其他插件应优先使用这个字段，而不是自己猜测直链。

## 给其他插件和工具使用的 API

思盘向其他插件和工具公开统一 HTTP API，可把下面地址作为文件服务 base URL：

```text
/plugin/private/siyuan-cloud
```

机器可读 API 索引：

```text
GET /plugin/private/siyuan-cloud/api/public/api
GET /plugin/private/siyuan-cloud/api/public/routes
```

常用文件 API：

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

管理 API：

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

下载、代理和协议入口：

```text
GET /plugin/private/siyuan-cloud/d/<path>
GET /plugin/private/siyuan-cloud/p/<path>
/plugin/private/siyuan-cloud/dav
/plugin/private/siyuan-cloud/s3
```

示例：获取文件播放链接。

```js
const resp = await fetch("/plugin/private/siyuan-cloud/api/fs/get", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ path: "/百度/我的资源/video.mp4" }),
});
const { data } = await resp.json();
console.log(data.raw_url);
```

## 强大的扩展能力

思盘不是单个网盘客户端，而是一个文件能力底座：

- 统一路由和响应形状，便于插件、脚本和外部工具复用。
- 统一挂载分发，按最长 `mount_path` 把不同网盘组合成一棵文件树。
- 流式代理基于思源内核 `body.proxy`，支持大文件、音视频 Range 请求和下载重定向。
- driver 内部只需返回标准 `link`，公共层统一处理 Header、Cookie、Range、代理和播放。
- WebDAV/S3/API 多入口共用同一文件树，便于外部工具和其他插件复用。
- 配置、用户、存储、分享、任务记录保存在思源插件存储中，可随工作空间同步策略管理。

## 使用入口

- 顶栏按钮：打开思盘文件管理页。
- Dock：管理账号、挂载、驱动参数、配置导入导出和迁移进度。
- 文件管理页：浏览、上传、下载、新建、重命名、复制、移动、删除，复制文档可用链接。

## 当前限制

- 需要带内核插件 HTTP `body.proxy` 能力的思源构建，相关能力见 SiYuan PR #17748。
- 部分驱动仍处于迁移或基础运行时阶段，上传、分片上传、秒传、离线下载、完整分享能力会继续补齐。
- Local 本地存储只映射思源工作空间相对路径，不直接开放宿主机任意绝对路径。

## 开发

```bash
pnpm install
pnpm build
pnpm test:kernel
```

内核插件源码位于 `src/kernel/**`；`pnpm dev` 和 `pnpm build` 会直接在目标插件输出目录生成 `kernel.js`，不要手改生成物。
