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
- `/api/fs/get` 负责返回 OpenList object data；媒体播放优先使用 `raw_url`。需要代理的 storage 返回 `/plugin/private/siyuan-cloud/p/<path>`，非代理 storage 可以保留 driver `Link()` URL。
- `/d/<path>` 和 `/p/<path>` 走 `fs.Link -> common.Proxy -> body.proxy`，不要恢复 per-driver 播放补丁。

## 流式代理边界

当前思源本体需要带 PR #17748 的 kernel plugin `body.proxy` 能力。插件的 `src/kernel/server/common/proxy.js` 对齐 OpenList `server/common/proxy.go`：driver `read()` 返回 `model.Link` 风格 URL/header，公共代理层合并浏览器请求头和 driver header，保留 `Range` / `If-Range` 等播放器请求头，过滤 hop-by-hop header，并交给思源 `body.proxy`。思源内核负责校验 http/https、限制 GET/HEAD、使用 SSRF-safe dialer、禁用自动解压、服务端受控跟随下载重定向并保留代理请求头、复制最终上游状态和安全响应头、过滤 `Set-Cookie`，并把上游 body 直接流式写回客户端。

`/api/network/forwardProxy` 只用于云盘 API 请求、登录刷新、链接解析、HEAD 探测和小体积元数据，不再作为视频/音频正文代理。新增 driver 时，能拿到下载 URL 的路径应优先实现 `Link()`/`read()` 返回 link，然后复用 `/d` 和 `/p`。

## Mount 与 Driver

存储挂载按最长 `mount_path` 分派。`driverRuntime.resolve` 给 driver 注入 storage-scoped `saveDriverStorage` callback，用来复刻 OpenList `MustSaveDriverStorage -> saveDriverStorage` 边界。

当前已有初始 runtime adapter：

- `OpenList` / `AListV3`
- `WebDav`
- `S3` / `Doge`
- `OneDrive`
- `123Pan`
- `BaiduNetdisk`
- `AliyundriveOpen`
- `189Cloud`
- `Quark`
- `Local`

`/api/admin/driver/names` 只暴露已接 runtime 的驱动，Dock 挂载列表不再显示 metadata-only driver。其他 OpenList driver 名称仍保留在 `src/kernel/internal/driver/info.js` 和 `/api/admin/driver/list` 作为 metadata/config-only placeholder，等待按 `docs/OpenList-main/drivers/*` 继续迁移。`Local` 在 SiYuan kernel runtime 中映射到 workspace-relative `/api/file`，不会直接访问任意宿主机绝对路径。

当前已对照 `docs/OpenList-main/drivers/*/meta.go` 做过一轮字段/config 校正：WebDav、123Pan 保持 `PreferProxy`；S3/Doge 保持 `CheckStatus` 并补齐 upstream addition 字段；OpenList 保留 `ProxyRangeOption` / `LinkCacheMode=auto` metadata；AliyundriveOpen、Quark、Local 保留 upstream default root、no overwrite、no cache/no link url 等 config 差异；115 Cloud 只保留 metadata，不进入 Dock 挂载列表。

驱动下载/播放边界按 OpenList `Link(ctx, file, args) -> common.Proxy` 组织。OneDrive、123Pan、WebDav、BaiduNetdisk、AliyundriveOpen、189Cloud、Quark 等 runtime adapter 的 `read()` 应返回 `model.Link` 风格数据，由 `/d`、`/p` 统一交给 `src/kernel/server/common/proxy.js` 和 SiYuan `body.proxy`。不要让具体 driver 自行下载完整文件正文作为播放路径。

## 前端边界

- `src/components/FileTab.vue` 是主文件管理 Tab，顶部按钮和右键菜单接入上传、下载、新建、重命名、复制、移动、删除。
- `src/utils/api.ts` 对齐 OpenList Frontend `utils/api.ts`，只放 FS helper。
- `src/utils/request.ts` 对齐 OpenList Frontend `utils/request.ts` 的 `r.post/r.put` 边界，并适配 SiYuan 私有路由前缀。
- `src/utils/handle_resp.ts` 对齐 OpenList Frontend `utils/handle_resp.ts`，把 notify 映射到 `showMessage`。
- `src/utils/dock.ts` 只承载 Dock 管理流：登录、挂载、driver form、config import/export、`external_previews`、验证。
- `src/utils/icon.ts` 保留文件图标映射。

UI 原则：优先使用 SiYuan 原生 `b3-*`、`block__icon`、`protyle-breadcrumb`、`fn__*` class 和 `var(--b3-*)` 变量，不新增视觉体系。文件管理按钮保持在路径/搜索右侧。

对外集成边界是 OpenList-compatible HTTP API，而不是前端 `window` 对象。其他项目把 `/plugin/private/siyuan-cloud` 当作 OpenList base URL，直接调用 `/api/*`、`/d/*`、`/p/*`、`/dav/*`、`/s3/*`。`/api/public/api` 和 `/api/public/routes` 返回机器可读的当前 route/capability 清单，避免另维护一份 150+ API 表。

外部软件打开沿用 OpenList Frontend 的 URL Scheme 机制：`external_previews` 保存扩展名到 scheme 模板的映射，第三方播放器插件可通过 HTTP API 读取 `/api/admin/setting/get?key=external_previews`，再按 OpenList Frontend `convertURL` 规则自行生成 `potplayer://$durl`、`vlc://$durl` 等链接。

## 状态与同步

- Frontend/Dock 偏好：`plugin.loadData/saveData`。
- Kernel runtime state：`siyuan.storage`，当前状态文件为 `siyuan-cloud/state.json`。
- 根据思源源码，`data/storage/petal/<plugin>` 默认位于同步仓库内；用户可用 `.siyuan/syncignore` 排除 `/storage/petal/**` 或 `/storage/petal/siyuan-cloud/**`。

## 验证

- `pnpm build`：构建前端和内核 bundle。
- `node --check dist/kernel.js`：检查生成内核 JS 语法。
- `pnpm test:kernel`：运行 `scripts/kernel-route-smoke.mjs`，覆盖 status、FS、task、meta、share、WebDAV、S3、archive placeholder 等 route。
- i18n key diff：确认 `src/i18n/en_US.json` 与 `src/i18n/zh_CN.json` key 完全一致。
