// src/lib/pdf.ts
import { Buffer } from "buffer";
import { createRequire } from "module";
import { pathToFileURL } from "url";

const req = createRequire(process.cwd() + "/");

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

function resolveFirst(candidates: string[]) {
  for (const spec of candidates) {
    try {
      return req.resolve(spec);
    } catch {
      // keep trying
    }
  }
  return null;
}

async function loadPdfJs() {
  await ensureCanvasPolyfills();

  // 1) Resolve a worker file that actually exists
  const workerCandidates = [
    "pdfjs-dist/build/pdf.worker.min.mjs",
    "pdfjs-dist/build/pdf.worker.mjs",
    "pdfjs-dist/build/pdf.worker.min.js",
    "pdfjs-dist/build/pdf.worker.js",
    "pdfjs-dist/legacy/build/pdf.worker.min.js",
    "pdfjs-dist/legacy/build/pdf.worker.js",
  ];

  const workerPath = resolveFirst(workerCandidates);
  if (!workerPath) {
    throw new Error(
      `Could not resolve a pdf.js worker. Tried: ${workerCandidates.join(", ")}`
    );
  }

  // 2) Load pdf.js (legacy build is most reliable on Node/serverless)
  const pdfCandidates = [
    "pdfjs-dist/legacy/build/pdf.js",
    "pdfjs-dist/legacy/build/pdf.mjs",
    "pdfjs-dist/build/pdf.js",
    "pdfjs-dist/build/pdf.mjs",
    "pdfjs-dist",
  ];

  const pdfPath = resolveFirst(pdfCandidates);
  if (!pdfPath) {
    throw new Error(`Could not resolve pdfjs-dist. Tried: ${pdfCandidates.join(", ")}`);
  }

  // Prefer require() for the legacy CJS build where possible
  let pdfjs: any;
  try {
    pdfjs = req(pdfPath);
  } catch {
    // Fallback to dynamic import if pdfPath is ESM
    const mod: any = await import(pathToFileURL(pdfPath).href);
    pdfjs = mod?.default ?? mod;
  }

  // 3) Critical: set workerSrc to an existing file BEFORE getDocument()
  // Use file URL for ESM workers.
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  return pdfjs;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfjs = await loadPdfJs();

  const data = new Uint8Array(buffer);

  // NOTE: even with disableWorker, pdf.js still uses "fake worker"
  // which imports workerSrc. workerSrc MUST be resolvable.
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
