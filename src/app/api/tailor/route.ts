// src/app/api/tailor/route.ts
import React from "react";
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { extractTextFromPdf } from "@/lib/pdf";
import { ResumePdf, CoverLetterPdf, renderPdfToBuffer } from "@/lib/pdfDocs";
import type { TailoredResume } from "@/lib/resumeFormat";
import { formatResumeATS } from "@/lib/resumeFormat";
import { buildResumeDocx, buildCoverLetterDocx } from "@/lib/docx";

export const runtime = "nodejs";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MAX_CHARS = 35_000;

function clamp(s: string) {
  const cleaned = (s ?? "").replace(/\u0000/g, "").trim();
  return cleaned.length > MAX_CHARS ? cleaned.slice(0, MAX_CHARS) : cleaned;
}

const encoder = new TextEncoder();

function sse(event: string, data: any) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}


function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function extractFirstJsonObject(text: string): string | null {
  if (!text) return null;

  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

function normalizeResume(r: any): TailoredResume {
  const resume: TailoredResume = {
    header: {
      name: String(r?.header?.name ?? "").trim() || "NAME",
      location: String(r?.header?.location ?? "").trim() || undefined,
      email: String(r?.header?.email ?? "").trim() || undefined,
      phone: String(r?.header?.phone ?? "").trim() || undefined,
      links: Array.isArray(r?.header?.links)
        ? r.header.links
            .map((x: any) => ({
              label: String(x?.label ?? "").trim(),
              url: String(x?.url ?? "").trim(),
            }))
            .filter((x: any) => x.label || x.url)
        : [],
    },
    summary: typeof r?.summary === "string" ? r.summary.trim() : "",
    skills: {
      languages: Array.isArray(r?.skills?.languages) ? r.skills.languages.map(String) : [],
      frameworks: Array.isArray(r?.skills?.frameworks) ? r.skills.frameworks.map(String) : [],
      tools: Array.isArray(r?.skills?.tools) ? r.skills.tools.map(String) : [],
      other: Array.isArray(r?.skills?.other) ? r.skills.other.map(String) : [],
    },
    experience: Array.isArray(r?.experience)
      ? r.experience.map((e: any) => ({
          company: String(e?.company ?? "").trim(),
          title: String(e?.title ?? "").trim(),
          location: String(e?.location ?? "").trim() || undefined,
          start: String(e?.start ?? "").trim() || undefined,
          end: String(e?.end ?? "").trim() || undefined,
          bullets: Array.isArray(e?.bullets) ? e.bullets.map(String).filter(Boolean) : [],
        }))
      : [],
    projects: Array.isArray(r?.projects)
      ? r.projects.map((p: any) => ({
          name: String(p?.name ?? "").trim(),
          tech: Array.isArray(p?.tech) ? p.tech.map(String).filter(Boolean) : [],
          bullets: Array.isArray(p?.bullets) ? p.bullets.map(String).filter(Boolean) : [],
        }))
      : [],
    education: Array.isArray(r?.education)
      ? r.education.map((e: any) => ({
          school: String(e?.school ?? "").trim(),
          degree: String(e?.degree ?? "").trim() || undefined,
          location: String(e?.location ?? "").trim() || undefined,
          year: String(e?.year ?? "").trim() || undefined,
          details: Array.isArray(e?.details) ? e.details.map(String).filter(Boolean) : [],
        }))
      : [],
  };

  // remove empty exp/projects/edu items
  resume.experience = (resume.experience ?? []).filter((e) => e.company && e.title);
  resume.projects = (resume.projects ?? []).filter((p) => p.name);
  resume.education = (resume.education ?? []).filter((e) => e.school);

  return resume;
}

const MODEL_RULES = `
You are tailoring a resume for ATS.

Return ONLY a single JSON object with this exact shape:
{
  "resume": {
    "header": { "name": "string", "location": "string", "email": "string", "phone": "string", "links": [{"label":"string","url":"string"}] },
    "summary": "string",
    "skills": { "languages": ["..."], "frameworks": ["..."], "tools": ["..."], "other": ["..."] },
    "experience": [{ "company":"string","title":"string","location":"string","start":"string","end":"string","bullets":["..."] }],
    "projects": [{ "name":"string","tech":["..."],"bullets":["..."] }],
    "education": [{ "school":"string","degree":"string","location":"string","year":"string","details":["..."] }]
  },
  "cover_letter": "string"
}

Rules:
- No markdown, no extra keys, no commentary.
- Do not invent experience or credentials. Do not fabricate employers, schools, or dates.
- Make bullets impact-focused (action + outcome; metrics if real).
- Keep it concise (~1 page equivalent).
- Cover letter: 3–5 short paragraphs, plain text, professional.
`;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const jobText = clamp(String(form.get("jobText") ?? ""));
    const resumeTextFallback = clamp(String(form.get("resumeText") ?? ""));

    if (jobText.trim().length < 50) {
      return NextResponse.json({ error: "Job posting text is too short." }, { status: 400 });
    }

    let originalResume = "";
    const resumePdf = form.get("resumePdf");

    if (resumePdf instanceof File && resumePdf.size > 0) {
      const ab = await resumePdf.arrayBuffer();
      originalResume = clamp(await extractTextFromPdf(Buffer.from(ab)));
    } else {
      originalResume = resumeTextFallback;
    }

    if (originalResume.trim().length < 50) {
      return NextResponse.json(
        { error: "Resume content is too short. Upload a PDF or paste resume text." },
        { status: 400 }
      );
    }

    const model = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";

    const prompt = `
${MODEL_RULES}

JOB DESCRIPTION:
${jobText}

CANDIDATE RESUME (extracted text):
${originalResume}
`;

    const completion = await groq.chat.completions.create({
      model,
      temperature: 0.25,
      response_format: { type: "json_object" } as any,
      messages: [
        { role: "system", content: "You write ATS-optimized resumes and concise cover letters." },
        { role: "user", content: prompt },
      ],
    });

    const content = completion.choices?.[0]?.message?.content ?? "";

    type AIShape = { resume: TailoredResume; cover_letter: string };

    let parsed = safeJsonParse<AIShape>(content);
    if (!parsed) {
      const extracted = extractFirstJsonObject(content);
      if (extracted) parsed = safeJsonParse<AIShape>(extracted);
    }

    if (!parsed?.resume || !parsed?.cover_letter) {
      return NextResponse.json(
        { error: "AI response could not be parsed.", raw: content.slice(0, 4000) },
        { status: 502 }
      );
    }

    const resume = normalizeResume(parsed.resume);
    const cover_letter = clamp(String(parsed.cover_letter ?? ""));

    // ATS text for side-by-side, search, and fallback
    const tailored_resume = clamp(formatResumeATS(resume));

    // PDFs
    const resumePdfBuffer = await renderPdfToBuffer(
      React.createElement(ResumePdf, { resume, contentFallback: tailored_resume })
    );
    const coverPdfBuffer = await renderPdfToBuffer(
      React.createElement(CoverLetterPdf, { content: cover_letter })
    );

    // DOCX
    const resumeDocx = await buildResumeDocx(resume);
    const coverDocx = await buildCoverLetterDocx(cover_letter);

    return NextResponse.json({
      original_resume: originalResume,
      tailored_resume, // ATS text
      resume, // structured JSON for HTML preview
      cover_letter,
      resume_pdf_base64: resumePdfBuffer.toString("base64"),
      cover_letter_pdf_base64: coverPdfBuffer.toString("base64"),
      resume_docx_base64: resumeDocx.toString("base64"),
      cover_letter_docx_base64: coverDocx.toString("base64"),
    });
  } catch (err: any) {
    console.error("TAILOR_ROUTE_ERROR:", err);
    return NextResponse.json(
      { error: "Server error.", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
