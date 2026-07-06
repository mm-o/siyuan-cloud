# Aliyundrive Open

This guide applies to `AliyundriveOpen`. It is the OpenList-recommended official Aliyundrive Open Platform driver for resource, backup, or default drives.

## Get refresh_token

1. Open the Aliyundrive Open token helper linked from the OpenList documentation.
2. **Important: when using the official online helper, enable "Use OpenList-provided parameters".** With this enabled, `client_id` and `client_secret` are usually not needed.
3. Authorize with your Aliyundrive account and copy `refresh_token`.
4. Fill `refresh_token` when creating or updating the mount. The driver refreshes and writes back new `refresh_token` and `access_token` values automatically.

If you use your own Open Platform application, disable `use_online_api` and fill `client_id` plus `client_secret`.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `AliyundriveOpen`.
3. Set Mount Path to `/Aliyun`.
4. Fill `refresh_token`.
5. Keep `drive_type=resource` and `root_folder_id=root` in most cases.
6. Save, then browse `/Aliyun`.

| Recommended field | Value |
| --- | --- |
| Driver | `AliyundriveOpen` |
| Mount path | `/Aliyun` |
| `drive_type` | `resource` |
| `root_folder_id` | `root` |
| `use_online_api` | `true` |
| `alipan_type` | `default` |
| `remove_way` | `trash` |

## Fields

| Field | Default | Description |
| --- | --- | --- |
| `drive_type` | `resource` | Drive type: `default`, `resource`, or `backup`. |
| `root_folder_id` | `root` | Root folder ID for this mount. |
| `refresh_token` | empty | Required token refresh value. |
| `order_by` | empty | Sort field: `name`, `size`, `updated_at`, or `created_at`. |
| `order_direction` | empty | Sort direction: `ASC` or `DESC`. |
| `use_online_api` | `true` | Use the online token refresh API. |
| `alipan_type` | `default` | Online refresh API type: `default` or `alipanTV`. |
| `api_url_address` | `https://api.oplist.org/alicloud/renewapi` | Online token refresh API URL. |
| `client_id` | empty | Custom app client ID. Leave empty when using the online API. |
| `client_secret` | empty | Custom app secret. Leave empty when using the online API. |
| `remove_way` | `trash` | Delete behavior: `trash` moves to recycle bin, `delete` deletes directly. |
| `rapid_upload` | `false` | Enable rapid upload. Upstream notes that progress can be inaccurate because the file is uploaded to the server first. |
| `internal_upload` | `false` | For Aliyun ECS in Beijing; rewrites upload URLs to the internal OSS endpoint. |
| `livp_download_format` | `jpeg` | `.livp` download format: `jpeg` or `mov`. |
| `access_token` | auto-written | Saved after refresh; usually does not need manual input. |

## Supported Runtime

- Token refresh: follows upstream `_refreshToken`, with online API and custom `client_id/client_secret` branches.
- Init: calls `user/getDriveInfo` and chooses `default_drive_id`, `resource_drive_id`, or `backup_drive_id` from `drive_type`.
- List: calls `openFile/list`, pages by marker, and passes `order_by` / `order_direction`.
- Download: calls `openFile/getDownloadUrl` with upstream's `14400` second expiry; `.livp` falls back to `streamsUrl[livp_download_format]`.
- Management: mkdir, move, copy, remove, and rename are supported.
- Video preview: `/api/fs/other` with `video_preview` calls `openFile/getVideoPreviewPlayInfo`.
- Storage details: calls `user/getSpaceInfo` and returns total, used, and free space.
- Upload: follows upstream `upload.go`: `openFile/create -> upload_url PUT -> openFile/complete`.

## Upload Behavior

- Normal uploads use 20 MiB parts by default.
- Large files follow upstream thresholds to avoid exceeding 10000 parts.
- With `rapid_upload=true` and files larger than 100 KiB, the driver first submits a SHA1 `pre_hash` of the first 1024 bytes.
- If the API returns `PreHashMatched`, the driver resubmits full SHA1 `content_hash`, `proof_version=v1`, and an access-token-based `proof_code`.
- Non-rapid uploads PUT each returned `part_info_list[].upload_url`, then call `openFile/complete`.
- With `internal_upload=true`, `https://cn-beijing-data.aliyundrive.net/` is replaced by the Beijing internal OSS endpoint.

## Differences From OpenList

- This project runs inside the SiYuan plugin environment, so upload input comes from the kernel HTTP API. Normal and rapid upload paths follow OpenList's main flow.
- Runtime adds short-lived list/file/link caches to avoid repeated path walking on media Range requests. Management operations and uploads clear those caches.
- Upstream tries to remove duplicate files after move, copy, and rename. This runtime preserves the main `check_name_mode/auto_rename` behavior but does not issue the extra duplicate-cleanup requests.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Token expired | Get a new `refresh_token`, then save the mount again. |
| `empty ClientID or ClientSecret` | Enable `use_online_api`, or fill custom `client_id/client_secret`. |
| Wrong folder | Check `drive_type` and `root_folder_id`. |
| Deleted files go to recycle bin | Set `remove_way` to `delete` for direct deletion. |
| Upload fails | Disable `internal_upload` and retry, or check network access to the upload URL. |
| Unexpected `.livp` download | Change `livp_download_format` to `jpeg` or `mov`. |
