import { readdir, writeFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const dir = new URL("../assets/docs/", import.meta.url)
const root = fileURLToPath(dir)
async function walk(root) {
  const files = []
  for (const item of await readdir(root, { withFileTypes: true })) {
    const path = join(root, item.name)
    if (item.isDirectory())
      files.push(...await walk(path))
    else if (item.name.endsWith(".md"))
      files.push(relative(fileURLToPath(dir), path).split(sep).join("/"))
  }
  return files
}

const files = (await walk(root)).sort()
await writeFile(new URL("index.json", dir), `${JSON.stringify(files, null, 2)}\n`)
