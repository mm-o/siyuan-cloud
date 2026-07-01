# OpenList 兼容挂载

本教程适用于 `OpenList`、`AListV3` 和 `AList V3`。

## 适合场景

- 把已有 OpenList/AList 服务接入思盘。
- 复用上游的目录、下载、上传和管理能力。
- 让其它插件通过思盘统一消费 `/p`、`/d`、`raw_url` 和 OpenList 兼容 API。

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd>。
2. 驱动选择 `OpenList`、`AListV3` 或 `AList V3`。
3. 填写挂载路径，例如 `/Remote`。
4. 填写上游地址 `url`，例如 `https://alist.example.com`。
5. 按上游配置填写 `username`/`password` 或 `token`。
6. 保存后浏览 `/Remote`。

OpenList token 获取工具：<https://api.oplist.org/>。

| 推荐项 | 值 |
| --- | --- |
| 驱动 | `OpenList` |
| 挂载路径 | `/Remote` |
| `url` | 上游服务地址，不要带 `/admin` |
| `token` | 有 token 时优先使用 |

## 字段

| 字段 | 说明 |
| --- | --- |
| `url` | 必填，上游 OpenList/AList API 基础地址 |
| `username` / `password` | 登录用户名和密码 |
| `token` | 已有认证 token |
| `meta_password` | OpenList 元信息密码 |
| `pass_ip_to_upsteam` | 向上游透传客户端 IP |
| `pass_ua_to_upsteam` | 向上游透传 User-Agent |
| `forward_archive_requests` | 压缩包请求转发给上游 |
| `pass_refresh_flag_to_upsteam` | 透传刷新标记 |

## 注意

- 不要填写后台页面地址。应填写 `http://127.0.0.1:5244`，不要填写 `http://127.0.0.1:5244/admin`。
- 思源 v3.7.0 会因为 SSRF 防护拦截内核代理访问 `127.0.0.1`、`localhost`、`192.168.x.x`、`10.x`、`172.16-31.x`。
- 桌面端文件管理器可以对本机/内网 OpenList/AList 挂载走前端直连，覆盖常用交互操作。
- 分享、WebDAV、S3、服务端压缩包/torrent 操作、外部客户端仍然走标准后端路径。
- 多设备或协议访问建议把 OpenList/AList 暴露成正常 HTTPS 反代或隧道地址。

## 详细说明

- [[OpenList AList 本地挂载与代理]]

## 排查

| 现象 | 处理 |
| --- | --- |
| 登录失败 | 检查 `url`、账号密码或 token |
| 列表为空 | 确认上游 OpenList/AList 自身可用 |
| `ip address ... is prohibited` | 使用桌面端文件管理器直连，或挂载 HTTPS 反代地址 |
| 其他设备无法使用本地挂载 | 使用反代或隧道，并挂载它的 HTTPS 地址 |
| 下载失败 | 检查上游 `raw_url`、代理配置、跨域和证书问题 |
