# OneDrive

This guide applies to `Onedrive`.

## Good For

- Connecting Microsoft OneDrive or SharePoint.
- Selecting global, China, US, or Germany cloud regions.
- Uploading small files directly and large files through upload sessions.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `Onedrive`.
3. Set Mount Path to `/OneDrive`.
4. Select `region`.
5. Fill `refresh_token`, and optionally `client_id` and `client_secret`.
6. Save, then browse `/OneDrive`.

| Recommended field | Value |
| --- | --- |
| Driver | `Onedrive` |
| Mount path | `/OneDrive` |
| `region` | `global` |
| `root_folder_path` | `/` |
| `use_online_api` | `true` |

## Fields

| Field | Description |
| --- | --- |
| `region` | `global`, `cn`, `us`, or `de` |
| `refresh_token` | Required token refresh value |
| `is_sharepoint` | SharePoint mode |
| `site_id` | SharePoint site ID |
| `root_folder_path` | Root path |
| `client_id` / `client_secret` | Optional custom app credentials |
| `redirect_uri` | OAuth redirect URI |
| `chunk_size` | Chunk size |
| `custom_host` | Custom download host |
| `enable_direct_upload` | Enable direct upload |

## Notes

- Runtime supports token refresh, list, get, read, link, management, and upload.
- Small files upload directly; large files use upload sessions.
- `disable_disk_usage` can reduce local disk usage.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Token expired | Update `refresh_token` |
| SharePoint is empty | Check `is_sharepoint` and `site_id` |
| Upload fails | Reduce `chunk_size` or check account permissions |
