# 思盘迁移计划

目标：把 OpenList 的核心能力迁移成独立的思源内核插件 `siyuan-cloud`，不启动 OpenList Go 后端，不修改思源源码，并尽可能保持 OpenList API、目录结构、字段名、响应形状和控制流兼容。

## 迁移原则

- 不把 OpenList Go 后端作为运行依赖；在思源内核插件 JavaScript runtime 中复刻兼容行为。
- 目录和模块名尽量对齐 OpenList，方便后续直接对照 `docs/OpenList-main` 与 `docs/OpenList-Frontend-main` 继续复制/适配。
- 优先复制 OpenList 的 route、request/response 字段、status message 和控制流；只有 Go-only 依赖、外部进程、数据库或思源内核 API 不支持时才改写。
- 受阻能力必须保留结构化兼容占位，不静默改成另一套行为。
- 不手改生成物；内核源码写在 `src/kernel/**`，通过 `pnpm dev` 或 `pnpm build` 生成目标插件目录里的 `kernel.js`。
- 前端插件设置使用 `plugin.loadData/saveData`；OpenList runtime state、用户、存储、分享、虚拟 FS 使用 `siyuan.storage`。

## 源码参考

- OpenList 后端：`docs/OpenList-main`
- OpenList 前端：`docs/OpenList-Frontend-main`
- OpenList router：`docs/OpenList-main/server/router.go`
- OpenList common response：`docs/OpenList-main/server/common/common.go`
- OpenList handlers：`docs/OpenList-main/server/handles`
- OpenList FS/op/driver：`docs/OpenList-main/internal/fs`、`docs/OpenList-main/internal/op`、`docs/OpenList-main/drivers`
- 思源内核插件：`docs/siyuan-master/kernel/plugin`
- 思源文件 API：`docs/siyuan-master/kernel/api/file.go`

## 当前结构

| 本插件目录 | 对齐 OpenList | 状态 |
| --- | --- | --- |
| `src/kernel/server/common` | `server/common` | 响应 envelope、分页、文本/JSON/proxy 已拆分 |
| `src/kernel/server/handles` | `server/handles` | auth/fs/admin/share/task/archive/public/status 按 handler 迁移 |
| `src/kernel/server/router.js` | `server/router.go` | 私有路由、下载、代理、协议入口集中分发 |
| `src/kernel/server/webdav.js` | `server/webdav.go` | WebDAV 表面和虚拟 FS 读写已接入 |
| `src/kernel/server/s3.js` | `server/s3.go` / `server/s3/*` | 默认 bucket、对象读写、multipart 骨架已接入 |
| `src/kernel/internal/conf` | `internal/conf` | 常量、任务类型、设置结构 |
| `src/kernel/internal/model` | `internal/model` | path、meta、args、storage/user/obj 辅助 |
| `src/kernel/internal/fs` | `internal/fs` | virtual、workspace、archive 边界 |
| `src/kernel/internal/driver` | `internal/driver` / `drivers/*` | driver info、mount dispatch、运行时适配器；具体驱动按 OpenList 源目录放在 `src/kernel/internal/driver/<driver>/driver.js` |
| `src/kernel/internal/bootstrap/data` | `internal/bootstrap/data` | 默认 users/settings/metas/storage |
| `src/utils/api.ts` | OpenList Frontend `utils/api.ts` | FS helper 复制 OpenList route 和 payload 形状 |
| `src/utils/request.ts` | OpenList Frontend `utils/request.ts` | 本地 `r.post` / `r.put` 适配 `/plugin/private/siyuan-cloud/api` |
| `src/utils/handle_resp.ts` | OpenList Frontend `utils/handle_resp.ts` | 保留 OpenList response 分流，notify 映射到 SiYuan `showMessage` |

## 已完成批次

| 阶段 | 结果 | 验证 |
| --- | --- | --- |
| 插件外壳 | 顶栏入口、Dock、文件管理自定义 Tab、账户/挂载/设置/进度面板 | 思源内启用插件后可打开 Dock 和文件 Tab |
| API 契约 | `/api/auth/*`、`/api/fs/*`、`/api/admin/*`、`/api/public/*`、`/api/task/*`、`/api/share/*` 保持 OpenList-style envelope | `pnpm test:kernel` |
| 虚拟 FS | list/get/put/form/mkdir/remove/rename/copy/move/download/proxy 已接入 | smoke test 覆盖文本和二进制回读 |
| 前端 FS 操作 | FileTab 顶部按钮和右键菜单接入上传、下载、新建、重命名、复制、移动、删除 | `fs*` helper + `handle_resp.ts` 统一处理 |
| 代理播放 | `/api/fs/get.raw_url`、`/api/fs/link.raw_url`、`/d`、`/p` 走 `fs.Link -> common.Proxy -> body.proxy` 边界；Range/header 交给思源 `body.proxy` 流式转发 | 播放器插件可直接调用 OpenList HTTP API，图片走 SiYuan Viewer |
| 驱动首批运行时 | OpenList/AListV3、WebDav、S3/Doge、OneDrive、123Pan、BaiduNetdisk、AliyundriveOpen、189Cloud、Quark、Local 有初始 runtime adapter | 通过最长 `mount_path` dispatch；Dock 只列出已接 runtime 的驱动 |
| 管理面板 | driver names/info、storage create/update/enable/disable/delete、config import/export | Dock 挂载表单可验证 |
| WebDAV/S3 | WebDAV 读写和 LOCK/UNLOCK/PROPPATCH 骨架，S3 list/get/put/delete/copy/multipart 骨架 | smoke test 覆盖主要表面 |

## 本轮整理

- 删除未使用的 `src/utils/index.ts`，避免留下无用 barrel 和旧 helper。
- `src/utils/api.ts` 只保留 OpenList 前端式 FS helper，不再重复 request 实现。
- `src/utils/request.ts` 作为唯一 request/r adapter，保留通用 `openListJson` 给 Dock 管理流使用。
- `src/utils/handle_resp.ts` 的类型引用改到 `request.ts`，避免通过 `api.ts` 绕回形成概念重复。
- `src/index.ts` 的 `siyuan://plugins/siyuan-cloud/open` 只打开代理 URL，不再解析媒体或调用播放器插件。
- Dock 的 FS round-trip 验证改用 `fsMkdir/fsNewFile/fsGet`，请求形状贴近 OpenList 前端 `api.ts`。
- `POST /api/fs/get_direct_upload_info` 在不支持直传时返回 `success(null)`，对齐 OpenList `direct_upload.go`。
- `PUT /api/fs/put` / `PUT /api/fs/form` 解码 `File-Path`，对齐 OpenList `fsup.go`。
- `src/components/FileTab.vue` 顶部工具栏回到 SiYuan 原生 `protyle-breadcrumb` / `block__icon` class 组合，删除路径输入的插件自定义尺寸样式。
- `src/components/FileTab.vue` 文件列表交互继续贴近 OpenList 前端：顶部工具栏选择按钮控制 checkbox 显示，checkbox 负责选择/全选，点击条目负责打开，批量操作按钮由选中项启用，并删除桌面式单击选择/双击打开逻辑。
- 新增 `/api/public/api` 和 `/api/public/routes` 机器可读索引，其他项目可把 `/plugin/private/siyuan-cloud` 当作 OpenList-compatible base URL，直接调用 `/api/*`、`/d/*`、`/p/*`、`/dav/*`、`/s3/*`。
- Dock 设置页保留 OpenList 兼容 `external_previews` JSON 编辑；PotPlayer 等播放器仍然是前端 URL Scheme，不是后端进程启动 API，FileTab 不内置外部播放器菜单，播放器插件按 OpenList HTTP API 和 OpenList Frontend URL 转换规则自行实现交互。
- 驱动实现文件架构对齐 OpenList：`openlist/driver.js`、`webdav/driver.js`、`s3/driver.js`、`onedrive/driver.js`、`baidu_netdisk/driver.js`、`aliyundrive_open/driver.js`、`189/driver.js`、`quark_uc/driver.js`、`local/driver.js` 等都放在对应驱动目录下。
- `/api/admin/driver/names` 现在只返回已接 runtime 的挂载项；未实现驱动仍保留在 `driver/list` / `driver/info` 的 metadata 中，方便后续按 OpenList 字段继续迁移，但不会出现在 Dock 可选挂载列表。
- 新增 AliyundriveOpen、189Cloud、Quark、Local 的初始 list/get/read/link 和基础管理适配；Local 在 SiYuan kernel runtime 中映射到 workspace-relative `/api/file`，不直接读取任意宿主机绝对路径。
- 115 Cloud / 115 Open 暂不暴露到挂载列表：OpenList 实现依赖第三方 Go SDK、115 ECDH 登录/秒传和 OSS 上传栈，需要单独迁移 JS 兼容层后再打开。
- 重新对照 `docs/OpenList-main/drivers/*/meta.go` 和 `driver.go`：WebDav、123Pan 按 OpenList `PreferProxy` 标记；S3/Doge 补齐 custom host presign、sign expire、placeholder、remove bucket、filename disposition、direct upload host 等 addition 字段；AliyundriveOpen、Quark、Local 补齐 default root / no overwrite / no cache / no link url 等 config 差异；115 Cloud 的 `cookie`、`qrcode_token` 改回 text metadata，并保持 metadata-only。
- OneDrive、123Pan、WebDav 的读取路径已从“driver 自己通过 `forwardProxy` 拉取 base64 内容”改为 OpenList 的 `Link()` 形态：driver 返回 `model.Link` 风格 URL/header，`/d` 和 `/p` 统一进入 `server/common/proxy.js -> body.proxy`。123Pan 的 `Referer` 继续按 OpenList 使用下载接口原始 URL 的 scheme/host。
- Dock 进度状态和 `/siyuan-cloud/status.adapters` 已同步到当前 runtime 驱动：OpenList/AListV3、WebDav、S3/Doge、OneDrive、123Pan、BaiduNetdisk、AliyundriveOpen、189Cloud、Quark、Local。

## 2026-05-26 流式代理补齐

- 已把 SiYuan PR #17748 的 kernel plugin `body.proxy` 能力写入文档：思源内核侧校验 `http/https` 和 `GET/HEAD`，过滤 hop-by-hop header，使用 SSRF-safe dialer，不自动解压，服务端受控跟随下载重定向并保留 `Range` / `User-Agent` 等代理请求头，最后以流式方式复制最终上游状态、安全响应头和 body，并过滤上游 `Set-Cookie`。
- `src/kernel/server/common/proxy.js` 进一步对齐 OpenList `common.Proxy`：合并浏览器/player 请求头和 driver `model.Link` header，保留 `Range` / `If-Range` 等播放关键头，按大小写去重，并过滤 `Connection` 声明的逐跳头。
- `/api/fs/link.raw_url` 与 `/api/fs/get.raw_url` 统一按 OpenList 代理策略返回：`web_proxy` / `PreferProxy` / `OnlyProxy` / `NoLinkURL` 返回 `/plugin/private/siyuan-cloud/p/<path>`，否则保留 driver `Link()` URL。
- Dock 迁移进度新增 `streaming-proxy` 阶段；smoke test 新增 OneDrive 直链 raw_url 和 Baidu 代理 raw_url 的覆盖，防止后续回退到全量 `/p` 或 per-driver 媒体补丁。

## 下一步

1. 继续从 `docs/OpenList-main/drivers/*` 迁移真实驱动上传、直传和大文件分片行为，优先 BaiduNetdisk、OneDrive、123Pan、AliyundriveOpen、Quark、189Cloud、WebDav、S3。
2. 补齐 OpenList 前端剩余 FS helper 对应的后端占位或真实行为，包括 dirs、batch_rename、recursive_move、remove_empty_directory、archive、offline download。
3. 扩展 smoke test，让每个稳定 route family 都有最小 OpenList-compatible 断言。
4. 继续审查 UI：文件管理 Tab 和 Dock 优先使用 SiYuan 原生 `b3-*`/`block__icon` 样式，不新增视觉体系。
5. 每完成一个 capability batch，同步更新本计划、`docs/kernel-architecture.md`、`docs/kernel-plugin-notes.md` 和 Dock 进度文案。
