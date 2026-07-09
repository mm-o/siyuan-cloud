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
| `endpoint` | Required S3 API endpoint. It must be an absolute URL with `http://` or `https://`, for example `https://s3.cn-south-1.qiniucs.com` |
| `region` | Region |
| `access_key_id` / `secret_access_key` | Required credentials |
| `session_token` | Temporary session token |
| `custom_host` | Custom public host |
| `enable_custom_host_presign` | Use custom host for presigned URLs |
| `force_path_style` | Path-style access, often needed for MinIO |
| `list_object_version` | `v1` or `v2` |
| `remove_bucket` | Remove bucket from access paths when using a custom host |
| `add_filename_to_disposition` | Add filename information to download response headers |
| `enable_direct_upload` | Enable direct-upload info |
| `direct_upload_host` | Direct-upload host |

## Common Formats

Put only the bucket name in `bucket`, and only the service endpoint in `endpoint`. Do not prepend the bucket to the endpoint. This S3 driver follows OpenList behavior and does not add the protocol automatically; an endpoint without `https://` may fail with `URL is not absolute`.

| Service | `bucket` example | `endpoint` example | `region` example | `force_path_style` |
| --- | --- | --- | --- | --- |
| Bitiful S4 | `your-bucket` | `https://s3.bitiful.net` | `cn-east-1` | Usually disabled; enable only if the service asks for path-style requests |
| Qiniu Kodo South China Guangdong | `your-bucket` | `https://s3.cn-south-1.qiniucs.com` | `cn-south-1` | Can be enabled; Qiniu supports both path-style and virtual-host style |
| Qiniu Kodo East China Zhejiang | `your-bucket` | `https://s3.cn-east-1.qiniucs.com` | `cn-east-1` | Can be enabled |
| AWS S3 | `your-bucket` | `https://s3.<region>.amazonaws.com` | `us-east-1`, `ap-east-1`, etc. | Usually disabled; enable only if your service requires it |
| Tencent Cloud COS | `your-bucket` | `https://cos.<Region>.myqcloud.com`, for example `https://cos.ap-guangzhou.myqcloud.com` | `auto` or the value required by the service | Usually disabled; enable only if your service requires it |
| Alibaba Cloud OSS S3-compatible | `your-bucket` | `https://s3.oss-<region>.aliyuncs.com`, for example `https://s3.oss-cn-hangzhou.aliyuncs.com` | `cn-hangzhou`, etc. | Usually disabled; enable only if your service requires it |
| Huawei Cloud OBS | `your-bucket` | `https://obs.<region>.myhuaweicloud.com`, for example `https://obs.cn-north-4.myhuaweicloud.com` | `cn-north-4`, etc. | Usually disabled; enable only if your service requires it |
| Volcengine TOS | `your-bucket` | `https://tos-s3-<region>.volces.com`, for example `https://tos-s3-cn-beijing.volces.com` | `cn-beijing`, etc. | Usually disabled; follow the S3 endpoint shown in the console |
| UPYUN USS | `your-bucket` | `https://s3.api.upyun.com` | Leave empty or use the value required by the service | Can be enabled; UPYUN supports both path-style and virtual-host style |
| Cloudflare R2 | `your-bucket` | `https://<account_id>.r2.cloudflarestorage.com` | `auto` | Usually enabled |
| MinIO | `your-bucket` | `https://minio.example.com` or `http://192.168.1.10:9000` | `us-east-1` | Usually enabled |
| Backblaze B2 | `your-bucket` | `https://s3.<region>.backblazeb2.com` | `us-west-004`, etc. | Usually disabled; enable only if your service requires it |
| DigitalOcean Spaces | `your-space` | `https://<region>.digitaloceanspaces.com`, for example `https://nyc3.digitaloceanspaces.com` | `nyc3`, etc. | Usually disabled |
| DogeCloud | From DogeCloud console | From DogeCloud S3 endpoint | From DogeCloud console | Follow the service hint |

S3-compatible services differ in compatibility details and signing rules. If a table example differs from your provider console, prefer the S3 API endpoint shown in the console or official documentation. Do not use a public object URL, CDN domain, or web console address as `endpoint`.

Common Qiniu Region IDs:

| Area | `region` | `endpoint` |
| --- | --- | --- |
| East China Zhejiang | `cn-east-1` | `https://s3.cn-east-1.qiniucs.com` |
| East China Zhejiang 2 | `cn-east-2` | `https://s3.cn-east-2.qiniucs.com` |
| North China Hebei | `cn-north-1` | `https://s3.cn-north-1.qiniucs.com` |
| South China Guangdong | `cn-south-1` | `https://s3.cn-south-1.qiniucs.com` |
| North America Los Angeles | `us-north-1` | `https://s3.us-north-1.qiniucs.com` |
| Asia Pacific Singapore | `ap-southeast-1` | `https://s3.ap-southeast-1.qiniucs.com` |
| Asia Pacific Hanoi | `ap-southeast-2` | `https://s3.ap-southeast-2.qiniucs.com` |

Avoid these values:

| Wrong value | Why |
| --- | --- |
| `bucket.s3.region.qiniucs.com` | This is a template, not a real endpoint, and it also lacks a protocol |
| `s3.cn-south-1.qiniucs.com` | Missing `https://`, so it is not an absolute URL |
| `https://siyuan-mediaplayer.s3.cn-south-1.qiniucs.com` while `bucket=siyuan-mediaplayer` | The bucket is usually added again by the S3 request path; use the service endpoint unless you are intentionally configuring a custom host |
| Public object URL, CDN domain, or static website domain | These are usually not S3 API endpoints and cannot handle signed list/put/delete requests |

## Notes

- File `raw_url` usually points to Siyuan Cloud `/d/<path>`.
- `/api/fs/link` returns an OpenList-style GET presigned URL. `/p/<path>` keeps a stable Siyuan Cloud path and reads the object through plugin-side S3 signing, which is safer for SiYuan Reader / PDF.js preview flows that issue Range requests.
- `/p/<path>` forwards Range requests to the upstream object storage, so PDF readers and media components can request partial content through the stable plugin path.
- Directory detection, listing pagination, directory marker filtering, and recursive directory copy/move/remove/rename follow OpenList S3 behavior. The default directory placeholder file is `.siyuan-cloud`.
- `enable_direct_upload` exposes OpenList `HttpDirect` direct-upload tool information, so clients upload objects directly with a presigned PUT request.
- `Doge` reuses the S3-compatible field set.
- For DogeCloud-specific notes, see [[DogeCloud]].
- Enable `force_path_style` when the object storage service requires path-style requests; MinIO, R2, and some compatible services often need it.
- If you only want to change the public access domain, prefer `custom_host`; do not put a CDN domain in `endpoint`.
- Bitiful S4 usually uses `endpoint=https://s3.bitiful.net`, `region=cn-east-1`, and `force_path_style=false`. Put a bound domain or CDN domain in `custom_host`, not in `endpoint`.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| `URL is not absolute` | Add `https://` or `http://` to `endpoint` |
| List fails | Check bucket, endpoint, region, and signing behavior |
| Upload fails | Check AK/SK permissions and bucket write policy |
| Link cannot open | Check `custom_host`, presign expiry, and public access policy |
| PDF downloads but SiYuan Reader cannot open it | Confirm `endpoint` is the S3 API endpoint instead of an object/CDN URL; Bitiful usually keeps `force_path_style` disabled; if using a custom public domain, put it in `custom_host` and decide whether `enable_custom_host_presign` is needed by that domain |
