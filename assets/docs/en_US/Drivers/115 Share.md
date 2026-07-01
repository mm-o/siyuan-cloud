# 115 Share

This guide applies to `115 Share`.

`115 Share` follows OpenList's 115 share driver. It mounts files from a 115 share link. Like `115 Cloud`, it uses `cookie` or a QR-code `qrcode_token` for login, but the file source is a share, so OpenList marks this driver as read-only and no-upload.

Upstream reference: <https://doc.oplist.org/guide/drivers/115>

## Good For

- Browsing folders and files inside a 115 share link.
- Reading or playing shared files through Siyuan Cloud proxy paths.
- Keeping OpenList-compatible `share_code`, `receive_code`, and `root_folder_id` fields.

## Related Drivers

- [[115 Cloud]]: Regular 115 Cloud mount with `cookie` or `qrcode_token`.
- [[115 Open]]: 115 Open Platform authorization with `access_token` and `refresh_token`.

## Share Link Fields

A common 115 share link looks like:

```text
https://115.com/s/swnxxxxxxx?password=abcd
```

Mapped fields:

| Field | Value |
| --- | --- |
| `share_code` | `swnxxxxxxx` |
| `receive_code` | `abcd` |

If the share link has no extraction code, keep `receive_code` empty or follow what the page shows.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `115 Share`.
3. Set Mount Path to `/115-share`.
4. Fill `cookie`, or click "Refresh QR code" and scan it with the 115 mobile app.
5. Fill `share_code` and `receive_code`.
6. Keep `root_folder_id` as `0`; use a subfolder ID only when you want the share mount to start from that subfolder.
7. Save, then browse `/115-share`.

| Recommended field | Value |
| --- | --- |
| Driver | `115 Share` |
| Mount path | `/115-share` |
| `root_folder_id` | `0` |
| `page_size` | `1000` |
| `limit_rate` | `2` |

## Fields

| Field | Description |
| --- | --- |
| `cookie` | 115 login cookie; alternative to `qrcode_token` |
| `qrcode_token` | QR-code token; alternative to `cookie` |
| `qrcode_source` | QR-code source, default `web`. Options: `web`, `android`, `ios`, `tv`, `alipaymini`, `wechatmini`, `qandroid` |
| `share_code` | Required share code from the share link |
| `receive_code` | Required extraction code from the share link |
| `root_folder_id` | Root folder ID inside the share, default `0` |
| `page_size` | Page size, OpenList default `1000` |
| `limit_rate` | Request rate limit, OpenList default `2` |

## Current Boundary

- List, get, read, and link are wired.
- After selecting `115 Share` in the mount form, click "Refresh QR code" to generate a QR code. After scan confirmation, Siyuan Cloud exchanges it for `cookie` and clears the temporary QR fields.
- `qrcode_source` is used by the final QR confirmation endpoint `/app/1.0/{source}/1.0/login/qrcode`. The `linux` login app is no longer available on 115's side, so the form defaults to `web`; choose `android`, `ios`, or `tv` only when you need a specific client.
- Same as OpenList, `115 Share` does not support mkdir, move, copy, remove, rename, or upload.
- Link cache is User-Agent aware.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Share not found | Fill only the share code in `share_code`, not the full URL |
| Wrong extraction code | Check whether `receive_code` matches the link's `password` value |
| Missing account | Fill a valid `cookie`, or click "Refresh QR code" and scan again |
| Playback or link resolution fails around 115 form data | Upgrade to the fixed runtime. 115 form requests use explicit URL encoding so `+` in generated data is not treated as a space. |
| Cannot manage files | `115 Share` is an OpenList read-only driver; use `115 Cloud` or `115 Open` for your own files |
