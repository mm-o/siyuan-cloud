# WebDAV

This guide applies to the `WebDav` driver.

## Good For

- Connecting NAS, cloud drives, or object gateways with WebDAV support.
- Using standard WebDAV methods for list, upload, download, and management.
- Using Siyuan Cloud `/p` paths for unified proxy playback.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `WebDav`.
3. Set Mount Path to `/WebDAV`.
4. Set `address` to the WebDAV root URL.
5. Fill `username` and `password`.
6. Save, then browse `/WebDAV`.

| Recommended field | Value |
| --- | --- |
| Driver | `WebDav` |
| Mount path | `/WebDAV` |
| `vendor` | `other` |
| `address` | WebDAV service URL |

## Fields

| Field | Description |
| --- | --- |
| `vendor` | `other` or `sharepoint` |
| `address` | Required WebDAV URL |
| `username` / `password` | Required credentials |
| `tls_insecure_skip_verify` | Skip TLS certificate verification |

## Notes

- WebDAV paths are built from `address + root_folder_path + relPath`.
- Supports `PROPFIND`, `GET`, `PUT`, `MKCOL`, `MOVE`, `COPY`, and `DELETE`.
- List and stat behavior follows the OpenList/gowebdav main path: directory listing uses `PROPFIND Depth:1`, object stat uses `PROPFIND Depth:0`, the self collection response is skipped, and object names prefer the href basename.
- The driver returns OpenList-style object/link data only. Preview URLs are produced by the shared `/d` and `/p` proxy layer, not injected as driver-only UI fields.
- For self-signed services, enable `tls_insecure_skip_verify` only when you trust the endpoint.

## Current Gaps

- `tls_insecure_skip_verify`, SharePoint `odrvcookie`, persistent cookie jar, Basic/Digest 401 negotiation, 409 parent retry for create/copy/move, and OpenList's no-redirect `Link(args.Redirect)` probe are still documented gaps for future parity checks.
- If a provider behaves differently from OpenList, compare this runtime with `docs/OpenList-main/drivers/webdav` and `docs/OpenList-main/pkg/gowebdav` first, then keep fixes in the driver instead of adding frontend-specific patches.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Auth fails | Check username, password, and WebDAV permissions |
| Certificate error | Install a trusted certificate or enable `tls_insecure_skip_verify` |
| Duplicated path | Check whether `address` already includes a subdirectory |
