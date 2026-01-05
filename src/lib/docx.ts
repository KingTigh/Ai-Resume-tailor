// src/lib/docx.ts
import { Document, Packer, Paragraph, TextRun } from "docx";
import type { TailoredResume } from "./resumeFormat";

function p(text: string, opts?: { bold?: boolean; size?: number; spacingAfter?: number }) {
  return new Paragraph({
    spacing: { after: opts?.spacingAfter ?? 120 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold ?? false,
        size: opts?.size ?? 22, // 11pt
      }),
    ],
  });
}

function bullet(text: string) {
  return new Paragraph({
    spacing: { after: 60 },
    bullet: { level: 0 },
    children: [new TextRun({ text, size: 22 })],
  });
}

export async function buildResumeDocx(resume: TailoredResume): Promise<Buffer> {
  const h = resume.header;

  const children: Paragraph[] = [];
  children.push(p(h.name || "NAME", { bold: true, size: 32, spacingAfter: 80 }));

  const line2 = [
    h.location,
    h.email,
    h.phone,
    ...(h.links ?? []).map((l) => l.url || l.label),
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" | ");

  if (line2) children.push(p(line2, { spacingAfter: 200 }));

  const section = (title: string) => {
    children.push(p(title, { bold: true, spacingAfter: 80 }));
  };

  section("SUMMARY");
  children.push(p(resume.summary?.trim() || "—", { spacingAfter: 200 }));

  section("SKILLS");
  const s = resume.skills ?? {};
  const skillsLines: string[] = [];
  if ((s.languages ?? []).length) skillsLines.push(`Languages: ${(s.languages ?? []).join(", ")}`);
  if ((s.frameworks ?? []).length) skillsLines.push(`Frameworks: ${(s.frameworks ?? []).join(", ")}`);
  if ((s.tools ?? []).length) skillsLines.push(`Tools: ${(s.tools ?? []).join(", ")}`);
  if ((s.other ?? []).length) skillsLines.push(`Other: ${(s.other ?? []).join(", ")}`);
  children.push(p(skillsLines.length ? skillsLines.join("\n") : "—", { spacingAfter: 200 }));

  section("EXPERIENCE");
  for (const e of resume.experience ?? []) {
    const header = `${e.company} — ${e.title}${e.location ? ` | ${e.location}` : ""}${
      e.start || e.end ? ` | ${(e.start ?? "").trim()}–${(e.end ?? "").trim()}` : ""
    }`.trim();
    children.push(p(header, { bold: true, spacingAfter: 60 }));
    (e.bullets ?? []).filter(Boolean).forEach((b) => children.push(bullet(b)));
    children.push(p("", { spacingAfter: 120 }));
  }
  if (!(resume.experience ?? []).length) children.push(p("—", { spacingAfter: 200 }));

  section("PROJECTS");
  for (const pr of resume.projects ?? []) {
    const header = `${pr.name}${(pr.tech ?? []).length ? ` | Tech: ${(pr.tech ?? []).join(", ")}` : ""}`;
    children.push(p(header, { bold: true, spacingAfter: 60 }));
    (pr.bullets ?? []).filter(Boolean).forEach((b) => children.push(bullet(b)));
    children.push(p("", { spacingAfter: 120 }));
  }
  if (!(resume.projects ?? []).length) children.push(p("—", { spacingAfter: 200 }));

  section("EDUCATION");
  for (const ed of resume.education ?? []) {
    const header = `${ed.school}${ed.degree ? ` — ${ed.degree}` : ""}${
      ed.location ? ` | ${ed.location}` : ""
    }${ed.year ? ` | ${ed.year}` : ""}`;
    children.push(p(header, { bold: true, spacingAfter: 60 }));
    (ed.details ?? []).filter(Boolean).forEach((d) => children.push(bullet(d)));
  }
  if (!(resume.education ?? []).length) children.push(p("—"));

  const doc = new Document({
    sections: [{ children }],
  });

  const u8 = await Packer.toBuffer(doc);
  return Buffer.from(u8);
}

export async function buildCoverLetterDocx(text: string): Promise<Buffer> {
  const paragraphs = (text || "")
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => p(t, { spacingAfter: 200 }));

  const doc = new Document({
    sections: [{ children: paragraphs.length ? paragraphs : [p("—")] }],
  });

  const u8 = await Packer.toBuffer(doc);
  return Buffer.from(u8);
}
