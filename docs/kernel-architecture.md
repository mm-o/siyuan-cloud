# 内核侧架构

思源加载插件包目录里的 `kernel.js`。仓库不维护根目录生成物；源码入口是 `src/kernel/index.js`，构建由 Vite 输出到 `dist/kernel.js` 或开发插件目录。

```text
src/kernel/**/*.js -> Vite kernel build step -> dist/kernel.js
```

## OpenList 对齐映射

| 本插件目录 | OpenList 参考 | 作用 |
| --- | --- | --- |
| `src/kernel/server/common` | `server/common` | `success/failure` envelope、分页响应、JSON/text/raw/proxy 响应 |
| `src/kernel/server/handles` | `server/handles` | auth、fs、admin、share、task、archive、public、status handlers |
| `src/kernel/server/router.js` | `server/router.go` | 私有 route table、下载路由、代理路由、协议入口 |
| `src/kernel/server/webdav.js` | `server/webdav.go` / `server/webdav/*` | WebDAV 兼容表面 |
| `src/kernel/server/s3.js` | `server/s3.go` / `server/s3/*` | S3 bucket/object/multipart 兼容表面 |
| `src/kernel/internal/conf` | `internal/conf` | 设置、任务类型和兼容常量 |
| `src/kernel/internal/model` | `internal/model` | path、meta、args、storage/user/obj 模型辅助 |
| `src/kernel/internal/fs` | `internal/fs` | virtual FS、workspace adapter、archive 边界 |
| `src/kernel/internal/driver` | `internal/driver` / `drivers/*` | driver info、mount runtime、具体云盘适配；具体驱动使用 OpenList 源目录名，例如 `onedrive/driver.js` 对齐 `drivers/onedrive/driver.go` |
| `src/kernel/internal/bootstrap/data` | `internal/bootstrap/data` | 默认 users/settings/metas/storages |

长期规则：新增能力优先复制 OpenList 相邻源码结构；无法直接迁移时保留兼容占位，并在文档中标明原因和下一步。

## 请求流

```text
SiYuan frontend
  -> /plugin/private/siyuan-cloud/*
  -> src/kernel/server/router.js
  -> src/kernel/server/handles/*
  -> src/kernel/internal/fs or internal/driver
  -> siyuan.storage / SiYuan API / forwardProxy
```

OpenList-compatible JSON 响应统一使用：

```json
{ "code": 200, "message": "success", "data": {} }
```

## FS 边界

- `src/kernel/server/handles/fs.js` 保持 OpenList `server/handles/fs*.go` 的 route 和字段形状。
- `PUT /api/fs/put` 和 `PUT /api/fs/form` 使用 `File-Path`、`Password`、`Overwrite` header，`File-Path` 会 URL decode。
- `POST /api/fs/get_direct_upload_info` 在不支持直传时返回 `success(null)`，对齐 OpenList direct-upload 行为。
- `/api/fs/copy` 和 `/api/fs/move` 的 `skip_existing` 行为对齐 OpenList：冲突项可跳过，后续 names 继续处理；copy 的 `merge` 只在目标为目录时继续。
- `/api/fs/torrent/parse`、`/api/fs/torrent/upload_parse`、`/api/fs/torrent/rapid_upload`、`/api/fs/torrent/generate` 已注册结构化兼容占位，等待迁移 JS bencode/torrent reader 和 189/189PC CAS 秒传行为。
- `/api/fs/get` 负责返回 OpenList object data；媒体播放优先使用 `raw_url`。需要代理的 storage 返回 `/plugin/private/siyuan-cloud/p/<path>`，非代理 storage 可以保留 driver `Link()` URL。
- `/d/<path>` 和 `/p/<path>` 走 `fs.Link -> common.Proxy -> body.proxy`，不要恢复 per-driver 播放补丁。

## 流式代理边界

当前思源本体需要带 PR #17748 的 kernel plugin `body.proxy` 能力。插件的 `src/kernel/server/common/proxy.js` 对齐 OpenList `server/common/proxy.go`：driver `read()` 返回 `model.Link` 风格 URL/header，公共代理层合并浏览器请求头和 driver header，保留 `Range` / `If-Range` 等播放器请求头，过滤 hop-by-hop header，并交给思源 `body.proxy`。思源内核负责校验 http/https、限制 GET/HEAD、使用 SSRF-safe dialer、禁用自动解压、服务端受控跟随下载重定向并保留代理请求头、复制最终上游状态和安全响应头、过滤 `Set-Cookie`，并把上游 body 直接流式写回客户端。

`/api/network/forwardProxy` 只用于云盘 API 请求、登录刷新、链接解析、HEAD 探测和小体积元数据，不再作为视频/音频正文代理。新增 driver 时，能拿到下载 URL 的路径应优先实现 `Link()`/`read()` 返回 link，然后复用 `/d` 和 `/p`。

## Mount 与 Driver

存储挂载按最长 `mount_path` 分派。`driverRuntime.resolve` 对齐 OpenList `op.GetStorageAndActualPath` 的边界：HTTP 层路径只在这里拆成 storage 和挂载内 `actualPath`，driver 只接收挂载内路径。`driverRuntime.resolve` 同时给 driver 注入 storage-scoped `saveDriverStorage` callback，用来复刻 OpenList `MustSaveDriverStorage -> saveDriverStorage` 边界。

当前已有初始 runtime adapter：

- `OpenList` / `AListV3`
- `WebDav`
- `S3` / `Doge`
- `OneDrive`
- `123Pan`
- `BaiduNetdisk`
- `AliyundriveOpen`
- `189Cloud`
- `189CloudPC`
- `189CloudTV`
- `Quark`
- `UC`
- `QuarkOpen`
- `QuarkTV`
- `UCTV`
- `Local`

`/api/admin/driver/names` 只暴露已接 runtime 的驱动，Dock 挂载列表不再显示 metadata-only driver。其他 OpenList driver 名称仍保留在 `src/kernel/internal/driver/info.js` 和 `/api/admin/driver/list` 作为 metadata/config-only placeholder，等待按 `docs/OpenList-main/drivers/*` 继续迁移。`Local` 在 SiYuan kernel runtime 中映射到 workspace-relative `/api/file`，不会直接访问任意宿主机绝对路径。

当前已对照 `docs/OpenList-main/drivers/*/meta.go` 做过一轮字段/config 校正：WebDav、123Pan 保持 `PreferProxy`；S3/Doge 保持 `CheckStatus` 并补齐 upstream addition 字段；OpenList 保留 `ProxyRangeOption` / `LinkCacheMode=auto` metadata；AliyundriveOpen、Quark/UC/QuarkOpen/QuarkTV/UCTV、Local 保留 upstream default root、no overwrite、no upload、only proxy、no cache/no link url 等 config 差异；普通 `Quark` 不固定 `PreferProxy`，而是在新建/更新挂载时按 OpenList `Init` 语义，仅当未启用 `use_transcoding_address` 时默认写入 `web_proxy=true`；115 Cloud 只保留 metadata，不进入 Dock 挂载列表。

驱动下载/播放边界按 OpenList `Link(ctx, file, args) -> common.Proxy` 组织。OneDrive、123Pan、WebDav、BaiduNetdisk、AliyundriveOpen、189Cloud、189CloudPC、189CloudTV、Quark/UC/QuarkOpen/QuarkTV/UCTV 等 runtime adapter 的 `read()` 应返回 `model.Link` 风格数据，由 `/d`、`/p` 统一交给 `src/kernel/server/common/proxy.js` 和 SiYuan `body.proxy`。不要让具体 driver 自行下载完整文件正文作为播放路径。

`src/kernel/internal/driver/common.js` 提供轻量 storage-scoped list/file/link cache，用来贴近 OpenList `internal/op/cache.go` 的 `dirCache` / `linkCache` 行为。BaiduNetdisk、AliyundriveOpen、Quark/UC、QuarkOpen、QuarkTV/UCTV 等播放路径必须复用对象解析和下载链接，避免播放器每个 Range 请求都重新逐层 list、重新取直链；管理操作后清理对应 storage cache。

189CloudPC 和 189CloudTV 的首批迁移对照 `docs/OpenList-main/drivers/189pc` 与 `docs/OpenList-main/drivers/189_tv`：已接入 OpenList `List`、`Link`、`MakeDir`、`Move`、`Copy`、`Remove`、`Rename` 的签名请求边界和 addition 字段；完整密码/二维码登录、PC AES `params`、上传、家庭云中转、rapid/CAS/torrent 仍是结构化占位，后续继续按上游相邻文件复制。189PC/TV 的 session 签名请求实现分别放在 `src/kernel/internal/driver/189pc/session.js` 和 `src/kernel/internal/driver/189_tv/session.js`，不再使用根级 189 公共文件，确保每个驱动目录可以独立对照 OpenList 源目录继续迁移。

Quark 系列按 OpenList 源目录拆分：`quark_uc/driver.js` 对齐 `drivers/quark_uc` 并注册 `Quark`/`UC`，`quark_open/driver.js` 对齐 `drivers/quark_open` 并注册 `QuarkOpen`，`quark_uc_tv/driver.js` 对齐 `drivers/quark_uc_tv` 并注册 `QuarkTV`/`UCTV`。Quark/UC 的 OpenList `File.GetPath()` 返回空，HTTP list/get 由 `server/handles/fsread.go` 的 `ObjResp` 生成响应；本端同样在 `/api/fs/list` 和 `/api/fs/get` 边界收敛字段，不向外返回 driver 私有 `path`。QuarkOpen 已迁移 signed request、online API token refresh、list/link/basic management；QuarkTV/UCTV 已迁移 device/query token 保存、refresh token、list/link，并保持 OpenList 上游对管理和上传方法的 `NotImplement` 边界。Quark 系列已接入 storage-scoped list/file/link cache，连续 `/p` Range 播放请求不会重复请求 Quark 目录接口和下载链接接口；普通 Quark 的转码链接路径保持 OpenList 行为，新建挂载启用 `use_transcoding_address` 时默认不额外套 `/p` 代理。

Dock 表单的新挂载默认值允许少量体验型偏置：BaiduNetdisk 默认 `download_api=crack_video`，普通 Quark 默认 `use_transcoding_address=true`，QuarkTV/UCTV 默认 `link_method=streaming`；这些只影响新建/编辑表单的 addition 默认值，不自动改写既有挂载。

## 前端边界

- `src/components/FileTab.vue` 是主文件管理 Tab，顶部按钮和右键菜单接入上传、下载、新建、重命名、复制、移动、删除。
- `src/utils/api.ts` 对齐 OpenList Frontend `utils/api.ts`，只放 FS helper。
- `src/utils/request.ts` 对齐 OpenList Frontend `utils/request.ts` 的 `r.post/r.put` 边界，并适配 SiYuan 私有路由前缀。
- `src/utils/handle_resp.ts` 对齐 OpenList Frontend `utils/handle_resp.ts`，把 notify 映射到 `showMessage`。
- `src/utils/dock.ts` 只承载 Dock 管理流：登录、挂载、driver form、config import/export、`external_previews`、验证。
- `src/utils/status.ts` 固定使用私有 HTTP status route，避免当前 SiYuan kernel plugin 的 `/ws/plugin/rpc` 通知通道偶发握手失败影响 Dock；内核仍保留 `siyuan-cloud.status` RPC 供 smoke 和后续能力验证。
- `src/utils/icon.ts` 保留文件图标映射。

UI 原则：优先使用 SiYuan 原生 `b3-*`、`block__icon`、`protyle-breadcrumb`、`fn__*` class 和 `var(--b3-*)` 变量，不新增视觉体系。文件管理按钮保持在路径/搜索右侧。

对外集成边界是 OpenList-compatible HTTP API，而不是前端 `window` 对象。其他项目把 `/plugin/private/siyuan-cloud` 当作 OpenList base URL，直接调用 `/api/*`、`/d/*`、`/p/*`、`/dav/*`、`/s3/*`。`/api/public/api` 和 `/api/public/routes` 返回机器可读的当前 route/capability 清单，避免另维护一份 150+ API 表。

Companion 插件集成复用普通链接点击边界，不进入内核 API。文件管理 Tab 的媒体和书籍文件名只暴露 OpenList-compatible `/p/<path>` 为 DOM `data-href`，由思播、思阅等 companion 插件按它们已有的文档链接拦截逻辑消费。思盘不调用 `window.siyuanMediaPlayer` / `window.sireader`，不派发插件专用事件，也不绕开 OpenList 的 `fs.Link -> common.Proxy -> body.proxy` 边界；`siyuan://plugins/<plugin>/...` 更适合作为文档链接或外部入口协议。

外部软件打开沿用 OpenList Frontend 的 URL Scheme 机制：`external_previews` 保存扩展名到 scheme 模板的映射，第三方播放器插件可通过 HTTP API 读取 `/api/admin/setting/get?key=external_previews`，再按 OpenList Frontend `convertURL` 规则自行生成 `potplayer://$durl`、`vlc://$durl` 等链接。

## 状态与同步

- Frontend/Dock 偏好：`plugin.loadData/saveData`。
- Kernel runtime state：`siyuan.storage`，当前状态文件为 `siyuan-cloud/state.json`。
- 根据思源源码，`data/storage/petal/<plugin>` 默认位于同步仓库内；用户可用 `.siyuan/syncignore` 排除 `/storage/petal/**` 或 `/storage/petal/siyuan-cloud/**`。

## 验证

- `pnpm build`：构建前端和内核 bundle。
- `node --check dist/kernel.js`：检查生成内核 JS 语法。
- `pnpm test:kernel`：运行 `scripts/kernel-route-smoke.mjs`，覆盖 status HTTP/RPC、FS、task、meta、share、WebDAV、S3、archive/torrent placeholder 等 route，以及 Quark 目录名尾随空格和连续 `/p` Range 请求缓存路径。
- i18n key diff：确认 `src/i18n/en_US.json` 与 `src/i18n/zh_CN.json` key 完全一致。
