# Quark / UC 系列

本教程适用于 `Quark`、`UC`、`QuarkOpen`、`QuarkTV` 和 `UCTV`。

## 适合场景

- 接入夸克网盘或 UC 网盘。
- 浏览、播放、下载和基础管理文件。
- 根据账号形态选择 cookie、开放平台或 TV token 路径。

## 选择驱动

| 驱动 | 适合场景 |
| --- | --- |
| `Quark` | 夸克 cookie 登录 |
| `UC` | UC cookie 登录 |
| `QuarkOpen` | 夸克开放平台 refresh token |
| `QuarkTV` | 夸克 TV token |
| `UCTV` | UC TV token |

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd>。
2. 选择对应驱动。
3. 挂载路径填写 `/Quark` 或 `/UC`。
4. Cookie 驱动填写 `cookie`；Open/TV 驱动填写 `refresh_token`。
5. `root_folder_id` 默认 `0`。
6. 保存后浏览挂载目录。

## 常用字段

| 字段 | 说明 |
| --- | --- |
| `cookie` | Quark/UC cookie 登录 |
| `refresh_token` | Open/TV token |
| `app_id` / `sign_key` | QuarkOpen 开放平台字段 |
| `root_folder_id` | 根目录 ID，默认 `0` |
| `order_by` / `order_direction` | 排序 |
| `use_transcoding_address` | 使用转码播放地址 |
| `only_list_video_file` | 只列出视频文件 |
| `link_method` | TV 驱动链接方式，`download` 或 `streaming` |

## 注意

- `Quark` / `UC` 支持列表、详情、读取、链接、创建目录、移动、删除、重命名和上传；复制未接入。
- `QuarkOpen` 支持开放平台 token 刷新、列表、详情、读取、链接、管理和上传；复制未接入。
- `QuarkTV` / `UCTV` 按 OpenList 行为不实现管理和上传。
- UC/QuarkOpen/TV 更偏向代理播放。

## 排查

| 现象 | 处理 |
| --- | --- |
| cookie 失效 | 重新获取 cookie 后保存 |
| Open token 失效 | 更新 `refresh_token` |
| 只看到视频 | 关闭 `only_list_video_file` |
| 复制失败 | Quark/UC 系列复制能力当前未接入 |
