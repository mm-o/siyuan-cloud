# 115 Share 挂载

本教程适用于 `115 Share`。

`115 Share` 对齐 OpenList 的 115 分享驱动，用于挂载别人或自己创建的 115 分享链接。它和 `115 Cloud` 一样使用 `cookie` 或 `qrcode_token` 登录，但文件来源是分享链接，因此 OpenList 上游将它标记为只读、不可上传。

上游参考：<https://doc.oplist.org/guide/drivers/115>

## 适合场景

- 浏览 115 分享链接中的目录和文件。
- 通过思盘代理读取或播放分享里的文件。
- 需要按 OpenList 字段填写 `share_code`、`receive_code` 和 `root_folder_id`。

## 相关驱动

- [[115 Cloud 挂载]]：普通 115 网盘，使用 `cookie` 或 `qrcode_token`。
- [[115 Open 挂载]]：115 开放平台授权，使用 `access_token` 和 `refresh_token`。

## 分享链接字段

常见 115 分享链接类似：

```text
https://115.com/s/swnxxxxxxx?password=abcd
```

对应字段：

| 字段 | 值 |
| --- | --- |
| `share_code` | `swnxxxxxxx` |
| `receive_code` | `abcd` |

如果分享链接没有提取码，`receive_code` 按 OpenList 字段仍建议保留为空字符串或按页面提示填写。

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd>。
2. 驱动选择 `115 Share`。
3. 挂载路径填写 `/115-share`。
4. 填写 `cookie`，或点击“刷新二维码”后用 115 移动端扫码登录。
5. 填写 `share_code` 和 `receive_code`。
6. `root_folder_id` 默认 `0`；如果只挂载分享里的某个子目录，填对应目录 ID。
7. 保存后浏览 `/115-share`。

| 推荐项 | 值 |
| --- | --- |
| 驱动 | `115 Share` |
| 挂载路径 | `/115-share` |
| `root_folder_id` | `0` |
| `page_size` | `1000` |
| `limit_rate` | `2` |

## 字段

| 字段 | 说明 |
| --- | --- |
| `cookie` | 115 登录 cookie；与 `qrcode_token` 二选一 |
| `qrcode_token` | 二维码登录 token；与 `cookie` 二选一 |
| `qrcode_source` | 二维码来源，默认 `web`；可选 `web`、`android`、`ios`、`tv`、`alipaymini`、`wechatmini`、`qandroid` |
| `share_code` | **必填**，分享链接里的分享码 |
| `receive_code` | **必填**，分享链接里的提取码 |
| `root_folder_id` | 分享内根目录 ID，默认 `0` |
| `page_size` | 分页大小，OpenList 默认 `1000` |
| `limit_rate` | 请求限速，OpenList 默认 `2` |

## 当前版本边界

- 已接入列表、详情、读取和下载链接。
- 在挂载表单里选择 `115 Share` 后，点击“刷新二维码”会生成二维码；扫码确认后会自动换取 `cookie` 并清空临时二维码字段。
- `qrcode_source` 会用于最终扫码确认接口 `/app/1.0/{source}/1.0/login/qrcode`。`linux` 端已被 115 下架，表单默认使用 `web`；需要模拟特定客户端时再选择 `android`、`ios`、`tv` 等来源。
- 与 OpenList 一致，`115 Share` 不支持创建目录、移动、复制、删除、重命名和上传。
- 链接缓存按 User-Agent 区分。

## 排查

| 现象 | 处理 |
| --- | --- |
| 分享不存在或无法进入 | 检查 `share_code` 是否只填写分享码，不要填完整 URL |
| 提取码错误 | 检查 `receive_code` 是否为链接里的 `password` 值 |
| 缺少账号 | 填写有效 `cookie`，或点击“刷新二维码”重新扫码 |
| 播放或解析链接时 115 表单数据异常 | 请升级到已修复版本。115 表单请求会显式 URL 编码，避免生成数据里的 `+` 被当作空格。 |
| 无法管理文件 | `115 Share` 是 OpenList 只读驱动，请使用 `115 Cloud` 或 `115 Open` 管理自己的网盘 |
