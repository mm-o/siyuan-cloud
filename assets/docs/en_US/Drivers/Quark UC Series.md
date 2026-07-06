# Quark / UC / TV / Open

Upstream reference: <https://doc.oplist.org/guide/drivers/quark>

This guide applies to `Quark`, `UC`, `QuarkTV`, `UCTV`, and `QuarkOpen`.

## Important Notes

- The Quark family uses reverse-engineered interfaces from legacy products. Stability depends on the upstream service and may change without notice.
- Quark Drive is commonly speed-limited. For normal cookie-based Quark/UC mounts, proxy playback and downloads may depend on the bandwidth of the machine running SiYuan.
- `QuarkTV` / `UCTV` are read/download oriented. Management and upload are not implemented by the upstream OpenList driver, and this plugin keeps that boundary.
- `QuarkOpen` is not a true public Open API. Use the online token refresh path unless you know how to maintain the required AppID and SignKey yourself.

## Choose A Driver

| Driver | When to use |
| --- | --- |
| `Quark` | Quark Drive cookie login |
| `UC` | UC Drive cookie login |
| `QuarkTV` | Quark TV QR/token login, read and download only |
| `UCTV` | UC TV QR/token login, read and download only |
| `QuarkOpen` | OAuth2-style Quark Open token with AppID and SignKey |

## Quark / UC

### Cookie

1. Open <https://pan.quark.cn> in Chrome and sign in.
2. Press <kbd>F12</kbd>, open the <kbd>Network</kbd> panel, and select any request that carries a `Cookie` request header.
3. Copy the full `Cookie` value into the mount field.

Chrome is recommended. Cookies copied from other browsers may stay in a guest state and keep asking for login.

### Root Folder ID

- Root folder ID is `0`.
- To mount a subfolder, enter that folder in the web UI and copy the folder ID from the address bar. For deeper folders, use the later folder ID in the URL.

### Playback And Download

- `use_transcoding_address` is disabled by default to match OpenList and prefer normal download links. When enabled, it tries Quark transcoded video links first and falls back to the normal download link if no usable transcoded URL is returned.
- `only_list_video_file` filters the list to video files and folders.
- This plugin follows the OpenList proxy boundary: proxied links go through `/p/<path>` and the generic streaming proxy.

## QuarkTV / UCTV

### Add A Mount

1. Add a `QuarkTV` or `UCTV` mount and save it with a mount path.
2. Use the mount verification flow to show or refresh the QR code.
3. Scan and confirm in the mobile app.
4. Save the returned addition. `refresh_token`, `device_id`, and `query_token` are filled automatically.

Do not edit `refresh_token`, `device_id`, or `query_token` manually unless you are intentionally replacing the login state.

### Device Limit Exceeded

If QuarkTV / UCTV reports that the device limit has been exceeded after QR confirmation, the account has usually reached the upstream TV/OAuth device authorization limit. This is not caused by the mount path or QR-code fields.

Try:

1. Open the Quark or UC mobile app, or the web account security/device-management page, and sign out old or unused devices.
2. Return to the Siyuan Cloud mount form, clear `refresh_token`, `query_token`, and `device_id` for this QuarkTV / UCTV mount, then refresh the QR code and scan again.
3. If the upstream service still reports the limit, wait for old device records to be released, or use the normal `Quark` / `UC` cookie-based mount instead.

### Root Folder ID

- Root folder ID is `0`.
- Subfolder IDs are obtained the same way as Quark/UC: enter the folder in the web UI and copy the folder ID from the address bar.

### Link Method

`link_method` controls TV video links:

| Value | Meaning |
| --- | --- |
| `download` | Original download link |
| `streaming` | Transcoded streaming link when available |

### TV Playback Quality And Smoothness

`streaming` requests upstream TV transcoded playback links with quality candidates in this order: `low`, `normal`, `high`, `super`, `2k`, `4k`. The current flow uses the first playable URL returned by the upstream service, so it favors "play smoothly first" and does not guarantee the highest quality.

Smoothness usually ranks like this:

| Smoothness rank | Quality | When to use |
| --- | --- | --- |
| 1 | `low` | Smoothest and lowest quality, good for unstable networks or quick previews |
| 2 | `normal` | Standard quality with faster startup |
| 3 | `high` | Clearer, with higher bandwidth requirements |
| 4 | `super` | HD-first, more likely to buffer |
| 5 | `2k` | High bitrate, best for stable bandwidth |
| 6 | `4k` | Highest quality and highest bandwidth cost, most likely to buffer |

If `streaming` looks low-resolution but plays smoothly, that is expected for the smoothness-first transcoding path. To prefer original quality, set `link_method` to `download`; original download links depend more on account status, bandwidth, and upstream throttling, so they may buffer more easily.

The TV drivers support list/get/read/link only. Upload, mkdir, rename, move, copy, and remove are intentionally unavailable.

## QuarkOpen

`QuarkOpen` needs at least `refresh_token`. When `use_online_api` is enabled, the plugin refreshes `access_token` through the online API first. Quark Open API requests still require public parameters; when `app_id` and `sign_key` are empty, the plugin uses built-in public parameters without showing them in the form or default configuration JSON.

> [!IMPORTANT]
> When using the official online helper to get a QuarkOpen token, enable "Use OpenList-provided parameters". With this enabled, `app_id` and `sign_key` may stay empty; disable it only when maintaining your own parameters.

| Field | Description |
| --- | --- |
| `refresh_token` | Refresh token obtained through the Quark OAuth2-style flow |
| `access_token` | May be empty; refreshed automatically when the online API is enabled |
| `app_id` | May be empty; built-in public parameters are used without being shown by default |
| `sign_key` | May be empty; built-in public parameters are used without being shown by default |
| `api_url_address` | Online refresh API, default `https://api.oplist.org/quarkyun/renewapi` |
| `use_online_api` | Keep enabled unless you maintain local refresh logic |

OpenList notes that this Open interface is not a true official public interface and provides no deeper tutorial. In this plugin, `QuarkOpen` supports list, get, read, link, basic management, and upload; copy is not exposed.

## Common Fields

| Field | Description |
| --- | --- |
| `root_folder_id` | Root folder ID, default `0` |
| `order_by` / `order_direction` | Sorting |
| `cookie` | Quark/UC cookie login |
| `refresh_token` | TV/Open refresh token |
| `use_transcoding_address` | Quark transcoded playback link, disabled by default |
| `only_list_video_file` | Show only video files and folders |
| `link_method` | TV link method, `download` or `streaming` |

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Cookie expired or still guest | Re-copy the Cookie from Chrome and save the mount again |
| Preview/download is slow | Use a machine with better bandwidth, or prefer TV/Open routes when suitable |
| Cookie login playback returns 502 | Disable `use_transcoding_address` and retry; this plugin also falls back to normal download links when transcoding returns no usable URL |
| Only videos are listed | Disable `only_list_video_file` |
| TV QR state is stale | Refresh the QR code and save the returned addition |
| TV reports device limit exceeded | Remove old devices from Quark/UC account device management, then clear this mount's `refresh_token`, `query_token`, and `device_id` before scanning again |
| QuarkOpen reports missing public parameters | Make sure the plugin is up to date; the current version uses built-in public parameters when `app_id` / `sign_key` are empty |
| Open token expired | Update `refresh_token` or keep `use_online_api` enabled |
| Copy fails | Copy is not exposed for the Quark family in this plugin |
