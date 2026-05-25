import { resolve } from "node:path"
import { build } from "vite"

const watch = process.argv.includes("--watch")
const outDirArg = process.argv.find((arg) => arg.startsWith("--out-dir="))
const outDir = outDirArg?.slice("--out-dir=".length) || (watch ? "dev" : "dist")

const options = {
  configFile: false,
  logLevel: "info",
  build: {
    outDir,
    emptyOutDir: false,
    sourcemap: false,
    minify: false,
    watch: watch ? {} : null,
    lib: {
      entry: resolve("src/kernel/index.js"),
      name: "SiyuanCloudKernel",
      formats: ["iife"],
      fileName: () => "kernel.js",
    },
    rollupOptions: {
      output: {
        banner: "/* Generated from src/kernel. Do not edit directly. */",
      },
    },
  },
}

await build(options)
if (watch) console.log(`[kernel] watching src/kernel -> ${outDir}/kernel.js`)
