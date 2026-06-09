# 思盘

> 兼容性提示：本插件需要思源 3.7.0 及以上版本。

## 0.3.4 版本更新

### 新增

- 新增 115 Cloud 运行时适配，支持 Cookie/二维码 Token 登录、列表、详情、读取、下载/播放链接、基础目录管理和存储详情。
- 新增更多网盘上传链路：123 网盘预签名/S3 上传，天翼云盘账号登录、短信二次验证和分片上传，以及百度网盘、OneDrive、阿里云盘开放平台、夸克网盘/夸克开放平台等上传流程。
- 新增 Dock 用户管理、OpenList 兼容权限配置、分享创建/编辑、挂载右键菜单、当前目录搜索、二维码登录、短信验证和驱动配置导入导出。
- 新增 OpenList 兼容多文件分享，支持自定义分享 ID、密码、过期时间、访问次数限制、Readme/Header、启用禁用和访问计数。
- 新增本地搜索索引构建、更新、清理和进度接口，支持忽略路径、索引深度和挂载级禁用索引。

### 优化

- 版本更新到 0.3.4，并将最低可用版本提升到思源 3.7.0。
- 优化文件管理页，支持本地工作空间和本机文件访问、上传、新建、删除、复制、移动、重命名、分享、下载/代理链接、复制 Markdown，以及跨搜索结果/多目录选择后的批量操作。
- 优化驱动配置表单，补充字段名称、选项翻译、敏感字段显隐、二维码生成、短信验证状态和运行时能力说明。
- 优化内核运行时存储，将配置、运行时数据和搜索索引拆分保存，并支持旧状态迁移和按配置/运行时/搜索索引分域保存。
- 优化 OpenList 兼容 API，补齐登录、用户、分享、任务、归档占位、上传、直传信息、公开能力描述、状态、WebDAV/S3 和路由别名等接口。

### 修复

- 修复 Local 本地存储说明和运行时行为不一致的问题：桌面端通过 Electron fs 访问本机文件系统，内核 HTTP 运行时仅保留 Local 元数据。
- 修复分享路由、分享下载、分享密码校验、过期校验、访问次数统计和多文件分享目录展示的兼容问题。
- 修复部分任务接口、归档占位接口、上传/直传信息接口返回结构与 OpenList 兼容性不足的问题。
- 修复多网盘登录、令牌刷新、上传分片、直链读取和基础文件管理流程中的若干边界问题，并扩展路由冒烟测试覆盖。

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
| 115 Cloud | Cookie/二维码 Token 登录、列表、详情、读取、下载/播放链接、基础管理 |
| Local 本地存储 | 桌面端通过 Electron fs 访问本机文件系统，内核 HTTP 运行时仅保留元数据 |
| 思盘虚拟存储 | 用于测试和兼容的内置虚拟文件系统 |

Google Drive、Google Photo、阿里云盘分享、OneDrive 分享、PikPak、SFTP、SMB、蓝奏云等驱动仍在迁移中；未完成运行时适配的驱动不会出现在 Dock 可挂载列表中。

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

## 审核测试方法

推荐快速测试路径：

1. 使用思源 3.7.0 或以上版本进行完整功能验证。
2. 打开 Dock 面板，进入“挂载”，新增一个存储。建议优先用 `123Pan` 做播放测试，因为 123 网盘的播放链路更直接。
3. 从顶栏打开思盘文件管理页，浏览已挂载的网盘文件。
4. 右键媒体文件，选择“复制链接”，然后把生成的 Markdown 链接粘贴到思源文档里。
5. 预览文档。图片应能直接显示，视频可通过浏览器/播放器表面或思播等接入插件播放。

百度网盘注意事项：

- 如需测试视频播放，百度网盘驱动的下载 API 请选择 `crack` 或 `crack_video` 等可播放链路；普通官方链路不一定能对所有账号和文件稳定播放。
- 测试播放时请关闭系统或网络代理。百度下载链接对出口 IP 很敏感，开启代理可能导致链接无法预览或无法播放。
- 百度视频播放依赖思源内核 `body.proxy` 流式代理能力。若没有 SiYuan PR #17748 对应的流式代理能力，百度即使能列目录和解析链接，也可能无法完成 Range 播放。

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

- 思源 3.7.0 是最低安装版本，并用于完整的文件路由、播放和代理行为，需要内核插件 HTTP `body.proxy` 能力。
- 部分驱动仍处于迁移或基础运行时阶段，上传、分片上传、秒传、离线下载、完整分享能力会继续补齐。
- Local 本地存储通过桌面端前端运行时访问宿主机文件系统；内核 HTTP 运行时仅保留 Local 元数据。
- 网络代理可能影响部分网盘媒体链接，尤其是百度网盘播放链接。

## 开发

```bash
pnpm install
pnpm build
pnpm test:kernel
```

内核插件源码位于 `src/kernel/**`；`pnpm dev` 和 `pnpm build` 会直接在目标插件输出目录生成 `kernel.js`，不要手改生成物。
