# OpenList AList 本地挂载与代理

这份文档说明思源 v3.7.0 的网络限制、插件当前处理方式，以及本地/内网 AList 或 OpenList 应该如何挂载、如何反代。

## 为什么本地地址会受限

思源 v3.7.0 对 `/api/network/forwardProxy`、`/api/network/proxy` 和插件流式 `body.proxy` 做了 SSRF 防护。内核代理可能拒绝 loopback 和私网地址：

```text
http://127.0.0.1:5244
http://localhost:5244
http://192.168.1.137:5244
http://10.0.0.2:5244
```

这不是 OpenList/AList 密码错误，也不是 `5244` 和思源端口冲突。标准后端路径需要思源内核去拨打上游地址，而思源内核会有意拦截私网目标。

另外，不要把后台页面当成 API 基础地址。挂载时填写不带 `/admin` 的服务地址；插件会兼容去掉 `/admin` 和 `/@manage`。

## 当前插件处理方式

插件保留标准 OpenList 后端路径作为主架构：

```text
OpenList API -> mounted driver -> fs.Link -> /d 或 /p -> common proxy -> SiYuan body.proxy
```

对于桌面端本地/内网挂载，文件管理器增加一个轻量直连快捷路径：

1. 已保存挂载的驱动是 `OpenList`、`AList`、`AListV3` 或 `AList V3`。
2. 挂载地址是 `127.0.0.1`、`localhost`、`192.168.x.x` 等本机/私网地址。
3. 前端文件管理器直接用 `fetch` 调用上游 OpenList/AList API。
4. 没有命中直连的路径继续走标准后端路径。

前端直连覆盖：

- 列目录和获取文件信息
- 打开、下载、图片预览、文本预览的 URL 解析
- 新建文件夹
- 重命名
- 删除
- 同一个直连挂载内复制和移动
- 通过 `/api/fs/put` 上传或新建文件
- 401/403 时使用用户名密码自动登录刷新 token

标准后端路径仍然负责：

- 分享链接
- WebDAV
- S3
- 外部客户端调用 `/plugin/private/siyuan-cloud`
- 服务端压缩包、torrent、任务类处理
- 从前端直连之外打开 `/d` 和 `/p`

## 本地挂载示例

启动 OpenList/AList：

```text
http://127.0.0.1:5244
```

挂载附加配置：

```json
{
  "url": "http://127.0.0.1:5244",
  "username": "admin",
  "password": "your-password",
  "meta_password": ""
}
```

如果服务在另一台内网机器：

```json
{
  "url": "http://192.168.1.137:5244",
  "username": "admin",
  "password": "your-password"
}
```

推荐：

```text
http://127.0.0.1:5244
```

避免：

```text
http://127.0.0.1:5244/admin
```

## 反代或隧道

当挂载需要在其他设备上使用，或需要后端/协议能力时，应使用正常可路由的 HTTPS 反代或隧道。

这些场景建议使用反代/隧道：

- 手机、平板、另一台电脑访问
- WebDAV、S3、分享链接、外部客户端访问
- 服务端压缩包、torrent 功能读取上游文件
- 所有客户端使用一个稳定地址

插件挂载 HTTPS 地址：

```text
https://alist.example.com
```

### Caddy 示例

```caddyfile
alist.example.com {
    reverse_proxy 127.0.0.1:5244
}
```

挂载附加配置：

```json
{
  "url": "https://alist.example.com",
  "username": "admin",
  "password": "your-password"
}
```

### Cloudflare Tunnel 快速测试

```powershell
cloudflared tunnel --url http://127.0.0.1:5244
```

使用生成的地址：

```text
https://xxxx.trycloudflare.com
```

长期使用建议配置固定隧道和域名：

```text
https://alist.example.com
```

## 如何选择

| 需求 | 推荐方案 |
| --- | --- |
| 只在当前桌面端使用本机 AList/OpenList | 前端直连快捷路径 |
| 其他设备、分享、WebDAV、S3、压缩包、外部客户端 | HTTPS 反代或隧道 |
| 公网或云端部署 | 标准后端路径 + 正常 HTTPS 上游 |

长期最理想的方案是思源内核代理提供管理员可控白名单。在这之前，插件保留两条路径：标准后端优先，前端直连只作为本地桌面兼容快捷路径。
