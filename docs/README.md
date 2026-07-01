# Reference Sources

This folder stores local reference source trees and notes for Siyuan Cloud / 思盘.

The source trees are intentionally ignored by Git because they are large upstream checkouts.

## Porting Docs

- `docs/kernel-plugin-notes.md`: SiYuan kernel plugin API findings, storage/sync conclusion, and implemented route surface.
- `docs/kernel-architecture.md`: Kernel-side source layout and generated `kernel.js` build rule.
- `docs/siyuan-cloud-migration-plan.md`: Chinese migration plan table for continuing the Siyuan Cloud OpenList-compatible port.
- `docs/platform-roadmap.md`: Platform roadmap for the OpenList-compatible base layer and deeper SiYuan-native integrations.
- `docs/openlist-alist-mounting.md`: OpenList/AList mounting guide, SiYuan v3.7.0 private-IP proxy limit, frontend direct shortcut, and reverse-proxy/tunnel setup.
- `docs/bazaar-review-checklist.md`: marketplace submission and maintainer review checklist.
- `AGENTS.md`: short handoff file for future agents. It records the "align with OpenList and copy/adapt directly" rule, current architecture mapping, and source locations.

## Source Trees

- `docs/siyuan-master`: SiYuan source checkout from `siyuan-note/siyuan`, currently checked out at tag `v3.7.0-dev9`.
  - Kernel plugin support from PR #17487 and streaming proxy support from PR #17748 are present in this tag.
- `docs/OpenList-main`: OpenList source checkout from `OpenListTeam/OpenList`, branch `main`.
  - Prefer copying route names, request fields, response fields, and handler control flow from this tree before writing new behavior.

## Key Reference Files

- OpenList router: `docs/OpenList-main/server/router.go`
- OpenList response helpers: `docs/OpenList-main/server/common/common.go`
- OpenList FS handlers: `docs/OpenList-main/server/handles/fs*.go`
- OpenList admin/auth/share/task handlers: `docs/OpenList-main/server/handles`
- OpenList WebDAV/S3: `docs/OpenList-main/server/webdav.go`, `docs/OpenList-main/server/webdav`, `docs/OpenList-main/server/s3.go`, `docs/OpenList-main/server/s3`
- OpenList archive behavior: `docs/OpenList-main/server/handles/archive.go`, `docs/OpenList-main/internal/op/archive.go`, `docs/OpenList-main/internal/archive`
- SiYuan kernel plugin runtime: `docs/siyuan-master/kernel/plugin`
- SiYuan file APIs: `docs/siyuan-master/kernel/api/file.go`

## Refresh Commands

From this plugin root:

```powershell
git -C docs/siyuan-master fetch origin --tags
git -C docs/siyuan-master checkout v3.7.0-dev9
git -C docs/OpenList-main pull --ff-only
```

If a tree is missing, clone it again:

```powershell
git clone --depth 1 --branch dev https://github.com/siyuan-note/siyuan.git docs/siyuan-master
git clone --depth 1 --branch main https://github.com/OpenListTeam/OpenList.git docs/OpenList-main
```
