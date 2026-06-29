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
- `/api/fs/other` 对齐 OpenList `server/handles/fsread.go` / `internal/fs/other.go` / `internal/op/fs.go` 的边界：handler 解析 `path/method/data/password`，按最长挂载把用户路径转成 storage actual path，再调用 driver `other`；`OpenList/AListV3` runtime 直接转发远端 `/api/fs/other`，`AliyundriveOpen` 对照上游 `Other(video_preview)` 调用 `openFile/getVideoPreviewPlayInfo`，没有 `other` 的驱动返回 OpenList 风格 `not implement`，不伪造行为。
- `/api/fs/batch_rename` 和 `/api/fs/regex_rename` 对齐 OpenList `server/handles/fsbatch.go` 的 `fs.Rename` 边界：虚拟 FS、`/@workspace` 和 mounted driver 都使用同一组 `src_dir` / `src_name` / `new_name` / regex 字段，driver 路径先转为 storage actual path。
- `/api/fs/recursive_move` 和 `/api/fs/remove_empty_directory` 在 mounted driver 上按 OpenList 批量边界调用 driver `list` / `move` / `remove`；同一 storage 内执行，跨挂载批量移动仍保持明确未实现。
- `/api/fs/copy` 和 `/api/fs/move` 的 `skip_existing` 行为对齐 OpenList：冲突项可跳过，后续 names 继续处理；copy 的 `merge` 只在目标为目录时继续。
- `/api/fs/search` 查询持久 `search_nodes`，字段和分页对齐 OpenList `server/handles/search.go` / `model.SearchNode`：`parent`、`name`、`is_dir`、`size`、`type`，关键词、scope 和 parent 过滤对齐 `internal/db/searchnode.go` 的非全文搜索形态。搜索不实时扫描目录；需要先通过 `/api/admin/index/build` 全量构建，或用 `/api/admin/index/update` 指定 `paths` 局部构建。`parent="/"` 是全局搜索，`parent="/mount"` 搜该路径整棵子树。索引构建已按 OpenList `internal/search/build.go` 跳过 `ignore_paths` 和 storage `disable_index`。它仍不是 OpenList `internal/search` 的完整多后端实现，后续还需补异步构建、停止取消、auto update 和 Bleve/Meilisearch/database 配置边界。
- `/api/fs/torrent/parse` 和 `/api/fs/torrent/upload_parse` 已按 OpenList `server/handles/torrent.go` / `pkg/torrent` 迁移 JS bencode reader，返回 `name/total_size/piece_length/piece_count/info_hash/files/has_cas/cas`；`/api/fs/torrent/generate` 可为本端可读单文件生成真实 torrent，并在 `with_cas=true` 时注入 OpenList 189 `x-cas` 扩展；`/api/fs/torrent/rapid_upload` 已保留 driver `rapidUploadFromTorrent` 边界，等待 189/189PC runtime 接入远端 CAS 秒传。
- `/api/fs/get` 负责返回 OpenList object data；媒体播放优先使用 `raw_url`。需要代理的 storage 返回 `/plugin/private/siyuan-cloud/p/<path>`，非代理 storage 可以保留 driver `Link()` URL。
- `/d/<path>` 和 `/p/<path>` 走 `fs.Link -> common.Proxy -> body.proxy`，不要恢复 per-driver 播放补丁。

## 非完整能力面

当前项目不是 OpenList 全量实现。以下能力只能按“浅兼容/占位/待迁移”理解：

- 搜索：已有本地持久 search node index、admin index build/update/clear/progress、`ignore_paths` / `disable_index` 跳过规则和按索引查询初版；仍缺 OpenList 完整 searcher backend、异步 running/stop 取消、自动增量和多后端配置。
- 任务：`/api/task/*` 已对齐 OpenList `server/handles/task.go` 的 TaskInfo 字段、done/undone 数组和 info/cancel/delete/retry/batch/clear/retry_failed 返回形态；批量接口只接受 OpenList JSON 字符串数组请求体。move/copy/offline/decompress 这类当前会创建轻量 task record 的入口会写入请求用户 `creator/creator_id/creator_role`，task list/info/cancel/delete/retry/clear 会按当前用户过滤，管理员可见全量。仍缺 OpenList `internal/task` + `tache` 的真实异步队列、取消传播、重试调度、实时进度和 task group coordinator。
- 分享：`/api/share/*` 已按 OpenList `model.Sharing` 主字段和 `server/handles/sharing.go` 管理路由收口，支持 `id/files/pwd/accessed/max_accessed`、多文件分享根、密码/过期/禁用校验、按 share id + client IP 去重的访问计数、`/api/fs/{list,get}` 公开读取和 `/sd/{id}` 下载；share create/update 保存清洗后的路径而不要求本地 `state.entries` 存在，公开读取时可通过 `driverRuntime` 解析挂载云盘文件；`/sd` 下载按 storage/driver 策略在 plugin proxy 与 driver redirect 间分流，不保留额外强制代理开关；管理路由支持 OpenList query `id`，config import 保留字符串/CJK share ID，archive meta/list 已识别 OpenList `/@s` 分享 split 并真实解析单文件或子路径分享压缩包，`/sad/{id}` 已可在密码校验后委托 archive entry 提取。显式 token 的分享管理请求已接入 creator owner 过滤、`CanShare`/自定义 ID、`base_path` 和 nearest meta 读访问检查；公开读取、`/sd`、`/@s` archive 和 `/sad` 现在会在分享密码/过期/次数之外复核 creator 当前未禁用、目标路径仍在 creator `base_path` 内且通过 nearest meta 读/password/hide 检查。仍未等价于 OpenList 完整 `internal/sharing`。
- 离线/torrent/archive：route 已注册或返回结构化占位，archive extension discovery 已按 OpenList archive tool keys 对齐，`/api/fs/archive/meta|list` 能读取虚拟 FS 或 mounted driver `read()` body/link 中 ZIP、tar、tgz/tar.gz 的目录树和 inner_path 列表；`/@s` 分享 archive meta/list 已解包到真实分享文件；`/ae`、`/ad`、`/ap` 和 `/sad` 可提取 ZIP stored/deflate 与 tar/tgz entry；`/api/fs/archive/decompress` 已支持解压到虚拟 FS 或带 `put()` 的 mounted driver 目标并返回 `task` 数组。ZIP 加密条目只检测，不解密，`pass` / `archive_pass` 当前返回明确 `501 wrong archive password`；`/api/fs/add_offline_download` 已对齐 OpenList `urls` trim/空行跳过和 `{ tasks: [...] }` 外形，torrent parse/upload_parse/generate 已有 JS bencode reader/generator 和 CAS 扩展读取/写入。但 aria2/qbit/transmission/SimpleHttp、ed2k、189/189PC 远端 CAS rapid、rar/7z 和其它 archive reader 未迁移。
- Auth/Admin：SSO/WebAuthn/2FA/SSH key/user/security settings 多数为兼容表面或轻量状态，不等价于 OpenList 安全模型。

用户基线已经按 OpenList `model.User` 字段收口到 `src/kernel/internal/model/user.js`：默认 admin/disabled guest、`role`、`base_path`、`permission`、`sso_id`、`allow_ldap`、`pwd_ts` 和脱敏响应都在这里规范化。kernel onload 会读取思源 `/api/system/getConf`，把默认 admin username 同步成当前思源账号昵称/用户名，并保留 `siyuan_account` 扩展信息；拿不到账号时继续使用 `admin`。`/api/auth/login` 和 `/api/auth/login/hash` 已返回 OpenList-style HS256 JWT payload（`username/pwd_ts/exp/iat/nbf`），settings `token` 作为 admin token，空 Authorization 按 OpenList `Auth` 语义解析为 guest，用户密码变更会让旧 JWT 因 `pwd_ts` 不匹配失效；旧 `siyuan-cloud-port:<id>` 仅作为既有插件集成兼容入口保留。`/api/admin/*`、admin meta/message/index/scan/sshkey 子路由已统一套 `AuthAdmin` 等价边界，`/api/me`、SSH key 和 2FA 使用当前 request user。当前用户权限位已用于 share 管理侧 creator/base_path/meta 检查，并在公开分享读取时复核 creator 当前权限；task 记录和 task API 已按 creator 做轻量过滤；普通 FS list/get/dirs/other 和 mkdir/upload/rename/move/copy/remove/batch rename/recursive move/remove empty/offline 已按 OpenList `user.JoinPath`、`CanAccess`、`CanRead`、`CanWrite` 和对应 permission bit 做入口校验。WebDAV 入口已按 OpenList `WebDAVAuth` 的 `CanWebdavRead` / `CanWebdavManage` 方法分组过滤；S3 上游是 access key/secret 认证，本端已消费 `s3_access_key_id`、`s3_secret_access_key` 和 `s3_buckets`，配置 AK/SK 后要求 AWS SigV4 header/query 签名，未配置时保留轻量兼容免签；显式 `siyuan-cloud-port:<id>` token 请求继续作为插件集成入口复用 WebDAV 读/管权限过滤。Archive meta/list/decompress、torrent generate/rapid_upload 和 search 也已按各自 OpenList handler 的入口语义接入权限边界。

## 流式代理边界

当前思源本体需要带 PR #17748 的 kernel plugin `body.proxy` 能力。插件的 `src/kernel/server/common/proxy.js` 对齐 OpenList `server/common/proxy.go`：driver `read()` 返回 `model.Link` 风格 URL/header，公共代理层合并浏览器请求头和 driver header，保留 `Range` / `If-Range` 等播放器请求头，过滤 hop-by-hop header，并交给思源 `body.proxy`。思源内核负责校验 http/https、限制 GET/HEAD、使用 SSRF-safe dialer、禁用自动解压、服务端受控跟随下载重定向并保留代理请求头、复制最终上游状态和安全响应头、过滤 `Set-Cookie`，并把上游 body 直接流式写回客户端。

`/api/network/forwardProxy` 只用于云盘 API 请求、登录刷新、链接解析、HEAD 探测和小体积元数据，不再作为视频/音频正文代理。新增 driver 时，能拿到下载 URL 的路径应优先实现 `Link()`/`read()` 返回 link，然后复用 `/d` 和 `/p`。

## Mount 与 Driver

存储挂载按最长 `mount_path` 分派。`driverRuntime.resolve` 对齐 OpenList `op.GetStorageAndActualPath` 的边界：HTTP 层路径只在这里拆成 storage 和挂载内 `actualPath`，driver 只接收挂载内路径。`driverRuntime.resolve` 同时给 driver 注入 storage-scoped `saveDriverStorage` callback，用来复刻 OpenList `MustSaveDriverStorage -> saveDriverStorage` 边界。

当前已有初始 runtime adapter：

- `OpenList` / `AListV3`
- `WebDav`
- `S3` / `Doge`
- `115 Cloud`
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

`/api/admin/driver/names` 只暴露已接 runtime 或前端可处理的驱动，Dock 挂载列表不再显示纯 metadata-only driver。其他 OpenList driver 名称仍保留在 `src/kernel/internal/driver/info.js` 和 `/api/admin/driver/list` 作为 metadata/config-only placeholder，等待按 `docs/OpenList-main/drivers/*` 继续迁移。`Local` 不走 kernel 代理：思源 kernel 插件运行时不能直接访问宿主文件系统，`forwardProxy` 也会拦截 loopback/private IP；桌面端由前端 Electron `window.require('fs')` 直接读写本地目录，FileTab 和 Dock 仍复用同一套 `fs*` helper 与右键菜单逻辑。

OpenList upstream 的 driver 目录远多于当前 runtime adapter。未接 runtime 的驱动不能因为 metadata 存在就标记为可用；已接 runtime 的驱动也要按方法边界区分 list/get/link、manage、upload、direct upload、rapid/CAS/torrent、login/refresh 是否完成。

当前已对照 `docs/OpenList-main/drivers/*/meta.go` 做过一轮字段/config 校正：WebDav、123Pan 保持 `PreferProxy`；S3/Doge 保持 `CheckStatus` 并补齐 upstream addition 字段；OpenList 保留 `ProxyRangeOption` / `LinkCacheMode=auto` metadata；AliyundriveOpen、Quark/UC/QuarkOpen/QuarkTV/UCTV、Local 保留 upstream default root、no overwrite、no upload、only proxy、no cache/no link url 等 config 差异；普通 `Quark` 不固定 `PreferProxy`，而是在新建/更新挂载时按 OpenList `Init` 语义，仅当未启用 `use_transcoding_address` 时默认写入 `web_proxy=true`；115 Cloud 保留 OpenList `LinkCacheMode=ua` 和 `cookie`/`qrcode_token` 二选一登录语义，已接 list/get/link/basic management/details runtime，并按 `LimitRate -> WaitLimit` 在公开操作入口限速，但上传仍按 `no_upload=true` 暂不声明完成。

驱动下载/播放边界按 OpenList `Link(ctx, file, args) -> common.Proxy` 组织。115 Cloud、OneDrive、123Pan、WebDav、BaiduNetdisk、AliyundriveOpen、189Cloud、189CloudPC、189CloudTV、Quark/UC/QuarkOpen/QuarkTV/UCTV 等 runtime adapter 的 `read()` 应返回 `model.Link` 风格数据，由 `/d`、`/p` 统一交给 `src/kernel/server/common/proxy.js` 和 SiYuan `body.proxy`。不要让具体 driver 自行下载完整文件正文作为播放路径。

OneDrive 上传已对齐 OpenList `drivers/onedrive` 的 `Put` 分支：小文件走 Graph `PUT /content`，大文件走 `createUploadSession` 后按 addition `chunk_size` MiB 写 `Content-Range` 分片。`enable_direct_upload=true` 时，`/api/fs/get_direct_upload_info` 会调用 driver 并返回 OpenList `HttpDirect` 风格的 upload URL、chunk size 和 `PUT` method；未实现 direct upload 的驱动继续返回原有 `null`。

123Pan 上传已对齐 OpenList `drivers/123` 的 `Put -> upload_request -> S3 upload -> upload_complete` 边界：上传请求使用 MD5 `etag`、`duplicate=2` 和父目录 ID；非复用文件按 16MiB 分片走 `s3_upload_object/auth` / `s3_repare_upload_parts_batch` 预签名 URL 后调用 `upload_complete/v2`，带临时 S3 AK/SK/session 的响应走 AWS v4 签名 `PUT` 后调用 `upload_complete`。后续继续用真实大文件和远端响应差异收敛 multipart 细节。

AliyundriveOpen 上传已对齐 OpenList `drivers/aliyundrive_open/upload.go` 的主链路：`openFile/create` 生成 `part_info_list`，非 `rapid_upload` 响应按默认 20MiB 分片 `PUT` 上传 URL，最后调用 `openFile/complete`。`rapid_upload=true` 且文件大于 100KiB 时复刻 `PreHashMatched` 分支：首轮提交前 1024 字节 SHA1 `pre_hash`，二轮提交全量 SHA1 `content_hash`、`proof_version=v1` 和基于 access token MD5 proof range 的 `proof_code`。`internal_upload` 保留 OpenList 的内网上传 URL 替换边界。

百度上传已对齐 OpenList `drivers/baidu_netdisk` 的 `Put` 主链路：先尝试 `PutRapid -> create`，失败后计算全量 MD5、首 256KiB slice MD5 和 4MiB 起步的 `block_list`，再走 `precreate -> locateupload -> superfile2 -> create`。SiYuan runtime 通过 `forwardProxy` 以 base64 透传 multipart 分片，但 HTTP API 形态、query/form 字段和 `file` 表单字段名保持 OpenList 一致。

Quark/UC 普通版上传已对齐 OpenList `drivers/quark_uc` 的 `Put -> upPre -> upHash -> upPart -> upCommit -> upFinish` 主链路：`file/upload/pre`、`file/update/hash`、`file/upload/auth`、OSS part `PUT`、OSS `CompleteMultipartUpload` XML 和 `file/upload/finish` 的 API、字段和 `auth_meta` canonical 文本保持上游命名。S3/Doge 的 `GetDirectUploadInfo` 按 OpenList `PutObjectRequest.Presign` 行为生成 SigV4 query presign，并支持 `direct_upload_host` 替换；WebDav `Put` 显式写 `Content-Type` 和 `Content-Length`，对齐 upstream `WriteStream` callback。

百度 `download_api=crack_video` 的本地策略保持简单：只有视频/音频走 OpenList `linkCrackVideo`，其它文件走 official，避免 PDF、EPUB、图片等非媒体文件误进视频 API。

`src/kernel/internal/driver/common.js` 提供轻量 storage-scoped list/file/link cache，用来贴近 OpenList `internal/op/cache.go` 的 `dirCache` / `linkCache` 行为。BaiduNetdisk、AliyundriveOpen、Quark/UC、QuarkOpen、QuarkTV/UCTV 等播放路径必须复用对象解析和下载链接，避免播放器每个 Range 请求都重新逐层 list、重新取直链；管理操作后清理对应 storage cache。

189CloudPC 和 189CloudTV 的迁移对照 `docs/OpenList-main/drivers/189pc` 与 `docs/OpenList-main/drivers/189_tv`：已接入 OpenList `List`、`Link`、`MakeDir`、`Move`、`Copy`、`Remove`、`Rename` 的签名请求边界和 addition 字段。189CloudTV 已接 OpenList TV 二维码登录：`getQrCodeUUID.action` 获取 UUID，Dock 前端生成二维码并通过 `/api/admin/driver/test` 返回 `need verify`，扫码后轮询 `qrcodeLoginResult.action` 写回 `access_token`，再用 `loginFamilyMerge.action` 刷新 `sessionKey/sessionSecret`。二维码生成留在前端，避免 SiYuan 3.6.5 kernel runtime 缺少 `TextEncoder` 时失败。189CloudTV 也复刻 OpenList `Init` 的个人/家庭云根目录规范化，并在家庭云 `family_id` 为空时调用 `getFamilyList.action` 自动写回。189CloudPC 完整密码/二维码登录、PC AES `params`、上传、家庭云中转、rapid/CAS/torrent 仍是结构化占位，后续继续按上游相邻文件复制。189PC/TV 的 session 签名请求实现分别放在 `src/kernel/internal/driver/189pc/session.js` 和 `src/kernel/internal/driver/189_tv/session.js`，不再使用根级 189 公共文件，确保每个驱动目录可以独立对照 OpenList 源目录继续迁移。
189PC/TV 的 JSON 解析保留 OpenList `types.go` 里 `String` ID 的语义：`id`、`parentId`、`familyId`、`fileId` 等大整数先转成字符串再解析，避免 JavaScript 安全整数限制破坏深层目录 parent id。

普通 189Cloud 的账号密码登录已按 OpenList `drivers/189/login.go` 迁移到 `src/kernel/internal/driver/189/login.js`：`loginUrl.action -> appConf.do -> encryptConf.do -> loginSubmit.do`，用户名和密码使用同款 RSA PKCS#1 v1.5 十六进制输出。因为 SiYuan `forwardProxy` 不维护 resty-style cookie jar，本端会在登录跳转和每次 189 业务 API 响应后收集 `Set-Cookie` 并合并保存到 addition `cookie`，让后续 list/upload 复用 `cookieUserSession` / `COOKIE_LOGIN_USER` 等真实登录态。`loginSubmit.do` 返回 `-133` 时，只有显式 driver test 可以调用一次 `sendSmsCodeForSecondAuth.do` 并返回 `verify.second_context`；Dock 提交短信码时由 `/api/admin/driver/test -> driver.verify()` 直达 `submitForSecondAuth.do`，成功后先把后端返回的 addition 写回表单再 `skipDriverTest` 保存挂载，避免保存时再次登录或丢失新 cookie。文件浏览链路不发送短信：已有 cookie invalid 时提示回挂载设置重新验证；没有 cookie 的普通账号可尝试一次不发短信的密码登录，若远端要求二次验证则直接报需要验证。上传文件结构已按 OpenList `drivers/189` 拆出 `src/kernel/internal/driver/189/upload.js`，承载 `getSessionKey -> uploadRequest -> newUpload` 边界，并保持 `initMultiUpload/getMultiUploadUrls/commitMultiUploadFile` 的 URI、header 和 form 字段。`help.go` 的 AES-ECB/PKCS7、RSA PKCS#1 v1.5、`b64tohex` 和 HMAC-SHA1 基础算法已在该 helper 中补齐；smoke test 已覆盖账号密码登录、登录态 cookie 回用、SMS 二次验证只发一次、验证后挂载保存、业务请求刷新 cookie 后二级目录继续浏览、mocked upload request header、加密 `params`、分片 PUT 和 commit 流程。2026-06-07 真实账号短信次数已达上限，下一步需要等次日用真实 189 账号确认短信验证后的一级/二级目录和大文件上传远端兼容性。

Quark 系列按 OpenList 源目录拆分：`quark_uc/driver.js` 对齐 `drivers/quark_uc` 并注册 `Quark`/`UC`，`quark_open/driver.js` 对齐 `drivers/quark_open` 并注册 `QuarkOpen`，`quark_uc_tv/driver.js` 对齐 `drivers/quark_uc_tv` 并注册 `QuarkTV`/`UCTV`。Quark/UC 的 OpenList `File.GetPath()` 返回空，HTTP list/get 由 `server/handles/fsread.go` 的 `ObjResp` 生成响应；本端同样在 `/api/fs/list` 和 `/api/fs/get` 边界收敛字段，不向外返回 driver 私有 `path`。QuarkOpen 已迁移 signed request、online API token refresh、list/link/basic management，以及 `upload_pre -> get_upload_urls -> OSS PUT -> upload_finish` 上传链路；上传 proof 按 OpenList 使用 `proof_seed1/proof_seed2` 和 `proof_code1/proof_code2`。QuarkTV/UCTV 已迁移 device/query token 保存、refresh token、list/link，并保持 OpenList 上游对管理和上传方法的 `NotImplement` 边界。Quark 系列已接入 storage-scoped list/file/link cache，连续 `/p` Range 播放请求不会重复请求 Quark 目录接口和下载链接接口；普通 Quark 的转码链接路径保持 OpenList 行为，新建挂载启用 `use_transcoding_address` 时默认不额外套 `/p` 代理。

Dock 表单的新挂载默认值允许少量体验型偏置：BaiduNetdisk 默认 `download_api=crack_video`，普通 Quark 默认 `use_transcoding_address=true`，QuarkTV/UCTV 默认 `link_method=streaming`；这些只影响新建/编辑表单的 addition 默认值，不自动改写既有挂载。

## 前端边界

- `src/components/FileTab.vue` 是主文件管理 Tab，顶部按钮和右键菜单接入上传、下载、新建、重命名、复制、移动、删除。文件右键菜单、路径分组和删除确认抽到 `src/utils/file_actions.ts`，Dock 文件树复用同一套菜单定义；后续改菜单只改这一处。
- `src/components/Dock.vue` 内联 Dock 轻量文件树，按思源 `layout/dock/Files.ts` 文档树 DOM/class 结构渲染：根级每项独立 `ul.b3-list.b3-list--background`，展开子级使用相邻 `ul`，行内保留 `--file-toggle-width`、toggle `padding-left` 和缩进线主题参数 `--QYL-indent-1`；文件树作为 Dock 的直接子级渲染，不经过额外内容包装层，避免和文件树自身左右间距叠加；它只复用 `/api/fs/list` 按需加载目录，并复用 FileTab 的 OpenList 文件图标、共享右键菜单、图片 Viewer 和 companion `data-href` 链接边界。Dock 文件树删除同样走 `/api/fs/remove` 和二次确认，根目录挂载入口删除会删除对应 storage；不新增边框/颜色样式规则、不新增 kernel route，也不改变 OpenList API surface。不要在稳定渲染树上保留 `file-tree__sliderDown`，该 class 在思源源码中是临时动画态，会让子树 `height: 0`。
- 文件管理 Tab 的打开逻辑保持单入口：`src/App.vue` 用稳定 `custom.data: { singleton: true }` 打开/聚焦同一个自定义 tab，避免重复创建主文件管理 Tab。Dock 文件树普通文件点击、挂载卡片点击和 `siyuan://plugins/siyuan-cloud/open?path=...` 文件链接都复用 `openFileManager(path)`；已挂载的 `FileTab` 先打开父目录并复用当前列表项判断，目录路径直接进入目录，文件路径选中目标文件。图片走 Viewer，媒体和书籍交给 companion `data-href` 链接边界。
- Dock 的文件、挂载、设置、任务、分享、关于页在顶部导航下方直接渲染同一个 SiYuan 原生 `b3-list-item` 页级表头；文件页签排第一，挂载页签排第二。文件页表头右侧承载刷新文件树和打开主文件管理按钮，顶部页签导航不再重复放这两个动作。文件页后面直接接文件树；其他页由 `ol-body` 统一提供左右内容边距和滚动，内部列表项清掉额外左右 margin，挂载页保留原有挂载卡片和表单卡片。挂载编辑会从 `/api/admin/storage/get` 回填完整明文 addition，保存时保留表单未展示字段（例如 refresh token），删除挂载、用户和分享都需要二次确认。分享页直接读取 OpenList-compatible `/api/share/list`，按 OpenList `id/files/pwd` 字段复制 `/sd/{id}` 链接，并用 `/api/share/enable`、`/api/share/disable`、`/api/share/delete` 管理现有分享。
- Dock 用户页复用挂载页的 `ol-mount-row` / `ol-mount-form` 结构和思源原生 `b3-*` 控件，管理 OpenList-compatible users：刷新、新增、编辑、启用/禁用、删除和取消 2FA。初始化时读取 `/api/me`，让登录验证用户名跟随当前思源账号同步后的默认 admin。
- `src/utils/api.ts` 对齐 OpenList Frontend `utils/api.ts`，只放 FS helper。
- `src/utils/request.ts` 对齐 OpenList Frontend `utils/request.ts` 的 `r.post/r.put` 边界，并适配 SiYuan 私有路由前缀。
- `src/utils/handle_resp.ts` 对齐 OpenList Frontend `utils/handle_resp.ts`，把 notify 映射到 `showMessage`。
- `src/utils/archive.ts` 对齐 OpenList Frontend archive preview 的 `fsArchiveMeta -> fsArchiveList -> raw_url + inner` 流程；普通远端/虚拟 FS 压缩包读取能力落在后端 archive handler，本地 Local ZIP/tar/tgz 是 SiYuan 桌面端例外，由前端 Electron 按需读取本地字节并复用同一套 archive reader。内部文件打开复用既有预览边界：图片走 Viewer，音视频优先交给思播兼容入口后回退内嵌播放器，PDF/书籍优先调用 SiReader 公开 `openEpubTab(file,title)` 后回退 iframe；列表渲染不预解压、不提前创建 blob URL。
- `src/utils/dock.ts` 只承载 Dock 管理流：登录、挂载、driver form、config import/export、`external_previews`、验证。
- `src/utils/status.ts` 固定使用私有 HTTP status route，避免当前 SiYuan kernel plugin 的 `/ws/plugin/rpc` 通知通道偶发握手失败影响 Dock；内核仍保留 `siyuan-cloud.status` RPC 供 smoke 和后续能力验证。
- `src/utils/icon.ts` 保留文件图标映射。

UI 原则：优先使用 SiYuan 原生 `b3-*`、`block__icon`、`protyle-breadcrumb`、`fn__*` class 和 `var(--b3-*)` 变量，不新增视觉体系。文件管理按钮保持在路径/搜索右侧。

对外集成边界是 OpenList-compatible HTTP API，而不是前端 `window` 对象。其他项目把 `/plugin/private/siyuan-cloud` 当作 OpenList base URL，直接调用 `/api/*`、`/d/*`、`/p/*`、`/dav/*`、`/s3/*`。`/api/public/api` 和 `/api/public/routes` 返回机器可读的当前 route/capability 清单，避免另维护一份 150+ API 表。

Companion 插件集成复用普通链接点击边界，不进入内核 API。文件管理 Tab 的媒体和书籍文件名只暴露 OpenList-compatible `/p/<path>` 为 DOM `data-href`，由思播、思阅等 companion 插件按它们已有的文档链接拦截逻辑消费。思盘不调用 `window.siyuanMediaPlayer` / `window.sireader`，不派发插件专用事件，也不绕开 OpenList 的 `fs.Link -> common.Proxy -> body.proxy` 边界；`siyuan://plugins/<plugin>/...` 更适合作为文档链接或外部入口协议。

外部软件打开沿用 OpenList Frontend 的 URL Scheme 机制：`external_previews` 保存扩展名到 scheme 模板的映射，第三方播放器插件可通过 HTTP API 读取 `/api/admin/setting/get?key=external_previews`，再按 OpenList Frontend `convertURL` 规则自行生成 `potplayer://$durl`、`vlc://$durl` 等链接。

## 状态与同步

- Frontend/Dock 偏好：`plugin.loadData/saveData`。
- Kernel runtime data：`siyuan.storage`，当前拆分为 `/storage/petal/siyuan-cloud/config.json`（可同步配置：settings/users/storages/metas/sharings/ssh_keys）、`runtime.json`（虚拟 FS、tasks、messages、scan、WebDAV locks、S3 multipart 运行态）和 `search-index.json`（搜索索引）。旧版 `siyuan-cloud/state.json` 只作为迁移来源读取，不能继续写出双层目录。
- 根据思源源码，`data/storage/petal/<plugin>` 默认位于同步仓库内；用户可用 `.siyuan/syncignore` 排除 `/storage/petal/**` 或 `/storage/petal/siyuan-cloud/**`。

## 验证

- `pnpm build`：构建前端和内核 bundle。
- `node --check dist/kernel.js`：检查生成内核 JS 语法。
- `pnpm test:kernel`：运行 `scripts/kernel-route-smoke.mjs`，覆盖 status HTTP/RPC、FS、task、meta、share、WebDAV、S3、ZIP/tar/tgz archive meta/list/extract/decompress、ZIP encrypted detect/501 boundary、share archive meta/list/`/sad` extract、`/ad`/`/ap` extract、offline placeholder、torrent parse/upload_parse/generate 和 rapid-upload driver-boundary，以及 Quark 目录名尾随空格和连续 `/p` Range 请求缓存路径。
- i18n key diff：确认 `src/i18n/en_US.json` 与 `src/i18n/zh_CN.json` key 完全一致。

## 2026-06-25 Archive / Torrent 接续状态

- 百度网盘挂载 ZIP 预览已从“整包拉取”改为 range reader：`driver.read()` 返回 link 时，`src/kernel/server/handles/archive.js` 使用 `parseZipArchiveAsync` 只读 EOCD、central directory 和目标 entry 数据；`/ae` 提取 ZIP stored/deflate entry 时复用同一个 reader。
- ZIP 非 UTF-8 文件名不再依赖运行环境的 `TextDecoder('gbk')`。`src/kernel/internal/fs/gbk.js` 是由 WHATWG `TextDecoder("gbk")` 生成的静态 GBK 表，`src/kernel/internal/fs/archive.js` 的默认 `zipFilenameDecoder` 对非 EFS ZIP 名称走 `decodeGbk`，EFS 名称走 UTF-8。这个修复已在真实百度 ZIP 上验证，`/api/fs/archive/meta` 网络响应里的 `name` 应直接返回中文，例如 `Cap 中文版安装包`。
- 本地 Local archive 和远端/mounted archive 现在都复用同一个 `parseArchive` 默认解码；前端 `src/utils/archive.ts` 不再保留单独的 `localZipFilenameDecoder`。
- `forwardProxy` 已收口：无 body 的 GET/HEAD 请求不再带 `contentType`、`payload`、`payloadEncoding`，避免 AliyundriveOpen / Quark signed URL 因额外 body/header 形状触发 `SignatureDoesNotMatch`。OpenList 对齐参考：AliyundriveOpen `Link` 只返回 URL；QuarkOpen `Link` 返回 URL + Cookie。
- 百度挂载 ZIP 生成 torrent 已接入 range chunk 读取，不再一次拉全量；`src/kernel/internal/fs/torrent.js` 负责单文件 bencode torrent 生成。已避免在 `src/kernel` / `dist/kernel.js` 引入 `async function*` / `for await`，因为旧 SiYuan kernel runtime 可能因此启动失败。
- 当前 archive 视频预览不是普通网盘视频播放链路：普通百度视频点击播放走 driver `Link()` / `/p` / `body.proxy` 和百度视频直链，速度快；压缩包内视频走 `/ae/...zip?inner=...mp4`，需要从远端 ZIP 定位并解压 entry，且 `/ae` 目前不是完整支持播放器 Range seek 的流式 entry proxy。视频一直加载通常是这个能力边界，不是百度直链播放退化。下一步若要优化，应实现 archive entry Range 响应或对压缩包内媒体改为下载/外部打开，不应假装与普通 `raw_url` 播放相同。

已验证命令：

```bash
node ./scripts/kernel-route-smoke.mjs
pnpm build
node --check dist/kernel.js
```

## 2026-06-29 Capability Matrix

- `src/kernel/server/handles/public.js` now exposes structured capability discovery. `/api/public/api` keeps the legacy `capabilities: string[]` list and adds `capability_summary`, `capability_matrix`, and `driver_capabilities`.
- `capability_matrix` uses `done` / `partial` / `placeholder` / `unsupported` so callers can distinguish a completed capability from a registered route or compatibility placeholder. Each partial/placeholder item should carry a short `next` note.
- `driver_capabilities` is method-granular for Dock-exposed runtime drivers: `list/get/link/read/mkdir/rename/move/copy/remove/put/direct_upload/other/details/rapid_upload/torrent/offline`.
- `src/kernel/server/handles/status.js` reuses the same summary and driver matrix, keeping `/siyuan-cloud/status` and `/api/public/api` aligned.
- `scripts/kernel-route-smoke.mjs` asserts the matrix shape and representative driver method statuses.

## 2026-06-29 Task Queue Base

- `src/kernel/internal/task/manager.js` now has two task creation paths. `addTask()` keeps the old immediate record behavior for existing copy/move/decompress/offline placeholders, while `enqueueTask()` creates a real queued task with `pending -> running -> succeeded/failed/canceled` transitions.
- The queue is intentionally small: one in-memory worker lane, persisted task status in `runtime.json`, progress updates through `progress({ progress, status, totalBytes, error })`, and cancel requests through existing `/api/task/{group}/cancel` routes. This is the base for later OpenList `internal/task` and `tache` alignment, not the full coordinator yet.
- `TASK_TYPES` includes `index`, so `/api/task/index/*` is available.
- `src/kernel/server/handles/index.js` keeps synchronous index build/update as the default. Passing `async: true`, `task: true`, or `queued: true` queues an index task and returns `{ task }`.
- Smoke coverage creates an async index update task and verifies it reaches `/api/task/index/done`.

## 2026-06-29 Index Stop

- `src/kernel/internal/search/index.js` accepts `shouldCancel` during build. The directory walker checks it before object reads, during child traversal, and before committing nodes.
- `/api/admin/index/stop` now cancels the active or first undone `index` task through `taskStore.markCanceled`. The queued worker observes the cancel token and finalizes the task as canceled.
- `/api/admin/index/progress` returns the existing progress payload plus `task` and `task_id`, allowing callers to correlate search progress with `/api/task/index/*`.
- The stop smoke test accepts both deterministic outcomes for a tiny local index: successful cancellation when stop wins the race, or `400 index is not running` when the task already completed.

## 2026-06-29 Password Hash And Logout

- `src/kernel/internal/auth/token.js` now mirrors OpenList's two-step password hash shape: static SHA-256 with the OpenList static salt, then SHA-256 with a per-user salt. New and changed passwords are stored as `pwd_hash` plus `pwd_salt/salt`; `password` is cleared.
- `src/kernel/server/handles/auth.js` validates raw passwords through the stored hash and validates `/api/auth/login/hash` against the OpenList static hash. Legacy plaintext users are migrated on successful login.
- `src/kernel/index.js` rejects JWTs whose fingerprint is present in the user's `logout_tokens`, giving `/api/auth/logout` current-token invalidation without blocking immediately reissued tokens.
- User responses are sanitized so password hashes, salts, and logout token fingerprints are not returned.
