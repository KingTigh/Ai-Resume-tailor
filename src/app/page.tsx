// src/app/page.tsx
"use client";

/**
 * page.tsx (full file)
 * - Upload resume PDF (or paste fallback text)
 * - Paste job description
 * - Call /api/tailor (multipart FormData)
 * - Preview/download PDF + DOCX in a modal
 * - 2-column card preview
 * - History (last 5 runs) using localStorage
 * - ATS Keyword Match + Score (client-side)
 * - Inline bullet editing + Regenerate PDFs/DOCX from edits
 */

import { useEffect, useMemo, useState } from "react";
import { renderAsync } from "docx-preview";

/** -----------------------------
 * Types (keep in sync with API)
 * ----------------------------- */
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
  resume: TailoredResume; // structured JSON for preview
  cover_letter: string;

  resume_pdf_base64: string;
  cover_letter_pdf_base64: string;

  resume_docx_base64: string;
  cover_letter_docx_base64: string;

  error?: string;
  raw?: any;
};

/** -----------------------------
 * ATS helpers (client-side)
 * ----------------------------- */
const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","but","by","for","from","has","have","had",
  "he","she","they","them","their","the","to","of","on","or","in","is","it","its",
  "this","that","these","those","with","will","would","can","could","should","may",
  "we","our","you","your","i","me","my","us","than","then","into","over","under",
  "within","across","per","using","use","used","work","works","working","role",
  "responsibilities","requirements","preferred","years","year","experience",
  "strong","excellent","ability","skills","team","teams","including","plus"
]);

function extractJobKeywords(jobText: string, max = 35) {
  const raw = (jobText ?? "")
    .replace(/[’']/g, "'")
    .toLowerCase();

  // tech-friendly tokens
  const tokens = raw.match(/[a-z0-9][a-z0-9\+\#\.\-\/]{1,}/g) ?? [];

  const freq = new Map<string, number>();

  for (const tok of tokens) {
    const t = tok.replace(/^[\.\-\/]+|[\.\-\/]+$/g, "");

    // ✅ EXCLUDE anything that contains a digit
    if (/\d/.test(t)) continue;

    if (t.length < 3 && !["c","r","go","js","ts"].includes(t)) continue;
    if (STOPWORDS.has(t)) continue;

    const normalized =
      t === "typescript" ? "ts" :
      t === "javascript" ? "js" :
      t === "node" ? "node.js" :
      t;

    freq.set(normalized, (freq.get(normalized) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, max);
}

function analyzeAts(jobText: string, resumeText: string) {
  const keywords = extractJobKeywords(jobText);
  const resume = (resumeText ?? "").toLowerCase();

  const present: string[] = [];
  const missing: string[] = [];

  for (const k of keywords) {
    if (resume.includes(k)) present.push(k);
    else missing.push(k);
  }

  const total = keywords.length || 1;
  const score = Math.round((present.length / total) * 100);

  return { score, keywords, present, missing };
}

/** -----------------------------
 * History types / storage helpers
 * ----------------------------- */
type HistoryEntry = {
  id: string;
  createdAt: number;
  label: string;
  jobPreview?: string;
  result: TailorResponse;
  hasFiles: boolean;
};

const HISTORY_KEY = "tailor_history_v1";
const HISTORY_MAX = 5;

function nowId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatDateTime(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeLoadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.id === "string" && typeof x.createdAt === "number")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

function safeSaveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_MAX)));
}

/** -----------------------------
 * Base64 helpers
 * ----------------------------- */
function base64ToBlob(b64: string, mime: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  return url;
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

/** -----------------------------
 * Safer fetch parsing
 * ----------------------------- */
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
    const preview = rawText.replace(/\s+/g, " ").slice(0, 220);
    throw new Error(`Server returned an HTML error page (status ${res.status}). Preview: ${preview}`);
  }

  try {
    return JSON.parse(rawText) as TailorResponse;
  } catch {
    const preview = rawText.replace(/\s+/g, " ").slice(0, 220);
    throw new Error(`Server returned non-JSON response (status ${res.status}). Preview: ${preview}`);
  }
}

/** -----------------------------
 * UI building blocks
 * ----------------------------- */
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

/** -----------------------------
 * Editable bullet
 * ----------------------------- */
function EditableBullet({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // keep draft in sync when switching history items / regenerating
  useEffect(() => setDraft(value), [value]);

  if (!editing) {
    return (
      <li
        className="cursor-pointer rounded-md px-1 py-0.5 hover:bg-white/5"
        title="Click to edit"
        onClick={() => setEditing(true)}
      >
        {value}
      </li>
    );
  }

  return (
    <li className="list-none">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onChange(draft.trim() ? draft : value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-sm text-white outline-none"
      />
    </li>
  );
}

/** -----------------------------
 * Resume Preview (2-column cards) with editing
 * ----------------------------- */
function ResumePreview({
  resume,
  onEdit,
}: {
  resume: TailoredResume;
  onEdit: (next: TailoredResume) => void;
}) {
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
      {/* Header full width */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-xl font-semibold">{h.name}</div>
        {meta && <div className="mt-1 text-sm text-white/70">{meta}</div>}
      </div>

      {/* Two-column grid */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* LEFT */}
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
                !resume.skills?.other?.length && <div className="text-sm text-white/80">—</div>}
            </div>
          </Section>

          <Section title="EDUCATION">
            {(resume.education ?? []).length ? (
              <div className="space-y-3">
                {resume.education!.map((e, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="text-sm font-semibold">
                      {e.school}
                      {e.degree ? <span className="font-normal text-white/80"> — {e.degree}</span> : null}
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

        {/* RIGHT */}
        <div className="space-y-4">
          <Section title="EXPERIENCE (click bullets to edit)">
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
                        <EditableBullet
                          key={i}
                          value={b}
                          onChange={(nextText) => {
                            const next = structuredClone(resume);
                            next.experience ??= [];
                            next.experience[idx].bullets ??= [];
                            next.experience[idx].bullets![i] = nextText;
                            onEdit(next);
                          }}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-white/80">—</div>
            )}
          </Section>

          <Section title="PROJECTS (click bullets to edit)">
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
                        <EditableBullet
                          key={i}
                          value={b}
                          onChange={(nextText) => {
                            const next = structuredClone(resume);
                            next.projects ??= [];
                            next.projects[idx].bullets ??= [];
                            next.projects[idx].bullets![i] = nextText;
                            onEdit(next);
                          }}
                        />
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

/** -----------------------------
 * Preview Modal + PDF/DOCX viewers
 * ----------------------------- */
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-zinc-950 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="text-sm font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="h-[80vh] overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function PdfViewer({ base64 }: { base64: string }) {
  const blob = useMemo(() => base64ToBlob(base64, "application/pdf"), [base64]);
  const url = useObjectUrl(blob);
  if (!url) return <div className="text-white/70">Loading PDF…</div>;

  return (
    <iframe
      title="PDF Preview"
      src={url}
      className="h-[78vh] w-full rounded-xl border border-white/10 bg-black"
    />
  );
}

function DocxViewer({ base64 }: { base64: string }) {
  const blob = useMemo(
    () =>
      base64ToBlob(
        base64,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ),
    [base64]
  );

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const container = document.getElementById("docx-preview-container");
    if (!container) return;
    container.innerHTML = "";

    renderAsync(blob, container, undefined, {
      className: "docx",
      inWrapper: true,
      breakPages: true,
    });
  }, [blob, mounted]);

  return (
    <div
      id="docx-preview-container"
      className="rounded-xl border border-white/10 bg-white p-4 text-black"
    />
  );
}

/** -----------------------------
 * Main Page Component
 * ----------------------------- */
export default function Home() {
  const [jobText, setJobText] = useState("");
  const [resumePdf, setResumePdf] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");

  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [data, setData] = useState<TailorResponse | null>(null);
  const [editedResume, setEditedResume] = useState<TailoredResume | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<
    | null
    | { kind: "pdf"; title: string; base64: string }
    | { kind: "docx"; title: string; base64: string }
  >(null);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyInfo, setHistoryInfo] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  useEffect(() => {
    setHistory(safeLoadHistory());
  }, []);

  const ats = useMemo(() => {
    if (!data) return null;
    return analyzeAts(jobText, data.tailored_resume || "");
  }, [data, jobText]);

  const canSubmit = useMemo(() => {
    const hasJob = jobText.trim().length >= 50;
    const hasResume = !!resumePdf || resumeText.trim().length >= 50;
    return hasJob && hasResume && !loading;
  }, [jobText, resumePdf, resumeText, loading]);

  function makeLabelFromJob(text: string) {
    const oneLine = text.replace(/\s+/g, " ").trim();
    if (!oneLine) return "Tailor Run";
    return oneLine.slice(0, 60) + (oneLine.length > 60 ? "…" : "");
  }

  function addToHistory(result: TailorResponse) {
    const entryFull: HistoryEntry = {
      id: nowId(),
      createdAt: Date.now(),
      label: makeLabelFromJob(jobText),
      jobPreview: jobText.slice(0, 240),
      result,
      hasFiles: true,
    };

    const next = [entryFull, ...history].slice(0, HISTORY_MAX);

    try {
      safeSaveHistory(next);
      setHistory(next);
      setHistoryInfo(null);
      return;
    } catch {
      // likely quota
    }

    const stripped: TailorResponse = {
      ...result,
      resume_pdf_base64: "",
      cover_letter_pdf_base64: "",
      resume_docx_base64: "",
      cover_letter_docx_base64: "",
    };

    const entryTextOnly: HistoryEntry = {
      ...entryFull,
      result: stripped,
      hasFiles: false,
    };

    const next2 = [entryTextOnly, ...history].slice(0, HISTORY_MAX);

    try {
      safeSaveHistory(next2);
      setHistory(next2);
      setHistoryInfo(
        "Saved to history without PDF/DOCX files (browser storage limit). Re-run Tailor to regenerate files."
      );
    } catch {
      setHistoryInfo("Could not save to history (browser storage limit).");
    }
  }

  function openHistoryEntry(entry: HistoryEntry) {
    setError(null);
    setData(entry.result);
    setEditedResume(entry.result.resume);
    setSelectedHistoryId(entry.id);
    if (entry.jobPreview) setJobText(entry.jobPreview);
    setHistoryInfo(entry.hasFiles ? null : "This history item was saved without files (storage limit).");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteHistoryEntry(id: string) {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    try {
      safeSaveHistory(next);
    } catch {}
    if (selectedHistoryId === id) setSelectedHistoryId(null);
  }

  function clearHistory() {
    setHistory([]);
    setSelectedHistoryId(null);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {}
  }

  async function onTailor() {
    setLoading(true);
    setError(null);
    setData(null);
    setEditedResume(null);
    setHistoryInfo(null);
    setSelectedHistoryId(null);

    try {
      const fd = new FormData();
      fd.append("jobText", jobText);

      if (resumePdf) fd.append("resumePdf", resumePdf);
      if (resumeText.trim().length) fd.append("resumeText", resumeText);

      const res = await fetch("/api/tailor", { method: "POST", body: fd });
      const json = await safeParseTailorResponse(res);

      if (!res.ok || json.error) throw new Error(json.error || `Request failed (${res.status})`);

      setData(json);
      setEditedResume(json.resume);
      addToHistory(json);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function onRegenerate() {
    if (!data || !editedResume) return;

    setRegenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: editedResume,
          cover_letter: data.cover_letter,
        }),
      });

      const updated = await res.json();
      if (!res.ok || updated.error) throw new Error(updated.error || `Regenerate failed (${res.status})`);

      // Update current data with regenerated outputs (keep original_resume/job context)
      const next: TailorResponse = {
        ...data,
        resume: updated.resume,
        tailored_resume: updated.tailored_resume,
        cover_letter: updated.cover_letter,
        resume_pdf_base64: updated.resume_pdf_base64,
        cover_letter_pdf_base64: updated.cover_letter_pdf_base64,
        resume_docx_base64: updated.resume_docx_base64,
        cover_letter_docx_base64: updated.cover_letter_docx_base64,
      };

      setData(next);
      setEditedResume(updated.resume);
    } catch (e: any) {
      setError(e?.message || "Regenerate failed");
    } finally {
      setRegenerating(false);
    }
  }

  const canUseFiles =
    !!data?.resume_pdf_base64 &&
    !!data?.cover_letter_pdf_base64 &&
    !!data?.resume_docx_base64 &&
    !!data?.cover_letter_docx_base64;

  return (
    <main className="min-h-screen px-6 py-10 bg-black text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-semibold">AI Resume & Cover Letter Tailor</h1>
          <p className="text-white/70">
            Upload your resume as a PDF and paste the job description. Tailor, edit bullets inline, then regenerate fresh PDFs/DOCX.
          </p>
          <p className="text-white/70">
            Formatted for ATS parsing (no tables icons or columns)
          </p>
        </header>

        {/* History */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">History (last {HISTORY_MAX})</div>
            <button
              onClick={clearHistory}
              disabled={!history.length}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-40"
            >
              Clear all
            </button>
          </div>

          {historyInfo && <div className="mt-3 text-sm text-white/70">{historyInfo}</div>}

          {!history.length ? (
            <div className="mt-3 text-sm text-white/60">No saved runs yet.</div>
          ) : (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className={`rounded-xl p-3 flex items-start justify-between gap-3 transition
                    ${
                      selectedHistoryId === h.id
                        ? "border border-white/60 bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.4)]"
                        : "border border-white/10 bg-black/30 hover:bg-black/40"
                    }
                  `}
                >
                  <button onClick={() => openHistoryEntry(h)} className="text-left flex-1">
                    <div className="text-sm font-medium text-white">{h.label}</div>
                    <div className="mt-1 text-xs text-white/60">
                      {formatDateTime(h.createdAt)}{" "}
                      {!h.hasFiles ? <span className="text-yellow-300/80">• no files saved</span> : null}
                    </div>
                  </button>

                  <button
                    onClick={() => deleteHistoryEntry(h.id)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Inputs */}
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
              If PDF parsing fails, paste your resume text below as fallback.
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
            {/* ATS Score */}
            {ats && (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-white/60">ATS Keyword Match</div>
                    <div className="text-2xl font-semibold">
                      {ats.score}/100{" "}
                      <span className="text-sm font-normal text-white/60">
                        ({ats.present.length}/{ats.keywords.length} keywords found)
                      </span>
                    </div>
                  </div>

                  <button
                    className="rounded-xl px-4 py-2 bg-white/10 border border-white/15 text-white font-medium disabled:opacity-40"
                    disabled={ats.missing.length === 0}
                    onClick={() => navigator.clipboard.writeText(ats.missing.join(", "))}
                  >
                    Copy missing keywords
                  </button>
                </div>

                <div>
                  <div className="text-sm font-semibold text-white/80">Missing keywords</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ats.missing.length ? (
                      ats.missing.map((k) => (
                        <span
                          key={k}
                          className="inline-flex items-center rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs text-red-200"
                        >
                          {k}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-white/60">None — nice match.</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Regenerate from edits */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-5">
              <div>
                <div className="text-sm font-semibold">Edits</div>
                <div className="text-sm text-white/60">
                  Click bullets in the cards to edit. When ready, regenerate PDFs/DOCX from your changes.
                </div>
              </div>

              <button
                onClick={onRegenerate}
                disabled={!editedResume || regenerating}
                className="rounded-xl px-4 py-2 bg-white text-black font-medium disabled:opacity-40"
              >
                {regenerating ? "Regenerating..." : "Regenerate files from edits"}
              </button>
            </div>

            {/* Downloads + previews */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => downloadBase64(data.resume_pdf_base64, "tailored_resume.pdf", "application/pdf")}
                disabled={!data.resume_pdf_base64}
                className="rounded-xl px-4 py-2 bg-white text-black font-medium disabled:opacity-40"
              >
                Download Resume PDF
              </button>

              <button
                onClick={() => downloadBase64(data.cover_letter_pdf_base64, "cover_letter.pdf", "application/pdf")}
                disabled={!data.cover_letter_pdf_base64}
                className="rounded-xl px-4 py-2 bg-white/90 text-black font-medium disabled:opacity-40"
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
                disabled={!data.resume_docx_base64}
                className="rounded-xl px-4 py-2 bg-white/10 border border-white/15 text-white font-medium disabled:opacity-40"
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
                disabled={!data.cover_letter_docx_base64}
                className="rounded-xl px-4 py-2 bg-white/10 border border-white/15 text-white font-medium disabled:opacity-40"
              >
                Download Cover Letter DOCX
              </button>

              <button
                onClick={() => setPreview({ kind: "pdf", title: "Resume PDF Preview", base64: data.resume_pdf_base64 })}
                disabled={!data.resume_pdf_base64}
                className="rounded-xl px-4 py-2 bg-white/5 border border-white/15 text-white font-medium disabled:opacity-40"
              >
                Preview Resume PDF
              </button>

              <button
                onClick={() =>
                  setPreview({ kind: "pdf", title: "Cover Letter PDF Preview", base64: data.cover_letter_pdf_base64 })
                }
                disabled={!data.cover_letter_pdf_base64}
                className="rounded-xl px-4 py-2 bg-white/5 border border-white/15 text-white font-medium disabled:opacity-40"
              >
                Preview Cover Letter PDF
              </button>

              <button
                onClick={() => setPreview({ kind: "docx", title: "Resume DOCX Preview", base64: data.resume_docx_base64 })}
                disabled={!data.resume_docx_base64}
                className="rounded-xl px-4 py-2 bg-white/5 border border-white/15 text-white font-medium disabled:opacity-40"
              >
                Preview Resume DOCX
              </button>

              <button
                onClick={() =>
                  setPreview({ kind: "docx", title: "Cover Letter DOCX Preview", base64: data.cover_letter_docx_base64 })
                }
                disabled={!data.cover_letter_docx_base64}
                className="rounded-xl px-4 py-2 bg-white/5 border border-white/15 text-white font-medium disabled:opacity-40"
              >
                Preview Cover Letter DOCX
              </button>

              {!canUseFiles && (
                <div className="w-full text-sm text-yellow-300/80">
                  This result doesn’t include saved files (storage limit). Re-run Tailor or Regenerate.
                </div>
              )}
            </div>

            {/* Preview area */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <h2 className="text-lg font-semibold">Original Resume (extracted)</h2>
                <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/90">
                  {data.original_resume}
                </pre>
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Tailored Resume (cards)</h2>
                {editedResume && <ResumePreview resume={editedResume} onEdit={setEditedResume} />}

                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <h3 className="text-sm font-semibold text-white/80">ATS Text (generated / regenerated)</h3>
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

      {/* Modal */}
      {preview && (
        <Modal title={preview.title} onClose={() => setPreview(null)}>
          {preview.kind === "pdf" ? <PdfViewer base64={preview.base64} /> : <DocxViewer base64={preview.base64} />}
        </Modal>
      )}
    </main>
  );
}
