# S3 Compatible

This guide applies to `S3` and `Doge`.

## Good For

- Connecting AWS S3, MinIO, R2, DogeCloud, or other S3-compatible object storage.
- Browsing bucket objects and using Siyuan Cloud for download, preview, upload, and management.
- Accessing objects through presigned URLs or Siyuan Cloud proxy/download paths.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `S3` or `Doge`.
3. Set Mount Path to `/S3`.
4. Fill `bucket`, `endpoint`, `region`, `access_key_id`, and `secret_access_key`.
5. Enable `force_path_style` when required by your service.
6. Save, then browse `/S3`.

| Recommended field | Value |
| --- | --- |
| Driver | `S3` |
| Mount path | `/S3` |
| `root_folder_path` | `/` |
| `sign_url_expire` | `4` |

## Fields

| Field | Description |
| --- | --- |
| `bucket` | Required bucket name |
| `endpoint` | Required S3 endpoint |
| `region` | Region |
| `access_key_id` / `secret_access_key` | Required credentials |
| `session_token` | Temporary session token |
| `custom_host` | Custom public host |
| `enable_custom_host_presign` | Use custom host for presigned URLs |
| `force_path_style` | Path-style access, often needed for MinIO |
| `list_object_version` | `v1` or `v2` |
| `enable_direct_upload` | Enable direct-upload info |
| `direct_upload_host` | Direct-upload host |

## Notes

- File `raw_url` usually points to Siyuan Cloud `/d/<path>`.
- `enable_direct_upload` exposes direct-upload tool information.
- `Doge` reuses the S3-compatible field set.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| List fails | Check bucket, endpoint, region, and signing behavior |
| Upload fails | Check AK/SK permissions and bucket write policy |
| Link cannot open | Check `custom_host`, presign expiry, and public access policy |
