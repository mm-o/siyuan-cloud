# OneDrive 挂载

本教程适用于 `Onedrive`。

## 适合场景

- 接入 Microsoft OneDrive 或 SharePoint。
- 按区域选择全球版、世纪互联、中国、美国或德国云。
- 使用小文件上传和 upload session 大文件上传。

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd>。
2. 驱动选择 `Onedrive`。
3. 挂载路径填写 `/OneDrive`。
4. 选择 `region`。
5. 填写 `refresh_token`，必要时填写 `client_id` 和 `client_secret`。
6. 保存后浏览 `/OneDrive`。

| 推荐项 | 值 |
| --- | --- |
| 驱动 | `Onedrive` |
| 挂载路径 | `/OneDrive` |
| `region` | `global` |
| `root_folder_path` | `/` |
| `use_online_api` | `true` |

## 字段

| 字段 | 说明 |
| --- | --- |
| `region` | `global`、`cn`、`us`、`de` |
| `refresh_token` | **必填**，刷新访问令牌 |
| `is_sharepoint` | SharePoint 模式 |
| `site_id` | SharePoint site ID |
| `root_folder_path` | 根路径 |
| `client_id` / `client_secret` | 自备应用时填写 |
| `redirect_uri` | OAuth 回调地址 |
| `chunk_size` | 分片大小 |
| `custom_host` | 自定义下载 host |
| `enable_direct_upload` | 开启直传能力 |

## 注意

- 当前运行时支持 token 刷新、列表、详情、读取、链接、管理和上传。
- 小文件直接上传，大文件使用 upload session。
- `disable_disk_usage` 可减少本地磁盘使用。

## 排查

| 现象 | 处理 |
| --- | --- |
| token 失效 | 更新 `refresh_token` |
| SharePoint 为空 | 检查 `is_sharepoint` 和 `site_id` |
| 上传失败 | 调小 `chunk_size` 或检查账号权限 |
