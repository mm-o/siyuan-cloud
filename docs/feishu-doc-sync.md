# 飞书文档同步

思盘文档以本仓库 Markdown 为源，飞书知识库为用户阅读入口。插件运行时只打开飞书链接，不再把 README、更新日志、API、驱动说明批量写进思源笔记本。

## 目标

- 本地保留 `README*.md` 和 `assets/docs/**/*.md`，方便 Git 审阅、发版和复用到其它插件。
- 飞书中创建一个知识库空间，根文档包含说明文档、更新日志、API 和驱动说明。
- 驱动说明作为 `驱动说明 / Drivers` 的子文档，每个驱动帮助按钮打开对应飞书文档。
- 中英文文档顶部提供 `中文 / English` 切换。
- 发版前重复运行同步命令，更新已有飞书文档，不新建重复文档；正文按 `contentHash` 增量覆盖，没变的文档会跳过。

## 文件

- `scripts/feishu-doc-sync.mjs`：通用同步脚本。其它插件复用时只改顶部常量。
- `docs/feishu-docs.json`：飞书空间、文档 token 和 URL 清单，脚本用它实现幂等更新。
- `src/utils/feishuDocs.generated.ts`：插件运行时使用的飞书链接表，由同步脚本生成。
- `src/App.vue`：按语言、文档 key、驱动名打开飞书链接。

## 授权

首次使用：

```bash
lark-cli config init --new --lang zh
lark-cli auth login --domain docs --domain drive --domain wiki
```

授权成功后检查：

```bash
lark-cli auth status --json --verify
```

## 同步

```bash
pnpm docs:feishu
```

可选空间名：

```powershell
$env:FEISHU_DOC_SPACE_NAME = "思盘文档"
pnpm docs:feishu
```

可选运行时 API 发现：

```powershell
$env:SIYUAN_CLOUD_API_URL = "http://127.0.0.1:6806/plugin/private/siyuan-cloud/api/public/api"
pnpm docs:feishu
```

脚本流程：

1. 扫描本地 README、更新日志和 `assets/docs/**/Drivers` / `assets/docs/**/驱动说明`。
2. 创建或复用飞书知识库空间 `思盘文档`。
3. 创建或复用根文档与驱动子文档。
4. 渲染 Markdown 并计算 `contentHash`，只覆盖更新变化过的飞书正文。
5. 生成 `src/utils/feishuDocs.generated.ts` 给插件信息面板和驱动帮助按钮使用；链接表内容不变时不重写文件。

## 发版建议

发版前运行：

```bash
pnpm docs:feishu
pnpm build
```

当前先保留手动命令，避免没有飞书授权的机器无法发版。如果要强制串进发版流程，可把 `release` 前置为：

```json
{
  "scripts": {
    "release:with-docs": "pnpm docs:feishu && node ./release.js"
  }
}
```

## 复用到其它插件

复制这几个文件和概念：

- `scripts/feishu-doc-sync.mjs`
- `docs/feishu-doc-sync.md`
- `src/utils/feishuDocs.generated.ts`

然后改三处：

- `ROOT_DOCS`：插件的 README、更新日志、API 根文档。
- `DRIVER_DOC_GROUPS`：驱动名到中英文文档标题的映射。
- `DOC_ROOT`：本地 Markdown 文档目录。

运行一次同步后，把生成的 `feishuDocs.generated.ts` 接到插件信息面板即可。
