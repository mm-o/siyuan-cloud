# 189Cloud Series

This guide applies to `189Cloud`, `189CloudPC`, and `189CloudTV`.

## Good For

- Connecting Tianyi Cloud personal or family spaces.
- Browsing, downloading, playing, and basic file management.
- Choosing normal, PC, or TV driver paths according to your account/session.

## Choose A Driver

| Driver | Best for |
| --- | --- |
| `189Cloud` | Username/password or cookie path |
| `189CloudPC` | Existing PC access token/session |
| `189CloudTV` | TV QR/token path |

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select one 189Cloud driver.
3. Set Mount Path to `/189`.
4. Fill account, password, cookie, `access_token`, or `refresh_token` as required.
5. Keep `root_folder_id` as `-11`.
6. Save, then browse `/189`.

## Common Fields

| Field | Description |
| --- | --- |
| `username` / `password` | Account credentials |
| `cookie` | Optional for normal 189Cloud when captcha is needed |
| `access_token` / `refresh_token` | PC/TV session fields |
| `root_folder_id` | Root folder ID, default `-11` |
| `type` | `personal` or `family` |
| `family_id` | Family space ID |
| `order_by` / `order_direction` | Sorting |
| `upload_method` | PC upload method field; upload remains limited |

## Notes

- `189Cloud` includes login, list, get, read, link, management, and upload request foundations.
- `189CloudPC` requires usable `access_token`/session; password/QR login remains a structured placeholder.
- `189CloudTV` supports TV login refresh, list, get, read, link, and management. Upload remains a placeholder.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Cookie expired | Re-save account info or update cookie |
| PC/TV session missing | Import an OpenList-compatible session addition or refresh token |
| Family space empty | Check `type` and `family_id` |
