# 115 Cloud 挂载

本教程适用于 `115 Cloud`。

## 适合场景

- 浏览 115 网盘目录。
- 通过思盘代理下载和播放文件。
- 使用 115 的移动、复制、删除、重命名、创建目录等基础管理能力。

## 相关驱动

- [[115 Open 挂载]]：115 开放平台授权，使用 `access_token` 和 `refresh_token`。
- [[115 Share 挂载]]：115 分享链接挂载，只读浏览分享内容。

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd>。
2. 驱动选择 `115 Cloud`。
3. 挂载路径填写 `/115`。
4. 填写 `cookie`，或点击“刷新二维码”后用 115 移动端扫码登录。
5. `root_folder_id` 默认 `0`。
6. 保存后浏览 `/115`。

| 推荐项 | 值 |
| --- | --- |
| 驱动 | `115 Cloud` |
| 挂载路径 | `/115` |
| `root_folder_id` | `0` |
| `page_size` | `1000` |

## 字段

| 字段 | 说明 |
| --- | --- |
| `cookie` | 115 登录 cookie |
| `qrcode_token` | 二维码登录 token；与 `cookie` 二选一 |
| `qrcode_source` | 二维码来源，默认 `web`；可选 `web`、`android`、`ios`、`tv`、`alipaymini`、`wechatmini`、`qandroid` |
| `root_folder_id` | 根目录 ID，默认 `0` |
| `page_size` | 分页大小 |
| `limit_rate` | 请求限速 |

## 注意

- 当前运行时支持 cookie/二维码登录、列表、详情、读取、链接和基础管理。
- 在挂载表单里选择 `115 Cloud` 后，点击“刷新二维码”会生成二维码；扫码确认后会自动换取 `cookie` 并清空临时二维码字段。
- `qrcode_source` 会用于最终扫码确认接口 `/app/1.0/{source}/1.0/login/qrcode`。`linux` 端已被 115 下架，表单默认使用 `web`；需要模拟特定客户端时再选择 `android`、`ios`、`tv` 等来源。
- 上传和离线下载仍是结构占位。
- 下载链接会按 User-Agent 区分。思盘现在会把播放器/浏览器请求里的 `User-Agent` 传给 115 `downurl`，并在 `/d`、`/p` 代理播放时继续转发同一个 `User-Agent`，对齐 OpenList 的 `LinkArgs.Header` 链路。

## 排查

| 现象 | 处理 |
| --- | --- |
| 缺少账号 | 填写有效 `cookie`，或点击“刷新二维码”重新扫码 |
| 列表失败 | 检查 `root_folder_id` 是否存在 |
| 播放或解析链接提示“提取码不能为空” | 请升级到已修复版本。115 `downurl` 请求必须把加密后的 `data` 字段作为 URL 编码表单发送，确保 `+` 保留为 `%2B`。 |
| 播放返回 `115cdn.net` 上游 403 | 优先使用 `/p` 或打开挂载代理，然后刷新页面/播放器重试。115 下载直链会绑定请求 `User-Agent`，从旧播放器会话复制出的直链可能过期或失效。 |
| 上传失败 | 当前 115 Cloud 上传尚未接入 |
