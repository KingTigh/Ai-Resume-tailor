// src/lib/resumeFormat.ts

export type ResumeLink = { label: string; url: string };

export type TailoredResume = {
  header: {
    name: string;
    location?: string;
    email?: string;
    phone?: string;
    links?: ResumeLink[];
  };
  summary?: string;
  skills?: {
    languages?: string[];
    frameworks?: string[];
    tools?: string[];
    other?: string[];
  };
  experience?: Array<{
    company: string;
    title: string;
    location?: string;
    start?: string;
    end?: string;
    bullets?: string[];
  }>;
  projects?: Array<{
    name: string;
    tech?: string[];
    bullets?: string[];
  }>;
  education?: Array<{
    school: string;
    degree?: string;
    location?: string;
    year?: string;
    details?: string[];
  }>;
};

function clean(s?: string) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function joinNonEmpty(parts: Array<string | undefined>, sep: string) {
  return parts.map(clean).filter(Boolean).join(sep);
}

export function formatResumeATS(resume: TailoredResume): string {
  const h = resume.header || ({} as TailoredResume["header"]);
  const name = clean(h.name) || "NAME";
  const links = (h.links ?? [])
    .map((l) => clean(l?.url || l?.label))
    .filter(Boolean)
    .join(" | ");

  const topLine2 = joinNonEmpty(
    [
      h.location,
      h.email,
      h.phone,
      links || undefined,
    ],
    " | "
  );

  const out: string[] = [];
  out.push(name);
  if (topLine2) out.push(topLine2);
  out.push("");

  // SUMMARY
  out.push("-- SUMMARY --");
  if (clean(resume.summary)) out.push(resume.summary!.trim());
  else out.push("—");
  out.push("");

  // SKILLS
  out.push("-- SKILLS --");
  const s = resume.skills ?? {};
  const skillsLines: string[] = [];
  if ((s.languages ?? []).length) skillsLines.push(`Languages: ${(s.languages ?? []).join(", ")}`);
  if ((s.frameworks ?? []).length) skillsLines.push(`Frameworks: ${(s.frameworks ?? []).join(", ")}`);
  if ((s.tools ?? []).length) skillsLines.push(`Tools: ${(s.tools ?? []).join(", ")}`);
  if ((s.other ?? []).length) skillsLines.push(`Other: ${(s.other ?? []).join(", ")}`);
  if (!skillsLines.length) skillsLines.push("—");
  out.push(...skillsLines);
  out.push("");

  // EXPERIENCE
  out.push("-- EXPERIENCE --");
  const exp = resume.experience ?? [];
  if (!exp.length) {
    out.push("—");
    out.push("");
  } else {
    for (const e of exp) {
      const header = `${clean(e.company)} — ${clean(e.title)}${
        e.location ? ` | ${clean(e.location)}` : ""
      }${e.start || e.end ? ` | ${joinNonEmpty([e.start, e.end], "–")}` : ""}`;
      out.push(header);
      const bullets = (e.bullets ?? []).map((b) => clean(b)).filter(Boolean);
      if (!bullets.length) out.push("- —");
      else bullets.forEach((b) => out.push(`- ${b}`));
      out.push("");
    }
  }

  // PROJECTS
  out.push("-- PROJECTS --");
  const proj = resume.projects ?? [];
  if (!proj.length) {
    out.push("—");
    out.push("");
  } else {
    for (const p of proj) {
      const tech = (p.tech ?? []).map(clean).filter(Boolean);
      const header = `${clean(p.name)}${tech.length ? ` | Tech: ${tech.join(", ")}` : ""}`;
      out.push(header);
      const bullets = (p.bullets ?? []).map(clean).filter(Boolean);
      if (!bullets.length) out.push("- —");
      else bullets.forEach((b) => out.push(`- ${b}`));
      out.push("");
    }
  }

  // EDUCATION
  out.push("-- EDUCATION --");
  const edu = resume.education ?? [];
  if (!edu.length) {
    out.push("—");
  } else {
    for (const e of edu) {
      const header = joinNonEmpty(
        [
          `${clean(e.school)}${e.degree ? ` — ${clean(e.degree)}` : ""}`,
          e.location,
          e.year,
        ],
        " | "
      );
      out.push(header || "—");
      const details = (e.details ?? []).map(clean).filter(Boolean);
      details.forEach((d) => out.push(`- ${d}`));
    }
  }

  return out.join("\n").trim() + "\n";
}
