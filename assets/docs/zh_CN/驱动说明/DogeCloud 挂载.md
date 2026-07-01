# DogeCloud 挂载

本教程适用于 `Doge`。

`Doge` 是 OpenList 里注册在 S3 驱动包下的多吉云专用变体。它复用 S3 的 bucket、endpoint、region 和对象操作模型，但 OpenList 上游会先用多吉云 API 换取临时 S3 凭证，再用这些临时凭证访问对象存储。

## 适合场景

- 接入多吉云对象存储。
- 希望后续与 OpenList 的 `Doge` 驱动字段和行为保持一致。
- 使用思盘统一浏览、下载、上传和管理对象存储文件。

## OpenList 对齐说明

OpenList 的 `Doge` 与普通 `S3` 的主要差异在初始化阶段：

1. 用户在挂载里填写多吉云访问密钥。
2. OpenList 调用 `https://api.dogecloud.com/auth/tmp_token.json`。
3. 请求体使用 `{"channel":"OSS_FULL","scopes":["*"]}`。
4. 多吉云返回临时 S3 凭证：`accessKeyId`、`secretAccessKey`、`sessionToken`。
5. OpenList 用临时凭证创建 S3 client，之后列表、读取、上传、删除、复制等操作都走 S3 逻辑。
6. 多吉云临时密钥最长 2 小时有效，OpenList 每 118 分钟刷新一次。

上游参考：

- OpenList `drivers/s3/meta.go`：`S3` 和 `Doge` 注册在同一个驱动包。
- OpenList `drivers/s3/doge.go`：`getCredentials()` 调用多吉云临时密钥 API。
- 多吉云临时密钥文档：<https://docs.dogecloud.com/oss/manual-tmp-token>
- 多吉云 S3 SDK 概览：<https://docs.dogecloud.com/oss/sdk-introduction>

## 当前版本边界

当前思盘已经在挂载列表中暴露 `Doge`，并且字段与 OpenList `Doge` 保持一致；但运行时仍复用通用 S3 driver，尚未补齐 OpenList 的多吉云临时凭证换取和 118 分钟自动刷新逻辑。

因此：

- 若你手头只有多吉云永久 AK/SK，并期望驱动自动换临时凭证，当前版本可能还不能完全等价于 OpenList。
- 若你能拿到可直接用于 S3 API 的临时 `accessKeyId`、`secretAccessKey`、`sessionToken`，可以按 S3 兼容字段尝试挂载。
- 如果只是普通 S3 兼容服务，不需要选择 `Doge`，直接使用 `S3` 驱动即可。

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd>。
2. 驱动选择 `Doge`。
3. 挂载路径填写 `/doge`。
4. `bucket` 填多吉云存储空间名。
5. `endpoint` 填多吉云控制台或官方文档提供的 S3 API endpoint，必须带 `https://`。
6. `region` 按多吉云控制台或官方文档填写。
7. `access_key_id`、`secret_access_key`、`session_token` 按当前凭证类型填写。
8. 保存后浏览 `/doge`。

| 推荐项 | 值 |
| --- | --- |
| 驱动 | `Doge` |
| 挂载路径 | `/doge` |
| `root_folder_path` | `/` |
| `endpoint` | 以多吉云控制台 S3 API endpoint 为准，必须带 `https://` |
| `region` | 以多吉云控制台为准 |
| `force_path_style` | 按多吉云控制台或 S3 endpoint 要求选择 |

## 字段

| 字段 | 说明 |
| --- | --- |
| `bucket` | **必填**，多吉云存储空间名 |
| `endpoint` | **必填**，多吉云 S3 API endpoint，必须是绝对 URL |
| `region` | 区域，按多吉云控制台填写 |
| `access_key_id` / `secret_access_key` | OpenList 语义下为多吉云访问密钥；当前运行时按 S3 凭证直接参与签名 |
| `session_token` | 临时 S3 凭证 token；OpenList 会自动获取，当前版本需要你手动提供可用值时再填 |
| `custom_host` | 自定义访问域名 |
| `enable_custom_host_presign` | 预签名时使用自定义域名 |
| `force_path_style` | 路径风格访问 |
| `list_object_version` | `v1` 或 `v2` |
| `enable_direct_upload` | 启用直传信息 |
| `direct_upload_host` | 直传 host |

## 注意

- `Doge` 的目标是完全对齐 OpenList 的多吉云专用 S3 变体。
- 当前版本请把它理解为“字段已对齐、运行时仍按通用 S3 处理”的过渡状态。
- 不要把多吉云 CDN 域名、对象外链域名或网页控制台地址填到 `endpoint`。
- `endpoint` 缺少 `https://` 或 `http://` 时会报 `URL is not absolute`。
- 普通 S3 兼容服务请优先看 [[S3 兼容存储]]。

## 排查

| 现象 | 处理 |
| --- | --- |
| `URL is not absolute` | `endpoint` 必须带 `https://` 或 `http://` |
| 列表失败 | 检查 bucket、endpoint、region、凭证类型和 `session_token` 是否匹配 |
| 签名失败 | 当前运行时还不会自动向多吉云换临时 S3 凭证；确认你填写的是可直接用于 S3 API 的凭证 |
| 上传失败 | 检查临时凭证是否有写权限，或等待后续补齐 OpenList Doge 临时凭证刷新逻辑 |
