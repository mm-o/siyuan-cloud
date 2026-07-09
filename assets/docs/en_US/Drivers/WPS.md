# WPS

This guide follows the OpenList WPS driver documentation and the local `docs/OpenList-main/drivers/wps` source. Upstream reference: <https://doc.oplist.org/guide/drivers/wps>

> [!WARNING]
> The WPS driver is based on reverse-engineered legacy web APIs. The OpenList documentation also notes that the upstream project does not actively maintain this interface. If WPS changes its web APIs, the mount may need another adapter pass.

## Use Cases

- Browse WPS Cloud / KDocs directories from Siyuan Cloud.
- Download or play downloadable files through `/p/<path>`.
- Manage WPS files through OpenList-compatible APIs: mkdir, move, copy, rename, and remove.

## Official Sites

- KDocs personal: <https://www.kdocs.cn/>
- WPS 365 business/enterprise/education: <https://365.kdocs.cn/>

## Cookie

Use a fresh browser profile or an incognito window to obtain Cookie, so it does not include another account session. One WPS session normally supports one logged-in account at a time.

1. Open a fresh browser profile or incognito window.
2. Visit the corresponding WPS cloud document site and sign in.
3. Open developer tools and switch to the Network tab.
4. Refresh the page and search for `islogin`.
5. Open the request details and copy the full `Cookie` header.
6. If you need a custom UA, copy the `User-Agent` from the same request.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd>, then use <kbd>Add</kbd>.
2. Select `WPS` as the driver.
3. Fill a mount path, for example `/WPS`.
4. Fill `cookie`.
5. Choose `mode`: use `Personal` for KDocs personal accounts, or `Business` for WPS 365 enterprise/education accounts.
6. Keep `root_folder_path` as `/` in most cases; use a real WPS group or subdirectory path to mount a narrower root.
7. Save the mount and browse `/WPS` in the file manager.

| Recommended field | Value |
| --- | --- |
| Driver | `WPS` |
| Mount path | `/WPS` |
| `root_folder_path` | `/` |
| `mode` | `Personal` or `Business` |

## Fields

| Field | Description |
| --- | --- |
| `cookie` | Required. Cookie from the signed-in WPS web session. |
| `mode` | API mode. `Personal` is KDocs personal, and `Business` is WPS 365 business/enterprise/education. |
| `root_folder_path` | Upstream root path, default `/`. The WPS root first lists group/space names, then child paths follow displayed names. |
| `custom_ua` | Optional custom User-Agent. Prefer copying it from the same request used to obtain Cookie. |

## Current Boundaries

- Login check, root/group listing, file metadata, download links, proxy reads, mkdir, move, copy, rename, remove, and storage details are wired.
- Download/playback uses the shared `driver read -> /p -> common proxy -> body.proxy` path.
- OpenList handles WPS upload through a streaming Go backend. The current SiYuan JavaScript kernel path would block the SiYuan runtime with base64 decoding, hashing, and proxy upload, so WPS upload is disabled for now.

## Test Checklist

- [ ] The Dock mount list shows `/WPS`.
- [ ] The file manager lists WPS root groups/spaces.
- [ ] Changing `root_folder_path` to a group or subdirectory narrows the visible tree.
- [ ] A regular file can be opened or downloaded.
- [ ] With proxy enabled, `raw_url` returns `/plugin/private/siyuan-cloud/p/...`.
- [ ] Test folders can be created, renamed, moved, copied, and removed.
- [ ] Storage details return total, used, and free space.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `cookie is empty` | Check that the mount config contains the full Cookie. |
| Login check fails | Obtain Cookie again from a fresh browser profile or incognito window, and make sure the session did not switch accounts. |
| Business mode reports empty company id | Confirm the account is a WPS 365 business/enterprise/education account, then log in from `365.kdocs.cn` and copy Cookie again. |
| Root directory is empty | Check whether `mode` matches the account type, and whether `root_folder_path` points to an existing group/directory. |
| File cannot be downloaded | WPS may deny download permission; business spaces can also be limited by file ACLs. |
| Upload fails | WPS upload is disabled in the current SiYuan JavaScript kernel runtime to avoid blocking SiYuan with base64 decoding, hashing, and proxy upload. |
