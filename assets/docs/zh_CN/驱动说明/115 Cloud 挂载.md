# 115 Cloud 挂载

本教程适用于 `115 Cloud`。

## 适合场景

- 浏览 115 网盘目录。
- 通过思盘代理下载和播放文件。
- 使用 115 的移动、复制、删除、重命名、创建目录等基础管理能力。

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd>。
2. 驱动选择 `115 Cloud`。
3. 挂载路径填写 `/115`。
4. 填写 `cookie`，或填写扫码得到的 `qrcode_token`。
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
| `qrcode_source` | 二维码来源 |
| `root_folder_id` | 根目录 ID，默认 `0` |
| `page_size` | 分页大小 |
| `limit_rate` | 请求限速 |

## 注意

- 当前运行时支持 cookie/二维码 token 登录、列表、详情、读取、链接和基础管理。
- 上传和离线下载仍是结构占位。
- 链接缓存会按 User-Agent 区分。

## 排查

| 现象 | 处理 |
| --- | --- |
| 缺少账号 | 填写有效 `cookie` 或重新扫码获取 `qrcode_token` |
| 列表失败 | 检查 `root_folder_id` 是否存在 |
| 上传失败 | 当前 115 Cloud 上传尚未接入 |
