# WebDAV 挂载

本教程适用于 `WebDav` 驱动。

## 适合场景

- 接入支持 WebDAV 的 NAS、网盘或对象网关。
- 通过标准 WebDAV 方法完成列表、上传、下载和管理。
- 需要代理播放时通过思盘 `/p` 路径统一访问。

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd>。
2. 驱动选择 `WebDav`。
3. 挂载路径填写 `/WebDAV`。
4. `address` 填写 WebDAV 根地址。
5. 填写 `username` 和 `password`。
6. 保存后浏览 `/WebDAV`。

| 推荐项 | 值 |
| --- | --- |
| 驱动 | `WebDav` |
| 挂载路径 | `/WebDAV` |
| `vendor` | `other` |
| `address` | WebDAV 服务地址 |

## 字段

| 字段 | 说明 |
| --- | --- |
| `vendor` | `other` 或 `sharepoint` |
| `address` | **必填**，WebDAV 地址 |
| `username` / `password` | **必填**，认证信息 |
| `tls_insecure_skip_verify` | 跳过 TLS 证书校验 |

## 注意

- WebDAV 路径会拼接 `address + root_folder_path + relPath`。
- 支持 `PROPFIND` 列表、`GET` 读取、`PUT` 上传、`MKCOL` 创建目录、`MOVE`/`COPY`/`DELETE` 管理。
- 列表和对象获取按 OpenList/gowebdav 主流程处理：目录列表使用 `PROPFIND Depth:1`，对象 stat 使用 `PROPFIND Depth:0`，跳过目录自身响应，对象名优先取 href basename。
- 驱动只返回 OpenList 风格对象和链接数据；预览 URL 由统一 `/d`、`/p` 代理层生成，不在 WebDAV driver 里写 UI 专用字段。
- 自签证书服务可按需开启 `tls_insecure_skip_verify`。

## 当前差异

- `tls_insecure_skip_verify`、SharePoint `odrvcookie`、持久 cookie jar、Basic/Digest 401 协商、创建/复制/移动遇到 409 时补父目录重试、以及 OpenList `Link(args.Redirect)` 的 no-redirect 探测仍是后续对齐项。
- 如果某个 WebDAV 服务和 OpenList 表现不一致，优先对照 `docs/OpenList-main/drivers/webdav` 与 `docs/OpenList-main/pkg/gowebdav` 修 driver，不在前端增加专用补丁。

## 排查

| 现象 | 处理 |
| --- | --- |
| 认证失败 | 检查用户名、密码和 WebDAV 权限 |
| 证书错误 | 配置可信证书或开启 `tls_insecure_skip_verify` |
| 路径重复 | 检查 `address` 是否已经包含子目录 |
