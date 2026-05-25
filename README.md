# Siyuan Cloud

Multi-storage file list and cloud drive manager inside SiYuan.

Siyuan Cloud brings multi-storage file listing, cloud-drive mounting, preview/playback URL forwarding, and WebDAV/S3-compatible access into SiYuan as a standalone kernel plugin. It runs fully inside the SiYuan plugin environment.

## Development

```bash
pnpm install
pnpm build
```

Kernel plugin source lives in `src/kernel/**`; `pnpm dev` and `pnpm build` generate `kernel.js` directly into the target plugin output directory.
