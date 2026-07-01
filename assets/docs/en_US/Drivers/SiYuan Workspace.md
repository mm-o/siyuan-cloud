# SiYuan Workspace

This guide applies to the `SiYuanWorkspace` driver.

## Good For

- Browsing files inside the current SiYuan workspace from Siyuan Cloud.
- Opening workspace assets, public files, PDFs, images, audio, and videos with SiYuan-native resource URLs.
- Copying stable relative links for workspace public resources without localhost ports.
- Reading workspace files through the OpenList-compatible file manager surface.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `SiYuanWorkspace`.
3. Set Mount Path, for example `/Workspace`.
4. Set `root_folder_path` to `/@workspace` to expose the workspace root, or a subfolder such as `/@workspace/data/assets`.
5. Save, then browse `/Workspace`.

| Recommended field | Value |
| --- | --- |
| Driver | `SiYuanWorkspace` |
| Mount path | `/Workspace` |
| `root_folder_path` | `/@workspace` |

## Fields

| Field | Description |
| --- | --- |
| `root_folder_path` | Workspace root or subfolder. Use `/@workspace` for the whole workspace |

## Public Resource Links

Files under workspace `data/<name>/...` use the same public resource shape as SiYuan:

```text
/@workspace/data/assets/a.mp4 -> /assets/a.mp4
/@workspace/data/public/a.pdf -> /public/a.pdf
```

The same rule applies after mounting:

```text
/Workspace/data/assets/a.mp4 -> /assets/a.mp4
/Workspace/data/public/a.pdf -> /public/a.pdf
```

This keeps media preview fast and makes copied links stable. Copied links do not include changing origins such as `https://127.0.0.1:<port>`.

## Notes

- `SiYuanWorkspace` is the only addable SiYuan-native driver. `SiYuanKernel` is internal and is not exposed as a mount driver.
- Public resource paths are only stable inside the current SiYuan environment.
- Non-public workspace files still use Siyuan Cloud's private `/p` or `/d` routes as a fallback.
- Write operations stay conservative because workspace writes must follow SiYuan file safety rules.

## Verify

- [ ] `/Workspace` is visible in the Dock and file manager.
- [ ] `/Workspace/data/assets/...` media opens as `/assets/...`.
- [ ] `/Workspace/data/public/...` files open as `/public/...`.
- [ ] Copied links use stable relative paths instead of localhost URLs.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Directory not found | Check `root_folder_path`; use `/@workspace` or an existing workspace subfolder |
| Media opens through `/plugin/private/.../p` | Refresh the file list and confirm the file is under `data/<name>/...` |
| Copied link fails elsewhere | Workspace public links are local to the current SiYuan workspace environment |
