# OneDrive

This guide applies to `Onedrive`.

## Good For

- Connecting Microsoft OneDrive or SharePoint.
- Selecting global, China, US, or Germany cloud regions.
- Uploading small files directly and large files through upload sessions.

## Get refresh_token

The upstream OpenList OneDrive guide recommends using the online API's default application first.

1. Open the official online helper: <https://api.oplist.org/>.
2. Select the OneDrive version that matches your account region.
3. **Important: enable "Use OpenList-provided parameters".**
4. Click "Get Token", then sign in to and authorize the OneDrive account you want to mount.
5. Return to the helper page after authorization and copy the returned `refresh_token`.
6. In the Siyuan Cloud mount form, keep `use_online_api=true` and fill `refresh_token`.

If the default online app hits rate limits because of heavy shared use, or if you need your own Azure app, disable "Use OpenList-provided parameters", fill your own `client_id`, `client_secret`, and `redirect_uri` to get the token, then use the same parameters in the mount form.

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
| `use_online_api` | Use the OpenList online API to refresh tokens; keep enabled when using the official online helper's default app |
| `client_id` / `client_secret` | Custom Azure app credentials; usually empty when the token was obtained with "Use OpenList-provided parameters" enabled |
| `redirect_uri` | OAuth redirect URI; custom apps commonly use `https://api.oplist.org/onedrive/callback` |
| `chunk_size` | Chunk size |
| `custom_host` | Custom download host |
| `enable_direct_upload` | Enable direct upload |

## Notes

- Runtime supports token refresh, list, get, read, link, management, and upload.
- Small files upload directly; large files use upload sessions.
- `enable_direct_upload` exposes OpenList `HttpDirect` direct-upload tool information.
- `disable_disk_usage` can reduce local disk usage.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Token expired | Update `refresh_token` |
| SharePoint is empty | Check `is_sharepoint` and `site_id` |
| Upload fails | Reduce `chunk_size` or check account permissions |
