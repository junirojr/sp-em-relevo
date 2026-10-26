import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

// Generated browser modules keep the source's import() boundaries and external CDN imports.
const outdir = path.resolve("dist");
const result = await build({
  entryPoints: { main: "src/app/main.js" },
  outdir,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2023",
  minify: true,
  legalComments: "none",
  external: ["three", "three/*"],
  chunkNames: "[name]-[hash]",
  metafile: true,
  write: false,
});

await fs.mkdir(outdir, { recursive: true });
const outputs = new Set(result.outputFiles.map((file) => file.path));
for (const entry of await fs.readdir(outdir, { withFileTypes: true })) {
  const target = path.join(outdir, entry.name);
  if (entry.isFile() && entry.name.endsWith(".js") && !outputs.has(target)) {
    await fs.unlink(target);
  }
}
for (const file of result.outputFiles) await fs.writeFile(file.path, file.contents);
await fs.writeFile(path.join(outdir, "manifest.json"), JSON.stringify(result.metafile));
console.log(`Runtime build: ${result.outputFiles.length} browser modules.`);
