import assert from "node:assert/strict";
import {
  previewModuleAssetInstallPath,
  previewModuleEntryAsset,
  previewModuleForFile,
  previewModuleForName,
  previewModuleForFileReady,
  previewModulePluginNames,
  previewModuleStyleAsset,
  rewritePreviewModuleScript,
  setPreviewModuleEnabledCategoryKeys,
  PREVIEW_MODULES,
} from "../src/utils/preview_modules.ts";

const [openFileViewerModule, fileViewerModule] = PREVIEW_MODULES;

[
  "demo.docx",
  "/path/demo.DOCX",
  "/path/demo.docx?download=1",
  "/path/slides.pptx#page=1",
  "table.xlsx",
  "slides.pptx",
  "legacy.doc",
  "deck.ppsx",
  "sheet.ods",
  "data.csv",
].forEach(name => {
  assert.equal(previewModuleForName(name)?.key, "file-viewer-office");
});

[
  "notes.md",
  "script.js",
  "style.css",
].forEach(name => assert.equal(previewModuleForName(name)?.key, "open-file-viewer"));
assert.equal(previewModuleForName("diagram.png"), null);
assert.equal(previewModuleForFile("README", "text")?.key, "open-file-viewer");
assert.equal(previewModuleForFile("diagram.png", "image"), null);
assert.equal(PREVIEW_MODULES.reduce((sum, module) => sum + module.categories.length, 0), 15);
assert.deepEqual(previewModulePluginNames("table.csv", "open-file-viewer"), ["textPlugin"]);
assert.deepEqual(previewModulePluginNames("README.md", "open-file-viewer"), ["textPlugin"]);
assert.deepEqual(previewModulePluginNames("model.glb", "open-file-viewer"), []);

assert.equal(PREVIEW_MODULES.length, 2);
assert.equal(fileViewerModule.adapter, "file-viewer");
assert.equal(fileViewerModule.version, "2.2.4");
assert.equal(fileViewerModule.assets.length, 3);
assert.deepEqual(fileViewerModule.categories.map(category => category.key), [
  "file-viewer-documents",
  "file-viewer-office",
  "file-viewer-engineering",
  "file-viewer-diagrams",
  "file-viewer-ebooks",
  "file-viewer-archives",
  "file-viewer-email-eda",
  "file-viewer-text-code",
  "file-viewer-media-assets",
]);
assert.deepEqual(fileViewerModule.categories.filter(category => category.defaultEnabled).map(category => category.key), ["file-viewer-documents", "file-viewer-office"]);
assert.equal(openFileViewerModule.categories.some(category => category.exts.includes("xmind")), false);
assert.equal(fileViewerModule.categories.find(category => category.key === "file-viewer-diagrams")?.exts.includes("xmind"), true);
assert.equal(fileViewerModule.categories.find(category => category.key === "file-viewer-archives")?.exts.includes("iso"), true);
assert.equal(fileViewerModule.categories.find(category => category.key === "file-viewer-email-eda")?.exts.includes("gds"), true);
assert.equal(fileViewerModule.categories.find(category => category.key === "file-viewer-documents")?.desc, "PDF, OFD, Typst");
assert.equal(fileViewerModule.categories.find(category => category.key === "file-viewer-office")?.desc, "Word, Excel, PowerPoint, OpenDocument");
globalThis.localStorage = {
  data: new Map(),
  getItem(key) { return this.data.get(key) ?? null },
  setItem(key, value) { this.data.set(key, String(value)) },
};
setPreviewModuleEnabledCategoryKeys("file-viewer-office", ["file-viewer-office", "file-viewer-diagrams"]);
assert.equal(previewModuleForName("mindmap.xmind")?.key, "file-viewer-office");
delete globalThis.localStorage;
assert.equal(fileViewerModule.assets[0].content.includes("./file-viewer-web.bundle.js"), true);
assert.equal(fileViewerModule.assets[0].content.includes("./file-viewer-preset-all.bundle.js"), true);
assert.equal(fileViewerModule.assets[0].content.includes("unpkg.com/@file-viewer/web@"), true);
assert.equal(fileViewerModule.assets[0].content.includes("mergeFullAssetOptions"), true);
assert.equal(fileViewerModule.assets[0].content.includes("fit: options.fit"), false);
assert.equal(fileViewerModule.assets[0].content.includes("toolbar: options.toolbar"), false);
assert.equal(previewModuleEntryAsset(fileViewerModule), fileViewerModule.assets[0]);
assert.equal(previewModuleStyleAsset(fileViewerModule), null);
assert.equal(previewModuleAssetInstallPath(fileViewerModule.assets[0]), "/data/public/preview-modules/file-viewer.js");
assert.equal(fileViewerModule.assets[1].target, "file-viewer-preset-all.bundle.js");
assert.equal(fileViewerModule.assets[2].target, "file-viewer-web.bundle.js");

globalThis.fetch = async (url, options) => {
  if (url === "/api/file/readDir" && JSON.parse(options.body).path === "/data/public/preview-modules")
    return { ok: true, json: async () => ({ code: 0, data: [{ name: "file-viewer.js", size: 1000 }] }) };
  throw new Error(`unexpected fetch ${url}`);
};
assert.equal(await previewModuleForFileReady("demo.docx"), null);
globalThis.fetch = async (url, options) => {
  if (url === "/api/file/readDir" && JSON.parse(options.body).path === "/data/public/preview-modules")
    return { ok: true, json: async () => ({ code: 0, data: fileViewerModule.assets.map(asset => ({ name: asset.target })) }) };
  throw new Error(`unexpected fetch ${url}`);
};
assert.equal(await previewModuleForFileReady("demo.docx"), fileViewerModule);
delete globalThis.fetch;

assert.equal(previewModuleEntryAsset(openFileViewerModule), openFileViewerModule.assets[0]);
assert.equal(previewModuleStyleAsset(openFileViewerModule), openFileViewerModule.assets[1]);
assert.equal(previewModuleAssetInstallPath(openFileViewerModule.assets[0]), "/data/public/preview-modules/open-file-viewer.js");
assert.equal(openFileViewerModule.assets[0].source, "https://cdn.jsdelivr.net/npm/@open-file-viewer/core@0.1.32/+esm");
assert.equal(previewModuleAssetInstallPath(openFileViewerModule.assets[1]), "/data/public/preview-modules/open-file-viewer.css");
assert.equal(openFileViewerModule.assets[1].source, "https://cdn.jsdelivr.net/npm/@open-file-viewer/core@0.1.32/dist/style.css");
assert.equal(openFileViewerModule.assets.length, 2);
assert.equal(openFileViewerModule.version, "0.1.32");
assert.equal(openFileViewerModule.categories.length, 6);
assert.equal(
  rewritePreviewModuleScript('import x from"/npm/jszip@3/+esm";const y=import("/npm/xlsx@0.18.5/+esm")'),
  'import x from"https://cdn.jsdelivr.net/npm/jszip@3/+esm";const y=import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm")',
);
assert.equal(
  rewritePreviewModuleScript('import"/node/buffer.mjs";export * from"/@file-viewer/web@2.2.4/es2022/web.bundle.mjs"'),
  'import"https://esm.sh/node/buffer.mjs";export * from"https://esm.sh/@file-viewer/web@2.2.4/es2022/web.bundle.mjs"',
);

console.log("preview modules smoke ok");
