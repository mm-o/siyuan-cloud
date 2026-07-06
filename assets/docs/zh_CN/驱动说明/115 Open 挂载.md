# 115 Open 挂载

本教程适用于 `115 Open`。

`115 Open` 对齐 OpenList 的 115 开放平台驱动，使用官方 115 开放平台 API。它和 `115 Cloud` 的 cookie/二维码登录路线不同，主要依赖 `access_token` 与 `refresh_token`。

上游参考：<https://doc.oplist.org/guide/drivers/115_open>

## 适合场景

- 使用 115 开放平台授权访问自己的 115 网盘。
- 不想使用普通 115 Cloud 的 cookie 登录方式。
- 需要按 OpenList 字段保存 `access_token`、`refresh_token` 和 `root_folder_id`。

## 相关驱动

- [[115 Cloud 挂载]]：普通 115 网盘，使用 `cookie` 或 `qrcode_token`。
- [[115 Share 挂载]]：115 分享链接挂载，只读浏览分享内容。

## 当前版本边界

当前思盘已接入 `115 Open` 运行时，字段、驱动名和主要行为按 OpenList `115 Open` 对齐：支持 token 刷新、列表、详情、读取、链接、创建目录、移动、复制、删除、重命名和空间详情。

上传路径仍是结构占位，因为 OpenList 上游使用 115 Open SDK 的 SHA1 校验和 OSS 分片上传流程，思盘内核端还没有完整移植该上传链路。

## 注意账号使用

请规范使用 115 账号。不要把账号用于多人共享、图床/软件床、视频外链到视频网站播放等分发用途；因不规范使用导致账号受限或封禁，后果需要自行承担。

速度和稳定性同时受本地网络、115 服务端网络和运行设备性能影响。

## 获取 Token

OpenList 文档推荐通过 OpenList API 工具获取 115 Open 授权：

1. 访问 <https://api.oplist.org/>。
2. 在下拉框中选择 115 网盘验证。
3. **重点：如果使用 OpenList 内置密钥对，务必勾选“使用 OpenList 提供的参数”。** `Client ID` 和 `Application Secret` 留空，然后点击“获取 Token”。
4. 如果使用自己在 115 开放平台注册的应用，不勾选“使用 OpenList 提供的参数”，填写自己的 `AppId` 和 `AppSecret`，再点击“获取 Token”。
5. 在弹出的 115 登录授权页面中登录账号并授权。
6. 授权成功后复制页面显示的 `Access Token` 和 `Refresh Token`。

115 开放平台地址：<https://open.115.com>

## Root Folder ID

默认根目录 ID 是 `0`。

如果只想挂载某个子目录：

1. 打开 115 网盘官网。
2. 进入要作为根目录的文件夹。
3. 查看浏览器地址中的 `cid` 参数。
4. 把 `cid` 后面的数字填到 `root_folder_id`。

示例：

```text
https://115.com/?cid=249163533602609229&offset=0&tab=&mode=wangpan
```

这个目录的 `root_folder_id` 是：

```text
249163533602609229
```

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd>。
2. 驱动选择 `115 Open`。
3. 挂载路径填写 `/115-open`。
4. `root_folder_id` 默认 `0`，或填写上面获取到的目录 `cid`。
5. 填写 `access_token` 和 `refresh_token`。
6. 按需调整排序、分页和限速字段。
7. 保存挂载。

| 推荐项 | 值 |
| --- | --- |
| 驱动 | `115 Open` |
| 挂载路径 | `/115-open` |
| `root_folder_id` | `0` |
| `order_by` | `file_name` |
| `order_direction` | `asc` |
| `page_size` | `200` |
| `limit_rate` | `1` |

## 字段

| 字段 | 说明 |
| --- | --- |
| `root_folder_id` | 根目录 ID，默认 `0` |
| `access_token` | **必填**，访问令牌 |
| `refresh_token` | **必填**，刷新令牌 |
| `order_by` | 排序字段：`file_name`、`file_size`、`user_utime`、`file_type` |
| `order_direction` | 排序方向：`asc` 或 `desc` |
| `page_size` | 分页大小，OpenList 字段默认 `200` |
| `limit_rate` | 请求限速，OpenList 字段默认 `1` |

## Token 与安全

- 如果 Token 泄漏，可以前往 115 设备登录管理解除应用授权。
- 115 网页端设备管理入口：<https://115.com/?mode=device_manage>
- 115 APP 解除授权需要较新的 iOS/Android 版本；OpenList 文档提到版本需不低于 `35.11.0`。
- 同一个账号在同一个应用下可以获取两次 `Refresh Token`；第三次获取后，第一次获取的 `Refresh Token` 会失效。
- 失效后常见错误类似：`failed get objs: failed to list objs: code: 40140116, message: no auth`。

## 注意

- OpenList 文档说明：115 的 token 刷新不需要 AppKey，并且有基于 IP 的频控。
- OpenList 文档中的“使用其他 APP ID 获取刷新令牌”和“手机扫码授权 PKCE 模式”仍标注为尚未实现。
- 思盘会在 115 Open 接口返回鉴权过期时尝试刷新 `access_token` / `refresh_token`，并保存回挂载配置。
- 当前上传尚未接入，上传失败时请先使用其他已支持上传的驱动。

## 排查

| 现象 | 处理 |
| --- | --- |
| 找不到目录 | 检查 `root_folder_id` 是否为 115 网页 URL 中正确的 `cid` |
| `no auth` | 重新获取 `access_token` 和 `refresh_token`，并确认旧授权没有被撤销 |
| Refresh Token 失效 | 同一应用重复获取第三次 token 会让第一次 token 失效，重新保存最新 token |
| 上传失败 | 当前 `115 Open` 上传尚未接入 |
