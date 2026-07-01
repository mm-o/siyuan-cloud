# DogeCloud

This guide applies to `Doge`.

In OpenList, `Doge` is a DogeCloud-specific variant registered under the S3 driver package. It reuses the S3 bucket, endpoint, region, and object-operation model, but OpenList first exchanges DogeCloud credentials for temporary S3 credentials and then uses those temporary credentials for S3 operations.

## Good For

- Connecting DogeCloud object storage.
- Keeping mount fields and behavior aligned with OpenList's `Doge` driver.
- Browsing, downloading, uploading, and managing object storage files through Siyuan Cloud.

## OpenList Alignment

The main difference between OpenList `Doge` and normal `S3` is initialization:

1. The mount stores DogeCloud access credentials.
2. OpenList calls `https://api.dogecloud.com/auth/tmp_token.json`.
3. The request body is `{"channel":"OSS_FULL","scopes":["*"]}`.
4. DogeCloud returns temporary S3 credentials: `accessKeyId`, `secretAccessKey`, and `sessionToken`.
5. OpenList creates an S3 client with those temporary credentials. Listing, reading, uploading, deleting, and copying then follow the S3 logic.
6. DogeCloud temporary credentials are valid for up to 2 hours, so OpenList refreshes them every 118 minutes.

References:

- OpenList `drivers/s3/meta.go`: `S3` and `Doge` are registered in the same driver package.
- OpenList `drivers/s3/doge.go`: `getCredentials()` calls the DogeCloud temporary-token API.
- DogeCloud temporary-token documentation: <https://docs.dogecloud.com/oss/manual-tmp-token>
- DogeCloud S3 SDK overview: <https://docs.dogecloud.com/oss/sdk-introduction>

## Current Boundary

Siyuan Cloud currently exposes `Doge` in the mount list and keeps its fields aligned with OpenList `Doge`, but the runtime still reuses the generic S3 driver. OpenList's DogeCloud temporary-credential exchange and 118-minute refresh loop are not fully ported yet.

Therefore:

- If you only have DogeCloud permanent AK/SK and expect the driver to exchange temporary credentials automatically, the current runtime may not behave exactly like OpenList yet.
- If you already have temporary `accessKeyId`, `secretAccessKey`, and `sessionToken` values that can be used directly with the S3 API, you can try them with the S3-compatible fields.
- If the service is a normal S3-compatible provider, choose `S3` instead of `Doge`.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `Doge`.
3. Set Mount Path to `/doge`.
4. Set `bucket` to your DogeCloud bucket name.
5. Set `endpoint` to the S3 API endpoint shown by DogeCloud console or documentation. It must include `https://`.
6. Set `region` according to DogeCloud console or documentation.
7. Fill `access_key_id`, `secret_access_key`, and `session_token` according to your credential type.
8. Save, then browse `/doge`.

| Recommended field | Value |
| --- | --- |
| Driver | `Doge` |
| Mount path | `/doge` |
| `root_folder_path` | `/` |
| `endpoint` | Use the DogeCloud S3 API endpoint from the console, with `https://` |
| `region` | Use the DogeCloud console value |
| `force_path_style` | Follow DogeCloud's S3 endpoint requirement |

## Fields

| Field | Description |
| --- | --- |
| `bucket` | Required DogeCloud bucket name |
| `endpoint` | Required DogeCloud S3 API endpoint; must be an absolute URL |
| `region` | Region from DogeCloud console |
| `access_key_id` / `secret_access_key` | In OpenList semantics, these are DogeCloud access credentials; in the current runtime, they are signed as direct S3 credentials |
| `session_token` | Temporary S3 session token; OpenList obtains it automatically, while the current runtime needs a usable value if you rely on temporary credentials |
| `custom_host` | Custom public host |
| `enable_custom_host_presign` | Use custom host for presigned URLs |
| `force_path_style` | Path-style access |
| `list_object_version` | `v1` or `v2` |
| `enable_direct_upload` | Enable direct-upload info |
| `direct_upload_host` | Direct-upload host |

## Notes

- `Doge` is intended to match OpenList's DogeCloud-specific S3 variant.
- In the current version, treat it as "fields aligned, runtime still handled as generic S3" until DogeCloud temporary-credential refresh is ported.
- Do not put a DogeCloud CDN domain, public object URL, or web console URL in `endpoint`.
- If `endpoint` does not include `https://` or `http://`, you may see `URL is not absolute`.
- For normal S3-compatible services, see [[S3 Compatible]].

## Troubleshooting

| Symptom | Try |
| --- | --- |
| `URL is not absolute` | Add `https://` or `http://` to `endpoint` |
| List fails | Check bucket, endpoint, region, credential type, and whether `session_token` matches |
| Signature fails | The current runtime does not yet exchange DogeCloud temporary S3 credentials automatically; verify that the credentials can be used directly with the S3 API |
| Upload fails | Check temporary credential write permission, or wait for the OpenList Doge temporary-credential refresh path to be ported |
