# 115 Cloud

This guide applies to `115 Cloud`.

## Good For

- Browsing 115 Cloud folders.
- Downloading and playing files through Siyuan Cloud proxy paths.
- Using basic management operations such as move, copy, delete, rename, and mkdir.

## Related Drivers

- [[115 Open]]: 115 Open Platform authorization with `access_token` and `refresh_token`.
- [[115 Share]]: Read-only mount for 115 share links.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `115 Cloud`.
3. Set Mount Path to `/115`.
4. Fill `cookie`, or click "Refresh QR code" and scan it with the 115 mobile app.
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
| `qrcode_source` | QR-code source, default `web`; options: `web`, `android`, `ios`, `tv`, `alipaymini`, `wechatmini`, `qandroid` |
| `root_folder_id` | Root folder ID, default `0` |
| `page_size` | Page size |
| `limit_rate` | Request rate limit |

## Notes

- Runtime supports cookie/QR login, list, get, read, link, and basic management.
- After selecting `115 Cloud` in the mount form, click "Refresh QR code" to generate a QR code. After scan confirmation, Siyuan Cloud exchanges it for `cookie` and clears the temporary QR fields.
- `qrcode_source` is used by the final QR confirmation endpoint `/app/1.0/{source}/1.0/login/qrcode`. The `linux` login app is no longer available on 115's side, so the form defaults to `web`; choose `android`, `ios`, or `tv` only when you need a specific client.
- Upload and offline download remain structured placeholders.
- Link cache is User-Agent aware.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Missing account | Fill a valid `cookie`, or click "Refresh QR code" and scan again |
| List fails | Check whether `root_folder_id` exists |
| Playback or link resolution reports "pickcode cannot be empty" | Upgrade to the fixed runtime. The 115 `downurl` request must send the encrypted `data` field as URL-encoded form data so `+` is preserved as `%2B`. |
| Upload fails | 115 Cloud upload is not ported yet |
