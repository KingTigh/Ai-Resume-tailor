// src/lib/pdf.ts
import { Buffer } from "buffer";
import { createRequire } from "module";
import { pathToFileURL } from "url";

async function ensureCanvasPolyfills() {
  const mod: any = await import("@napi-rs/canvas");

  const DOMMatrix = mod.DOMMatrix ?? mod.default?.DOMMatrix;
  const ImageData = mod.ImageData ?? mod.default?.ImageData;
  const Path2D = mod.Path2D ?? mod.default?.Path2D;

  if (!DOMMatrix || !ImageData || !Path2D) {
    throw new Error("Failed to load @napi-rs/canvas exports (DOMMatrix/ImageData/Path2D).");
  }

  (globalThis as any).DOMMatrix ??= DOMMatrix;
  (globalThis as any).ImageData ??= ImageData;
  (globalThis as any).Path2D ??= Path2D;
}

async function loadPdfJs() {
  // Bypass Next's resolver: resolve the real file path using Node, then import by file URL.
  const require = createRequire(import.meta.url);

  const candidates = [
    "pdfjs-dist/legacy/build/pdf.mjs",
    "pdfjs-dist/legacy/build/pdf.js",
    "pdfjs-dist/legacy/build/pdf",
  ];

  let resolved: string | null = null;

  for (const spec of candidates) {
    try {
      resolved = require.resolve(spec);
      break;
    } catch {
      // keep trying
    }
  }

  if (!resolved) {
    throw new Error(
      `Could not resolve pdfjs-dist legacy build. Tried: ${candidates.join(", ")}`
    );
  }

  const url = pathToFileURL(resolved).href;
  const mod: any = await import(url);

  // pdfjs sometimes exports as default, sometimes as named module object
  return mod?.default ?? mod;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  await ensureCanvasPolyfills();

  // ✅ Avoid deep imports like pdfjs-dist/legacy/build/pdf.mjs
  const mod: any = await import("pdfjs-dist");
  const pdfjs: any = mod?.default ?? mod;

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
