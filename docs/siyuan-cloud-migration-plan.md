# 思盘迁移计划�?
目标：把 OpenList 的核心能力迁移成思盘（Siyuan Cloud）这个独立的思源内核插件，不修改思源源码，不依赖外部 OpenList 进程，并尽可能保�?OpenList API、目录结构、字段和行为兼容�?
## 当前原则

- 不把 OpenList Go 后端作为依赖启动，也不要求用户额外安�?OpenList�?- 尽可能对�?OpenList 架构、目录命名、模块边界和路由分组，方便后续直接对照源码继续迁移�?- 优先复制/移植 OpenList 的请求字段、响应字段、状态消息、控制流和路由命名；只有遇到 Go 依赖、外部进程、数据库或思源内核 API 限制时才改写�?- 参考源码固定在 `docs/OpenList-main` �?`docs/siyuan-master`�?- `kernel.js` 是目标插件输出目录里的构建产物，仓库根目录不再维护它；内核逻辑写在 `src/kernel/**`�?- 前端 Dock 配置使用 `plugin.loadData/saveData`；OpenList 运行状态、账户、虚�?FS、分享、存储挂载和导入配置使用 `siyuan.storage`�?- `siyuan.storage` 位于 `data/storage/petal/siyuan-cloud`。根据思源源码分析，它默认持久化并参与同步，除非用户在 `.siyuan/syncignore` 排除 `/storage/petal/**` 或本插件目录�?
## 总路�?
| 阶段 | 目标 | 参考源�?| 当前状�?| 下一步验�?|
| --- | --- | --- | --- | --- |
| 1. 插件外壳、Dock 与自定义 Tab | 独立插件、顶栏入口、Dock 登录/设置/挂载管理、文件管理自定义 Tab、中�?i18n、验证页 | `plugin-sample-vite-vue`、`docs/siyuan-master/app/src/plugin/index.ts`、`docs/siyuan-master/kernel/plugin/*` | 已完�?| 在思源启用插件，确认顶栏打开文件管理 Tab，Dock 可登录、创建挂载、导入导出配�?|
| 2. 内核插件入口 | 通过生成�?`kernel.js` 注册 `/plugin/private/siyuan-cloud/*` 路由 | `docs/siyuan-master/kernel/plugin/api_server.go`、OpenList `server` | 已完�?| `/siyuan-cloud/status` 返回路由、存储、版本和阶段信息 |
| 3. OpenList API 契约 | 迁移 OpenList 响应 envelope、路由命名、请求字段和错误形状 | `docs/OpenList-main/server/router.go`、`server/common`、`server/handles/*` | 进行�?| 继续�?route smoke test |
| 4. 认证和账�?| 登录、hash 登录、当前用户、退出、用户管理、权限字�?| `server/handles/auth.go`、`server/handles/user.go` | 基础完成 | 权限位真实行为后续补�?|
| 5. 虚拟文件系统 | �?`siyuan.storage` 中承�?OpenList 虚拟目录、文件和分享状�?| `internal/fs`、`handles/fsread.go`、`handles/fsmanage.go` | 基础完成 | 继续�?archive 真实行为 |
| 6. 思源工作空间适配 | 暴露 `/@workspace` 并映射到思源 `/api/file/*` | `docs/siyuan-master/kernel/api/file.go` | 读、列、删、改名完�?| 证明 multipart 上传闭环后补写入 |
| 7. 设置、存储、驱动管�?| 对齐 OpenList setting/storage/driver/meta/message/index/scan API 数据结构 | `handles/setting.go`、`handles/storage.go`、`drivers/*/meta.go` | 进行�?| 已补常用网盘字段表单和配置导入导出；继续迁移真实驱动行为 |
| 8. 常用网盘驱动字段 | 优先复制百度、阿里�?23�?15、OneDrive、Google、天翼等常用驱动�?`meta.go` 字段 | `docs/OpenList-main/drivers/{baidu_netdisk,aliyundrive*,123*,115*,onedrive*,google*,189*}/meta.go` | 字段级完�?| Dock 选择驱动后应出现具体输入框；创建挂载�?addition JSON 应持久化 |
| 9. 真实网盘运行�?| 在思源内核 JS 里逐个迁移常用驱动 list/get/put/remove/rename 等行�?| `docs/OpenList-main/drivers/*/driver.go` | OpenList/AListV3/WebDav/S3/Doge/Onedrive/123Pan/BaiduNetdisk 初步可运行，其余字段先可配置 | 先用导入配置测试字段和挂载，再逐个接真�?API；OneDrive�?23Pan、BaiduNetdisk 后续补大文件/分片上传�?direct upload |
| 10. 分享和任�?| 分享 CRUD、启停、任务列表、取消等兼容接口 | `handles/sharing.go`、`handles/task.go` | 进行�?| 继续补真实异步队�?|
| 11. 协议表面 | WebDAV/S3 等外部协议兼容入�?| OpenList WebDAV/S3 实现 | 进行�?| �?WebDAV 客户端兼容细节和 S3 signature |
| 12. 验证和发�?| 构建、包体、跨设备同步说明、测试清单、Dock 验证�?| 思源插件发布规范 | 进行�?| 扩展自动化测试和手工验收�?|

## 本轮进度

- 已把常用驱动字段�?OpenList `meta.go` 复制�?`src/kernel/internal/driver/info.js`：`115 Cloud`、`115 Open`、`123Pan`、`123 Open`、`189Cloud`、`Aliyundrive`、`AliyundriveOpen`、`AliyundriveShare`、`BaiduNetdisk`、`Onedrive`、`OnedriveAPP`、`GoogleDrive`、`GooglePhoto`�?- 已保留常见别名：`115`、`115Open`、`123`、`123Open`、`AliyunDrive`、`OneDrive` 等，避免旧面板或测试配置找不到驱动�?- Dock 挂载管理已根�?`/api/admin/driver/info` 动态生成具体输入框，同时保�?addition JSON 高级编辑�?- 已新�?`/api/admin/config/export` �?`/api/admin/config/import`，用于导�?导入 settings、users、storages、metas、sharings，方便直接粘贴配置测试�?- `scripts/kernel-route-smoke.mjs` 已覆盖常用驱动字段和配置导入导出�?- 已从 OpenList `drivers/onedrive/driver.go`、`util.go`、`types.go` 迁移首批 OneDrive 真实运行时到 `src/kernel/internal/driver/onedrive.js`：支�?Graph token 刷新、路�?URL 拼接、list/get/read、mkdir/remove/rename 和小文件 put，并接入最长挂载路径分发�?- `scripts/kernel-route-smoke.mjs` 已增�?OneDrive Graph mock，覆�?`/api/fs/list`、`/api/fs/get` �?`/d/<mount>/<file>` 读取�?- Dock 挂载表单已补 `driverField.*` �?`driverFieldHelp.*` i18n：UI 显示中文/英文标签和说明，悬停保留 OpenList 原字段名，提交的 addition JSON 仍保持原字段�?- 已从 OpenList `drivers/123/driver.go`、`util.go`、`types.go` 迁移首批 123Pan 真实运行时到 `src/kernel/internal/driver/123/driver.js`：支�?`GetApi` CRC32 签名、账号登录后重试、分�?list、按路径解析 fileId、get/read、mkdir、remove/trash、rename；上传仍保留明确待迁移错误，下一步对�?OpenList `upload_request`、S3 上传�?`upload_complete`�?- `scripts/kernel-route-smoke.mjs` 已增�?123Pan mock，覆�?`/api/fs/list`、`/api/fs/get` �?`/d/<mount>/<file>` 读取�?- Dock 挂载表单已改�?OpenList 风格的存储管理流：添加会先尝�?`/api/admin/driver/test`，支持测试方法的驱动会立即验证并写回 addition JSON；已有挂载可从列表载入同一表单并调�?`/api/admin/storage/update` 修改，也可按 id 启用、禁用、删除；导出/导入只作用于当前驱动 addition JSON�?- Dock 已调整为 OpenList 风格管理面板：顶部图标导航只保留账户、设置、任务、用户、挂载、分享、元信息和关于等管理入口；Vue 模板 `src/components/Dock.vue` 只负�?UI，OpenList 调用流程集中�?`src/utils/dock.ts`，统一样式集中�?`src/index.scss`；迁移进度、计划表和路由诊断已移动�?`src/components/MigrationPanel.vue`，方便后续一次性移除开发看板�?- 文件管理 Tab 已增加思播联动：音视频文件行显示播放按钮，双击媒体文件或点击播放会调用 `window.siyuanMediaPlayer.playMediaItem`；播放地址�?OpenList 边界�?`/api/fs/get` �?`raw_url`/`sign` 解析，缺省回落到 `/d/<path>` 下载路由。播放器侧应接收 OpenList `raw_url`：当 storage `web_proxy` �?driver `only_proxy` 生效时，通用格式�?`/p/<path>`；否则是对象 URL �?`Link()` URL�?23Pan �?`/api/fs/get` 已对�?OpenList 非代�?`Link` 控制流：`download_info` 后解 `params`，再请求 `auto_redirect=0` 地址解析 `data.redirect_url`；OneDrive 也返�?Graph 下载直链。百度网盘因 OpenList `PreferProxy: true` 默认�?`web_proxy`，所�?`/api/fs/get.raw_url` 应为 `/p/<path>`，由插件 `/p` 后端代理读取真实链接并返回标准媒体头�?- 已从 OpenList `drivers/baidu_netdisk/driver.go`、`util.go`、`types.go` 迁移首批 BaiduNetdisk 真实运行时到 `src/kernel/internal/driver/baidu_netdisk.js`：支�?token 刷新、分�?list、路径解析、get/read、mkdir、remove、rename，并保留 `official/crack/crack_video` 下载分支命名和请求字段；BaiduNetdisk `Link()` 已对�?OpenList official 流程：`filemetas` 获取 `dlink`，拼�?`access_token`，尝试用 `User-Agent: pan.baidu.com` �?HEAD 解析 `Location`；`crack` 对齐 `api/filemetas`，`crack_video` 对齐 `api/mediainfo type=VideoURL`，并允许百度�?HTTP 400 响应体内返回 `info.dlink` 后继续按 OpenList 读取链接；`/d`/`/p` 通过 `fs.Link -> common.Proxy -> body.proxy` 透明转发播放�?Range 请求，不再使用思源 `/api/network/proxy` 或自定义有界 Range 播放补丁；上�?分片仍保留明确待迁移错误�?- 2026-05-24: BaiduNetdisk playback now benefits from short-lived list, resolved-file, and `Link()` caches in the driver itself, so repeated player Range requests do not keep re-walking deep paths or re-resolving `filemetas`/`dlink`.
- 2026-05-25: Driver addition persistence now mirrors OpenList's `internal/op/storage.go` boundary: `driverRuntime.resolve` attaches `saveDriverStorage`, and migrated drivers call it where upstream calls `op.MustSaveDriverStorage`. This covers OpenList/AListV3 login token saves plus OneDrive/Baidu token refresh saves, so config export and later mount edits show current tokens instead of stale imported values.
- 图片文件已接入思源原生 Viewer.js 查看器：�?OpenList `/api/fs/get` �?`raw_url`/`sign` 解析图片 URL，缺省回�?`/d/<path>`，同目录图片组成查看队列�?
## Dock 验证�?
Dock 的“验证”标签页用于手工验收�?
- 登录验证：调�?`/api/auth/login`�?- 创建挂载：调�?`/api/admin/storage/create`�?- 刷新挂载：调�?`/api/admin/storage/list`�?- 文件读写：调�?`/api/fs/mkdir`、`/api/fs/put`、`/api/fs/get`�?- WebDAV 读写：调�?`/dav/<path>` �?`PUT` �?`GET`�?- S3 读写：调�?`/s3/siyuan-cloud/<key>` �?`PUT` �?`GET`�?- 任务列表：调�?`/api/task/copy/done`�?
挂载管理页用于真实配置测试：

- 选择驱动后，表单来自 `/api/admin/driver/info`�?- “更�?JSON”把输入框同步到 addition JSON�?- “从 JSON 填表”把已有 addition JSON 反填到输入框�?- “导出配置”导出当�?OpenList 兼容配置并复制到剪贴板�?- “导入配置”把粘贴的配置写入内核状态�?
## 参考源码位�?
- OpenList 本地源码：`docs/OpenList-main`
- OpenList 路由总表：`docs/OpenList-main/server/router.go`
- OpenList handler：`docs/OpenList-main/server/handles`
- OpenList 驱动总表：`docs/OpenList-main/drivers/all.go`
- 常用驱动字段：`docs/OpenList-main/drivers/*/meta.go`
- 常用驱动行为：`docs/OpenList-main/drivers/*/driver.go`
- 思源 dev 源码：`docs/siyuan-master`
- 思源内核插件：`docs/siyuan-master/kernel/plugin`
- 思源文件 API：`docs/siyuan-master/kernel/api/file.go`

## 每轮继续开发顺�?
1. 先跑 `pnpm test:kernel`、`pnpm build` �?`node --check dist/kernel.js`�?2. 对照 `docs/OpenList-main/server/router.go` 查漏路由�?3. 对照 `docs/OpenList-main/drivers/*/meta.go` �?`driver.go` 继续复制字段和行为�?4. 优先�?OpenList 前端或常见客户端会调用的接口�?5. 每新增一组能力，同步更新 Dock 面板、本文档、`docs/kernel-plugin-notes.md` �?`docs/kernel-architecture.md`�?
## 2026-05-24 Streaming Proxy Alignment

- `/d` and `/p` now follow the OpenList `fs.Link -> common.Proxy` boundary in the kernel JS port. Driver read methods can return `model.Link`-style data, normalized by `src/kernel/internal/model/args.js`, and streamed by `src/kernel/server/common/proxy.js`.
- With a SiYuan kernel that supports plugin `body.proxy`, the common proxy layer forwards player Range headers transparently to the final upstream URL. This matches OpenList transparent proxy behavior and avoids per-driver playback hacks.
- BaiduNetdisk `download_api=crack_video` is aligned with OpenList `linkCrackVideo`: request `https://pan.baidu.com/api/mediainfo` with `type=VideoURL`, `nom3u8=1`, `dlink=1`, `media=1`, and `origin=dlna`, then stream the returned `model.Link` through the same `/d`/`/p -> common.Proxy` path as other drivers.
- Companion players must treat `/plugin/private/siyuan-cloud/p` and `/d` as final playback URLs. The OpenList plugin already resolved the storage driver and link; re-parsing those URLs through a player-side Baidu/123/OpenList driver can produce false "file not found" errors.
