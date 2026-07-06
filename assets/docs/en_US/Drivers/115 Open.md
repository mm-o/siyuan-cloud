# 115 Open

This guide applies to `115 Open`.

`115 Open` follows OpenList's 115 Open Platform driver. It uses the official 115 Open Platform API and differs from the cookie/QR-token flow used by `115 Cloud`; the main credentials are `access_token` and `refresh_token`.

Upstream reference: <https://doc.oplist.org/guide/drivers/115_open>

## Good For

- Accessing your 115 Cloud files through the official 115 Open Platform authorization flow.
- Avoiding the regular `115 Cloud` cookie login path.
- Keeping OpenList-compatible `access_token`, `refresh_token`, and `root_folder_id` fields.

## Related Drivers

- [[115 Cloud]]: Regular 115 Cloud mount with `cookie` or `qrcode_token`.
- [[115 Share]]: Read-only mount for 115 share links.

## Current Boundary

Siyuan Cloud now wires the `115 Open` runtime. The driver name, fields, and main behavior follow OpenList `115 Open`: token refresh, list, get, read, link, mkdir, move, copy, remove, rename, and storage details are available.

Upload remains a structured placeholder because OpenList uses the 115 Open SDK's SHA1 verification and OSS multipart upload chain, which has not been fully ported into the Siyuan kernel runtime yet.

## Account Use

Use your 115 account responsibly. Do not use it for multi-user sharing, image/software hosting, or video hotlink distribution. Account restrictions caused by misuse are your own responsibility.

Speed and stability also depend on your local network, 115 server network, and device performance.

## Get Tokens

OpenList recommends using the OpenList API helper for 115 Open authorization:

1. Open <https://api.oplist.org/>.
2. Select 115 Cloud verification from the drop-down list.
3. **Important: if you use the OpenList-provided key pair, enable "Use OpenList-provided parameters".** Leave `Client ID` and `Application Secret` empty, then click "Get Token".
4. If you use your own 115 Open Platform app, disable "Use OpenList-provided parameters", fill your own `AppId` and `AppSecret`, then click "Get Token".
5. Log in and authorize on the 115 authorization page.
6. Copy the returned `Access Token` and `Refresh Token`.

115 Open Platform: <https://open.115.com>

## Root Folder ID

The default root folder ID is `0`.

To mount a subfolder:

1. Open the 115 web app.
2. Enter the folder you want to use as the mount root.
3. Check the `cid` parameter in the browser URL.
4. Put the number after `cid` into `root_folder_id`.

Example:

```text
https://115.com/?cid=249163533602609229&offset=0&tab=&mode=wangpan
```

The folder's `root_folder_id` is:

```text
249163533602609229
```

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `115 Open`.
3. Set Mount Path to `/115-open`.
4. Keep `root_folder_id` as `0`, or use the folder `cid` from above.
5. Fill `access_token` and `refresh_token`.
6. Adjust sort, page size, and rate limit fields when needed.
7. Save the mount.

| Recommended field | Value |
| --- | --- |
| Driver | `115 Open` |
| Mount path | `/115-open` |
| `root_folder_id` | `0` |
| `order_by` | `file_name` |
| `order_direction` | `asc` |
| `page_size` | `200` |
| `limit_rate` | `1` |

## Fields

| Field | Description |
| --- | --- |
| `root_folder_id` | Root folder ID, default `0` |
| `access_token` | Required access token |
| `refresh_token` | Required refresh token |
| `order_by` | Sort field: `file_name`, `file_size`, `user_utime`, or `file_type` |
| `order_direction` | Sort direction: `asc` or `desc` |
| `page_size` | Page size, OpenList default `200` |
| `limit_rate` | Request rate limit, OpenList default `1` |

## Tokens And Security

- If tokens leak, revoke the app authorization from 115 device login management.
- 115 web device management: <https://115.com/?mode=device_manage>
- Revoking authorization from the 115 mobile app requires a recent iOS/Android app version; OpenList notes `35.11.0` or later.
- The same account can obtain two `Refresh Token` values for the same app. When a third token is obtained, the first one becomes invalid.
- A common expired-token error is similar to: `failed get objs: failed to list objs: code: 40140116, message: no auth`.

## Notes

- OpenList notes that refreshing 115 tokens does not require AppKey and is subject to IP-based rate limiting.
- OpenList still marks "use another APP ID to get refresh token" and "mobile QR authorization PKCE mode" as not implemented.
- Siyuan Cloud retries token refresh when the 115 Open API reports an expired authorization, then saves the updated `access_token` / `refresh_token` back to the mount configuration.
- Upload is not wired yet; use another upload-capable driver when you need uploads.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Folder not found | Check whether `root_folder_id` is the correct `cid` from the 115 web URL |
| `no auth` | Get new `access_token` and `refresh_token`, and confirm the app authorization was not revoked |
| Refresh Token expired | Getting a third token for the same app invalidates the first token; save the latest token |
| Upload fails | `115 Open` upload is not wired yet |
