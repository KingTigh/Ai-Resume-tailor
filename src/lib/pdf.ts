// src/lib/pdf.ts
import { Buffer } from "buffer";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "url";

async function ensureCanvasPolyfills() {
  try {
    const mod: any = await import("@napi-rs/canvas");
    const DOMMatrix = mod?.DOMMatrix ?? mod?.default?.DOMMatrix;
    const ImageData = mod?.ImageData ?? mod?.default?.ImageData;
    const Path2D = mod?.Path2D ?? mod?.default?.Path2D;

    if (DOMMatrix && !(globalThis as any).DOMMatrix) (globalThis as any).DOMMatrix = DOMMatrix;
    if (ImageData && !(globalThis as any).ImageData) (globalThis as any).ImageData = ImageData;
    if (Path2D && !(globalThis as any).Path2D) (globalThis as any).Path2D = Path2D;
  } catch {
    // ok
  }
}

function getVendoredWorkerPath(): string {
  const vendorDir = path.join(process.cwd(), "src", "lib", "vendor");
  const manifestPath = path.join(vendorDir, "pdf-worker.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `pdfjs worker manifest not found at ${manifestPath}. Run: node scripts/copy-pdf-worker.mjs`
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { file?: string };
  const file = manifest.file;
  if (!file) throw new Error(`pdfjs worker manifest missing "file" key: ${manifestPath}`);

  const workerPath = path.join(vendorDir, file);
  if (!fs.existsSync(workerPath)) {
    throw new Error(`pdfjs worker file not found at ${workerPath}. Re-run copy script.`);
  }

  return workerPath;
}

async function loadPdfJs() {
  await ensureCanvasPolyfills();

  const mod: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjs: any = mod?.default ?? mod;

  const workerFsPath = getVendoredWorkerPath();
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerFsPath).href;

  return pdfjs;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(buffer);

  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  } as any);

  const doc = await loadingTask.promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    const pageText = (content.items as any[])
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .filter(Boolean)
      .join(" ");

    fullText += pageText + "\n";
  }

  return fullText.trim();
}
