# 思盘

**思盘**是思源内的 OpenList 兼容文件能力底座。它不启动、不依赖 OpenList Go 后端，而是在思源 kernel 插件里迁移 OpenList 兼容的路由、响应形状、挂载分发、驱动运行时、代理播放、分享、搜索、压缩包、torrent、WebDAV 和 S3 能力。

> [!IMPORTANT]
> 需要 **思源 3.7.0** 或以上版本。

## 最近更新

### 0.6.1

#### 新增

- 新增网盘传输能力策略，不支持上传或直接下载的挂载会在开始前直接提示。

#### 优化

- 首页网盘列表改为直接读取已配置挂载，避开较慢的存储列表接口，打开思盘和文件管理首页更快显示。
- 网盘目录切换增加轻量加载动画，Dock 文件树会在正在打开的位置显示，文件管理页面加载列表时也会给出状态反馈。

#### 修复

- 修复挂载盘音视频点击播放被 companion 链路提前截获的问题，阅读类文件继续使用稳定预览链接。
- 修复不支持上传或直接下载的挂载缺少前置提示的问题，下载入口会标注推荐 Motrix Next。

### 0.6.0

#### 新增

- 新增 `/` 命令插入入口：在编辑器输入 `/` 后选择“思盘”，可搜索或浏览思盘文件树并插入文件链接。
- `/` 插入复用右键菜单的复制链接逻辑：图片插入 Markdown 图片，音频插入 `<audio>`，视频插入 `<video>`，其它文件和文件夹插入稳定的 `siyuan://plugins/siyuan-cloud/open?path=...` 链接。
- 新增索引建立入口：文件管理器“更多”菜单和 Dock 工具页都可触发建立索引；搜索无结果时会提示先建立索引，耗时取决于文件数量。
- 新增 GitHub Releases 运行时驱动：支持按仓库结构浏览 Release 资产、README/LICENSE、源码包和全部版本，可配置 GitHub Token 与代理地址。
- 新增中英文 GitHub Releases 驱动说明。
- 新增飞书文档同步脚本 `pnpm docs:feishu` 和 `release:with-docs` 发布入口，README、API、更新日志和驱动说明可从本地 Markdown 同步到飞书。

#### 优化

- 精简搜索索引进度存储和执行路径：建立索引在后台执行，进度直接记录到运行时状态，并支持停止、清空和查询进度。
- 优化预览与文档插入格式：图片、音频、视频保留可直接预览/播放的资源链接；PDF、EPUB、TXT、压缩包、普通文件和文件夹统一使用 `siyuan://` 打开思盘。
- 明确 `/` 插入支持格式：图片包含 `jpg/tiff/jpeg/png/gif/bmp/svg/ico/swf/webp/avif`，音频包含 `mp3/wav/aac/m4a/flac/ogg`，视频包含 `mp4/mkv/avi/mov/rmvb/webm/flv/m3u8/m4v`，文本预览类包含 `txt/log/md/markdown/json/xml/yml/yaml/toml/ini/conf/js/ts/jsx/tsx/vue/css/scss/less/html/htm/go/py/java/rb/rs/php/c/cpp/h`；除图片、音频、视频外，插入文档时统一生成 `siyuan://` 链接。
- 统一 FileTab、Dock、拖拽和 `/` 插入的链接生成入口，减少复制链接与插入链接之间的分叉。
- Dock 状态页文档入口切换为飞书 Wiki 链接，说明文档、API、更新日志和驱动说明直接在浏览器打开。
- 删除旧的打包文档清单和思源文档写入路径，运行时只读取生成的飞书文档链接，不再创建或更新思源笔记本文档。
- 前端请求增加轻量重试，遇到限流提示时会短暂等待后重试，减少偶发 TooManyRequests 失败。
- 内核状态读写增加限流重试，减少同步存储读写遇到 TooManyRequests 时的失败。
- 状态页和能力矩阵补入 `github_releases` 适配器信息，驱动列表只展示已经接入运行时的 GitHub Releases。
- 打包规则精简为只复制根目录中英文 README，不再把 `assets/docs` 整树打入插件包。

#### 修复

- 修复 Docker 部署下无法验证和创建云盘挂载的问题，避免驱动测试阶段直接返回 `Auth failed [session]`。
- 修复搜索索引进度曾经写在 settings 字符串里的历史兼容问题，加载旧数据时会迁移到独立的 `index_progress` 运行时状态。

### 0.5.5

- 文档入口切换到飞书 Wiki 链接：Dock 状态页里的说明文档、API、更新日志和驱动说明现在都是直接打开浏览器的链接。
- 删除旧的打包文档清单和思源文档写入路径，本地 Markdown 作为源文件，发版时同步到飞书。
- 修复 Docker 部署下无法验证和创建云盘挂载的问题，避免驱动测试阶段直接返回 `Auth failed [session]`。

### 0.5.4

- 修复部分网络无法访问 123 网盘当前 `yun.123pan.com` B API 时的连接问题：失败后自动回退到 `api.123278.com`，并使用 `www.123pan.com` 网页请求头。
- 合并 mm-o/siyuan-cloud#1，并将其中的兼容路径保留为回退方案，而不是替换默认的 123 网盘官方 API 域名。

### 0.5.3

- 修复 123Pan 的 PDF/EPUB/书籍类文件预览链接：`/api/fs/get` 现在按 OpenList 语义让 `PreferProxy`、`WebProxy` 和 `OnlyProxy` 挂载返回稳定的 `/p/<path>` 代理入口。
- 修复 123Pan 文件行预览入口，统一使用稳定的 `/p` 代理链接，避免阅读类 companion 插件拿到脆弱的上游直链。

## 它是什么

- **云盘聚合管理器**：浏览、挂载、上传、下载、分享和引用文件。
- **兼容 HTTP 能力层**：给 companion 插件、本机自动化、WebDAV 客户端和 S3 兼容工具调用。
- **思源工作流底座**：把云盘文件接入文档、媒体笔记、阅读、图床、附件、AI 上下文和后续自动化。

> [!TIP]
> 详细版本变化请打开插件文档中的 [[更新日志]]。实时路由清单请在 Dock/关于页打开 [[API]]，它直接由正在运行的 `/api/public/api` 生成。

| 内容 | 入口 |
| --- | --- |
| 版本变化 | [[更新日志]] |
| 实时 API | [[API]] |
| 驱动教程 | [[驱动说明]] |
| OpenList/AList 本地挂载 | [[OpenList AList 本地挂载与代理]] |
| 百度网盘 | [[百度网盘挂载]] |
| Local 本地存储 | [[Local 本地存储]] |

---

## 快速开始

> [!TIP]
> 菜单路径可以按 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd> 操作。新增后从 <kbd>Dock 文件树</kbd> 或 <kbd>顶部栏文件管理</kbd> 浏览。

- [ ] 打开 Dock 面板。
- [ ] 新增一个挂载，选择真实可用的运行时驱动。
- [ ] 在文件树中打开文件或目录。
- [ ] 右键复制 Markdown 链接、代理链接、下载链接或分享链接。
- [ ] 需要自动化时调用 [[API]] 中的运行时接口。

## 当前能力一览

| 模块 | 说明 |
| --- | --- |
| 文件管理 | 文件管理 Tab、Dock 文件树、右键菜单 |
| 文件接口 | 列表、详情、链接、上传、复制、移动、删除、重命名 |
| 播放下载 | 统一 `/p`、`/d` 路径，复用思源 kernel `body.proxy` |
| 协议能力 | 用户、权限、meta、分享、任务形态、搜索索引、压缩包、torrent、WebDAV、S3 |
| 文档链接 | Markdown 图片、audio/video 标签、下载链接、`siyuan://plugins/siyuan-cloud/open?...` |
| 本地文件 | Local 通过桌面端 Electron runtime 访问，kernel HTTP 层只保留元数据 |

## 已接入运行时驱动

Dock 当前可见的运行时适配包括：

- [[OpenList 兼容挂载]]
- [[OpenList AList 本地挂载与代理]]
- [[WebDAV 挂载]]
- [[S3 兼容存储]]
- [[DogeCloud 挂载]]
- [[115 Cloud 挂载]]
- [[115 Open 挂载]]
- [[115 Share 挂载]]
- [[OneDrive 挂载]]
- [[123Pan 挂载]]
- [[百度网盘挂载]]
- [[GitHub Releases]]
- [[阿里云盘开放平台]]
- [[189Cloud 系列]]
- [[Quark UC 系列]]
- [[Local 本地存储]]
- [[思源工作空间]]
- 内置虚拟存储

> [!NOTE]
> 其它 OpenList 驱动可能保留 metadata/config 参考；没有真实运行时的驱动不会出现在常规挂载列表里。

## 常用动作

| 目标 | 操作 |
| --- | --- |
| 浏览云盘 | <kbd>Dock</kbd> 文件树或顶部栏文件管理 |
| 管理文件 | 右键菜单上传、下载、重命名、复制、移动、删除 |
| 管理用户 | 内置 `admin` 和 `guest` 用户跟随 OpenList 行为不可删除，Dock 用户管理不会为这两个用户显示删除按钮 |
| 放进文档 | 复制 Markdown 图片、音视频标签、下载链接或 `siyuan://` 链接 |
| 分享文件 | 使用分享菜单生成 `/sd/{id}` 私有路由链接 |
| 接入插件 | companion 插件消费 `raw_url`、`/p/<path>`、`/d/<path>` 或 OpenList-compatible HTTP API |

## 边界

> [!WARNING]
> `/plugin/private/siyuan-cloud/*` 是思源私有路由，不是公网匿名 OpenList 服务。

- `/sd/{id}` 分享链接仍是私有路由链接，除非另外设计外部 bridge。
- 搜索使用本地持久索引，还不是完整 OpenList search backend 矩阵。
- 任务接口已对齐 OpenList 形态，但真实异步队列、取消传播、重试调度和进度上报仍待实现。
- ZIP/tar/tgz 已支持；RAR/7z/ISO 需要等 reader、许可证、打包路径和 fixture 都明确后再接入。
- `/ae` 压缩包内媒体偏向 entry 提取，不等同于普通 `/p` 的可 seek 流式播放。
- 离线下载工具和真实 189/189PC CAS rapid-upload 仍需要继续迁移。

## 数据与同步

内核数据保存在思源插件存储中：

| 文件 | 内容 |
| --- | --- |
| `config.json` | settings、users、storages、metas、sharings、SSH keys |
| `runtime.json` | 虚拟 FS、tasks、messages、scan、WebDAV locks、S3 multipart 状态 |
| `search-index.json` | 本地搜索索引 |

> [!NOTE]
> 思源默认会同步 `data/storage/petal/<plugin>`，用户可以通过 `.siyuan/syncignore` 排除。

## 开发

```bash
pnpm install
pnpm test:kernel
pnpm build
```

内核源码位于 `src/kernel/**`。不要手改生成的 `kernel.js`；`pnpm dev` 和 `pnpm build` 会生成到插件输出目录。
