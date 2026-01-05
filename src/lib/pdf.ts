// src/lib/pdf.ts
import { Buffer } from "buffer";
import path from "node:path";
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

async function loadPdfJs() {
  await ensureCanvasPolyfills();

  // ✅ Modern pdfjs-dist: legacy build is typically ESM (.mjs) only
  const mod: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjs: any = mod?.default ?? mod;

  // ✅ Worker is vendored into repo by scripts/copy-pdf-worker.mjs
  const workerFsPath = path.join(process.cwd(), "src", "lib", "vendor", "pdf.worker.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerFsPath).href;

  return pdfjs;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(buffer);

  // Even with disableWorker, pdf.js uses a "fake worker" that imports workerSrc.
  // workerSrc MUST point to a real file (our vendored worker).
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
