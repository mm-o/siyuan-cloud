# OpenList Compatible

This guide applies to `OpenList`, `AListV3`, and `AList V3`.

## Good For

- Connecting an existing OpenList/AList service to Siyuan Cloud.
- Reusing upstream list, download, upload, and management behavior.
- Letting companion plugins consume `/p`, `/d`, `raw_url`, and OpenList-compatible APIs through Siyuan Cloud.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `OpenList`, `AListV3`, or `AList V3`.
3. Set Mount Path, for example `/Remote`.
4. Set upstream `url`, for example `https://alist.example.com`.
5. Fill `username`/`password` or `token` according to the upstream service.
6. Save, then browse `/Remote`.

OpenList token helper: <https://api.oplist.org/>.

| Recommended field | Value |
| --- | --- |
| Driver | `OpenList` |
| Mount path | `/Remote` |
| `url` | Upstream service URL, without `/admin` |
| `token` | Prefer token when available |

## Fields

| Field | Description |
| --- | --- |
| `url` | Required upstream OpenList/AList API base URL |
| `username` / `password` | Login credentials |
| `token` | Existing auth token |
| `meta_password` | OpenList meta password |
| `pass_ip_to_upsteam` | Pass client IP to upstream |
| `pass_ua_to_upsteam` | Pass User-Agent to upstream |
| `forward_archive_requests` | Forward archive requests upstream |
| `pass_refresh_flag_to_upsteam` | Forward refresh flag |

## Notes

- Do not fill the admin page URL. Use `http://127.0.0.1:5244`, not `http://127.0.0.1:5244/admin`.
- SiYuan v3.7.0 may block kernel proxy requests to `127.0.0.1`, `localhost`, `192.168.x.x`, `10.x`, and `172.16-31.x` for SSRF protection.
- The desktop file manager can directly connect to local/private OpenList/AList mounts for common interactive operations.
- Shares, WebDAV, S3, archive/torrent server-side operations, and external clients still use the standard backend path.
- For cross-device or protocol use, expose OpenList/AList through a routed HTTPS reverse proxy or tunnel.

## Detailed Guide

- [[OpenList AList Local Mounting and Proxy]]

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Login fails | Check `url`, credentials, or token |
| Empty list | Confirm the upstream mount works by itself |
| `ip address ... is prohibited` | Use the desktop file manager direct path, or mount a routed HTTPS reverse-proxy URL |
| Other devices cannot use a local mount | Use a reverse proxy or tunnel and mount its HTTPS URL |
| Download fails | Check upstream `raw_url`, proxy, CORS, and certificate settings |
