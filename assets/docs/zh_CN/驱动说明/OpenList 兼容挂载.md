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
| `url` | 上游服务地址 |
| `token` | 有 token 时优先使用 |

## 字段

| 字段 | 说明 |
| --- | --- |
| `url` | **必填**，上游 OpenList/AList 地址 |
| `username` / `password` | 登录用户名和密码 |
| `token` | 已有认证 token |
| `meta_password` | OpenList 元信息密码 |
| `pass_ip_to_upsteam` | 向上游透传客户端 IP |
| `pass_ua_to_upsteam` | 向上游透传 User-Agent |
| `forward_archive_requests` | 压缩包请求转发给上游 |
| `pass_refresh_flag_to_upsteam` | 透传刷新标记 |

## 注意

- `OpenList` 会按需登录并缓存 token。
- 文件管理动作会转发给上游 `/api/fs/*`。
- 上游不可用、证书异常或认证过期时，思盘只能返回上游错误。

## 排查

| 现象 | 处理 |
| --- | --- |
| 登录失败 | 检查 `url`、账号密码或 token |
| 列表为空 | 确认上游挂载自身可用 |
| 下载失败 | 检查上游 raw_url、代理配置和跨域/证书问题 |
