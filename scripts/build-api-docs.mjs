#!/usr/bin/env node
// Generate per-module Markdown API reference under docs/api/ from JSDoc in src/.
// Invoked by `npm run docs:api`.

import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";
import jsdoc2md from "jsdoc-to-markdown";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const srcRoot = join(repoRoot, "src");
const outRoot = join(repoRoot, "docs", "api");

// pdfWorker.js is a Web Worker entry point with no public API surface.
const IGNORED_FILES = new Set(["loading/pdfWorker.js"]);

async function main() {
  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });

  const files = (await glob("**/*.js", { cwd: srcRoot })).sort();
  const generated = [];

  for (const rel of files) {
    if (IGNORED_FILES.has(rel)) continue;
    const absPath = join(srcRoot, rel);
    const markdown = await jsdoc2md.render({
      files: absPath,
      "heading-depth": 2,
      "no-gfm": false,
    });
    if (!markdown.trim()) continue;

    const outRelNoExt = rel.replace(/\.js$/, "");
    const outPath = join(outRoot, `${outRelNoExt}.md`);
    await mkdir(dirname(outPath), { recursive: true });

    const title = outRelNoExt.split(sep).join("/");
    const body = `# \`${title}.js\`\n\n${markdown.trim()}\n`;
    await writeFile(outPath, body, "utf8");

    generated.push({
      module: title,
      docPath: relative(join(repoRoot, "docs"), outPath),
    });
  }

  const indexLines = ["# API Reference", "", "Auto-generated from JSDoc in `src/`.", ""];
  for (const { module, docPath } of generated) {
    indexLines.push(`- [\`${module}.js\`](${docPath.split(sep).join("/").replace(/^api\//, "")})`);
  }
  indexLines.push("");
  await writeFile(join(outRoot, "index.md"), indexLines.join("\n"), "utf8");

  console.log(`Wrote ${generated.length} API pages to ${relative(repoRoot, outRoot)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
