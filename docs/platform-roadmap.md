# 思盘平台化路线图

本文档用于重新定义思盘的长期形态：它不是一个孤立的网盘文件管理器，而是思源内的 OpenList-compatible 文件能力底座。后续所有功能都应围绕两个层次展开：

- OpenList 兼容底座：对外提供稳定 HTTP API、协议入口、驱动运行时、权限、任务、索引、分享和代理播放能力。
- 思源原生融合层：把云盘文件变成可被文档、块、资源、播放器、阅读器、图床、AI、自动化和其它插件自然消费的思源内容能力。

## 基本判断

思源 kernel plugin runtime 已经给出几个明确边界：

- 私有路由 `/plugin/private/siyuan-cloud/*` 由思源本体 `CheckAuth` 和 `CheckAdminRole` 保护。它适合本机、当前工作空间和插件间集成，不应被假设为天然公网服务。
- kernel JavaScript 运行在 goja event loop 中。大文件正文、耗时索引、批量复制、解压、离线下载等能力必须任务化、可取消、可恢复，不能在单次请求里长时间阻塞。
- `body.proxy` 是当前最适合媒体播放和大文件下载的流式通道。普通文件播放必须继续保持 `driver Link -> /p or /d -> common proxy -> body.proxy`，不要回到 per-driver 正文下载或 bounded range 补丁。
- `siyuan.storage` 位于 `data/storage/petal/siyuan-cloud`，默认跟随思源数据仓库同步。配置同步是优势；runtime、任务、缓存、搜索索引则需要清晰的同步/忽略策略。
- kernel 插件不能直接访问宿主任意文件系统。Local driver 只能作为桌面前端 Electron 能力存在，kernel HTTP 层不应绕过思源网络安全模型访问本地盘。

因此，思盘后续的核心工作不是继续堆 UI，而是把文件能力做成稳定平台：所有上层玩法都通过同一个 OpenList-compatible surface 或思源原生链接协议接入。

## 架构分层

### OpenList 兼容底座

职责：

- 暴露 `/api/*`、`/d/*`、`/p/*`、`/dav/*`、`/s3/*`。
- 保持 route、request 字段、response envelope、错误消息和权限语义尽量对齐 OpenList。
- 维护 driver runtime、mount dispatch、link/read/list/manage/upload/direct-upload 边界。
- 维护用户、权限、meta、share、task、search、archive、torrent、offline 等通用能力。
- 通过 `/api/public/api`、`/api/public/routes`、`/siyuan-cloud/status` 公开机器可读能力清单。

原则：

- 新能力优先对照 `docs/OpenList-main` 相邻源码迁移。
- 不能直接迁移时保留结构化 placeholder，不伪装已完成。
- Dock 和其它插件都以 capability 清单为准，不凭 driver 名或 route 是否存在推断能力。
- 已接 runtime 的驱动也要按方法粒度标记能力：list/get/link/manage/upload/direct-upload/rapid/torrent/offline/other/details。

### 思源原生融合层

职责：

- 把 OpenList 文件路径转换成思源文档中稳定可用的链接、嵌入、资源引用和操作入口。
- 在 FileTab、Dock、文档菜单、块菜单、命令面板、拖拽、粘贴、复制链接等场景中提供原生体验。
- 让思播、思阅、图床、AI、自动化脚本等 companion 插件通过 HTTP API 和普通链接边界协作，而不是硬编码彼此的 `window` 对象。
- 提供 `siyuan://plugins/siyuan-cloud/open?path=...` 这样的入口协议，用于文档内跳转和外部打开。

原则：

- 思盘不直接调用 `window.siyuanMediaPlayer`、`window.sireader` 等插件私有 API。
- 媒体和书籍文件只暴露标准 `raw_url`、`/p/<path>`、`data-href` 或文档链接，让 companion 插件按自己的拦截逻辑处理。
- 图片预览优先使用思源原生 Viewer。
- UI 优先使用思源 `b3-*`、`block__icon`、`protyle-breadcrumb`、`fn__*` class 和主题变量。

## 近期优先级

### P0：能力契约冻结

目标：让思盘从“很多 route 已注册”变成“能力可被可靠发现”。

要做：

- 扩展 `/api/public/api` 的 capability 元数据，区分 `done`、`partial`、`placeholder`、`unsupported`。
- 为每个 driver 输出方法级能力矩阵：`list`、`get`、`link`、`read`、`mkdir`、`rename`、`move`、`copy`、`remove`、`put`、`direct_upload`、`other`、`details`、`rapid_upload`、`torrent`、`offline`。
- Dock 进度、挂载表单、文件右键菜单、archive/torrent/offline 入口都读取 capability，不再只看扩展名或 driver 名。
- 给 companion 插件提供稳定发现入口：`GET /api/public/api`、`GET /api/public/routes`、`GET /siyuan-cloud/status`。

验收：

- smoke test 校验 capability 清单中已完成、部分完成、占位能力的代表项。
- 文档明确每个 `partial` 的缺口和下一步。

### P1：真实异步任务系统

目标：把耗时操作从请求处理里移出，形成所有重能力的公共调度层。

适用能力：

- 大文件上传、跨目录复制/移动、批量删除、批量重命名。
- 搜索索引构建和增量更新。
- 压缩包解压、archive entry range 缓存。
- 离线下载、torrent generate、rapid upload、CAS 秒传。
- 驱动详情扫描、容量刷新、失效链接刷新。

要做：

- 对齐 OpenList `internal/task` 与 `tache` 的任务分组、状态、done/undone、retry、cancel、clear 语义。
- 本地实现 task runner、queue、worker、cancel token、progress reporter。
- 任务状态持久化到 `runtime.json`，但大体积中间数据不能写入 syncable config。
- 提供 HTTP 查询和可选 SSE/RPC 通知。UI 只订阅状态，不轮询大对象。

验收：

- task 可创建、运行、取消、失败、重试、恢复展示。
- 插件重载后可看到历史任务和未完成任务的明确状态。
- 长任务不阻塞 `/ping`、`/siyuan-cloud/status`、普通 list/get。

### P1：搜索索引平台化

目标：搜索成为所有文件能力的公共入口，而不是简单目录查询补丁。

要做：

- 索引构建任务化，支持 running、stop、progress、last_error。
- 支持 storage 级 `disable_index`、全局 `ignore_paths`、路径增量 update。
- search node 扩展保守字段：path、parent、name、is_dir、size、type、modified、storage_id、driver、hash 或 sign。
- 保持 OpenList `PageResp` 和现有 `/api/fs/search` 字段兼容。
- 后续再考虑全文索引或外部后端，不在当前阶段引入大依赖。

融合方向：

- Dock 全局搜索。
- FileTab 当前目录/全局搜索切换。
- 文档中插入云文件时可快速搜索。
- AI 插件可按路径、类型、关键词选择上下文文件。

### P1：安全与权限收口

目标：基础插件必须有可解释、可测试、可迁移的安全模型。

要做：

- 迁移 OpenList `PwdHash/Salt` 密码存储，逐步淘汰轻量明文兼容字段。
- 补 logout token invalidation cache。
- 明确 guest、admin、general user 在私有思源路由保护下的语义。
- 复核分享公开读取、`/sd`、`/@s`、`/sad` 在 creator disabled、base_path 收紧、meta 变化后的失效边界。
- WebDAV/S3 token、SigV4、legacy `siyuan-cloud-port:<id>` token 的权限文档化。
- 配置导入时对用户、token、secret、cookie、refresh_token 做迁移和脱敏策略。

验收：

- 权限 smoke 覆盖 FS、share、task、archive、torrent、search、WebDAV、S3。
- README 或 docs 明确私有路由不是公网匿名分享入口。

### P1：驱动能力真实化

目标：少而真，避免 metadata-only driver 进入用户主流程。

优先顺序：

1. 普通 `189Cloud`：真实账号短信验证后一级/二级目录、大文件上传、cookie 刷新。
2. `189CloudPC`：完整登录、PC AES `params`、上传、CAS/torrent rapid。
3. `115 Cloud`：上传、rapid/pre-hash、OSS multipart、离线相关能力。
4. WebDav/S3：补协议边角兼容、锁、条件请求、metadata/header。
5. 其它高频 OpenList drivers：按真实用户需求和可测试性逐目录迁移。

规则：

- `/api/admin/driver/names` 只展示已接 runtime 或前端可真实处理的 driver。
- `/api/admin/driver/list` 可保留 metadata/config-only，占位必须清晰。
- 每补一个 driver 方法，补 smoke 或 fixture；真实账号限制要在文档里写明。

## 可扩展融合方向

### 文档链接与嵌入

能力：

- 复制 Markdown 图片：`![](/plugin/private/siyuan-cloud/p/<path>)`
- 复制 HTML audio/video：`<audio src="...">`、`<video src="...">`
- 复制普通链接：`siyuan://plugins/siyuan-cloud/open?path=...`
- 复制 OpenList API 链接：`/api/fs/get`、`/p/<path>`、`/d/<path>`
- 批量生成文件清单块：文件名、大小、修改时间、云盘路径、下载链接。

后续可做：

- 文档右键菜单“插入云文件链接”。
- 拖拽云文件到编辑器生成对应 Markdown/HTML/链接。
- 对图片支持插入缩略图链接和原图下载链接。
- 对目录支持插入动态目录索引卡片，点击后打开 FileTab 对应路径。

边界：

- 文档链接必须优先使用 root-relative 私有路径或 `siyuan://plugins`，避免写死 `127.0.0.1:6806`。
- 公开分享链接和私有文档链接要明确区分。

### 媒体播放融合

能力：

- 普通媒体文件走 `/api/fs/get.raw_url` 或 `/p/<path>`。
- companion 播放器可读取 OpenList-compatible API，自行生成播放列表、字幕、封面。
- Dock/FileTab 通过 `data-href` 暴露文件链接，保持普通 DOM 点击边界。

后续可做：

- 文件夹播放列表导出：m3u、json、OpenList-style list。
- 字幕自动配对：同目录同名 `.srt/.ass/.vtt`。
- 记忆播放进度：使用 frontend `plugin.saveData` 或 companion 自己的存储，不写入 driver runtime。
- 外部播放器 scheme：沿用 OpenList Frontend `external_previews`，如 PotPlayer、VLC。
- 媒体元数据缓存：时长、分辨率、字幕列表、封面路径；只做轻量缓存，不在 kernel 解码大媒体。

边界：

- archive 内视频不是普通媒体播放。`/ae` 目前是 entry extract，不是完整 seekable proxy。若要支持压缩包内媒体，需要单独实现 archive entry Range 响应或改为下载/外部打开。

### 阅读器与批注融合

能力：

- PDF、EPUB、MOBI、CBZ 等文件通过 `raw_url` 交给阅读器插件。
- 思盘只提供文件发现、链接、下载、缓存和路径打开。

后续可做：

- “用阅读器打开”作为普通链接/`data-href`，由阅读器插件拦截。
- 文档中插入书籍链接块，包含书名、路径、阅读入口。
- 阅读器插件可把批注回写成思源块，块属性保留 cloud path、mount id、file sign、page/cfi。
- 支持同名 `.opf`、封面图、笔记文件的目录关联。

边界：

- 思盘不保存阅读器私有批注格式，只提供稳定文件标识和访问 URL。

### 图床与附件融合

能力：

- 云盘图片可作为文档图片源。
- 本地 assets 可上传到云盘并返回私有或分享链接。

后续可做：

- “上传当前文档图片到云盘”。
- “把网络图片保存到云盘并替换链接”。
- “复制图床链接”：私有 `/p`、分享 `/sd`、或 driver direct link。
- 批量扫描文档 assets，按规则归档到挂载目录。
- 生成缩略图或低清预览路径，原图保留下载链接。

边界：

- 是否生成公开图床链接取决于分享/发布方案，不能把私有路由当公网图床。

### AI 与知识库融合

能力：

- AI 插件可通过 OpenList API 读取用户选择的云盘文件。
- 搜索索引可成为文件选择器和上下文入口。

后续可做：

- “把云文件加入 AI 上下文”：支持文本、Markdown、PDF 提取后的文本、字幕、代码文件。
- “按目录构建资料集”：生成文件清单、摘要索引、更新时间。
- “文档引用云文件”：块属性保存 path/sign/mtime，AI 可按需取回。
- “远程文件问答”：先走搜索索引，再按类型调用 companion extractor。
- “同步资料库”：定期扫描挂载目录变化，更新思源文档索引页。

边界：

- kernel 不应内置重量级内容解析器。大文件文本抽取应任务化，或交给专门插件/外部工具。
- 权限必须沿用当前 user/base_path/meta，不允许 AI 绕过文件访问边界。

### 自动化与工作流

能力：

- HTTP API 本身就是自动化入口。
- WebDAV/S3 让外部软件把思源云盘当协议端使用。

后续可做：

- 命令面板动作：上传当前文件、复制链接、创建分享、刷新索引、打开挂载目录。
- 批处理规则：按扩展名、大小、修改时间移动/复制/归档。
- 定时任务：刷新 token、刷新容量、重建索引、清理过期分享。
- 导入导出模板：一键创建常用挂载配置、权限和 meta。
- 插件间 workflow：其它插件调用 `/api/fs/put` 上传产物，再把链接插入文档。

边界：

- 定时任务需要和 task manager 绑定，并提供停用/取消/日志，不应在 onload 静默跑大量工作。

### 分享与发布融合

能力：

- 当前分享可以生成 `/sd/{id}` 私有路由下载/预览入口。
- 管理侧已有 owner、base_path、meta 复核初版。

后续可做：

- 分享页更接近 OpenList：目录列表、文件预览、密码页、过期提示。
- 分享与思源文档联动：从文档中选中文件链接创建分享，回填分享 URL。
- 分享访问日志、访问次数、过期清理任务。
- 发布模式研究：思源 publish 当前不能直接暴露 private plugin route，若要公网分享，需要明确 bridge 设计。
- 外部 OpenList 同步：把思盘挂载导出为 OpenList 配置，或反向接入外部 OpenList。

边界：

- 在思源 private route 之上做公网匿名分享会被本体权限挡住。不要在 UI 上暗示它是公网链接。

### 资源库与虚拟文件系统

能力：

- 当前虚拟 FS、workspace adapter、mounted driver 已有统一 list/get/link/manage 表面。

后续可做：

- 聚合视图：最近文件、收藏文件、图片库、视频库、书库、压缩包库。
- 标签和 meta：给云文件打标签、备注、访问密码、隐藏规则。
- 虚拟目录：按类型/时间/标签/search query 展示，不改变真实云盘路径。
- 文件关系：同名字幕、封面、说明文档、压缩包 entry、torrent CAS 元数据。
- 去重视图：按 hash/sign/size/name 发现重复文件。

边界：

- 虚拟目录必须清楚标记为 view，不应伪装真实可写目录，除非有明确写入规则。

### 协议服务融合

能力：

- WebDAV 和 S3 surface 已有骨架，可让外部工具访问思盘挂载。

后续可做：

- WebDAV lock/etag/condition header 细节补齐。
- S3 metadata、multipart、range、copy、delete markers 等细节增强。
- bucket 到 path 的管理 UI。
- 外部工具配置向导：Zotero、播放器、备份软件、文件同步器。

边界：

- 协议服务仍跑在思源私有路由权限下，外部工具需要能带 cookie/token 或处在受信环境。
- 大量外部同步工具会产生高频请求，需要 cache、rate limit 和任务隔离。

### 压缩包与归档融合

能力：

- ZIP stored/deflate、tar、tgz 的 meta/list/extract/decompress 已有初版。
- mounted ZIP 可走 range reader，避免整包拉取。

后续可做：

- archive entry Range 响应，用于压缩包内媒体 seek。
- 解压任务化，支持取消、进度、覆盖策略。
- 压缩包内容索引：把 entry name 写入 search index。
- RAR/7z/ISO 只在 reader、许可证、wasm 打包、fixture 全部明确后接入。
- 压缩包内文件生成临时分享或外部打开链接。

边界：

- 加密 ZIP 当前只检测不解密；不要把 `pass/archive_pass` 做成假成功。

## 插件间集成契约

其它插件应优先使用这些入口：

- Base URL：`/plugin/private/siyuan-cloud`
- 能力发现：`GET /api/public/api`、`GET /api/public/routes`、`GET /siyuan-cloud/status`
- 文件读取：`POST /api/fs/get`、`POST /api/fs/list`
- 播放/下载：`/p/<path>`、`/d/<path>`
- 打开思盘：`siyuan://plugins/siyuan-cloud/open?path=<encoded path>`
- 协议入口：`/dav/*`、`/s3/*`

集成方不应依赖：

- 思盘前端内部 Vue 组件。
- `window.siyuanCloud` 这类未定义全局对象。
- 其它 companion 插件的私有 window API。
- 未在 capability 清单中声明为 `done/partial` 的行为。

## 数据与同步策略

建议长期拆分：

- `config.json`：settings、users、storages、metas、sharings、ssh_keys。可同步。
- `runtime.json`：tasks、messages、scan、webdav locks、s3 multipart、虚拟 FS。默认可同步但应提供说明。
- `search-index.json`：搜索索引。通常可重建，未来可提供不参与同步的选项或清理入口。
- driver cache/link cache：短期内存缓存优先，必要持久化时单独存放并可清理。
- 大文件临时数据：不要写入 `siyuan.storage`，优先 stream/range/task 临时态。

后续 UI：

- 设置页显示当前 storage 是否被 `.siyuan/syncignore` 忽略。
- 提供复制 syncignore 规则。
- 提供清理 runtime/search/cache 的按钮。

## 验证策略

每个 capability batch 必须同时更新：

- `pnpm test:kernel`
- `pnpm build`
- `docs/siyuan-cloud-migration-plan.md`
- `docs/kernel-architecture.md`
- `docs/kernel-plugin-notes.md`
- 本文档中对应路线或边界
- Dock status/capability 文案

建议新增测试维度：

- capability matrix smoke：确保公开能力和真实 route/driver 方法一致。
- long task smoke：创建、取消、重试、恢复。
- companion contract smoke：`fs/get.raw_url`、`/p` Range header、`data-href` 链接。
- sync split smoke：config 更新不误写 runtime/search，runtime/search 清理不破坏 config。

## 建议实施顺序

1. 能力契约冻结：扩展 `/api/public/api` 与 status capability matrix。
2. 真实异步 task manager：为后续重能力铺路。
3. 搜索索引任务化和增量化。
4. 安全模型收口：密码哈希、logout invalidation、分享复核。
5. 189Cloud/189PC/115 等高优驱动真实能力补齐。
6. 文档链接、拖拽插入、复制链接、图床/阅读器/播放器 companion 契约增强。
7. 离线下载、torrent CAS、archive entry Range 这类重能力在 task manager 上继续扩展。

长期判断：思盘最有价值的位置不是替代 OpenList，而是把 OpenList 的文件能力嵌进思源的知识工作流。OpenList-compatible API 保证生态和可迁移性，思源原生融合层决定它是否真正好用。
