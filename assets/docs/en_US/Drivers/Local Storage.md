# Local Storage

This guide follows the OpenList `Local` driver fields used by **Siyuan Cloud**.

> [!TIP]
> Local accesses the host file system through the SiYuan desktop Electron runtime. It is desktop-only; the kernel HTTP layer keeps metadata only and does not proxy local disks.

## Good For

- Browsing local folders in Siyuan Cloud.
- Copying local images, videos, and documents as SiYuan-ready links.
- Previewing local images, text files, PDFs, ebooks, and ZIP archives.
- Creating, uploading, renaming, copying, moving, and deleting files inside the mounted folder.

## Before You Start

- Use SiYuan desktop.
- Make sure the Siyuan Cloud Dock can be opened.
- Prepare a local folder to expose, for example `E:\XianNi`.
- If you want to enumerate all disks, make sure the current OS user can access the target drives or mount points.

## Mount A Folder

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd> -> <kbd>Add</kbd>.
2. Select `Local`.
3. Set Mount Path, for example `/Local`.
4. Set `root_folder_path` to a local folder, for example `E:\XianNi`.
5. Save, then open the file manager and browse `/Local`.

| Recommended field | Value |
| --- | --- |
| Driver | `Local` |
| Mount path | `/Local` |
| `root_folder_path` | `E:\XianNi` |
| `show_hidden` | `true` or disable as needed |

## Enumerate Devices

If `root_folder_path` is `/`, `*`, or empty, Siyuan Cloud treats the mount as a device entry:

- Windows: lists accessible drives such as `C:`, `D:`, and `E:`.
- macOS: lists `/`, `~`, and volumes under `/Volumes`.
- Linux: lists `/`, `~`, and mount points under `/mnt` and `/media`.

For example, when Mount Path is `/Local`, Windows drives appear as:

```text
/Local/C:
/Local/D:
/Local/E:
```

## Fields

| Field | Description |
| --- | --- |
| `root_folder_path` | Local root folder. `/`, `*`, or empty means device enumeration |
| `directory_size` | Directory size calculation; may affect host performance |
| `thumbnail` | Thumbnail switch. Current local browsing mainly uses list and preview paths |
| `thumb_cache_folder` | Thumbnail cache folder |
| `thumb_concurrency` | Thumbnail concurrency |
| `video_thumb_pos` | Video thumbnail position |
| `show_hidden` | Whether to show hidden files and folders |
| `mkdir_perm` | OpenList-compatible field; local creation mainly follows OS permissions |
| `recycle_bin_path` | OpenList-compatible field; current deletion uses local file deletion |

## Capabilities

- List: reads the mounted folder or device entries.
- Preview: images, text files, PDFs, ebooks, and archives follow Siyuan Cloud file-type handling.
- Media: local files return `file://` links; copied image/video links keep Chinese paths readable.
- Write: supports mkdir, upload/create file, rename, copy, move, and delete.
- Cross-drive move: falls back to copy then delete when system `rename` fails.

## Verify

- [ ] `/Local` is visible in the Dock.
- [ ] The file manager can list the local folder or drives.
- [ ] Images can preview, and copied Chinese filenames remain readable.
- [ ] Videos copy as `<video>` with readable paths while spaces remain `%20`.
- [ ] You can create folders, upload files, rename, and delete inside the mount.
- [ ] ZIP files can open archive preview.

## Notes

> [!NOTE]
> Local is not a publicly reachable storage. Copied `file://` links only work on the current computer or environments with the same path.

> [!WARNING]
> Do not keep system roots, important config folders, or sensitive folders as writable mounts. Siyuan Cloud blocks modifying device entries, but delete and move operations inside the mounted folder affect real local files.

- Local depends on desktop `window.require` to access Node `fs/path`; it is unavailable in browsers and mobile clients.
- Kernel private HTTP routes do not proxy local disk content, and share links cannot let other devices download your local files.
- When `root_folder_path` points to a folder, Siyuan Cloud prevents paths from escaping that root.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Mount is not visible | Make sure you are using SiYuan desktop, then reopen the Dock or refresh status |
| Directory is empty | Check that `root_folder_path` exists and the OS user can access it |
| Access times out | Avoid slow network drives, sleeping disks, or unavailable devices |
| Modification fails | Check OS permissions, or whether the target is a device entry |
| Share cannot download | Local exposes files only on the current computer; it is not a public download source |
