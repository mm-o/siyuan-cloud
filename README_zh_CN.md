# 思盘

思盘是思源中的多存储文件列表与网盘管理插件。

思盘把多存储文件列表、网盘挂载、预览/播放链接转发以及 WebDAV/S3 兼容入口带进思源。它完整运行在思源插件环境中。

## 开发

```bash
pnpm install
pnpm build
```

内核插件源码位于 `src/kernel/**`；`pnpm dev` 和 `pnpm build` 会直接在目标插件输出目录生成 `kernel.js`，根目录不再维护这个生成文件。
