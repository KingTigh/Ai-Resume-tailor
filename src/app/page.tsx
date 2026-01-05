"use client";

import { useMemo, useState } from "react";

type ResumeLink = { label: string; url: string };

type TailoredResume = {
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

type TailorResponse = {
  original_resume: string;
  tailored_resume: string; // ATS text
  resume: TailoredResume;  // structured JSON
  cover_letter: string;
  resume_pdf_base64: string;
  cover_letter_pdf_base64: string;
  resume_docx_base64: string;
  cover_letter_docx_base64: string;
  error?: string;
  raw?: any;
};

function base64ToBlob(b64: string, mime: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

async function safeParseTailorResponse(res: Response): Promise<TailorResponse> {
  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawText) as TailorResponse;
    } catch {
      // fallthrough
    }
  }

  if (rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html")) {
    const preview = rawText.replace(/\s+/g, " ").slice(0, 200);
    throw new Error(`Server returned an HTML error page (status ${res.status}). Preview: ${preview}`);
  }

  try {
    return JSON.parse(rawText) as TailorResponse;
  } catch {
    const preview = rawText.replace(/\s+/g, " ").slice(0, 220);
    throw new Error(`Server returned non-JSON response (status ${res.status}). Preview: ${preview}`);
  }
}

function downloadBase64(base64: string, filename: string, mime: string) {
  const blob = base64ToBlob(base64, mime);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="text-sm font-semibold tracking-wide">{title}</div>
      <div className="mt-2 h-px bg-white/10" />
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/90">
      {children}
    </span>
  );
}

function ResumePreview({ resume }: { resume: TailoredResume }) {
  const h = resume.header;

  const meta = [
    h.location,
    h.email,
    h.phone,
    ...(h.links ?? []).map((l) => l.url || l.label),
  ]
    .filter(Boolean)
    .join(" • ");

 return (
    <div className="space-y-4">
      {/* Header stays full width */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-xl font-semibold">{h.name}</div>
        {meta && <div className="mt-1 text-sm text-white/70">{meta}</div>}
      </div>

      {/* Two-column grid for the cards */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          <Section title="SUMMARY">
            <p className="text-sm text-white/90 leading-relaxed">{resume.summary || "—"}</p>
          </Section>

          <Section title="SKILLS">
            <div className="space-y-2">
              {resume.skills?.languages?.length ? (
                <div className="space-y-2">
                  <div className="text-xs text-white/60">Languages</div>
                  <div className="flex flex-wrap gap-2">
                    {resume.skills.languages.map((x, i) => (
                      <Chip key={i}>{x}</Chip>
                    ))}
                  </div>
                </div>
              ) : null}

              {resume.skills?.frameworks?.length ? (
                <div className="space-y-2">
                  <div className="text-xs text-white/60">Frameworks</div>
                  <div className="flex flex-wrap gap-2">
                    {resume.skills.frameworks.map((x, i) => (
                      <Chip key={i}>{x}</Chip>
                    ))}
                  </div>
                </div>
              ) : null}

              {resume.skills?.tools?.length ? (
                <div className="space-y-2">
                  <div className="text-xs text-white/60">Tools</div>
                  <div className="flex flex-wrap gap-2">
                    {resume.skills.tools.map((x, i) => (
                      <Chip key={i}>{x}</Chip>
                    ))}
                  </div>
                </div>
              ) : null}

              {resume.skills?.other?.length ? (
                <div className="space-y-2">
                  <div className="text-xs text-white/60">Other</div>
                  <div className="flex flex-wrap gap-2">
                    {resume.skills.other.map((x, i) => (
                      <Chip key={i}>{x}</Chip>
                    ))}
                  </div>
                </div>
              ) : null}

              {!resume.skills?.languages?.length &&
                !resume.skills?.frameworks?.length &&
                !resume.skills?.tools?.length &&
                !resume.skills?.other?.length && (
                  <div className="text-sm text-white/80">—</div>
                )}
            </div>
          </Section>

          <Section title="EDUCATION">
            {(resume.education ?? []).length ? (
              <div className="space-y-3">
                {resume.education!.map((e, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="text-sm font-semibold">
                      {e.school}
                      {e.degree ? (
                        <span className="font-normal text-white/80"> — {e.degree}</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-white/60">
                      {[e.location, e.year].filter(Boolean).join(" • ")}
                    </div>
                    {(e.details ?? []).length ? (
                      <ul className="list-disc pl-5 text-sm text-white/90 space-y-1">
                        {e.details!.filter(Boolean).map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-white/80">—</div>
            )}
          </Section>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          <Section title="EXPERIENCE">
            {(resume.experience ?? []).length ? (
              <div className="space-y-4">
                {resume.experience!.map((e, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="text-sm font-semibold">
                        {e.company} — {e.title}
                      </div>
                      <div className="text-xs text-white/60">
                        {[e.location, e.start && e.end ? `${e.start}–${e.end}` : e.start || e.end]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    </div>
                    <ul className="list-disc pl-5 text-sm text-white/90 space-y-1">
                      {(e.bullets ?? []).filter(Boolean).map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-white/80">—</div>
            )}
          </Section>

          <Section title="PROJECTS">
            {(resume.projects ?? []).length ? (
              <div className="space-y-4">
                {resume.projects!.map((p, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="text-sm font-semibold">
                      {p.name}
                      {(p.tech ?? []).length ? (
                        <span className="text-xs font-normal text-white/60">
                          {" "}
                          • Tech: {(p.tech ?? []).join(", ")}
                        </span>
                      ) : null}
                    </div>
                    <ul className="list-disc pl-5 text-sm text-white/90 space-y-1">
                      {(p.bullets ?? []).filter(Boolean).map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-white/80">—</div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [jobText, setJobText] = useState("");
  const [resumePdf, setResumePdf] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TailorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const hasJob = jobText.trim().length >= 50;
    const hasResume = !!resumePdf || resumeText.trim().length >= 50;
    return hasJob && hasResume && !loading;
  }, [jobText, resumePdf, resumeText, loading]);

  async function onTailor() {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const fd = new FormData();
      fd.append("jobText", jobText);
      if (resumePdf) fd.append("resumePdf", resumePdf);
      if (resumeText.trim().length) fd.append("resumeText", resumeText);

      const res = await fetch("/api/tailor", { method: "POST", body: fd });
      const json = await safeParseTailorResponse(res);

      if (!res.ok || json.error) throw new Error(json.error || `Request failed (${res.status})`);
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-10 bg-black text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-semibold">AI Resume & Cover Letter Tailor</h1>
          <p className="text-white/70">
            Upload your resume as a PDF and paste the job description. Get a tailored resume + cover
            letter, and download both as PDFs or DOCX.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-white/70">Resume PDF (recommended)</label>
            <input
              type="file"
              accept="application/pdf"
              className="block w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm"
              onChange={(e) => setResumePdf(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-white/50">
              If PDF parsing ever fails, you can paste your resume text below as a fallback.
            </p>

            <label className="text-sm text-white/70 mt-4 block">Resume Text (fallback)</label>
            <textarea
              className="h-44 w-full rounded-xl bg-white/5 border border-white/10 p-4 outline-none"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="(Optional) Paste resume text..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-white/70">Job Posting (paste text)</label>
            <textarea
              className="h-[18.5rem] w-full rounded-xl bg-white/5 border border-white/10 p-4 outline-none"
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              placeholder="Paste the full job description..."
            />
          </div>
        </section>

        <button
          onClick={onTailor}
          disabled={!canSubmit}
          className="rounded-xl px-5 py-3 bg-white text-black font-medium disabled:opacity-40"
        >
          {loading ? "Tailoring..." : "Tailor for this job"}
        </button>

        {error && <p className="text-red-400 whitespace-pre-wrap">{error}</p>}

        {data && (
          <section className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() =>
                  downloadBase64(data.resume_pdf_base64, "tailored_resume.pdf", "application/pdf")
                }
                className="rounded-xl px-4 py-2 bg-white text-black font-medium"
              >
                Download Resume PDF
              </button>
              <button
                onClick={() =>
                  downloadBase64(
                    data.cover_letter_pdf_base64,
                    "cover_letter.pdf",
                    "application/pdf"
                  )
                }
                className="rounded-xl px-4 py-2 bg-white/90 text-black font-medium"
              >
                Download Cover Letter PDF
              </button>

              <button
                onClick={() =>
                  downloadBase64(
                    data.resume_docx_base64,
                    "tailored_resume.docx",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  )
                }
                className="rounded-xl px-4 py-2 bg-white/10 border border-white/15 text-white font-medium"
              >
                Download Resume DOCX
              </button>

              <button
                onClick={() =>
                  downloadBase64(
                    data.cover_letter_docx_base64,
                    "cover_letter.docx",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  )
                }
                className="rounded-xl px-4 py-2 bg-white/10 border border-white/15 text-white font-medium"
              >
                Download Cover Letter DOCX
              </button>
            </div>

            {/* Preview + ATS comparison */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <h2 className="text-lg font-semibold">Original Resume (extracted)</h2>
                <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/90">
                  {data.original_resume}
                </pre>
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Tailored Resume (preview)</h2>
                <ResumePreview resume={data.resume} />

                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <h3 className="text-sm font-semibold text-white/80">
                    ATS Text (what the PDF is based on)
                  </h3>
                  <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/90">
                    {data.tailored_resume}
                  </pre>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <h2 className="text-lg font-semibold">Cover Letter</h2>
              <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/90">
                {data.cover_letter}
              </pre>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
