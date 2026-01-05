// scripts/copy-pdf-worker.mjs
import fs from "node:fs";
import path from "node:path";

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

const root = process.cwd();
const outDir = path.join(root, "src", "lib", "vendor");

const candidates = [
  path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.mjs"),
  path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.js"),
  path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.js"),
  path.join(root, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs"),
  path.join(root, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
  path.join(root, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.js"),
  path.join(root, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.js"),
];

const found = candidates.find(exists);

if (!found) {
  console.error("❌ Could not find pdf.js worker in node_modules. Tried:");
  for (const c of candidates) console.error("  -", c);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

// Copy with original extension
const ext = path.extname(found); // .mjs or .js
const outExact = path.join(outDir, `pdf.worker${ext}`);
fs.copyFileSync(found, outExact);

// Also write a tiny manifest file so runtime can find the right one
const manifestPath = path.join(outDir, "pdf-worker.json");
fs.writeFileSync(manifestPath, JSON.stringify({ file: path.basename(outExact) }, null, 2));

console.log("✅ Copied pdf worker:", found, "->", outExact);
console.log("✅ Wrote manifest:", manifestPath);
