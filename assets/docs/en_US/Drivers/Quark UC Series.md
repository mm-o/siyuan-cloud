# Quark / UC Series

This guide applies to `Quark`, `UC`, `QuarkOpen`, `QuarkTV`, and `UCTV`.

## Good For

- Connecting Quark Drive or UC Drive.
- Browsing, playing, downloading, and basic file management.
- Choosing cookie, Open Platform, or TV-token paths according to the account type.

## Choose A Driver

| Driver | Best for |
| --- | --- |
| `Quark` | Quark cookie login |
| `UC` | UC cookie login |
| `QuarkOpen` | Quark Open Platform refresh token |
| `QuarkTV` | Quark TV token |
| `UCTV` | UC TV token |

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select the matching driver.
3. Set Mount Path to `/Quark` or `/UC`.
4. For cookie drivers, fill `cookie`; for Open/TV drivers, fill `refresh_token`.
5. Keep `root_folder_id` as `0`.
6. Save, then browse the mount.

## Common Fields

| Field | Description |
| --- | --- |
| `cookie` | Quark/UC cookie login |
| `refresh_token` | Open/TV token |
| `app_id` / `sign_key` | QuarkOpen platform fields |
| `root_folder_id` | Root folder ID, default `0` |
| `order_by` / `order_direction` | Sorting |
| `use_transcoding_address` | Use transcoding playback URL |
| `only_list_video_file` | List video files only |
| `link_method` | TV link method, `download` or `streaming` |

## Notes

- `Quark` / `UC` support list, get, read, link, mkdir, move, remove, rename, and upload. Copy is not ported.
- `QuarkOpen` supports Open Platform token refresh, list, get, read, link, management, and upload. Copy is not ported.
- `QuarkTV` / `UCTV` follow OpenList behavior and do not implement management or upload.
- UC/QuarkOpen/TV prefer proxy playback.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Cookie expired | Refresh cookie and save the mount again |
| Open token expired | Update `refresh_token` |
| Only videos are listed | Disable `only_list_video_file` |
| Copy fails | Copy is not ported for the Quark/UC series |
