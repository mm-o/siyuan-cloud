# Baidu Netdisk

This guide follows the OpenList Baidu driver documentation and adds the current Siyuan Cloud runtime boundaries for step-by-step testing. Upstream reference: <https://doc.oplist.org/guide/drivers/baidu>

> [!TIP]
> New Baidu mounts in Siyuan Cloud default to `download_api=crack_video`. The current runtime only uses `crack_video` for video/audio files and falls back to `official` for other files, so PDFs, EPUBs, images, and similar files do not enter the video API path.

## Good For

- Browsing Baidu Netdisk folders in Siyuan Cloud.
- Proxy playback for video or audio through `/p/<path>`.
- Copying OpenList-compatible file links, download links, or document-ready links.
- Previewing remote ZIP archives, including range-based ZIP reads on Baidu mounts.
- Uploading ordinary files to Baidu Netdisk.

## Before You Start

- A usable Baidu Netdisk account.
- A valid `refresh_token`.
- The Siyuan Cloud Dock can open the <kbd>Mounts</kbd> page.
- A stable network egress path. Baidu download links are sensitive to IP, User-Agent, and proxy changes.

## Get refresh_token

OpenList documents several ways to obtain the token. Siyuan Cloud only needs the final `refresh_token` in the mount form.

1. Official online helper: <https://api.oplist.org/>
2. OpenList Baidu driver documentation: <https://doc.oplist.org/guide/drivers/baidu>
3. Your own Baidu OAuth app: fill your own `client_id` and `client_secret`, then disable or bypass the online renewal API.

> [!IMPORTANT]
> When using the official online helper, enable "Use OpenList-provided parameters". With this enabled, usually leave `client_id` / `client_secret` empty; only fill your own values when using your own Baidu OAuth app.

When using the online helper, keep the default `api_url_address`:

```text
https://api.oplist.org/baiduyun/renewapi
```

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd>, then use the bottom <kbd>Add</kbd> entry.
2. Select `BaiduNetdisk`.
3. Set Mount Path, for example `/Baidu`.
4. Fill `refresh_token`.
5. Keep `root_folder_path` as `/` in most cases; use a real Baidu folder path when mounting a subfolder.
6. Keep `download_api` as `crack_video` first.
7. Save, then open the file manager and browse `/Baidu`.

| Recommended field | Value |
| --- | --- |
| Driver | `BaiduNetdisk` |
| Mount path | `/Baidu` |
| `root_folder_path` | `/` |
| `download_api` | `crack_video` |
| `custom_crack_ua` | `netdisk` |
| `api_url_address` | `https://api.oplist.org/baiduyun/renewapi` |

## Fields

| Field | Description |
| --- | --- |
| `refresh_token` | Required. Used to refresh Baidu `access_token`; Siyuan Cloud writes back the refreshed token after a successful renewal. |
| `root_folder_path` | Baidu-side root path. Default: `/`. For example, use `/Movies` to expose only that folder. |
| `download_api` | Download API: `official`, `crack`, or `crack_video`. Siyuan Cloud defaults to `crack_video`; non-media files fall back to `official`. |
| `use_online_api` | Use the online token renewal API. Keep enabled when using `api.oplist.org`. |
| `api_url_address` | Online renewal API address. Default: `https://api.oplist.org/baiduyun/renewapi`. |
| `client_id` / `client_secret` | Fill these when using your own Baidu OAuth app; usually empty when using the online helper. |
| `custom_crack_ua` | User-Agent used by `crack` / `crack_video` link APIs. Default: `netdisk`. |
| `upload_thread` | Upload thread count. Keep the default `3` for basic testing. |
| `use_dynamic_upload_api` | Dynamic upload API. Enabled by default; temporarily disable it when diagnosing upload failures. |
| `low_bandwith_upload_mode` | Low-bandwidth upload mode. Disabled by default; try it only on unstable networks. |
| `only_list_video_file` | Only list video files. Do not enable for normal file management. |
| `order_by` / `order_direction` | List ordering field and direction. |

## download_api

| Value | Purpose | Recommendation |
| --- | --- | --- |
| `official` | Uses the official `filemetas` / `dlink` path. | Most conservative; useful for ordinary download troubleshooting. |
| `crack` | Uses the OpenList crack-link path. | Requires a suitable UA; check proxy and `custom_crack_ua` first when it fails. |
| `crack_video` | Uses Baidu's video API for media links. | Recommended default in Siyuan Cloud; only media files use it, non-media files fall back to official. |

> [!WARNING]
> OpenList notes that Baidu files larger than 20 MiB may be affected by User-Agent, account, and network constraints. Siyuan Cloud playback uses `fs.Link -> /p -> body.proxy`, but Baidu-side limits still apply.

## Test Checklist

- [ ] `/Baidu` is visible in the Dock mount list.
- [ ] The file manager can list the Baidu Netdisk root folder.
- [ ] Changing `root_folder_path` to a subfolder only shows that subfolder.
- [ ] A small ordinary file can open or download.
- [ ] A video file `raw_url` points to `/plugin/private/siyuan-cloud/p/...`.
- [ ] Video playback supports Range requests without resolving the full path again for every Range request.
- [ ] Non-media files still use the ordinary download path when `download_api=crack_video`.
- [ ] Creating folders, renaming, and deleting test files work.
- [ ] Uploading a small file works.
- [ ] ZIP files can open archive preview and Chinese filenames display correctly.

## Siyuan Cloud Boundaries

- Baidu mounts default to `PreferProxy`, so `raw_url` usually points to `/p/<path>` instead of a direct Baidu URL.
- Media playback keeps the OpenList boundary: `driver Link -> /p -> common proxy -> body.proxy`.
- Baidu ZIP preview uses range reads and no longer pulls the full archive first.
- Video inside an archive is not ordinary cloud-drive video playback; `/ae` is currently entry extraction, not a fully seekable proxy.
- Short-lived list, file, and link caches reduce repeated path resolution during player Range requests.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| `empty refresh_token` | Get a new `refresh_token`, then save the mount again. |
| Login or token renewal fails | Check `api_url_address`; when using your own OAuth app, check `client_id` / `client_secret`. |
| Empty directory | Check that `root_folder_path` exists and is a real Baidu Netdisk folder. |
| Playback fails | Disable system or network proxies first, then refresh the directory and play again. |
| Large-file download fails | Switch to `official` first, then check UA, account state, and network egress. |
| Non-media download fails | If `download_api` was changed, restore `crack_video` or `official`. |
| ZIP Chinese filenames are garbled | Use the current version; Siyuan Cloud includes deterministic GBK filename decoding. |
| Upload fails | Test with a small file first; then try disabling `use_dynamic_upload_api` or enabling `low_bandwith_upload_mode`. |
