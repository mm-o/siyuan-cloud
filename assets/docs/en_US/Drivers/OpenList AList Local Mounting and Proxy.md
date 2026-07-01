# OpenList AList Local Mounting and Proxy

This document explains the SiYuan v3.7.0 network limit, the plugin's current handling, and how to mount or proxy local/private OpenList and AList services.

## Why Local Addresses Are Limited

SiYuan v3.7.0 protects `/api/network/forwardProxy`, `/api/network/proxy`, and plugin streaming `body.proxy` with SSRF protection. The kernel proxy may reject loopback and private addresses:

```text
http://127.0.0.1:5244
http://localhost:5244
http://192.168.1.137:5244
http://10.0.0.2:5244
```

This is not caused by a wrong OpenList/AList password and it is not a port conflict. It happens because the standard backend path asks the SiYuan kernel to dial the upstream URL, and the kernel intentionally blocks private targets.

Also do not use the admin page as the API base URL. Fill the base URL without `/admin`; the plugin strips `/admin` and `/@manage` for compatibility.

## Current Plugin Behavior

The standard backend path remains the main architecture:

```text
OpenList API -> mounted driver -> fs.Link -> /d or /p -> common proxy -> SiYuan body.proxy
```

For desktop local/private mounts, the file manager adds a small direct shortcut:

1. The saved driver is `OpenList`, `AList`, `AListV3`, or `AList V3`.
2. The mount URL is local/private, such as `127.0.0.1` or `192.168.x.x`.
3. The frontend file manager calls the upstream OpenList/AList API directly with `fetch`.
4. Paths that do not match the shortcut continue to use the standard backend path.

Frontend direct mode covers:

- list and get
- open/download/image preview/text preview URL resolution
- mkdir
- rename
- remove
- copy and move inside the same direct mount
- upload/new file through `/api/fs/put`
- token refresh through username/password login on 401/403

The backend path is still used for:

- shares
- WebDAV
- S3
- external clients calling `/plugin/private/siyuan-cloud`
- server-side archive/torrent/task operations
- `/d` and `/p` when opened outside the frontend shortcut

## Local Mount Example

Start OpenList/AList:

```text
http://127.0.0.1:5244
```

Mount addition:

```json
{
  "url": "http://127.0.0.1:5244",
  "username": "admin",
  "password": "your-password",
  "meta_password": ""
}
```

For another LAN host:

```json
{
  "url": "http://192.168.1.137:5244",
  "username": "admin",
  "password": "your-password"
}
```

Recommended:

```text
http://127.0.0.1:5244
```

Avoid:

```text
http://127.0.0.1:5244/admin
```

## Reverse Proxy or Tunnel

Use a routed HTTPS reverse proxy or tunnel when the mount must work from other devices or through backend/protocol surfaces.

Use proxy/tunnel for:

- mobile or another desktop
- WebDAV/S3/share/external clients
- server-side archive/torrent features
- one stable address across clients

Mount the HTTPS URL:

```text
https://alist.example.com
```

### Caddy Example

```caddyfile
alist.example.com {
    reverse_proxy 127.0.0.1:5244
}
```

Mount addition:

```json
{
  "url": "https://alist.example.com",
  "username": "admin",
  "password": "your-password"
}
```

### Cloudflare Tunnel Quick Test

```powershell
cloudflared tunnel --url http://127.0.0.1:5244
```

Use the generated URL:

```text
https://xxxx.trycloudflare.com
```

For long-term use, configure a named tunnel and mount a stable domain:

```text
https://alist.example.com
```

## Which Path To Choose

| Need | Recommended path |
| --- | --- |
| Desktop-only local AList/OpenList | Frontend direct shortcut |
| Other devices, shares, WebDAV, S3, archive, external clients | HTTPS reverse proxy or tunnel |
| Public/cloud deployment | Standard backend path with a normal HTTPS upstream |

The ideal long-term solution is an administrator-controlled allowlist in the SiYuan kernel proxy. Until then, this plugin keeps both paths: standard backend first, frontend direct only as a local desktop compatibility shortcut.
