# Changelog

## 0.3.4

### Added

- Added 115 Cloud runtime support for Cookie/QR-token login, list, get, read, download/playback links, basic folder management, and storage details.
- Added upload support for 123Pan presigned/S3 upload, 189Cloud account login with SMS second verification and multipart upload, plus expanded Baidu Netdisk, OneDrive, AliyundriveOpen, Quark, and QuarkOpen upload paths.
- Added Dock user management with OpenList-compatible user normalization, permissions, enable/disable/delete flows, SiYuan account sync, and sanitized user responses.
- Added OpenList-compatible multi-file shares with custom IDs, passwords, expiry, access limits, Readme/Header fields, enable/disable controls, share download routes, and access counting.
- Added local search index build/update/clear/progress APIs with ignore-path, max-depth, and mount-level disable-index handling.

### Improved

- Raised the minimum supported SiYuan version to 3.7.0.
- Improved driver configuration metadata, field labels, option labels, secret-field handling, QR-code generation, SMS verification handling, and runtime capability notes.
- Improved the file manager with current-tree search, local workspace and host-file access, upload/new-file support, delete/copy/move/rename/share operations, download/proxy/Markdown link copying, and context-menu reuse.
- Split persisted state into config, runtime, and search-index files, with legacy state migration and targeted save paths for config/runtime/search changes.
- Expanded OpenList-compatible HTTP APIs for login, users, shares, tasks, archive placeholders, upload/direct-upload information, public capability discovery, status reporting, WebDAV/S3 paths, and route aliases.

### Fixed

- Fixed Local storage documentation/runtime mismatch by clarifying desktop Electron fs access and kernel metadata-only behavior.
- Fixed share route, share download, password, expiry, access-count, and multi-file share compatibility gaps.
- Fixed task, archive placeholder, upload, and direct-upload response compatibility gaps for OpenList-style clients.
- Fixed multi-drive login, token refresh, upload chunk, direct-link read, and basic file-management edge cases; expanded `scripts/kernel-route-smoke.mjs` coverage for 115, SMS verification, uploads, local/search/share/task/status routes, and docs organization.
