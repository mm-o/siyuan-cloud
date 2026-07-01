# 115 Cloud

This guide applies to `115 Cloud`.

## Good For

- Browsing 115 Cloud folders.
- Downloading and playing files through Siyuan Cloud proxy paths.
- Using basic management operations such as move, copy, delete, rename, and mkdir.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `115 Cloud`.
3. Set Mount Path to `/115`.
4. Fill `cookie`, or use a QR-code `qrcode_token`.
5. Keep `root_folder_id` as `0`.
6. Save, then browse `/115`.

| Recommended field | Value |
| --- | --- |
| Driver | `115 Cloud` |
| Mount path | `/115` |
| `root_folder_id` | `0` |
| `page_size` | `1000` |

## Fields

| Field | Description |
| --- | --- |
| `cookie` | 115 login cookie |
| `qrcode_token` | QR-code token; alternative to `cookie` |
| `qrcode_source` | QR-code source |
| `root_folder_id` | Root folder ID, default `0` |
| `page_size` | Page size |
| `limit_rate` | Request rate limit |

## Notes

- Runtime supports cookie/QR-token login, list, get, read, link, and basic management.
- Upload and offline download remain structured placeholders.
- Link cache is User-Agent aware.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Missing account | Fill a valid `cookie` or refresh `qrcode_token` |
| List fails | Check whether `root_folder_id` exists |
| Upload fails | 115 Cloud upload is not ported yet |
