# 189Cloud 系列

本教程适用于 `189Cloud`、`189CloudPC` 和 `189CloudTV`。

## 适合场景

- 接入天翼云盘个人或家庭空间。
- 浏览、下载、播放和基础管理文件。
- 按账号形态选择普通、PC 或 TV 驱动。

## 选择驱动

| 驱动 | 适合场景 |
| --- | --- |
| `189Cloud` | 账号密码或 cookie 路径，通用入口 |
| `189CloudPC` | 已有 PC access token/session 的场景 |
| `189CloudTV` | TV 二维码/token 路径 |

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd>。
2. 选择一个 189Cloud 驱动。
3. 挂载路径填写 `/189`。
4. 按驱动填写账号、密码、cookie、`access_token` 或 `refresh_token`。
5. `root_folder_id` 默认 `-11`。
6. 保存后浏览 `/189`。

## 常用字段

| 字段 | 说明 |
| --- | --- |
| `username` / `password` | 账号密码 |
| `cookie` | 普通 189Cloud 遇到验证码时可填 |
| `access_token` / `refresh_token` | PC/TV 会话字段 |
| `root_folder_id` | 根目录 ID，默认 `-11` |
| `type` | `personal` 或 `family` |
| `family_id` | 家庭空间 ID |
| `order_by` / `order_direction` | 排序 |
| `upload_method` | PC 上传方式字段；当前上传仍有限制 |

## 注意

- `189Cloud` 已接入登录、列表、详情、读取、链接、管理和上传请求基础。
- `189CloudPC` 需要可用 `access_token`/session；密码/二维码登录仍是结构占位。
- `189CloudTV` 支持 TV 登录刷新、列表、详情、读取、链接和管理；上传仍是占位。

## 排查

| 现象 | 处理 |
| --- | --- |
| cookie 失效 | 重新保存账号信息或更新 cookie |
| PC/TV 缺 session | 导入 OpenList 兼容 session addition 或重新获取 token |
| 家庭空间为空 | 检查 `type` 和 `family_id` |
