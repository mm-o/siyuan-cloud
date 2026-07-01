# OpenList/AList 挂载说明

这份文档记录 OpenList/AList 挂载的当前处理方式、思源 v3.7.0 的网络限制，以及本地/内网 AList 或 OpenList 应该如何连接、如何反代。

## 为什么 127.0.0.1 和内网 IP 会失败

思源 v3.7.0 对 `/api/network/forwardProxy`、`/api/network/proxy` 和插件流式 `body.proxy` 使用了 SSRF 安全拨号器。这个拨号器会拒绝 loopback、private、link-local、unspecified 这几类地址。

可能被思源内核代理拒绝的地址示例：

```text
http://127.0.0.1:5244
http://localhost:5244
http://192.168.1.137:5244
http://10.0.0.2:5244
```

这不是 OpenList/AList 的账号密码错误，也不是 `5244` 和思源端口冲突。问题来自请求发起位置：标准后端路径由思源内核代理发起请求，内核会把 `127.0.0.1` 理解为内核所在主机自己，并且会拦截私网 IP。

另外，OpenList/AList 的后台地址不是 API 基础地址。挂载时应填写不带 `/admin` 的服务地址；插件会自动去掉 `/admin` 和 `/@manage`，但推荐直接填写干净地址。

## 当前处理方式

插件保留标准 OpenList 兼容后端路径作为主架构：

```text
OpenList API -> mounted driver -> fs.Link -> /d 或 /p -> common proxy -> SiYuan body.proxy
```

对于本机或内网 OpenList/AList 挂载，前端文件管理器额外提供一个轻量直连快捷路径，行为参考思播的 OpenList 驱动：

1. 已保存挂载的驱动是 `OpenList`、`AList`、`AListV3` 或 `AList V3`。
2. 挂载地址是 `127.0.0.1`、`localhost`、`192.168.x.x`、`10.x`、`172.16-31.x` 这类本机/私网地址。
3. 前端文件管理器直接用浏览器 `fetch` 调用上游 OpenList/AList API。
4. 如果路径没有命中前端直连，就继续走标准后端路径。

前端直连覆盖这些交互式文件管理操作：

- 列目录和获取文件信息
- 打开、下载、图片预览、文本预览的直链解析
- 新建文件夹
- 重命名
- 删除
- 同一个直连挂载内复制和移动
- 通过 `/api/fs/put` 上传或新建文件
- 401/403 时用用户名密码自动登录刷新 token

标准后端路径仍然负责这些场景：

- 分享链接
- WebDAV
- S3
- 外部客户端调用 `/plugin/private/siyuan-cloud`
- 服务端压缩包、torrent、任务类处理
- 从前端直连之外访问 `/d` 和 `/p`

这个拆分是有意保留的：后端继续保持 OpenList 兼容 API 的统一架构；前端直连只作为桌面端本地兼容快捷路径，用来绕开思源内核代理无法拨打私网地址的问题。

## 本地 AList/OpenList 如何挂载

先正常启动 OpenList/AList，例如：

```text
http://127.0.0.1:5244
```

插件挂载表单里填写：

```json
{
  "url": "http://127.0.0.1:5244",
  "username": "admin",
  "password": "your-password",
  "meta_password": ""
}
```

如果 AList/OpenList 在另一台内网机器上：

```json
{
  "url": "http://192.168.1.137:5244",
  "username": "admin",
  "password": "your-password"
}
```

不要把后台路径当成服务地址：

```text
http://127.0.0.1:5244/admin
```

推荐填写：

```text
http://127.0.0.1:5244
```

保存挂载后，在同一台桌面端思源里打开插件文件管理器。命中前端直连后，就可以直接列目录、打开和管理这个挂载。

## 什么时候需要反代或隧道

只在当前桌面端使用本机/内网 AList 时，前端直连最简单。

下面这些情况应该使用反代或隧道：

- 手机、平板、另一台电脑也要访问同一个挂载。
- WebDAV、S3、分享链接、外部播放器或其他客户端要访问。
- 服务端压缩包、torrent、任务等能力需要读取上游文件内容。
- 希望所有设备都使用同一个稳定地址。

这时插件里应填写一个正常可路由的 HTTPS 地址：

```text
https://alist.example.com
```

### Caddy 反代示例

如果 Caddy 能访问本机 OpenList/AList：

```caddyfile
alist.example.com {
    reverse_proxy 127.0.0.1:5244
}
```

插件挂载填写：

```json
{
  "url": "https://alist.example.com",
  "username": "admin",
  "password": "your-password"
}
```

### Cloudflare Tunnel 快速测试

临时测试可以直接运行：

```powershell
cloudflared tunnel --url http://127.0.0.1:5244
```

它会生成一个临时 HTTPS 地址：

```text
https://xxxx.trycloudflare.com
```

插件挂载填写这个地址即可。

长期使用建议配置固定域名，例如：

```text
https://alist.example.com
```

## 方案选择

简单规则：

- 只在当前桌面端使用本机/内网 AList：使用前端直连。
- 多设备、分享、WebDAV、S3、压缩包、外部客户端：使用 HTTPS 反代或隧道。
- 公网或云端部署：只使用标准后端路径和正常 HTTPS 上游。

长期最理想的方案是思源内核提供管理员可控的代理白名单。在这之前，插件同时保留两条路：标准后端路径作为主架构，前端直连作为本地桌面兼容快捷路径。
