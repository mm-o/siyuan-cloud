# 思盘迁移计划

目标：把 OpenList 的核心能力迁移成独立的思源内核插件 `siyuan-cloud`，不启动 OpenList Go 后端，不修改思源源码，并尽可能保持 OpenList API、目录结构、字段名、响应形状和控制流兼容。

## 迁移原则

- 不把 OpenList Go 后端作为运行依赖；在思源内核插件 JavaScript runtime 中复刻兼容行为。
- 目录和模块名尽量对齐 OpenList，方便后续直接对照 `docs/OpenList-main` 与 `docs/OpenList-Frontend-main` 继续复制/适配。
- 优先复制 OpenList 的 route、request/response 字段、status message 和控制流；只有 Go-only 依赖、外部进程、数据库或思源内核 API 不支持时才改写。
- 受阻能力必须保留结构化兼容占位，不静默改成另一套行为。
- 不手改生成物；内核源码写在 `src/kernel/**`，通过 `pnpm dev` 或 `pnpm build` 生成目标插件目录里的 `kernel.js`。
- 前端插件设置使用 `plugin.loadData/saveData`；OpenList kernel 数据使用 `siyuan.storage` 分文件保存：`config.json` 存 settings/users/storages/metas/sharings/ssh_keys，`runtime.json` 存虚拟 FS、任务、消息、scan、WebDAV/S3 运行态，`search-index.json` 存索引。旧 `siyuan-cloud/state.json` 只作为迁移来源，避免继续生成多嵌套目录。

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
| 搜索索引初版 | 对照 OpenList `internal/search`、`internal/db/searchnode.go` 和 `server/handles/index.go`，新增持久 `search_nodes`、`/api/admin/index/{build,update,stop,clear,progress}` 和 `/api/fs/search` 的 PageResp/`parent/name/is_dir/size/type` 查询形态；索引构建已跳过 `ignore_paths` 和 storage `disable_index` | `pnpm test:kernel` 覆盖 build/progress/search/clear/update/ignore_paths/disable_index |
| 任务管理形态 | 对照 OpenList `server/handles/task.go`，`/api/task/{group}/done` 与 `undone` 返回 TaskInfo 数组，info/cancel/delete/retry、cancel_some/delete_some/retry_some、clear_done/clear_succeeded/retry_failed 的返回形态和 not found 语义已收口；批量接口只接受 OpenList JSON 字符串数组请求体。move/copy/offline/decompress 轻量 task record 现在写入请求用户 `creator/creator_id/creator_role`，task list/info/cancel/delete/retry/clear 按当前用户过滤，管理员可见全量。 | `pnpm test:kernel` 覆盖 done/info/not-found/batch error map/invalid batch body、普通用户 task creator 写入、普通用户只见自己的 task 和不能读取 admin task |
| 分享主形态 | 对照 OpenList `model.Sharing`、`server/handles/sharing.go` 与 `internal/sharing/{list,get,link}.go`，分享状态改为 `id/files/pwd/accessed/max_accessed`，支持多文件分享根列表、密码/过期/禁用/访问次数校验、按 share id + client IP 去重的访问计数、`/api/fs/{list,get}` 公开读取和 `/sd/{id}` 下载；管理路由支持 query `id`，config import 保留字符串/CJK share ID | `pnpm test:kernel` 覆盖 create/list/multi-file root/password/disable/download/access count/query id/new_id/import |
| 分享 creator/meta 权限边界 | 对照 OpenList `server/handles/sharing.go` 和 `server/common/check.go`，显式 token 请求会解析当前用户；非管理员只能 list/get/update/delete/enable/disable 自己创建的分享，create/update 会检查 `CanShare`、自定义 ID 权限、`base_path` 前缀和 nearest meta 的 `read_users/password/hide` 读访问边界；admin 可指定 creator 并保留既有兼容默认管理上下文。公开 `/api/fs/list|get` 分享读取、`/sd` 下载、`/@s` archive meta/list 和 `/sad` extract 现在也会复核 creator 当前未禁用、目标路径仍在 creator `base_path` 内并通过 nearest meta 读/password/hide 检查，避免用户或 meta 变更后旧公开分享继续越权。 | `pnpm test:kernel` 覆盖普通用户 owner 过滤、越 base_path 拒绝、meta read_users 拒绝、guest token 拒绝、base_path 收紧后公开 list/download/archive 失效和 creator 禁用后公开 get 失效 |
| Torrent 解析/生成初版 | 对照 OpenList `server/handles/torrent.go` 和 `pkg/torrent`，`/api/fs/torrent/parse` 与 `/api/fs/torrent/upload_parse` 已迁移纯 JS bencode 解析、文件列表、piece 信息、OpenList-style info_hash 和 `x-cas` 扩展读取；`/api/fs/torrent/generate` 可为虚拟 FS、workspace 文本文件和可读 mounted driver 文件生成真实 torrent，`with_cas` 按 OpenList 189 CAS 扩展注入 MD5/slice MD5；`rapid_upload` 已收口到 driver `rapidUploadFromTorrent` 能力边界，未接该方法的目标 storage 返回明确错误 | `pnpm test:kernel` 覆盖真实 torrent fixture、CAS 字段、upload_parse 回传、普通 torrent generate、CAS 非 189 storage 拒绝和 rapid_upload driver-boundary |
| Archive 目录/提取/解压初版 | 对照 OpenList `server/handles/archive.go` 的 `ArchiveMetaResp`、`ArchiveListReq`、`ArchiveInternalExtract` 与 `ArchiveDecompressReq` 路由边界，`/api/fs/archive/meta` 和 `/api/fs/archive/list` 可读取虚拟 FS 或 mounted driver `read()` body/link 中 ZIP、tar、tgz/tar.gz 的目录树，返回 `comment/encrypted/content/raw_url/sign` 与 PageResp；`/@s` 分享 archive meta/list 已按 `server/handles/sharing.go` 解包到真实分享文件；`/ae`、`/ad`、`/ap` 和 `/sad` 可提取 ZIP stored/deflate 以及 tar/tgz entry；`/api/fs/archive/decompress` 已支持解压到虚拟 FS 或带 `put()` 的 mounted driver 目标；ZIP 加密条目目前只检测并返回明确 `501 wrong archive password`，不声明已解密；rar 和 7z 仍保持结构化占位，等待可打包且有 fixture 的真实 JS/wasm reader | `pnpm test:kernel` 覆盖 zip/tar/tgz 上传、meta/list、stored/deflate extract、加密 ZIP 501 边界、`/ad`/`/ap` extract、Baidu mounted zip list/extract、share meta/list/`/sad` extract 和虚拟 FS decompress |
| Archive 百度挂载 ZIP / 中文文件名收口 | 百度网盘 ZIP meta/list/extract 已改为 mounted driver link range reader，不再整包拉取；非 EFS ZIP 文件名使用内置 GBK 表解码，解决 `Cap ���İ氲װ��` 这类后端响应已乱码的问题。本地 Local archive 和远端 archive 共用同一套 `parseArchive` 默认解码。`forwardProxy` 对无 body GET/HEAD 不再传 `contentType/payload/payloadEncoding`，避免 signed URL 请求形状污染；百度 mounted ZIP torrent generate 已可通过 range chunk 生成。 | 真实百度压缩包验证中文正常；`node ./scripts/kernel-route-smoke.mjs` 覆盖 GBK ZIP、本地/百度 mounted ZIP、range 请求形状、extract 和 torrent generate；`pnpm build` 通过 |
| Archive 前端入口 | FileTab 和 Dock 文件树已接入 zip/tar/tgz 浏览入口：点击或右键“浏览压缩包”会先调用 `/api/fs/archive/meta`，再按需调用 `/api/fs/archive/list` 展示内部目录；目录行进入目录，文件行/打开按钮走 `raw_url + inner` 按扩展复用现有打开逻辑，图片走 Viewer，音视频优先交给思播兼容入口、PDF/书籍优先交给 SiReader `openEpubTab(file,title)`，缺 companion 时回退内嵌预览；下载按钮追加 `download=1`；本地 Local archive 由前端 Electron 按需读取并复用同一个 archive reader；对话框内容限制在视口内滚动 | `pnpm build` |
| 前端 FS 操作 | FileTab 顶部按钮和右键菜单接入上传、下载、新建、重命名、复制、移动、删除 | `fs*` helper + `handle_resp.ts` 统一处理 |
| 普通 FS 用户权限边界 | 对照 OpenList `server/common/check.go`、`server/handles/fsread.go`、`server/handles/fsmanage.go` 和 `model.User` permission bit，普通 `/api/fs/list|get|dirs|other` 已接入 `base_path`/nearest meta `CanAccess`；`mkdir/put/form/rename/move/copy/remove/batch_rename/regex_rename/recursive_move/remove_empty_directory/add_offline_download` 已按 `CanWriteContent`、`CanRename`、`CanMove`、`CanCopy`、`CanRemove`、`CanAddOfflineDownloadTasks` 与源/目标 `CanRead`/`CanWrite` 做入口校验；批量操作仍保持 OpenList “不逐项深查”的性能边界 | `pnpm test:kernel` 覆盖普通用户 copy 任务允许、缺 move 位拒绝、base_path 外 copy 拒绝 |
| WebDAV/S3 用户权限与签名边界 | WebDAV 对照 OpenList `server/webdav.go` 的 `WebDAVAuth`：除 OPTIONS 外先要求 `CanWebdavRead`，`PUT/MKCOL/MOVE/COPY/DELETE/PROPPATCH` 再要求 `CanWebdavManage`。S3 对照 `server/s3/utils.go` / `server/s3/server.go`：`s3_buckets` 解析 bucket -> path 映射，空配置回退 `siyuan-cloud -> /`；配置 `s3_access_key_id` / `s3_secret_access_key` 后要求 AWS SigV4 header/query 签名，未配置时保留本端轻量兼容免签。显式 `siyuan-cloud-port:<id>` token 请求作为插件集成入口继续复用 WebDAV read/manage 权限过滤。 | `pnpm test:kernel` 覆盖 WebDAV read-only PROPFIND 可读、PUT 拒绝、manage 后 PUT 成功，S3 token read-only/manage 权限，S3 settings bucket 映射、未签拒绝、签名成功和错误签名拒绝 |
| Archive/Torrent/Search 用户权限边界 | Archive meta/list 对照 OpenList `server/handles/archive.go`，要求 `CanReadArchives`、`base_path` 和 nearest meta `CanAccess`；decompress 要求 `CanDecompress`、源路径在 `base_path` 内、目标目录 `CanWrite`。Torrent generate/rapid_upload 对照 `server/handles/torrent.go`，生成要求目标文件 `base_path` + `CanRead`，rapid upload 要求目标路径 `base_path` + `CanWrite`；parse/upload_parse 保持无路径权限要求。Search 对照 `server/handles/search.go`，parent 先做 `base_path` 边界，结果再按 `base_path` 和 nearest meta `CanAccess` 过滤。 | `pnpm test:kernel` 覆盖 archive read/decompress permission bit、torrent generate base_path、torrent rapid base_path、search parent base_path 和结果过滤 |
| Dock 文件树 | Dock 新增文件列表树视图页，按思源文档树结构使用 `file-tree` / `sy__file` / `b3-list-item` 原生 class，复用 `/api/fs/list`、FileTab 文件图标、图片 Viewer 和 companion `data-href` 链接边界 | `pnpm build` |
| 代理播放 | `/api/fs/get.raw_url`、`/api/fs/link.raw_url`、`/d`、`/p` 走 `fs.Link -> common.Proxy -> body.proxy` 边界；Range/header 交给思源 `body.proxy` 流式转发 | 播放器插件可直接调用 OpenList HTTP API，图片走 SiYuan Viewer |
| FS Other 边界 | 对照 OpenList `server/handles/fsread.go`、`internal/fs/other.go`、`internal/op/fs.go`，`/api/fs/other` 已从空响应改为按挂载解析实际路径并调用 driver `other(storage, relPath, { method, data })`；`OpenList/AListV3` runtime 直接透传远端 `/api/fs/other`，`AliyundriveOpen` 已补 `video_preview`，未实现驱动保持 OpenList `not implement` 语义 | `pnpm test:kernel` 覆盖 OpenList mount 路径改写、method/data/password 透传、AliyundriveOpen video_preview 和虚拟路径 not implement |
| 驱动首批运行时 | OpenList/AListV3、WebDav、S3/Doge、115 Cloud、OneDrive、123Pan、BaiduNetdisk、GitHub Releases、AliyundriveOpen、189Cloud、189CloudPC、189CloudTV、Quark/UC/QuarkOpen/QuarkTV/UCTV、WPS 有 kernel runtime adapter；Local 由桌面端前端 Electron fs runtime 处理 | 通过最长 `mount_path` dispatch；Dock 只列出已接 runtime 或前端可处理的驱动 |
| 管理面板 | driver names/info、storage create/update/enable/disable/delete、config import/export | Dock 挂载表单可验证 |
| 用户基线 | 默认 admin 运行时同步为当前思源账号名，保留 disabled guest；`/api/admin/user/list/get/create/update/delete/cancel_2fa` 按 OpenList 用户字段、角色限制和分页响应收口；Dock 新增紧凑用户管理页 | `pnpm test:kernel` 覆盖默认账号同步、用户 CRUD、禁止创建 admin/guest、禁止禁用 admin |
| Request context / JWT 统一 | 对照 OpenList `server/common/auth.go` 和 `server/middlewares/auth.go`，`/api/auth/login` 与 `/api/auth/login/hash` 返回 HS256 JWT，payload 包含 `username/pwd_ts/exp/iat/nbf`；settings `token` 作为 admin token；空 Authorization 解析为 guest；密码变更更新 `pwd_ts` 并让旧 JWT 失效；`/api/admin/*`、admin meta/message/index/scan/sshkey 子路由统一走 `AuthAdmin` 等价边界；`/api/me`、SSH key、2FA 使用当前 request user。旧 `siyuan-cloud-port:<id>` token 保留为插件集成兼容入口。 | `pnpm test:kernel` 覆盖 JWT 登录、`/api/me` 当前用户、空 token guest、guest/admin/general 权限拒绝、密码变更后旧 token 401 |
| WebDAV/S3 | WebDAV 读写和 LOCK/UNLOCK/PROPPATCH 骨架，S3 list/get/put/delete/copy/multipart 骨架 | smoke test 覆盖主要表面 |

## OpenList 完整性复审结论

当前不能标记为“驱动和功能已完整”。本项目目前是 OpenList-compatible 的 SiYuan kernel runtime 子集：核心 FS route、播放代理、Dock、WebDAV/S3 表面和一批常用驱动的 list/get/link/manage/upload 正在逐步对齐，但 OpenList 的完整能力面仍有明确缺口。

按 `docs/OpenList-main/server/router.go` 复审，主缺口如下：

- 驱动完整性：OpenList upstream 有大量 `drivers/*` 目录，本端 kernel runtime 只接了 OpenList/AListV3、WebDav、S3/Doge、115 Cloud、OneDrive、123Pan、BaiduNetdisk、GitHub Releases、AliyundriveOpen、189Cloud、189CloudPC、189CloudTV、Quark/UC、QuarkOpen、QuarkTV/UCTV、WPS；Local 由前端 Electron fs runtime 处理。其它驱动只保留 metadata/config 或未接入 runtime，不能出现在 Dock 可挂载列表。
- 驱动方法完整性：已接 runtime 的驱动也不是全方法完成。189PC/TV 上传、rapid/CAS/torrent、PC 密码登录仍是占位；189CloudPC/TV 的二维码登录、session 刷新和家庭云 ID 回填已接入；普通 189Cloud 上传已有 OpenList `uploadRequest/newUpload` 基座和 smoke 覆盖，但仍需真实账号/大文件验证；QuarkTV/UCTV 的 management/upload 保持 OpenList 上游 `NotImplement`；S3/WebDav 仍需继续补 full compatibility 细节。
- 搜索：已有本地持久 `search_nodes` 和 OpenList-style admin index/search route 初版，查询逻辑对齐 `db_non_full_text` 的 parent/keywords/scope/page 形态，构建时已按 `internal/search/build.go` 跳过 `ignore_paths` 和 storage `disable_index`；但还不是 OpenList 完整 `internal/search` 多后端体系，缺 Bleve/Meilisearch/database 后端切换、真实异步构建、停止中的取消传播和自动增量 hook。
- 任务：`/api/task/*` 已按 OpenList `server/handles/task.go` 收口 TaskInfo 字段、done/undone 数组、单任务和批量管理返回形态，批量接口只接受 JSON 字符串数组；当前轻量持久 task record 已写入 `creator/creator_id/creator_role` 并按当前用户过滤 list/info/cancel/delete/retry/clear，管理员可见全量。但仍不等价于 OpenList `internal/task` + `tache` manager，尚未实现真实异步队列、取消传播、重试调度、实时进度和 task group coordinator。
- 分享：`/api/share/*` 已按 OpenList `model.Sharing` 主字段收口，支持多文件 share root、密码/过期/禁用/max_accessed 校验、按 share id + client IP 去重的访问计数、`/api/fs/{list,get}` 公开读取和 `/sd/{id}` 下载；share create/update 不再要求路径存在于本地 `state.entries`，公开读取时可通过 `driverRuntime` 解析挂载云盘文件；`/sd` 下载按 storage/driver 代理策略在 plugin proxy 和 driver redirect 之间分流，已删除临时强制代理开关，密码页会保留 `download=1`；archive meta/list 已识别 OpenList `/@s` 分享 split 并真实解析单文件或子路径分享压缩包，`/sad` 已可校验分享密码后提取 archive entry。管理侧 creator/base_path/meta 权限边界已有初版；公开分享读取仍按 share 本身校验，尚未等价于 OpenList 完整 `internal/sharing`、用户请求上下文和所有协议权限模型。
- 离线下载与 torrent：`/api/fs/add_offline_download` 已保留 OpenList `urls` trim/空行跳过和 `{ tasks: [...] }` 响应外形，但真实 aria2/qbit/transmission/SimpleHttp/ed2k 工具未迁移；torrent parse/upload_parse 已有 JS bencode reader 和 CAS 扩展读取，generate 已能从本端可读文件生成 torrent 并支持 189 CAS 扩展；rapid_upload 已保留 driver 方法边界，仍需把 189/189PC 远端 CAS 秒传方法接入对应 runtime driver 后才能真实秒传。
- Archive：`/api/public/archive_extensions` 已按 OpenList archive tool 注册 key 对齐；archive meta/list 已按 `/@s` split 区分普通 archive 与 sharing archive，普通虚拟 FS 以及能通过 mounted driver `read()` body/link 读取的 ZIP/tar/tgz 可解析目录并返回 OpenList-style meta/list；`/ae`、`/ad`、`/ap` 和 `/sad` 可提取 ZIP stored/deflate 与 tar/tgz entry；ZIP 加密条目可识别 `encrypted=true`，但当前不解密，带 `pass` 或 `archive_pass` 也返回明确 `501 wrong archive password`。RAR/7z 及其它非 zip/tar reader 当前仍是 compatibility placeholder：`node-unrar-js`/`libarchive.js` 需要额外 wasm 资源路径，`7z-wasm` 许可证和打包边界需单独复核，且当前缺真实 fixture 生成工具。
- Auth/Admin 完整性：SSO/WebAuthn/2FA/SSH key/user/settings 多数是兼容表面或轻量状态，不是完整 OpenList 安全模型。

复审原则：后续每个 batch 都必须从 `docs/OpenList-main` 对照具体 upstream 文件补齐，不能凭 API 名称自造行为；不确定的协议、加密、SDK 行为保留结构化占位，直到能按 OpenList 源码和 smoke/真机验证收敛。

## 本轮整理

- 删除未使用的 `src/utils/index.ts`，避免留下无用 barrel 和旧 helper。
- `src/utils/api.ts` 只保留 OpenList 前端式 FS helper，不再重复 request 实现。
- `src/utils/request.ts` 作为唯一 request/r adapter，保留通用 `openListJson` 给 Dock 管理流使用。
- `src/utils/handle_resp.ts` 的类型引用改到 `request.ts`，避免通过 `api.ts` 绕回形成概念重复。
- `src/index.ts` 的 `siyuan://plugins/siyuan-cloud/open` 只打开代理 URL，不再解析媒体或调用播放器插件。
- Dock 验证页不再执行会写入真实工作区的 FS/WebDAV/S3 round-trip；一键验证只做登录、挂载列表、任务列表和状态刷新等无副作用检查，写入能力留给 smoke test 或用户明确触发的文件操作。
- `POST /api/fs/get_direct_upload_info` 在不支持直传时返回 `success(null)`，对齐 OpenList `direct_upload.go`。
- `PUT /api/fs/put` / `PUT /api/fs/form` 解码 `File-Path`，对齐 OpenList `fsup.go`。
- `src/components/FileTab.vue` 顶部工具栏回到 SiYuan 原生 `protyle-breadcrumb` / `block__icon` class 组合，删除路径输入的插件自定义尺寸样式。
- `src/components/FileTab.vue` 文件列表交互继续贴近 OpenList 前端：顶部工具栏选择按钮控制 checkbox 显示，checkbox 负责选择/全选，点击条目负责打开，批量操作按钮由选中项启用，并删除桌面式单击选择/双击打开逻辑。
- `/api/fs/batch_rename` 取消对 `src_name/new_name` 的 `.trim()`，保留 OpenList 的原样文件名语义，避免尾随空格文件名被静默改写；smoke 已补带尾随空格的改名覆盖。
- `/api/fs/batch_rename`、`/api/fs/regex_rename`、`/api/fs/recursive_move` 和 `/api/fs/remove_empty_directory` 现在也会分发到已挂载 driver，沿用 OpenList `fs.Rename` / `fs.List` / `fs.Move` / `fs.Remove` 的批量边界，不再只作用于虚拟 FS；smoke 已覆盖 OpenList mount 的 rename/move/remove 请求体。
- 新增 `/api/public/api` 和 `/api/public/routes` 机器可读索引，其他项目可把 `/plugin/private/siyuan-cloud` 当作 OpenList-compatible base URL，直接调用 `/api/*`、`/d/*`、`/p/*`、`/dav/*`、`/s3/*`。
- Dock 设置页保留 OpenList 兼容 `external_previews` JSON 编辑；PotPlayer 等播放器仍然是前端 URL Scheme，不是后端进程启动 API，FileTab 不内置外部播放器菜单，播放器插件按 OpenList HTTP API 和 OpenList Frontend URL 转换规则自行实现交互。
- 驱动实现文件架构对齐 OpenList：`openlist/driver.js`、`webdav/driver.js`、`s3/driver.js`、`onedrive/driver.js`、`baidu_netdisk/driver.js`、`aliyundrive_open/driver.js`、`189/driver.js`、`189pc/driver.js`、`189pc/session.js`、`189_tv/driver.js`、`189_tv/session.js`、`quark_uc/driver.js`、`quark_open/driver.js`、`quark_uc_tv/driver.js`、`wps/driver.js`、`local/driver.js` 等都放在对应驱动目录下。
- `/api/admin/driver/names` 现在只返回已接 runtime 的挂载项；未实现驱动仍保留在 `driver/list` / `driver/info` 的 metadata 中，方便后续按 OpenList 字段继续迁移，但不会出现在 Dock 可选挂载列表。GitHub Releases 已从 metadata-only 提升为 runtime driver，保留 OpenList `repo_structure` / `show_readme` / `show_source_code` / `show_all_version` / `gh_proxy` 字段和只读 release asset 语义。
- 新增 AliyundriveOpen、189Cloud、189CloudPC、189CloudTV、Quark 的初始 list/get/read/link 和基础管理适配；189CloudPC / 189CloudTV 对照 `docs/OpenList-main/drivers/189pc` 和 `docs/OpenList-main/drivers/189_tv` 先复制 `List`、`Link`、`MakeDir`、`Move`、`Copy`、`Remove`、`Rename` 的签名请求边界；189CloudPC 已接 PC 二维码登录和 `getSessionForPC.action` session 刷新，189CloudTV 已接 OpenList TV 二维码登录、轮询 access token、`loginFamilyMerge` session 刷新和 addition 写回；189CloudPC 密码登录、PC AES `params`、上传和 CAS/torrent 秒传仍保留结构化占位。Local 不再尝试 kernel -> loopback bridge，而是在 FileTab/Dock 前端通过 Electron `window.require('fs')` 直接实现 list/get/mkdir/upload/rename/remove/copy/move。
- 115 Cloud 已暴露到挂载列表：对照 OpenList `drivers/115` 和 `github.com/SheltonZhu/115driver` v1.3.3 先迁移 cookie/二维码 token 登录、列表、详情、下载 link 编解码、基础管理和容量信息；115 Open / 115 Share 仍保持 metadata-only。
- 重新对照 `docs/OpenList-main/drivers/*/meta.go` 和 `driver.go`：WebDav、123Pan 按 OpenList `PreferProxy` 标记；S3/Doge 补齐 custom host presign、sign expire、placeholder、remove bucket、filename disposition、direct upload host 等 addition 字段；AliyundriveOpen、Quark、Local 补齐 default root / no overwrite / no cache / no link url 等 config 差异；115 Cloud 的 `cookie`、`qrcode_token` 保持 text metadata，`LinkCacheMode=ua`，上传仍按 `no_upload=true` 保留后续批次。
- OneDrive、123Pan、WebDav 的读取路径已从“driver 自己通过 `forwardProxy` 拉取 base64 内容”改为 OpenList 的 `Link()` 形态：driver 返回 `model.Link` 风格 URL/header，`/d` 和 `/p` 统一进入 `server/common/proxy.js -> body.proxy`。123Pan 的 `Referer` 继续按 OpenList 使用下载接口原始 URL 的 scheme/host。
- BaiduNetdisk 默认 `download_api=crack_video` 时只让视频/音频走 `crack_video`，其它文件走 official，避免 PDF、EPUB、图片等非媒体文件误进视频 API。
- Dock 进度状态和 `/siyuan-cloud/status.adapters` 已同步到当前 runtime 驱动：OpenList/AListV3、WebDav、S3/Doge、115 Cloud、OneDrive、123Pan、BaiduNetdisk、AliyundriveOpen、189Cloud、189CloudPC、189CloudTV、Quark/UC/QuarkOpen/QuarkTV/UCTV、WPS。

## 2026-05-26 流式代理补齐

- 已把 SiYuan PR #17748 的 kernel plugin `body.proxy` 能力写入文档：思源内核侧校验 `http/https` 和 `GET/HEAD`，过滤 hop-by-hop header，使用 SSRF-safe dialer，不自动解压，服务端受控跟随下载重定向并保留 `Range` / `User-Agent` 等代理请求头，最后以流式方式复制最终上游状态、安全响应头和 body，并过滤上游 `Set-Cookie`。
- `src/kernel/server/common/proxy.js` 进一步对齐 OpenList `common.Proxy`：合并浏览器/player 请求头和 driver `model.Link` header，保留 `Range` / `If-Range` 等播放关键头，按大小写去重，并过滤 `Connection` 声明的逐跳头。
- 115 Cloud / 115 Open 播放取链进一步对齐 OpenList `LinkArgs.Header`：`/d`、`/p` 会把播放器/浏览器 `User-Agent` 传给 115 `downurl` 并转发同一个 header 给上游下载直链；115 Open 同一挂载的并发 token refresh 会合并为一次，减少播放器 Range 请求导致的 refresh burst 和旧 `refresh_token` 重复使用。
- `/api/fs/link.raw_url` 与 `/api/fs/get.raw_url` 统一按 OpenList 代理策略返回：`web_proxy` / `PreferProxy` / `OnlyProxy` / `NoLinkURL` 返回 `/plugin/private/siyuan-cloud/p/<path>`，否则保留 driver `Link()` URL。
- Dock 迁移进度新增 `streaming-proxy` 阶段；smoke test 新增 OneDrive 直链 raw_url 和 Baidu 代理 raw_url 的覆盖，防止后续回退到全量 `/p` 或 per-driver 媒体补丁。

## 2026-05-30 OpenList 最新对齐

- 对照最新 `docs/OpenList-main/server/handles/torrent.go`，新增 OpenList torrent route：`/api/fs/torrent/parse`、`/api/fs/torrent/upload_parse`、`/api/fs/torrent/rapid_upload`、`/api/fs/torrent/generate`。parse/upload_parse 已改为真实 JS bencode 解析；generate 已按 OpenList `pkg/torrent` 的单文件结构生成 bencode torrent、piece SHA1、info_hash、MD5 和可选 `x-cas`；rapid_upload 保留 189/189PC driver `rapidUploadFromTorrent` 边界，目标 driver 未接时返回明确错误。
- `/api/public/api` 新增 `openlist.fs.torrent.parse`、`openlist.fs.torrent.generate` 与 `openlist.fs.torrent.rapid-upload.driver-boundary` capability，`/siyuan-cloud/status.stages` 暴露 `torrent` active 阶段。
- `/api/fs/copy` 和 `/api/fs/move` 的 `skip_existing` 冲突处理对齐最新 OpenList `server/handles/fsmanage.go`：目标已存在且允许跳过时继续处理后续文件，不再中断整批；copy 的 `merge` 只在目标为目录时继续。
- `pnpm test:kernel` 增加 torrent parse/upload_parse/generate、rapid upload driver-boundary、公开能力索引、Dock 进度阶段，以及 copy/move skip-existing continuation 覆盖。
- Dock 状态刷新固定使用私有 HTTP status route，避免当前 SiYuan kernel plugin 的 `/ws/plugin/rpc` 通知通道偶发握手失败影响用户界面；内核侧 HTTP status 和 `siyuan-cloud.status` RPC 仍共用 `createStatusPayload`，避免字段漂移。

## 2026-05-30 Companion 链接复用

- FileTab 的媒体和书籍文件名暴露 OpenList-compatible `/p/<path>` 为 DOM `data-href`，直接复用思播、思阅已经支持的文档链接点击拦截逻辑。
- 思盘不调用 `window.siyuanMediaPlayer` / `window.sireader`，不派发 `playMediaItem` 或阅读器专用事件，不增加 `siyuan://plugins/<plugin>/...` 跳转；文件内容仍走 `/p -> fs.Link -> common.Proxy -> body.proxy`。
- 其他 companion 插件可复用同一条普通 HTTP 链接元数据，也可继续直接调用 `/plugin/private/siyuan-cloud/api/fs/get`。

## 2026-05-30 189Cloud PC/TV 初始迁移

- 对照 `docs/OpenList-main/drivers/189pc/{driver.go,utils.go,help.go,meta.go}` 和 `docs/OpenList-main/drivers/189_tv/{driver.go,utils.go,help.go,meta.go}`，新增 `src/kernel/internal/driver/189pc/driver.js`、`src/kernel/internal/driver/189pc/session.js`、`src/kernel/internal/driver/189_tv/driver.js` 与 `src/kernel/internal/driver/189_tv/session.js` runtime 入口，并暴露到 `/api/admin/driver/names`。
- 首批按 OpenList 方法边界迁移 PC/TV 的已登录 session 路径：`List`、`Link`、`MakeDir`、`Move`、`Copy`、`Remove`、`Rename`，下载仍返回 `model.Link` 风格数据并复用 `/d` / `/p -> common.Proxy -> body.proxy`。
- PC/TV 的完整登录链路仍未声称完成：PC 二维码登录和 token/session refresh 已迁移，PC 密码登录仍涉及 RSA、验证码/OCR、AES-ECB `params` 等后续边界；TV 二维码登录涉及 AppKey 签名与扫码轮询；上传、家庭云中转、rapid/CAS/torrent 仍按结构化错误保留下一步边界。
- AliyundriveOpen 增加短期 list/path/link 缓存，贴近 OpenList `op/cache` 对 repeated `Link()` 的复用效果，减少播放器 Range 请求反复逐层 list 和取下载链接造成的首包等待。
- 189PC/TV 的 session 签名请求实现已拆回各自 OpenList 对应目录；根级 189 专用 common 文件不再存在，后续继续按 `drivers/189pc` 与 `drivers/189_tv` 分别复制相邻源码。

## 2026-05-30 Quark 系列对齐

- 对照 `docs/OpenList-main/drivers/quark_uc` 和 `docs/OpenList-main/server/handles/fsread.go` 修复 Quark/UC runtime 的 OpenList object 路径边界：driver 内部继续用挂载内 `relPath` 解析对象，但 `/api/fs/list` 的 HTTP 边界按 OpenList `ObjResp` 收敛，不向外返回 driver 私有 `path` 字段；FileTab 按当前目录和 `name` 组合下一层路径。
- 新增 `src/kernel/internal/driver/quark_open/driver.js`，按 OpenList `quark_open` 复制请求签名、online API token refresh、`List`、`Link`、`MakeDir`、`Move`、`Rename`、`Remove` 方法边界；上传链路已接 `upload_pre`、proof、`get_upload_urls`、OSS part `PUT` 和 `upload_finish`。
- 新增 `src/kernel/internal/driver/quark_uc_tv/driver.js`，按 OpenList `quark_uc_tv` 暴露 `QuarkTV` 和 `UCTV`，复制 TV 签名、device/query token 保存、refresh token 换取 access token、`List`、`Link`，并保持上游 `MakeDir`/`Move`/`Rename`/`Copy`/`Remove`/`Put` 的 `NotImplement` 边界。
- `UC`、`QuarkOpen`、`QuarkTV`、`UCTV` 已加入 `/api/admin/driver/names`、`/api/admin/driver/info`、`/siyuan-cloud/status.adapters` 和 smoke test；QuarkTV/UCTV 的 OpenList `need verify` 二维码流程已在 Dock 中提供“刷新二维码”入口，扫码后通过 driver test 轮询写回 addition。
- 修复路径规范化和 OpenList `FixAndCleanPath` 的差异：内核与 FileTab 不再对整条路径 `.trim()`，保留文件名组件首尾空格；真实验证 `/夸克网盘/花生十三&飞扬《2025上半年省考笔试系统班》 ` 可正常进入，smoke test 覆盖 Quark 目录名尾随空格。
- Quark/UC、QuarkOpen、QuarkTV/UCTV 接入共享 storage-scoped list/file/link cache，补齐 OpenList `op` 层 `dirCache` / `linkCache` 的关键播放路径行为；连续 `/p` Range 请求不再重复逐层 list 和重新取下载链接，smoke test 用 Quark API 计数断言该行为。
- 普通 `Quark` 的代理默认值改回 OpenList `QuarkOrUC.Init` 语义：新增/更新挂载未显式传 `web_proxy` 时，只有 `use_transcoding_address=false` 才默认 `web_proxy=true`；开启转码地址的新挂载默认返回转码直链，不额外套 `/p`。
- Dock 新挂载表单默认偏向播放体验：BaiduNetdisk `download_api=crack_video`、普通 `Quark` `use_transcoding_address=true`、QuarkTV/UCTV `link_method=streaming`；既有挂载 addition 不自动迁移。

## 2026-05-31 Dock 文件树视图

- Dock 新增“思盘文件”页签，文件树已内联到 `Dock.vue`，结构对齐思源 `layout/dock/Files.ts` 文档树和已有 companion 插件树视图：根级每个条目独立输出 `ul.b3-list.b3-list--background`，展开子级使用相邻 `ul`，行内保留 `--file-toggle-width`、toggle `padding-left` 和缩进线主题参数 `--QYL-indent-1`，让主题背景色与缩进线继续走思源/主题规则；不新增边框/颜色样式规则。注意 `file-tree__sliderDown` 是思源插入后的临时动画类，稳定展开状态必须移除，否则子树会保持 `height: 0`。
- 树数据直接复用 OpenList-compatible `/api/fs/list`，目录展开按需加载并缓存当前层；刷新会清空展开缓存并重新读取根目录。
- 点击目录在 Dock 内展开/折叠；图片按 FileTab 一样打开 Viewer，媒体和书籍文件保留 OpenList-compatible `/p/<path>` `data-href` 供 companion 插件消费，不打开主文件管理 Tab。
- 清理重复打开入口：文件管理 Tab 使用稳定 `custom.data: { singleton: true }` 复用同一个自定义 Tab；Dock 文件页表头打开按钮、Dock 树普通文件点击、挂载卡片点击和 `siyuan://plugins/siyuan-cloud/open?path=...` 文件链接都复用同一个 `openFileManager(path)` 入口。带路径时由已挂载的 FileTab 先打开父目录并复用当前列表项判断：目录路径直接进入目录，文件路径选中目标文件；图片走 Viewer，媒体和书籍交给 companion `data-href` 链接边界。
- Dock 管理页继续按思源原生形态收口：文件、挂载、设置、任务、分享、关于页在顶部导航下方直接渲染统一 `b3-list-item` 页级表头；顶部导航只负责页签切换，文件页表头右侧承载刷新文件树和打开主文件管理按钮；文件树直接挂在 Dock 下，不经过额外内容包装层，其他页由 `ol-body` 统一提供滚动和左右内容边距，内部列表项清掉额外左右 margin，挂载页保留原有挂载卡片和表单卡片。分享页直接复用 OpenList-compatible `/api/share/list`、`/api/share/enable`、`/api/share/disable`、`/api/share/delete`，提供复制链接、启用/禁用和删除。
- Dock 文件页签现排第一，挂载页签第二；FileTab 与 Dock 文件树的右键菜单、路径分组和删除确认共用 `src/utils/file_actions.ts`。Dock 文件树删除根目录挂载入口时同样走 `/api/fs/remove`，内核会删除对应 storage，和挂载列表删除保持一致；挂载、用户、分享删除都需要二次确认。
- 挂载编辑从 `/api/admin/storage/get` 回填完整明文 addition，driver 表单不再用 password input 隐藏令牌，保存时保留表单未展示字段，避免 refresh token/access token 这类字段被空默认值覆盖。
- 这是前端 Dock 可用性增强，不新增 kernel route 或 OpenList capability，因此 `/siyuan-cloud/status.stages` 暂不增加新阶段，避免把 UI 视图误标为内核迁移能力。

## 2026-06-01 189CloudTV 扫码登录

- 对照 `docs/OpenList-main/drivers/189_tv/utils.go` 补齐 189CloudTV 的 TV 二维码登录链路：`getQrCodeUUID.action` 获取 UUID，Dock 前端把 UUID 登录 URL 生成二维码并通过 `/api/admin/driver/test` 展示 `need verify`，扫码后 `qrcodeLoginResult.action` 换取 `access_token`。
- `refreshTvSession` 继续复用 OpenList `loginFamilyMerge.action` AppKey/HMAC 签名边界，把 `sessionKey`、`sessionSecret`、`familySessionKey`、`familySessionSecret`、`loginName` 写回 addition；已删除临时 `temp_uuid`，避免扫码完成后重复轮询旧二维码。
- Dock 二维码展示兼容完整 `data:image/*;base64,...`、`qr_data` base64 和 `qr_text` 文本；189CloudTV 使用前端生成二维码，避免 SiYuan 3.6.5 kernel runtime 缺少 `TextEncoder` 时失败，QuarkTV/UCTV 仍兼容原来的 `qr_data` base64。
- Dock 扫码轮询成功后会直接保存/更新挂载并关闭表单；未扫码时保留当前二维码，不再因为一次 `verify: null` 轮询响应清空二维码。
- 189CloudTV 对齐 OpenList `Init` 的个人/家庭云参数规范化：家庭云默认 `root_folder_id=-11` 改为空，个人云空根目录改为 `-11`；家庭云未填写 `family_id` 时调用 `getFamilyList.action` 自动写回，减少 `parentId ... file not found or invalid` 这类根目录/家庭 ID 不匹配错误。
- 189CloudTV/189CloudPC 的 JSON 解析补齐 OpenList `types.go` 中 `String` ID 的行为：`id`、`parentId`、`familyId`、`fileId` 等 15 位以上数字字段在 `JSON.parse` 前先转成字符串，避免 JS 超过安全整数后把目录 ID 舍入，导致第三级目录用错误 `parentId` 请求并返回 `file not found or invalid`。
- `pnpm test:kernel` 新增 189CloudTV `need verify -> temp_uuid -> access_token/sessionKey` 覆盖；`pnpm build` 和 `node --check dist/kernel.js` 已验证通过。
- 189CloudTV 上传、rapid/CAS/torrent 和家庭云上传细节仍是结构化占位；189CloudPC 密码登录、PC AES `params`、上传和 CAS/torrent 仍待单独迁移。

## 2026-06-05 123Pan 上传链路

- 对照 `docs/OpenList-main/drivers/123/{driver.go,upload.go,util.go,types.go}` 补齐 `123Pan` 的 OpenList `Put` 控制流：`upload_request` 使用 `duplicate=2`、MD5 `etag`、`parentFileId`、文件名和大小；远端返回 `Reuse` 或空 `Key` 时直接结束。
- 远端返回临时 S3 AK/SK/session 时走 S3 兼容 `PUT` 后调用 `/file/upload_complete`；否则按 OpenList `newUpload` 路径获取 `s3_upload_object/auth` 或 `s3_repare_upload_parts_batch` 预签名 URL，按 16MiB 分片 `PUT`，最后调用 `/file/upload_complete/v2`。
- `pnpm test:kernel` 新增 `/api/fs/put -> 123Pan upload_request -> presigned PUT -> upload_complete/v2` 覆盖，断言 OpenList 请求字段、MD5、分片授权字段和上传 payload。

## 2026-06-05 AliyundriveOpen 上传链路

- 对照 `docs/OpenList-main/drivers/aliyundrive_open/upload.go` 补齐 AliyundriveOpen 普通上传主链路：`openFile/create` 使用 `drive_id`、`parent_file_id`、`name`、`type=file`、`check_name_mode=ignore`、本地创建/修改时间和 `part_info_list`。
- 非 `rapid_upload` 响应按 OpenList 默认 20MiB 分片 `PUT` `part_info_list[].upload_url`，允许上游 `200` / `409`，最后调用 `openFile/complete`。
- `rapid_upload=true` 且文件大于 100KiB 时按 OpenList `PreHashMatched` 分支迁移：首轮 `openFile/create` 写入前 1024 字节 SHA1 `pre_hash`，收到 `PreHashMatched` 后二轮写入 `proof_version=v1`、`content_hash_name=sha1`、全量 SHA1 `content_hash` 和基于 access token MD5 proof range 的 `proof_code`。
- `internal_upload` 继续复用 OpenList 的上传 URL 内网域名替换边界。
- `pnpm test:kernel` 新增 `/api/fs/put -> AliyundriveOpen openFile/create -> upload_url PUT -> openFile/complete` 普通上传覆盖，以及 `PreHashMatched -> content_hash/proof_code -> rapid_upload=true -> openFile/complete` rapid 覆盖。

## 2026-06-05 QuarkOpen 上传链路

- 对照 `docs/OpenList-main/drivers/quark_open/{driver.go,util.go,types.go}` 补齐 QuarkOpen `Put` 控制流：上传前计算 MD5/SHA1，使用 `upload_pre` 手动签名请求提交 `file_name`、`size`、`format_type`、`pdir_fid`、`same_path_reuse` 和 proof 字段。
- `upload_pre.data.finish=true` 时按 OpenList 秒传边界直接结束；否则按 `part_size` 生成 `part_info_list`，调用 `get_upload_urls` 获取 OSS 上传 URL 和公共 header。
- 分片上传按 OpenList `upPart` 设置 `Authorization`、`X-Oss-Date`、`X-Oss-Content-Sha256`、`Accept-Encoding=gzip`、`User-Agent=Go-http-client/1.1`，收集 ETag 后调用 `upload_finish`。
- `pnpm test:kernel` 新增 `/api/fs/put -> QuarkOpen upload_pre -> get_upload_urls -> OSS PUT -> upload_finish` 覆盖，断言哈希、proof、part 信息、OSS header、ETag 回传和 finish payload。

## 2026-06-05 BaiduNetdisk 上传链路

- 对照 `docs/OpenList-main/drivers/baidu_netdisk/{driver.go,util.go,types.go}` 补齐 BaiduNetdisk `Put` 控制流：空文件按上游拒绝，先走 `PutRapid -> create`，失败后回退到 `precreate -> locateupload -> superfile2 -> create`。
- 上传表单字段保持 OpenList 命名：`rtype=3`、`block_list`、`content-md5`、`slice-md5`、`local_mtime`、`local_ctime`、`uploadid`；动态上传域名使用 `d.pcs.baidu.com/rest/2.0/pcs/file?method=locateupload&appid=250528&upload_version=2.0`。
- 分片上传保持 OpenList `superfile2` 边界：`POST {uploadUrl}/rest/2.0/pcs/superfile2`，query 写入 `method=upload`、`access_token`、`type=tmpfile`、`path`、`uploadid`、`partseq`，multipart 表单字段名为 `file`。
- `pnpm test:kernel` 新增 `/api/fs/put -> BaiduNetdisk create rapid fallback -> precreate -> locateupload -> superfile2 -> create` 覆盖，断言 rapid/final create、precreate、locateupload、superfile2 的字段和上传内容。

## 2026-06-05 OneDrive 上传链路

- 对照 `docs/OpenList-main/drivers/onedrive/{driver.go,util.go,types.go}` 补齐 OneDrive `Put` 分支：`<=4MiB` 继续走 `PUT /content`，大文件走 `createUploadSession` 并按 `chunk_size` MiB 分片 `PUT uploadUrl`。
- 大文件分片保持 OpenList `Content-Range: bytes start-end/size` 边界，SiYuan runtime 通过 `forwardProxy` base64 透传分片正文；`chunk_size` 沿用 OpenList addition 默认单位 MB。
- `/api/fs/get_direct_upload_info` 现在会在 driver 实现 `getDirectUploadInfo` 时转发，OneDrive `enable_direct_upload=true` 返回 OpenList `HttpDirect` 语义的 `upload_url`、`chunk_size`、`method=PUT`；普通虚拟 FS 和未实现驱动仍返回 `null`。
- `pnpm test:kernel` 新增 `/api/fs/put -> OneDrive createUploadSession -> Content-Range PUT` 和 `/api/fs/get_direct_upload_info -> OneDrive createUploadSession` 覆盖，断言 upload session body、分片 range、累计上传大小和 direct upload info。

## 2026-06-05 Quark/UC、S3、WebDav 上传补齐

- 对照 `docs/OpenList-main/drivers/quark_uc/{driver.go,util.go,types.go}` 补齐普通 Quark/UC `Put` 主链路：上传前计算 MD5/SHA1，调用 `file/upload/pre`、`file/update/hash`，非秒传时按 `metadata.part_size` 分片。
- Quark/UC 分片保持上游 `upPart/upCommit/upFinish` API：`file/upload/auth` 的 `auth_meta` 按 OSS `PUT`/`POST` canonical 文本生成，分片 `PUT https://{bucket}.{upload_url[7:]}/{obj_key}?partNumber=&uploadId=`，收集 ETag 后发 `CompleteMultipartUpload` XML，再调用 `file/upload/finish`。
- S3/Doge 补齐 OpenList `GetDirectUploadInfo`：`enable_direct_upload=true` 时返回 `HttpDirect` 风格 `upload_url` 和 `method=PUT`，URL 按 `PutObjectRequest.Presign` 等价的 SigV4 query presign 生成，并支持 `direct_upload_host` 替换。
- WebDav `Put` 对齐 OpenList `WriteStream` callback：上传请求显式设置 `Content-Type` 和 `Content-Length`，正文仍走当前 `forwardProxy` PUT。
- `pnpm test:kernel` 新增 `/api/fs/put -> Quark file/upload/pre -> file/update/hash -> file/upload/auth -> OSS PUT/CompleteMultipartUpload -> file/upload/finish` 覆盖，以及 S3 `/api/fs/get_direct_upload_info` presigned URL host/path/query 覆盖。

## 2026-06-05 189 上传边界复核

- 已对照 `docs/OpenList-main/drivers/189/{driver.go,util.go,help.go,types.go}` 和 `docs/OpenList-main/drivers/189pc/{driver.go,utils.go,types.go}` 复核上传入口。
- 普通 189Cloud 新增 `src/kernel/internal/driver/189/upload.js`，按 OpenList `drivers/189/util.go` 拆出 `getSessionKey -> uploadRequest -> newUpload` 的相邻文件边界；`Put` 已接入 `initMultiUpload/getMultiUploadUrls/commitMultiUploadFile` 控制流，字段保持 `parentFolderId`、`fileName`、`fileSize`、`sliceSize`、`fileMd5`、`sliceMd5`、`partInfo`、`uploadFileId`、`lazyCheck`、`opertype`。
- `uploadRequest` 的 URI、header 名和签名文本已按 OpenList 保留：`https://upload.cloud.189.cn{uri}?params=`、`SessionKey`、`Signature`、`X-Request-Date`、`X-Request-ID`、`EncryptionText`、`PkId`。`help.go` 的 AES-ECB/PKCS7 `AesEncrypt`、RSA PKCS#1 v1.5 `RsaEncode`、`b64tohex` 和 HMAC-SHA1 已在本地 helper 中按上游算法补齐，仍需用真实 189 账号和大文件确认远端兼容性。
- 189PC/TV 上传比 189 普通版更大，包含 `StreamUpload`、`FastUpload`、`RapidUpload`、`OldUpload`、family transfer、CAS/torrent 生成和断点进度；本批不写未对齐的假实现，下一步先迁移可测试的 189 crypto/upload request 基础层。

## 2026-06-06 189Cloud 账号密码登录

- 对照 `docs/OpenList-main/drivers/189/login.go` 补齐普通 `189Cloud` 的 `newLogin` 主链路：访问 `loginUrl.action`，读取跳转 URL 的 `lt/reqId/appId`，调用 `appConf.do` 和 `encryptConf.do`，使用 OpenList 同款 RSA PKCS#1 v1.5 十六进制输出提交 `loginSubmit.do`。
- 由于思源 `/api/network/forwardProxy` 不像 Go resty 一样自动维护 cookie jar，新增 `src/kernel/internal/driver/189/login.js` 收集 `Set-Cookie` 并合并保存到 storage addition 的 `cookie` 字段，后续 list/upload 请求复用 `cookieUserSession` / `COOKIE_LOGIN_USER` 等真实登录态。
- `pnpm test:kernel` 新增普通 `189Cloud` 不预置 cookie、只用 username/password 登录后列目录的覆盖，并断言登录提交使用 RSA 包裹字段、后续 list 带上登录态 cookie；原上传 smoke 继续覆盖 upload request header、加密 `params`、分片 PUT 和 commit 流程。
- 已接入普通 `189Cloud` 登录的短信二次验证分支：`loginSubmit.do` 返回 `-133` 时只调用一次 `sendSmsCodeForSecondAuth.do`，Dock 保存本次 `verify.second_context` 并在用户输入短信码后通过 driver `verify()` 直达 `submitForSecondAuth.do`，不再把二次验证状态写入 addition；验证码/captcha 分支仍待后续按上游或网页登录脚本补齐。

## 2026-06-07 189Cloud 二次验证收口进度

- 继续对照 OpenList `drivers/189/login.go` / `util.go` 的 resty cookie jar 行为，确认 JS runtime 不能只在登录阶段保存 cookie；普通 189Cloud 的业务请求 `listFiles.action` 等也会返回新的 `Set-Cookie`，必须在每次 189 API 响应后合并写回 addition，才能模拟 OpenList 同一个 client 持续浏览第一层、第二层目录的会话状态。
- `src/kernel/internal/driver/189/driver.js` 已从 `remoteJson` 改为 `forwardProxy + remember189Cookies`，业务请求会吸收响应 cookie；已有 cookie 时文件浏览不再自动重新登录或发送短信，cookie invalid 时直接提示回挂载设置重新短信验证，避免文件列表消耗短信次数。没有 cookie 的普通账号仍允许一次 `login189({ allowSms: false })` 普通登录；若远端返回 `-133`，浏览链路只报需要二次验证，不发送短信。
- `/api/admin/driver/test` 的短信提交路径已改为 `driver.verify()` 直达 `submitForSecondAuth.do`，不再把 `sms_code` 混入 addition 后重新走 `test/login`，避免“点击验证”变成再次发送短信。调试用 `console.log`、`debug` 字段和旧的 `cloud189_second_*` 临时 addition 写入已清理。
- Dock 短信验证成功后必须先应用后端返回的 `payload.data.addition` 再保存挂载；已修复 `submitDriverSmsCode()` 成功分支漏写回新 cookie 的问题，否则会出现“短信验证成功保存，但文件列表立刻用旧 cookie 报 invalid”。现在成功后调用 `applyDriverTestData(payload.data)`，再 `saveMount({ skipDriverTest: true })` 保存，避免保存时再次触发 driver test/login。
- smoke test 已覆盖：`-133 -> sendSmsCodeForSecondAuth.do` 只发送一次短信、短信码提交只调用 `submitForSecondAuth.do`、短信验证后的 addition 可创建挂载、第一层 list 接收新 `Set-Cookie` 后第二层 list 使用刷新 cookie、缺二次验证时浏览不发短信、坏 cookie 不自动重登发短信。
- 已验证：`node --check src/kernel/internal/driver/189/{driver,login}.js`、`node --check scripts/kernel-route-smoke.mjs`、`pnpm test:kernel`、`pnpm build` 均通过；构建已输出到 `E:/sy/data/plugins/siyuan-cloud`。
- 真实账号验证暂停：2026-06-07 用户 189Cloud 短信次数已达上限，不能继续消耗短信。明天优先只做一次真实验证：重载插件后进入 189Cloud 挂载设置重新获取验证码，提交后检查挂载 addition 中是否保存了新的 `cookie`，再打开一级目录和二级目录；若仍 invalid，下一步只增加一次脱敏 cookie 名称/请求阶段诊断，不再反复触发短信。

## 2026-06-07 115 Cloud 初始运行时

- 对照 `docs/OpenList-main/drivers/115/{driver.go,util.go,types.go,meta.go}` 和 OpenList 依赖的 `github.com/SheltonZhu/115driver` v1.3.3，新增 `src/kernel/internal/driver/115/driver.js`。普通 `115 Cloud` 已接入 runtime 并进入 `/api/admin/driver/names`；`115 Open` / `115 Share` 仍保持 metadata-only。
- 已迁移 cookie 登录检查、二维码 token 换 cookie、`webapi.115.com/files` 分页 list、路径逐级解析、`/api/fs/get` 对象响应、`files/add`、`files/move`、`files/copy`、`files/batch_rename`、`rb/delete`、`files/index_info` 容量信息，以及 `proapi.115.com/app/chrome/downurl` 所需的 `m115` RSA/XOR 请求/响应编解码 helper。下载仍走 OpenList `Link() -> common.Proxy -> body.proxy` 边界。
- 继续按 OpenList `meta.go` 和 `driver.go` 收口：`cookie` 与 `qrcode_token` 不写成 schema `required`，保持上游“二选一”的 help/运行时登录校验语义；Dock 表单把 `root_folder_id`、`cookie`、`qrcode_token`、`qrcode_source` 作为 115 主字段默认展开，并补齐中英 i18n help 与二维码来源选项。`limit_rate` 现在按 OpenList `WaitLimit` 粒度在公开操作入口限速，默认值和字段名保持上游 addition。
- 115 上传没有伪实现：OpenList `Put` 依赖 115 ECDH rapid-upload、SHA1 pre-hash/full-hash、OSS token、普通 OSS PUT 和 multipart complete，本轮保留 `no_upload=true` 和明确错误，后续单独迁移 `drivers/115/upload` 相关边界。
- `pnpm test:kernel` 新增 115 Cloud 暴露到 driver names、挂载 list/get、基础管理 form 字段和 storage details 覆盖；加密下载响应需要真实 115 服务端私钥侧数据，mock 只覆盖协议入口和非下载链路。

## 2026-06-05 用户基线对齐

- 新增 `src/kernel/internal/model/user.js`，集中 OpenList 用户角色、默认 admin/guest、权限位、脱敏响应和导入规范化，避免 auth/admin/config import 三处字段继续漂移。
- 默认管理员在 kernel onload 时读取思源 `/api/system/getConf`，优先使用当前思源账号昵称/用户名作为 OpenList admin username，并保存 `siyuan_account` 扩展信息；拿不到账号时保留 `admin`。guest 用户按 OpenList 保留为 disabled。
- `/api/auth/login`、`/api/auth/login/hash` 不再无条件回退 admin，必须匹配存在且未禁用的用户；当前密码仍是本端轻量兼容字段，未迁移 OpenList `PwdHash/Salt` 安全模型。JWT 和 `pwd_ts` 请求上下文已按 OpenList `common.GenerateToken/ParseToken` 与 `middlewares.Auth` 的主语义迁移；`/api/auth/login/ldap` 保留为明确 `501` 占位，等真正迁移 OpenList 的 LDAP bind/search 认证后再启用。
- `/api/admin/user/list/get/create/update/delete/cancel_2fa` 按 OpenList `server/handles/user.go` 收口：列表分页返回 `PageResp`，响应脱敏 password/otp_secret，禁止创建 admin/guest，禁止修改 role，禁止禁用 admin，禁止删除 admin/guest。
- Dock 新增“用户”页签，复用现有 `ol-mount-row` / `ol-mount-form` 和思源 `b3-*` 原生 class，支持刷新、新增、编辑、启用/禁用、删除、取消 2FA，并在初始化时用 `/api/me` 同步登录验证用户名。
- `pnpm test:kernel` 增加默认思源账号同步、用户 CRUD、角色限制和 admin 禁用限制覆盖；`pnpm build` 和 i18n key diff 已通过。
- 未完成：密码仍未迁移 OpenList `PwdHash/Salt` 双重哈希存储，logout token invalidation cache、SSO/WebAuthn/LDAP 完整登录、2FA/SSH key 真实挑战仍是兼容表面；权限位和 request context 已贯穿 share/task/普通 FS/WebDAV/S3/archive/torrent/search 的主要入口。

## 2026-06-06 Dock 挂载编辑回填

- 确认挂载账号字段不另存隐藏位置：`/api/admin/storage/create/update/get` 按 OpenList storage `addition` 边界保存并返回，123Pan 的 `username`、`password`、`access_token` 都在配置中的 `storage.addition`。
- 修正 Dock 编辑挂载时的 driver metadata 刷新时序，避免 `verifyDriver` watcher 把已保存的 addition 重置成默认空表单；新增挂载在挂载页顶部动作和列表加号入口均可打开同一表单。
- 管理读取接口在返回 storage/user 前刷新 syncable `config.json` 域，确保同步器更新配置文件后，再点击编辑能拿到最新挂载 addition；`runtime.json` 和 `search-index.json` 不参与这条热路径，避免文件列表/播放被全量重读拖慢。
- Dock 底部“添加挂载”卡片显式声明 `DockRow` props，修复 `clickable` 不稳定导致的无反应；password/token/secret/cookie/private 类 driver 字段默认隐藏，右侧眼睛按钮按需显示。
- `/api/fs/remove` 删除根目录下的挂载入口时改为保存 config 域，避免 Dock 文件树删除挂载后又被下一次 config 刷新恢复。
- `pnpm test:kernel` 新增 123Pan storage get 回读、外部改写 `config.json` 后 storage get 刷新、FS 删除挂载落盘断言；`pnpm build` 通过。
- 复核 LocalBrowse / media-player-private 后确认：它们能访问本地盘，是因为前端 Electron 环境直接 `window.require('fs')`；本项目因此不再让 kernel 通过 `forwardProxy` 调 loopback bridge。新增 `src/utils/local_fs.ts` 前端薄适配，`src/utils/api.ts` 的 `fs*` helper 命中 Local 挂载时直接走 Electron `fs.promises`，FileTab 和 Dock 继续复用同一套列表、右键菜单和删除确认逻辑；Local 重新出现在 Dock 挂载列表，但 OpenList HTTP kernel API 不代理本地盘。
- Local 根目录语义收口：`root_folder_path=/` 或空值表示本机全部设备入口，Windows 下枚举 A-Z 可访问盘符；`D:\`、`E:\` 或 `D:\folder` 表示只挂载指定盘符/目录。根目录 `/api/fs/list` 合并 kernel 挂载入口和前端 Local 入口时按路径去重，避免一个 Local storage 在 FileTab/Dock 显示两份。
- 对照 LocalBrowse 的历史问题补齐 Local 稳定性边界：盘符枚举、`stat`、`readdir` 增加超时保护，避免网络盘/异常设备拖住 UI；全部设备入口是虚拟目录，禁止删除、重命名、写入；跨盘移动遇到 `EXDEV` 时降级为复制后删除。

## 2026-06-29 能力契约矩阵

- `/api/public/api` 在保留旧 `capabilities: string[]` 的同时新增 `capability_summary`、`capability_matrix` 和 `driver_capabilities`。矩阵按 `done`、`partial`、`placeholder`、`unsupported` 标记系统能力，并给 `partial`/`placeholder` 写明下一步。
- `/siyuan-cloud/status` 复用同一份 `capability_summary` 和 `driver_capabilities`，Dock 和 companion 插件后续可以按机器可读状态决定是否显示入口，而不是只看 route 或 driver 名。
- 首批 driver 方法矩阵覆盖 Dock 暴露的 runtime driver：SiYuanWorkspace、Local、WebDav、OpenList/AList、S3/Doge、115、123、189、AliyundriveOpen、BaiduNetdisk、OneDrive、Quark/UC/QuarkOpen/QuarkTV/UCTV。虚拟 FS 是思盘内置根能力，不再作为 `SiYuanKernel` driver 暴露；115 上传、189PC rapid/CAS、offline、archive entry range、RAR/7z/ISO 等明确保持 placeholder/unsupported。
- `pnpm test:kernel` 已补 smoke 断言，校验 capability summary、代表性 `partial`/`placeholder`/`unsupported` 项，以及 115、189CloudPC、QuarkTV 的方法级状态；`pnpm build` 和生成 bundle 语法检查通过。

## 2026-06-29 Task 队列基座 / Index 异步模式

- `src/kernel/internal/task/manager.js` 在保留旧 `addTask()` 立即完成记录语义的同时新增 `enqueueTask()`：任务先写入 `pending`，单 worker 队列调度为 `running`，worker 可调用 `progress()` 更新进度/状态，完成后落为 `succeeded`，异常落为 `failed`，取消请求落为 `canceling/canceled`。
- `TASK_TYPES` 新增 `index` 分组，并自动暴露 `/api/task/index/{done,undone,info,cancel,delete,retry,...}`。这是后续搜索、解压、离线下载等重能力复用同一任务表面的最小基座。
- `/api/admin/index/build` 和 `/api/admin/index/update` 保持默认同步行为不变；请求体传 `async: true`、`task: true` 或 `queued: true` 时返回 `{ task }` 并后台执行索引构建/更新。
- smoke test 新增异步 index update 覆盖：创建 `index` task，轮询 `/api/task/index/info` 到 `succeeded`，再确认 `/api/task/index/done` 可发现该任务。
- 仍未完成：copy/move/decompress/offline/upload 等重操作还未迁入 queue；retry 仍是轻量状态重置，未恢复原 worker；插件重载后未完成 worker 还不能恢复。

## 2026-06-29 Index Stop 取消传播

- `src/kernel/internal/search/index.js` 的构建流程新增 `shouldCancel` 检查点，walk 目录前、子节点循环中、写入节点前都会检查取消请求；取消时写入 progress error 并抛出，使 task worker 落到 canceled。
- `/api/admin/index/stop` 不再固定返回 `index is not running`。现在会查找当前 `index` undone task，调用 `taskStore.markCanceled("index", task.id, user)`，并把 progress 写成 `is_done=true`、`error="index canceled"`、`task_id=<id>`。
- `/api/admin/index/progress` 现在返回 search progress 的同时带 `task` 和 `task_id`，方便 Dock 或调用方关联 `/api/task/index/info`。
- smoke test 覆盖 stop 竞态：若 stop 抢到正在运行/排队的 index task，则断言该 task 最终 canceled；若小索引已经完成，则保留 OpenList-compatible 400 边界并确认 task 已处于完成态。
- 仍未完成：自动增量 hook、插件重载后恢复未完成 worker、retry 恢复原 worker、OpenList 多 search backend 选择。

## 2026-06-29 密码哈希与 Logout Token 失效

- 对照 OpenList `internal/model/user.go`，本端新增 `StaticHash(password)=sha256(password + "-https://github.com/alist-org/alist")`、`PwdHash=sha256(static + "-" + salt)` 的 JS 实现，用户新增/改密会写入 `pwd_hash`、`pwd_salt/salt` 和 `pwd_ts`，不再保存新明文密码。
- 旧配置中的明文 `password` 仍可兼容登录；首次成功明文登录时会迁移为 `pwd_hash/pwd_salt` 并清空 `password`。`/api/auth/login/hash` 现在校验 OpenList static hash，而不是无条件登录。
- `sanitizeUser()` 会移除 `pwd_hash`、`pwd_salt`、`salt`、`logout_tokens` 等敏感字段，避免 admin user list/get/create 响应泄露。
- `/api/auth/logout` 现在只失效当前 JWT：保存 token fingerprint 到用户 `logout_tokens` 短列表，`currentUser` 解析 JWT 后会拒绝已 logout 的 token。admin token 和 legacy `siyuan-cloud-port:<id>` 集成 token 不进入该黑名单。
- smoke test 覆盖 logout 后旧 JWT 401、新登录 JWT 可用、用户响应不泄露 hash/salt、`login/hash` 使用 static hash 成功、改密后旧 JWT 仍因 `pwd_ts` 失效。
- 仍未完成：2FA/WebAuthn/SSO/LDAP 的真实挑战链路、配置导入时更全面的 secret 迁移/脱敏策略。

## 2026-06-29 123Pan API Host 切换

- 真实登录验证确认：`login.123pan.com/api/user/sign_in` 仍返回 token，但旧 OpenList 常量 `https://www.123pan.com/b/api/user/info` 即使带新 token 也返回 `200 text/html` 网页兜底，导致 `invalid character '<' looking for beginning of value`。
- 初始修复 OpenListTeam/OpenList#2677 使用 `api.123278.com` / `api.123pan.cn`，但上游后续合并的 OpenListTeam/OpenList#2678 覆盖范围更完整：`Api`、`AApi`、`BApi`、`123 Share` 和下载跳转 referer 统一从 `www.123pan.com` 改为 `yun.123pan.com`。
- 本端 `123Pan` runtime 已跟随 #2678，把 `API` / `B_API`、`origin/referer` 和下载跳转 Referer 统一切到 `https://yun.123pan.com`；当前尚未迁移独立 `123_share` runtime。

## 2026-06-30 默认挂载收口

- 新状态不再自动创建 `/` 的 `SiYuanKernel` 默认挂载；虚拟 FS 根目录继续由 `state.entries["/"]` 提供，并且不再作为可添加 driver 暴露。
- 文件管理根目录不再自动插入 `@workspace` 入口；`/@workspace` 路径仍可被显式访问、局部索引和测试。用户手动添加 `SiYuanWorkspace` 挂载后，可通过自定义挂载路径进入工作空间。
- `/api/admin/config/import` 和配置加载会过滤历史 `SiYuanKernel` storage，避免旧 `/` 或测试内核挂载继续出现在挂载页。
- 已有配置中的旧 `/`、`@workspace` 相关入口或 `verify-*` 测试挂载不会被自动删除；用户可以在挂载页手动删除，避免升级时误删真实自定义配置。

## 2026-07-01 WebDAV 对齐与文件 UI 收敛

- WebDav driver 已按 `docs/OpenList-main/drivers/webdav` 和 `docs/OpenList-main/pkg/gowebdav` 主流程重整：列表走 `PROPFIND Depth:1`，对象 stat/get 走 `PROPFIND Depth:0`，跳过 self collection，文件名优先取 href basename，`read()` 只返回 OpenList `model.Link` 风格 URL/header，预览地址交给 `/d`、`/p` 统一代理。
- 为了避免图片 503、目录 404、图片查看器打开第一张等问题继续被前端补丁掩盖，WebDAV 差异后续只在 driver/gowebdav 对齐层处理；当前明确剩余项包括 cookie jar、SharePoint `odrvcookie`、`tls_insecure_skip_verify`、Basic/Digest 401 negotiation、409 parent retry 和 no-redirect link probe。
- FileTab 与 Dock 的文件行为收敛为一套维护点：`src/utils/file_ui.ts` 负责图片 Viewer、URL、大小、prompt、错误提示等 UI 小工具；`src/utils/file_actions.ts` 负责下载、复制链接、分享、删除、右键菜单和文档链接生成。组件只保留各自的列表渲染、选择状态和路径解析。
- 已修复 Dock 与 FileTab 图片预览中的 `handleError is not defined`，并在 Viewer shown 后显式切到点击项，避免从第一张图片开始显示。

## 2026-07-05 Quark 小差异收口

- 普通 Quark/UC runtime 的请求路径改为吸收 OpenList 上游同款 `__puus` cookie，Quark 转码模式同时吸收 `__pus`，并通过 `saveDriverStorage` 写回 addition；补齐 `/member` 容量 details，能力矩阵标记 Quark/UC `details=done`。
- QuarkOpen 上传 proof 生成前会按 OpenList `Init` 语义确保 `/open/v1/user/info` 返回 `user_id`，并保存到 addition 供 kernel runtime 后续请求复用；若拿不到 user ID，按上游语义返回明确错误，不再用空 user id 继续上传。
- 修正 QuarkOpen driver metadata 中“multipart upload placeholder”的过期说明；实际上传链路仍是已迁移的 `upload_pre -> get_upload_urls -> OSS PUT -> upload_finish`。

## 2026-07-06 WPS 云文档接入

- 对照 `docs/OpenList-main/drivers/wps/{meta.go,driver.go,util.go,types.go}` 新增 `src/kernel/internal/driver/wps/driver.js`，接入 Cookie 登录校验、Personal/Business 模式、根目录路径解析、群组/文件列表、文件 `Link`、`MakeDir`、`Move`、`Copy`、`Remove`、`Rename` 和容量详情。
- `WPS` 已加入 `/api/admin/driver/names`、driver metadata 和中英文 i18n；字段保持 OpenList addition key：`root_folder_path`、`cookie`、`mode`、`custom_ua`。
- WPS 下载/播放沿用 OpenList `Link -> /p -> common proxy -> body.proxy` 边界。上传保持 `no_upload=true`：OpenList 依赖 Go 后端流式处理 SHA1/SHA256、外部 PUT/POST 和 commit，当前思源 JS kernel 不在请求线程里执行这条重链路。
- 新增 `assets/docs/zh_CN/驱动说明/WPS 云文档.md` 和 `assets/docs/en_US/Drivers/WPS.md`，记录 Cookie 获取、Personal/Business 模式、字段、测试清单和当前边界。

## 2026-07-21 GitHub Releases 只读驱动

- 对照 `docs/OpenList-main/drivers/github_releases/{meta.go,driver.go,types.go,util.go,models.go}` 新增 `src/kernel/internal/driver/github_releases/driver.js`，接入 `repo_structure` 解析、latest release、all versions、README/LICENSE、source code zip/tar.gz 和 `gh_proxy` 下载链接改写。
- `GitHub Releases` 已加入 `/api/admin/driver/names`、`/api/admin/driver/info`、`/siyuan-cloud/status.adapters` 和 capability matrix。它是 OpenList 上游同款只读驱动：`List/Get/Link/read` 可用，`MakeDir/Move/Rename/Copy/Remove/Put` 保持 `NotImplement`/unsupported 边界。
- `pnpm test:kernel` 新增 fake GitHub API 覆盖：latest asset + README + source code、all-version tag 目录、版本下 asset/source code、token header、OpenList `path:org/repo` 结构和 `gh_proxy` link/raw_url。

## 2026-07-07 189Cloud 家庭云收口

- 对齐 OpenList `drivers/189pc` 的家庭云初始化：`189CloudPC` 刷新 PC session 后会规范化 `type=family` 的根目录，把 `root_folder_id=-11` 转为空根目录，并在 `family_id` 留空时调用 `family/manage/getFamilyList.action` 自动写回家庭 ID。
- 普通 `189Cloud` 仍按上游网页端个人云边界处理；家庭云明确走 `189CloudPC` 或 `189CloudTV`。中英文 189Cloud 系列文档已补充家庭云选择、`family_id` 自动/手动填写和根目录规则。
- smoke test 新增 `189CloudPC` family 模式验证，覆盖 `family_id` 回填和家庭云根目录归一；能力矩阵与 driver metadata 说明同步更新，避免继续显示“PC 二维码登录占位”的旧状态。

## 2026-07-07 S3 Link/Reader 收口

- 对照 OpenList `drivers/s3/driver.go` 的 `Link` 语义，`src/kernel/internal/driver/s3/driver.js` 新增独立 `link()`，供 `/api/fs/link` 返回 GET 预签名 URL；`read()` 继续保留插件内 S3 签名读取，供 `/p` 代理、`/d` 下载、思阅/伴侣插件稳定消费，避免 PDF.js Range 请求触发上游预签名 403。
- S3/Doge GET link 补齐 `custom_host`、`enable_custom_host_presign`、`remove_bucket` 和 `response-content-disposition` 文件名参数；`force_path_style` 默认值修正为 OpenList 的关闭状态，避免缤纷云 S4 这类 virtual-host style 服务被默认拼成 path-style。
- smoke test 新增 S3 `/api/fs/link` 和 `/p/remote-s3/object.txt` 断言，分别覆盖 GET 预签名 URL、文件名响应参数和本地 `/p` 读取不返回 403；S3 兼容存储文档补充缤纷云 S4、PDF/思阅打不开、`custom_host` 与 path-style 排查说明。

## 2026-07-10 文件交互与上传边界收口

- FileTab 支持 Ctrl/Shift 多选、Ctrl+A、Esc、Delete、Enter；选中项按当前可见排序批量下载或批量发送到 Motrix Next，右键菜单仍复用 `src/utils/file_actions.ts`。
- FileTab 与 Dock 文件树拖入文档复用 `openListDocumentLink/openListDragHtml`：图片生成 Markdown 图片，音频生成 `<audio controls src="...">`，视频生成 `<video controls src="...">`，其它文件生成 `siyuan://plugins/siyuan-cloud/open?path=...` 链接。
- S3/Doge 上传优先请求 OpenList `HttpDirect` 直传信息并用预签名 PUT 直接上传；无直传或直传失败时回落到显式 base64 `/api/fs/put`，避免 multipart 在 SiYuan JS kernel 中丢失文件内容导致 0KB。
- WPS 上传保持 `no_upload=true`：OpenList 的 WPS 上传由 Go 后端流式处理；当前思源 JS kernel 的 base64 解码、SHA1/SHA256 校验和 forwardProxy 上传会阻塞思源运行环境，不能在请求线程里假装完成。

## 下一步

1. 上传链路后续优先沿用 OpenList direct upload 或分阶段直传；需要大文件哈希、分片和 commit 的驱动不能继续依赖思源 JS kernel 内同步 base64/forwardProxy 路径。WPS 上传若要启用，需要先改为前端分阶段直传或 Worker/流式方案。
2. 权限上下文后续继续对齐 OpenList auth 安全细节：2FA/WebAuthn/SSO/LDAP 的真实挑战和登录链路；主要 request context、`AuthAdmin`、权限位、S3 signing、`PwdHash/Salt` 和 logout token invalidation 已完成。也可以转向真实异步 task manager。
3. Offline/torrent 后续继续对齐 `server/handles/offline_download.go`、`server/handles/torrent.go` 和相关 tool/driver：真实 aria2/qbit/transmission/SimpleHttp/ed2k，以及 189/189PC driver 侧 CAS rapid upload 方法；通用 torrent generate 已在本端可读文件范围内完成。
4. 任务后续增强继续对齐 `internal/task` + `tache`：补真实异步 manager、取消传播、重试调度、进度更新和 task group coordinator。
5. 搜索后续增强继续对齐 `internal/search/build.go`：补 auto_update_index hook 和更接近 OpenList searcher backend 的配置边界。
6. 驱动继续按 `docs/OpenList-main/drivers/*` 逐目录迁移：优先真实账号验证普通 189Cloud 短信二次验证后的一级/二级目录和大文件上传；随后攻 189PC/TV upload/rapid/CAS/torrent，再按用户高频驱动补 runtime。metadata-only 驱动不能暴露到 Dock 挂载列表。
7. Archive 若继续扩格式，只接有真实 reader、明确许可证/wasm 打包路径和 smoke fixture 的 RAR/7z/ISO 等格式；否则继续保持结构化占位。
8. Archive 媒体预览下一步不要与普通网盘视频播放混淆：普通百度视频走 driver `Link()` / `/p` / `body.proxy`，压缩包内视频走 `/ae` 解压 entry。若要让压缩包内视频可稳定播放，需要实现 archive entry Range 响应或改为下载/外部打开；当前内嵌 `<video src="/ae?...">` 可能一直加载，这是能力边界。
9. 每个 capability batch 必须补 smoke test，并同步更新本计划、`docs/kernel-architecture.md`、`docs/kernel-plugin-notes.md` 和 Dock 进度文案。

## 下轮对话接续清单

- 当前已验证：`node ./scripts/kernel-route-smoke.mjs`、`pnpm build`、`node --check dist/index.js`、`node --check dist/kernel.js`。
- Archive 当前真实能力：ZIP stored/deflate、tar、tgz/tar.gz 的 meta/list/extract/decompress；普通 `/ae`、driver path `/ad`/`/ap`、share `/@s` meta/list 和 `/sad` extract；虚拟 FS 与 mounted driver `put()` 目标解压上传。百度 mounted ZIP 已支持 range meta/list/extract 和 GBK 中文文件名；ZIP 加密只检测并返回 `501 wrong archive password`，尚未解密。
- Archive 当前明确占位：RAR、7z、其它 OpenList archive tool；这些需要真实 JS/wasm reader、许可证/资源打包复核和 fixture，不能只加后缀入口。
- Archive 当前已知瓶颈：压缩包内视频预览不等同普通百度视频直链播放，`/ae` 尚不是完整 Range seek entry proxy；新对话若继续优化视频，应优先设计 archive entry Range 响应。
- Torrent 当前真实能力：parse/upload_parse、普通单文件 generate、可选 189 `x-cas` 元数据生成、rapid_upload driver-boundary；真正远端 CAS 秒传仍需在 189/189PC runtime driver 中接入 `rapidUploadFromTorrent`。
- 下一轮建议转向 Offline/torrent 的真实工具/189 CAS 边界，或补 OpenList 密码哈希/logout invalidation/2FA-WebAuthn 安全细节；若继续 archive，则先解决 wasm 静态资源打包和 RAR/7z fixture，再接 `src/kernel/internal/fs/archive.js`。
