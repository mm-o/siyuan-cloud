# 内核侧架�?
思源最终加载插件包目录里的 `kernel.js`，但这个文件只在 `pnpm dev` �?`pnpm build` 的目标输出目录生成，仓库根目录不再维护它�?
源码入口�?
```text
src/kernel/index.js
```

构建流程�?
```text
src/kernel/**/*.js -> Vite kernel build step -> dist/kernel.js
```

## 目录对应 OpenList

| 本插件目�?| 对应 OpenList 概念 | 用�?|
| --- | --- | --- |
| `src/kernel/server/common` | `server/common` | OpenList 响应 envelope、分页响应、文本和 JSON 响应 |
| `src/kernel/server/handles` | `server/handles` | �?auth/fs/admin/share/task/archive/public/status/compat �?handler |
| `src/kernel/server/router.js` | `server/router.go` | 集中分发表、下载路由、协议入�?|
| `src/kernel/server/webdav.js` | `server/webdav.go` | WebDAV 兼容入口 |
| `src/kernel/server/s3.js` | `server/s3.go` �?`server/s3/*` | S3 兼容入口和默�?bucket 对象接口 |
| `src/kernel/internal/conf` | `internal/conf` | 常量、任务类型、设置类�?|
| `src/kernel/internal/model` | `internal/model` | SettingItem、Meta、路径规范化、Storage/User/Obj 模型辅助 |
| `src/kernel/internal/driver` | `internal/driver` �?`drivers/*` | DriverInfo、driver names/info/list、挂载运行时适配 |
| `src/kernel/internal/fs` | `internal/fs` | 虚拟 FS、思源工作空间适配、archive 能力边界 |
| `src/kernel/internal/task` | OpenList task manager | 轻量任务兼容�?|
| `src/kernel/internal/bootstrap/data` | `internal/bootstrap/data` | OpenList 默认设置和默认状�?|

## 迁移约束

- 新功能优先在 OpenList 对应目录找源文件，然后复制字段、路由名和处理顺序，再改成思源内核 JS 可运行的形式�?- 不为了“更像前端项目”而打�?OpenList 的模块边界；长期可维护性来自和 OpenList 源码一一对应�?- �?OpenList 依赖数据库、Go interface、后台任务或外部二进制的部分，先保留同名模块和路由，占位响应要说明阻塞点和对�?OpenList 源文件�?- OpenList `common.Proxy` �?Go `io.Copy` 真流式代理；当前思源内核已通过本地 PR 提供 kernel plugin `body.proxy` 响应类型。`/d`/`/p` 通过 `fs.Link` 风格的驱动返回值进�?`server/common/proxy.js`，再把最�?URL、驱动头和播放器 Range 请求原样交给 `body.proxy`，不要再为单个网盘添加有�?Range 或播放器专用代理�?- 每完成一批能力，要同步更新本文档、`docs/siyuan-cloud-migration-plan.md`、`docs/kernel-plugin-notes.md` 和独立迁移进度面板�?
## 当前拆分状�?
- `internal/conf/const.js`：版本、状态文件、任务类型、设置类型�?- `server/common/response.js`：`success`、`failure`、`jsonResponse`、`textResponse`、`pageResp`�?- `internal/model/path.js`：`normalizePath`、`dirname`、`basename`、相对名称校验�?- `internal/model/setting.js`：设置分组和 flag 常量�?- `internal/model/meta.js`：OpenList Meta 结构、覆盖范围、hide/readme/header 规则�?- `internal/driver/info.js`：驱动字段和配置描述；已复制常用网盘 `meta.go` 字段，包括百度、阿里�?23�?15、OneDrive、Google、天翼�?- `internal/driver/registry.js`、`openlist.js`、`webdav.js`、`s3.js`、`onedrive.js`、`123/driver.js`、`baidu_netdisk.js`、`aws4.js`、`http.js`：按挂载点分发到驱动，并通过思源 `/api/network/forwardProxy` 接入外部 HTTP 类网盘、OneDrive Graph API�?23Pan 签名 API、BaiduNetdisk REST API �?S3 兼容对象存储；OpenList 通用 `/p` 代理由插�?`/d`/`/p` �?`fs.Link -> common.Proxy -> body.proxy` 返回真流式响应；`registry.js` 会给运行�?storage 附加 `saveDriverStorage` 回调，用于驱动在刷新 token 或登录后�?OpenList `op.MustSaveDriverStorage -> saveDriverStorage` 一样把 addition 写回挂载配置；BaiduNetdisk 在驱动内部保留短�?list、resolved file �?`Link()` 缓存，避免播放器 Range 请求重复逐级解析深路径和重复请求 `filemetas`/`mediainfo`�?- `internal/bootstrap/data/settings.js`：OpenList 默认设置和设置元数据�?- `internal/bootstrap/data/state.js`：默认运行状态、默认用户、默�?storage、根目录�?- `internal/state.js`：状态读取、默认状态合并和持久化�?- `internal/fs/virtual.js`：虚�?FS 的目录、文件、删除、复制、移动、重命名和清空目录操作�?- `internal/fs/workspace.js`：`/@workspace` 到思源 `/api/file/*` 的适配�?- `internal/fs/archive.js`：archive 扩展名和未实现能力说明�?- `internal/task/manager.js`：轻量任务记录、done/undone 分类、取消、删除和清理�?- `server/handles/admin.js`：user/storage/driver/setting/config 管理�?handler；包含配置导入导出�?- `server/handles/fs.js`：FS list/get/search/manage/batch、direct-upload 回落、离线下载占位�?- `server/handles/share.js`：分�?CRUD handler、公开读取工具、`sid`/密码/过期校验�?- `server/webdav.js`：`/dav` 支持虚拟 FS �?PROPFIND/GET/HEAD/MKCOL/PUT/DELETE/COPY/MOVE/LOCK/UNLOCK/PROPPATCH，`/@workspace` 暂时只读�?- `server/s3.js`：`/s3` 默认 `openlist` bucket，支�?bucket list、object list/get/head/put/delete/copy/multi-delete、prefix/delimiter，以�?multipart init/list parts/list uploads/abort/complete 骨架�?- `src/components/Dock.vue`：OpenList 管理面板模板，只负责渲染账户登录、图标导航、挂载管理、驱动字段表单、配置导入导出、任务检查、用�?分享/meta 占位�?about/API 操作；具�?OpenList 调用流程集中�?`src/utils/dock.ts`，挂载字段通过 `driverField.*` / `driverFieldHelp.*` i18n 显示，但 addition JSON 保持 OpenList 原字段名；已有挂载可回填表单并按 OpenList storage update/enable/disable/delete 路由修改�?- `src/components/MigrationPanel.vue`：迁移进度、计划表和路由诊断已�?Dock 拆出到独立开发面板，方便后续一次性移除�?- `src/components/FileTab.vue`：通过 `plugin.addTab` 注册思源自定�?Tab，用于主页文件管理；媒体文件�?OpenList 播放边界先取 `/api/fs/get` �?`raw_url`/`sign` 并交给思播�?Artplayer 运行时；`raw_url` 遵循 OpenList 通用规则，代�?storage 返回 `/p/<path>`，非代理 storage 返回对象 URL �?`Link()` URL；图片文件复用思源 Viewer.js 查看器�?
## 维护规则

- 不要在仓库根目录维护生成�?`kernel.js`�?- 改内核逻辑时编�?`src/kernel/**`�?- �?Dock 管理页模板时编辑 `src/components/Dock.vue`；改 Dock 调用逻辑时编�?`src/utils/dock.ts`；统一样式�?`src/index.scss`；OpenList 语义图标统一�?`src/utils/icon.ts`，优先映射到思源现有 Material 风格 symbol；改迁移进度/计划诊断时编�?`src/components/MigrationPanel.vue`�?- 改文件管理主页时编辑 `src/components/FileTab.vue`，保持思源自定�?Tab 承载主文件浏览体验�?- 每次提交前运行：

```powershell
pnpm test:kernel
pnpm build
node --check dist/kernel.js
```

## 下一步拆分顺�?
1. 继续�?`docs/OpenList-main/drivers/*/driver.go` 复制 115、阿里云盘、天翼、Google 等真实驱动行为；OneDrive 已有首批 Graph API 运行时，123Pan 已有首批签名 API 运行时和最终播放链接解析，BaiduNetdisk 已有首批 REST API 运行时且播放链路已按 OpenList `PreferProxy -> web_proxy -> /p` 通用规则转发 Range，并已加入短期对�?链接缓存降低播放启动前的重复解析；后续分别补上传分片/complete 和持久化 token 刷新�?2. `internal/fs/upload.js`：验证思源 multipart 上传闭环�?3. `internal/driver/s3.js`：补�?S3 真实远程驱动行为和签名�?4. `internal/fs/archive.js`：迁�?archive meta/list/decompress 的真实行为�?5. 扩展 `scripts/kernel-route-smoke.mjs`：覆盖更�?OpenList 前端常用接口�?
## Streaming Proxy Alignment

- `src/kernel/internal/model/args.js` mirrors the OpenList `model.Link` boundary used by `fs.Link`.
- `src/kernel/server/common/proxy.js` mirrors the OpenList `server/common/proxy.go` boundary: merge browser request headers with driver link headers, then hand the final URL and headers to SiYuan `body.proxy`.
- `/d` and `/p` should continue to flow through `fs.Link`-style driver output and common proxy logic; do not add another per-driver proxy stack when the behavior belongs in this common proxy layer.
- BaiduNetdisk `download_api=crack_video` follows OpenList's `api/mediainfo VideoURL` final-link branch. The official Baidu streaming m3u8 API is a separate future experiment, not the default OpenList-compatible playback path.
- The sibling SiYuan Media Player integration treats `/plugin/private/siyuan-cloud/p` and `/d` as final playback URLs. This keeps the player aligned with OpenList's `raw_url` boundary instead of asking the player to run its own cloud-drive lookup after this plugin has already resolved the driver link.
- OpenList `ProxyRange` depends on a Go `RangeReader`. In this JS kernel port, keep the name and boundary, but let normal URL links flow through SiYuan `body.proxy`; only add a real range-reader branch if the kernel later exposes an equivalent stream/range primitive.
