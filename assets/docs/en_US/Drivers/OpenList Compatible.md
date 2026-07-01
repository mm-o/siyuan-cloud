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
| `url` | Upstream service URL |
| `token` | Prefer token when available |

## Fields

| Field | Description |
| --- | --- |
| `url` | Required upstream OpenList/AList address |
| `username` / `password` | Login credentials |
| `token` | Existing auth token |
| `meta_password` | OpenList meta password |
| `pass_ip_to_upsteam` | Pass client IP to upstream |
| `pass_ua_to_upsteam` | Pass User-Agent to upstream |
| `forward_archive_requests` | Forward archive requests upstream |
| `pass_refresh_flag_to_upsteam` | Forward refresh flag |

## Notes

- `OpenList` logs in and caches token when needed.
- File actions are forwarded to upstream `/api/fs/*`.
- If upstream auth, certificate, or network fails, Siyuan Cloud can only surface the upstream error.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Login fails | Check `url`, credentials, or token |
| Empty list | Confirm the upstream mount works by itself |
| Download fails | Check upstream `raw_url`, proxy, CORS, and certificate settings |
