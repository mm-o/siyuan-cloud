# Baidu Netdisk

This guide follows the OpenList `BaiduNetdisk` driver fields used by **Siyuan Cloud**.

> [!TIP]
> Keep `download_api` as `crack_video` first. It is the default path tuned for media playback in Siyuan Cloud.

{{{row

{{{col

## Good For

- Browsing Baidu Netdisk folders in Siyuan Cloud.
- Copying file download links or document-ready links.
- Proxy playback through `/p/<path>`.
- Previewing remote ZIP archives.

}}}

{{{col

## Before You Start

- A usable Baidu Netdisk account.
- A valid `refresh_token`.
- The Siyuan Cloud Dock can be opened.
- A stable network egress path; frequent proxy changes may break Baidu links.

}}}

}}}

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `BaiduNetdisk`.
3. Set Mount Path, for example `/Baidu`.
4. Fill `refresh_token`.
5. Keep `download_api` as `crack_video` for media playback, or use `official` for the conservative upstream path.
6. Save, then open the file manager and browse `/Baidu`.

| Recommended field | Value |
| --- | --- |
| Driver | `BaiduNetdisk` |
| Mount path | `/Baidu` |
| `download_api` | `crack_video` |
| `root_folder_path` | `/` |

## Fields

- `refresh_token`: required. Used to refresh Baidu access tokens.
- `download_api`: `official`, `crack`, or `crack_video`. `crack_video` is the default in Siyuan Cloud for faster media playback.
- `use_online_api`: keep enabled unless you provide your own Baidu OAuth app.
- `api_url_address`: token renewal API. Default: `https://api.oplist.org/baiduyun/renewapi`.
- `client_id` / `client_secret`: optional when using your own OAuth app.
- `custom_crack_ua`: User-Agent used by crack link APIs. Default: `netdisk`.
- `root_folder_path`: optional remote root path. Default: `/`.
- `order_by` / `order_direction`: list order.

{{{row

{{{col

## Verify

- [ ] `/Baidu` is visible in the Dock.
- [ ] The file manager can list Baidu Netdisk folders.
- [ ] Ordinary files can produce download links.
- [ ] Video `raw_url` points to `/p/<path>`.
- [ ] ZIP files can open archive preview.

}}}

{{{col

## Notes

> [!NOTE]
> Baidu Netdisk prefers proxy playback, so `raw_url` usually points to `/p/<path>`.

> [!WARNING]
> Baidu links are sensitive to egress IP changes. If playback fails, try disabling system or network proxies first.

- Media playback uses `fs.Link -> /p -> body.proxy`; companion plugins should consume the returned `raw_url`.
- ZIP archive preview uses range reads. Ordinary video playback and video inside ZIP archives are different paths.

}}}

}}}

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Playback fails | Disable system or network proxies first |
| Empty directory | Check whether `root_folder_path` points to a real folder |
| Expired link | Reopen the file or refresh the directory so Siyuan Cloud resolves it again |
| Login expired | Update `refresh_token`, then save the mount again |
