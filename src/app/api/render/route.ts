// src/app/api/render/route.ts
import { NextResponse } from "next/server";
import React from "react";
import { ResumePdf, CoverLetterPdf, renderPdfToBuffer } from "@/lib/pdfDocs";
import { formatResumeATS, type TailoredResume } from "@/lib/resumeFormat";

export const runtime = "nodejs";

type RenderRequest = {
  resume: TailoredResume;
  cover_letter: string;
};

function splitTextToLines(text: string) {
  return (text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd());
}

async function renderDocxBase64FromText(text: string, filenameTitle: string) {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun } = docx;

  const lines = splitTextToLines(text);

  const children = [
    new Paragraph({
      children: [new TextRun({ text: filenameTitle, bold: true, size: 32 })],
      spacing: { after: 200 },
    }),
    ...lines.map(
      (l) =>
        new Paragraph({
          children: [new TextRun({ text: l || " " })],
        })
    ),
  ];

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer).toString("base64");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RenderRequest;

    if (!body?.resume?.header?.name) {
      return NextResponse.json(
        { error: "Missing resume payload." },
        { status: 400 }
      );
    }

    const cover = String(body.cover_letter ?? "").trim();
    if (cover.length < 10) {
      return NextResponse.json(
        { error: "Missing cover letter text." },
        { status: 400 }
      );
    }

    //  Convert structured resume -> ATS text (used for DOCX + as PDF fallback)
    const tailored_resume = formatResumeATS(body.resume);

    //  PDFs (match ResumePdf props)
    const resumePdfBuffer = await renderPdfToBuffer(
      React.createElement(ResumePdf, {
        resume: body.resume,
        contentFallback: tailored_resume,
      })
    );

    const coverPdfBuffer = await renderPdfToBuffer(
      React.createElement(CoverLetterPdf, { content: cover })
    );

    //  DOCX (simple, clean)
    const resume_docx_base64 = await renderDocxBase64FromText(
      tailored_resume,
      "Tailored Resume"
    );
    const cover_letter_docx_base64 = await renderDocxBase64FromText(
      cover,
      "Cover Letter"
    );

    return NextResponse.json({
      tailored_resume,
      resume: body.resume,
      cover_letter: cover,
      resume_pdf_base64: resumePdfBuffer.toString("base64"),
      cover_letter_pdf_base64: coverPdfBuffer.toString("base64"),
      resume_docx_base64,
      cover_letter_docx_base64,
    });
  } catch (err: any) {
    console.error("RENDER_ROUTE_ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Server error." },
      { status: 500 }
    );
  }
}
