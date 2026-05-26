# SiYuan Bazaar Review Checklist

This checklist summarizes the current official bazaar workflow plus recurring maintainer review comments seen in recent plugin PRs. Use it before every marketplace submission or release.

## Bazaar PR Format

- Submit the plugin by editing `plugins.txt` in `siyuan-note/bazaar`.
- Add exactly one `owner/repo` line for the plugin repository.
- Do not edit generated `stage/*.json` files for a normal plugin submission.
- Keep the PR focused on the package-list change only.
- The repository must be public, contain a suitable `LICENSE`, and avoid infringing bundled assets.
- If a package is closed-source, grant source access to the listed maintainers before review.

## GitHub Release Requirements

- The plugin repository must have a latest GitHub Release.
- The latest release must contain an asset named exactly `package.zip`.
- The release tag, `plugin.json.version`, `package.json.version`, and package contents must match.
- Prefer a normal release, not a prerelease, because the bazaar checker uses GitHub's latest release API.
- `package.zip` should be uploaded to Releases, not committed to the repository.

## Required Repository Files

- `plugin.json`
- `icon.png`
- `preview.png`
- `README.md`
- `LICENSE`

Recommended optional files:

- `README_zh_CN.md`, mapped from `plugin.json.readme.zh_CN`.
- `i18n/en_US.json` and `i18n/zh_CN.json`, generated into the package from source.

## Package ZIP Rules

- The archive must be a real ZIP file.
- All internal paths must use `/`, not Windows backslashes.
- Do not include `.git`, `node_modules`, lock files, `package.json`, source folders, docs, `.DS_Store`, plans, or other development files.
- Include only runtime files needed by SiYuan: bundled JS/CSS, `kernel.js` if used, manifest, README files, icon, preview, and i18n files.
- The manifest inside `package.zip` must match the repository manifest at the release commit.

## Manifest Rules

- `name` must be valid ASCII and must equal the GitHub repository name.
- `author`, `url`, `version`, and `minAppVersion` must be present and non-empty.
- `url` must point to the real GitHub repository, not a placeholder.
- `displayName` should not include the SiYuan/思源 brand name; use the product name or category name.
- `keywords` should not include `siyuan`, `SiYuan`, `思源`, or other brand-name-only keywords.
- Remove empty `funding` objects.
- Do not add a custom `i18n` field; SiYuan loads the `i18n/` directory automatically.
- Avoid redundant platform arrays. If `all` is used, do not list concrete frontends/backends/kernels beside it.
- Set `disabledInPublish: true` for plugins that need private APIs, kernel-plugin runtime, local process APIs, or desktop-only capabilities that cannot run in publish/web mode.
- Set `minAppVersion` to the first stable SiYuan version that contains every required API.

## Images

- `icon.png` should be 160x160 PNG. Keep it small; recent reviews prefer under 20KB.
- `preview.png` should be 1024x768 PNG and under 200KB.
- Use custom icons instead of reusing built-in SiYuan icons as the product icon.
- Do not embed `preview.png` in README; the bazaar displays it separately.

## README Rules

- `README.md` is the default/English README.
- `README_zh_CN.md` is the Chinese README when declared in `plugin.json.readme.zh_CN`.
- Keep each README in its declared language.
- Use absolute HTTPS links for images or external resources that must render in the bazaar.
- Avoid relative image links inside README files.
- Clearly describe what the plugin does, supported environments, and any important permissions or limitations.

## License Rules

- Include a real open-source license file.
- Replace sample copyright holders and years with the plugin author's own information.
- Do not bundle non-commercial fonts or other assets that conflict with the selected license.

## Lifecycle And Cleanup

- If the plugin uses `saveData()`, add `uninstall()` and call `removeData()` for those stored keys.
- Do not call `removeData()` in `onunload()`, because disable/update/reload should not delete user settings.
- `onunload()` should only clean runtime resources created by the plugin.
- Unregister EventBus listeners with the same function reference used for registration.
- Clear `setTimeout` and `setInterval` handles.
- Remove global DOM event listeners.
- Disconnect observers such as `MutationObserver` and `ResizeObserver`.
- Close WebSocket, EventSource, worker, or long-running client connections.
- Destroy dialogs and unmount Vue apps created by the plugin.
- Framework registrations such as top bar buttons, commands, docks, tabs, and icons are generally cleaned by SiYuan, but custom DOM or app instances still need cleanup.

## Code Quality Review

- Do not call `window.location.reload()`.
- Avoid leftover `plugin-sample` class names, icons, or comments.
- Use named constants for storage keys, dock types, tab ids, and icon ids.
- Use `custom-` prefixes for custom block attributes.
- Keep `loadData()` calls limited and cache loaded settings where practical.
- Avoid debug `console.log`; keep `console.warn` and `console.error` for real error handling.
- Prefer SiYuan `b3-*` classes and theme variables for UI.
- Ensure declared frontends/backends match real runtime behavior.

## I18n Review

- Keep `en_US.json` English and `zh_CN.json` Chinese.
- Keep key sets aligned across locales.
- Remove truly unused keys, but be careful with dynamic keys such as `driverName.*`, `driverNote.*`, and `driverField.*`.
- Do not hardcode user-facing Chinese or English strings in Vue/TS components when an i18n key is already available.

## Local Pre-Submission Checks

Run these before release:

```powershell
pnpm test:kernel
pnpm build
node -e "JSON.parse(require('fs').readFileSync('plugin.json','utf8')); JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('json ok')"
tar -tf package.zip
```

Then verify:

- `package.zip` contains no development files.
- `tar -tf package.zip` shows `/` paths only.
- `icon.png` is 160x160.
- `preview.png` is 1024x768 and under 200KB.
- GitHub latest release has `package.zip`.
- The bazaar PR changes only `plugins.txt`.
