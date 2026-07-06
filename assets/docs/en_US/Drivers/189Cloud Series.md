# 189Cloud Series

This guide applies to `189Cloud`, `189CloudPC`, and `189CloudTV`, covering Tianyi Cloud's web, PC/client, and TV API paths. Upstream reference: <https://doc.oplist.org/guide/drivers/189>.

## Choose A Driver

| Driver | Best for | Current status |
| --- | --- | --- |
| `189Cloud` | Username/password or cookie login through the web path | Login, SMS second verification, list, download/playback, basic management, and upload-request foundations are ported; family cloud is not part of this driver |
| `189CloudPC` | Tianyi Cloud app QR login, family cloud, or existing PC token/session data | QR login, token refresh, family-cloud ID refill, list, download/playback, and basic management are ported; upload and CAS/torrent rapid upload remain placeholders |
| `189CloudTV` | TV QR/token path for token login or family cloud | TV QR login, session refresh, family-cloud ID refill, list, download/playback, and basic management are ported; upload remains a placeholder |

If `189Cloud` hits web captcha or login risk control, try `189CloudPC` QR login first.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add Mount</kbd>.
2. Select `189Cloud`, `189CloudPC`, or `189CloudTV`.
3. Use a unique mount path such as `/189` or `/189pc`.
4. Keep `root_folder_id` as `-11` for the personal-cloud root.
5. Save, then browse the mount path in the file tree.

## 189Cloud

Normal `189Cloud` accepts `username` / `password`, or an already valid `cookie`. This driver maps to the web personal-cloud path; use `189CloudPC` or `189CloudTV` for family cloud.

- Username/password login follows the OpenList flow: open the login page, fetch encryption config, then submit RSA-encrypted credentials.
- When the remote service requires SMS second verification, Dock shows an SMS form. After verification succeeds, the new `cookie` is written back to the mount config.
- File browsing does not repeatedly send SMS. If an existing cookie expires, return to mount settings and verify again.
- Upload uses the `initMultiUpload -> getMultiUploadUrls -> commitMultiUploadFile` foundation, but real-account large-file validation is still recommended before relying on it.

## 189CloudPC

QR login is recommended:

1. Set `login_type` to `qrcode`.
2. Keep `root_folder_id` as `-11`.
3. Click verify or save; Dock shows a QR code.
4. Scan it with the Tianyi Cloud app and confirm on your phone.
5. Click verify or save again. The plugin polls the login state and writes back `access_token`, `refresh_token`, `sessionKey`, and `sessionSecret`.

You can also import existing `access_token` / `refresh_token` / session fields. `username`, `password`, and `validate_code` mirror upstream PC password-login fields; this port currently recommends the QR/token path.

For family cloud, set `type` to `family`. If `family_id` is empty, the plugin calls the upstream family-list API after refreshing the PC session and tries to write back `family_id` from the matching login name or the first family space.

## 189CloudTV

`189CloudTV` can start without account credentials:

1. Leave `access_token` empty and click verify or save.
2. Dock shows the TV login QR content.
3. Scan and confirm, then click verify or save again.
4. The plugin writes back `access_token` and refreshes `sessionKey` / `sessionSecret`.

## Family Space

| Field | Description |
| --- | --- |
| `type` | `personal` for personal cloud, `family` for family cloud |
| `family_id` | Family space ID; the PC/TV drivers try to fill it when possible |
| `root_folder_id` | Personal cloud defaults to `-11`; family cloud is usually empty or a specific folder ID |

Use `189CloudPC` or `189CloudTV` for family cloud. Normal `189Cloud` does not expose family-cloud fields. In family mode, `root_folder_id=-11` is normalized to an empty value for the family-cloud root; use a concrete folder ID only when mounting a subfolder.

If automatic refill fails, follow the upstream guide and find `familyId` from Tianyi Cloud mobile H5 family-cloud requests, then enter it as `family_id`. If the family space is empty, check that `type`, `family_id`, and `root_folder_id` match.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Normal 189Cloud says cookie expired | Re-login from mount settings or update the cookie |
| Normal 189Cloud requires SMS verification | Complete SMS verification in mount settings instead of retrying from file browsing |
| 189CloudPC says QR login is waiting | Scan with the Tianyi Cloud app, then click verify or save again |
| 189CloudPC QR code expired | Click verify again to generate a fresh QR code |
| PC/TV session is missing | Verify again so the plugin can refresh the session from the token |
| Family space is empty | Prefer `189CloudPC` / `189CloudTV`, then check `type`, `family_id`, and `root_folder_id` |

## Known Limits

- `189CloudPC` upload, family transfer, and CAS/torrent rapid upload are not fully ported yet.
- `189CloudTV` upload remains a placeholder.
- Normal `189Cloud` upload has smoke coverage, but real-account large-file validation is still pending.
