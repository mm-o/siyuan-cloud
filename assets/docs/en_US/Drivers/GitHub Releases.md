# GitHub Releases

This guide follows the OpenList GitHub Releases driver documentation and the local `docs/OpenList-main/drivers/github_releases` source. Upstream reference: <https://doc.oplist.org/guide/drivers/github_releases>

The driver mounts GitHub repository release assets as a read-only file tree. It is useful for downloading release packages, source archives, and optional README/LICENSE files from one or more repositories.

## Good For

- Browsing GitHub release assets in Siyuan Cloud.
- Mounting one repository at the mount root, or several repositories under subdirectories.
- Copying OpenList-compatible download links for release packages.
- Showing latest release assets, or all release versions as tag directories.
- Showing repository README and LICENSE files next to release assets.

## Before You Start

- A repository name in `owner/repo` form, for example `OpenListTeam/OpenList`.
- A GitHub personal access token if the repository is private or you want higher rate limits.
- Optional GitHub proxy URL if direct GitHub downloads are slow in your network.

> [!TIP]
> OpenList documents GitHub API limits as 60 unauthenticated requests per hour, or 5,000 authenticated requests per hour with a token. Use `token` for private repositories and for more stable browsing.

## Mount

1. Open <kbd>Dock</kbd> -> <kbd>Mounts</kbd>, then use <kbd>Add</kbd>.
2. Select `GitHub Releases`.
3. Fill a mount path, for example `/GitHub`.
4. Fill `repo_structure`.
5. Optional: fill `token`.
6. Optional: enable `show_all_version`, `show_readme`, or `show_source_code`.
7. Save the mount and browse `/GitHub` in the file manager.

| Recommended field | Value |
| --- | --- |
| Driver | `GitHub Releases` |
| Mount path | `/GitHub` |
| `repo_structure` | `OpenListTeam/OpenList` |
| `show_readme` | `true` |
| `show_source_code` | `false` |
| `show_all_version` | `false` |

## repo_structure

Single repository at the mount root:

```text
OpenListTeam/OpenList
```

This is equivalent to:

```text
/:OpenListTeam/OpenList
```

Multiple repositories under subdirectories:

```text
openlist-gh:OpenListTeam/OpenList
frontend-gh:OpenListTeam/OpenList-Frontend
```

The leading slash is optional. These are equivalent:

```text
/openlist-gh:OpenListTeam/OpenList
openlist-gh:OpenListTeam/OpenList
```

## Fields

| Field | Description |
| --- | --- |
| `repo_structure` | Required. One repository per line. Use `owner/repo` for root mounting or `path:owner/repo` for subdirectory mounting. |
| `show_readme` | Show repository `README*.md` and `LICENSE*` files next to release assets. Enabled by default. |
| `token` | GitHub personal access token. Required for private repositories and recommended to avoid rate limiting. |
| `show_source_code` | Show `Source code (zip)` and `Source code (tar.gz)` entries for each release. Disabled by default. |
| `show_all_version` | Show every release version as a tag directory. Disabled by default, which means only the latest release assets are listed. |
| `gh_proxy` | Optional GitHub proxy prefix, for example `https://gh-proxy.com/github.com`. It rewrites `https://github.com` download URLs. |

## Version Display

Default latest-release mode:

```text
/GitHub
  openlist-linux-amd64.tar.gz
  openlist-windows-amd64.zip
  README.md
  LICENSE
```

With `show_all_version=true`:

```text
/GitHub
  v4.0.0/
    openlist-linux-amd64.tar.gz
    openlist-windows-amd64.zip
  v3.9.0/
    openlist-linux-amd64.tar.gz
    openlist-windows-amd64.zip
```

## GitHub Proxy

When `gh_proxy` is filled, the runtime rewrites GitHub download URLs before returning them through `/api/fs/get` and `/api/fs/link`.

Example:

```text
https://gh-proxy.com/github.com
```

> [!WARNING]
> GitHub proxy services are third-party services. Availability, speed, privacy, and file-size limits depend on the selected service.

## Current Boundaries

- `list`, `get`, `link`, and `read` are wired.
- The driver is read-only, matching OpenList upstream behavior. Create folder, move, copy, rename, remove, and upload are unsupported.
- `raw_url` is the release asset URL or the rewritten `gh_proxy` URL unless storage-level proxying is enabled.
- `/p/<path>` can still proxy downloads if you enable proxy options on the storage.

## Test Checklist

- [ ] The Dock mount list shows `/GitHub`.
- [ ] A single `owner/repo` structure lists latest release assets.
- [ ] `show_readme=true` shows README and LICENSE files.
- [ ] `show_source_code=true` shows source zip and tar.gz entries.
- [ ] `show_all_version=true` lists tag directories.
- [ ] A `path:owner/repo` line appears under the configured subdirectory.
- [ ] `/api/fs/link` returns the GitHub asset URL or the configured `gh_proxy` URL.
- [ ] Upload or management attempts fail clearly as unsupported.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `invalid repo` | Use the exact `owner/repo` form, for example `OpenListTeam/OpenList`. |
| Empty list | Check that the repository has releases and release assets. |
| GitHub API rate limit | Fill `token`, then refresh the directory. |
| Private repository returns an error | Fill a token with access to the repository. |
| Downloads are slow | Fill `gh_proxy`, or enable storage proxy and test again. |
| README or LICENSE missing | Enable `show_readme` and confirm those files exist at the repository root. |
| No version directories | Enable `show_all_version`; otherwise only latest release assets are listed. |
