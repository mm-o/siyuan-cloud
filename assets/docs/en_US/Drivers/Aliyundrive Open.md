# Aliyundrive Open

This guide applies to `AliyundriveOpen`.

## Good For

- Connecting an Aliyundrive Open Platform account.
- Browsing resource, backup, or default drives.
- Uploading, downloading, moving, copying, deleting, and renaming files.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `AliyundriveOpen`.
3. Set Mount Path to `/Aliyun`.
4. Fill `refresh_token`.
5. Keep `drive_type` as `resource` in most cases.
6. Save, then browse `/Aliyun`.

| Recommended field | Value |
| --- | --- |
| Driver | `AliyundriveOpen` |
| Mount path | `/Aliyun` |
| `drive_type` | `resource` |
| `root_folder_id` | `root` |
| `use_online_api` | `true` |

## Fields

| Field | Description |
| --- | --- |
| `drive_type` | `default`, `resource`, or `backup` |
| `refresh_token` | Required token refresh value |
| `root_folder_id` | Root folder ID, default `root` |
| `use_online_api` | Use online token refresh API |
| `api_url_address` | Token refresh API |
| `client_id` / `client_secret` | Optional custom app credentials |
| `remove_way` | `trash` or `delete` |
| `rapid_upload` | Rapid-upload branch |
| `internal_upload` | Internal upload endpoint |
| `livp_download_format` | `jpeg` or `mov` |

## Notes

- Runtime supports token refresh, list, get, read, link, management, and upload.
- Upload chooses normal or rapid-upload paths according to upstream response.
- `no_overwrite_upload` is enabled to avoid overwriting same-name files.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Token expired | Update `refresh_token`, then save the mount again |
| Wrong folder | Check `drive_type` and `root_folder_id` |
| Upload fails | Disable `internal_upload` or check network egress |
