# OneDrive 挂载

本教程适用于 `Onedrive`。

## 适合场景

- 接入 Microsoft OneDrive 或 SharePoint。
- 按区域选择全球版、世纪互联、中国、美国或德国云。
- 使用小文件上传和 upload session 大文件上传。

## 获取 refresh_token

OpenList 上游 OneDrive 文档推荐优先使用在线 API 的默认应用获取刷新令牌。

1. 打开官方在线工具：<https://api.oplist.org/>。
2. 根据账号区域选择对应的 OneDrive 版本。
3. **重点：务必勾选“使用 OpenList 提供的参数”。**
4. 点击“获取 Token”，登录需要挂载的 OneDrive 账号并授权。
5. 授权后回到工具页面，复制返回的 `refresh_token`。
6. 在思盘挂载表单中保持 `use_online_api=true`，填入 `refresh_token` 即可。

如果在线默认应用因用户过多遇到频控，或你需要使用自己的 Azure 应用，才取消勾选“使用 OpenList 提供的参数”，填写自己的 `client_id`、`client_secret` 和 `redirect_uri` 后获取 token，并在挂载表单中填写同一组参数。

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
| `use_online_api` | 使用 OpenList 在线 API 刷新 token；使用官方在线工具默认应用时保持开启 |
| `client_id` / `client_secret` | 自备 Azure 应用时填写；勾选“使用 OpenList 提供的参数”获取 token 时通常留空 |
| `redirect_uri` | OAuth 回调地址；自备应用通常使用 `https://api.oplist.org/onedrive/callback` |
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
