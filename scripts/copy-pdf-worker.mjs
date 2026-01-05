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
const outFile = path.join(outDir, "pdf.worker.mjs");

// Candidate worker paths (varies by pdfjs-dist version)
const candidates = [
  path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.mjs"),
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
fs.copyFileSync(found, outFile);

console.log("✅ Copied pdf worker:", found, "->", outFile);
