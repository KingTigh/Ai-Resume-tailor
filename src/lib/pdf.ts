// src/lib/pdf.ts
import { Buffer } from "buffer";
import { createRequire } from "module";
import { pathToFileURL } from "url";

// Optional: helps pdfjs on server envs that expect DOMMatrix/ImageData/Path2D
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
    // If canvas polyfills aren't available, we'll try anyway.
    // (Some builds only need text extraction and won't hit canvas paths.)
  }
}

async function loadPdfJs() {
  await ensureCanvasPolyfills();

  const mod: any = await import("pdfjs-dist");
  const pdfjs: any = mod?.default ?? mod;

  // Explicitly point workerSrc to a file that actually exists in the package.
  // This prevents "Setting up fake worker failed" on serverless.
  const require = createRequire(process.cwd() + "/");


  const workerCandidates = [
    "pdfjs-dist/build/pdf.worker.min.mjs",
    "pdfjs-dist/build/pdf.worker.mjs",
    "pdfjs-dist/legacy/build/pdf.worker.min.js",
    "pdfjs-dist/legacy/build/pdf.worker.js",
  ];

  let workerPath: string | null = null;
  for (const spec of workerCandidates) {
    try {
      workerPath = require.resolve(spec);
      break;
    } catch {
      // keep trying
    }
  }

  if (workerPath) {
    // pdfjs expects a URL-like string in many environments
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  }

  return pdfjs;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfjs = await loadPdfJs();

  const data = new Uint8Array(buffer);

  // Disable workers in serverless (safe + avoids worker import issues)
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
