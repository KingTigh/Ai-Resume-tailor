// src/lib/pdfDocs.tsx
import React from "react";
import { Buffer } from "buffer";
import { Document, Page, Text, StyleSheet, View, pdf } from "@react-pdf/renderer";
import type { TailoredResume } from "./resumeFormat";
import { formatResumeATS } from "./resumeFormat"

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.25,
  },

  title: { fontSize: 13.5, fontWeight: 700, marginBottom: 10 },

  name: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  meta: { fontSize: 10, marginBottom: 10 },

  section: { marginTop: 10 },
  sectionHeader: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  divider: { height: 1, backgroundColor: "#DDDDDD", marginBottom: 6 },

  line: { marginBottom: 2 },

  bulletRow: { flexDirection: "row", marginBottom: 2 },
  bulletDot: { width: 10, fontSize: 10 },
  bulletText: { flex: 1 },
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <View style={styles.divider} />
      {children}
    </View>
  );
}

function Bullets({ bullets }: { bullets: string[] }) {
  return (
    <>
      {bullets.map((b, i) => (
        <Text key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{b}</Text>
        </Text>
      ))}
    </>
  );
}

// If you ever want to render from plain text, this keeps it usable:
function FormattedATS({ content }: { content: string }) {
  const lines = (content || "").split(/\r?\n/);

  return (
    <>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <Text key={i} style={{ marginBottom: 4 }} />;
        if (line.startsWith("## ")) {
          return (
            <Text key={i} style={styles.sectionHeader}>
              {line.replace(/^##\s*/, "")}
            </Text>
          );
        }
        if (line.trimStart().startsWith("- ")) {
          const text = line.trimStart().slice(2);
          return (
            <Text key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{text}</Text>
            </Text>
          );
        }
        return (
          <Text key={i} style={styles.line}>
            {line}
          </Text>
        );
      })}
    </>
  );
}

export function ResumePdf({
  resume,
  contentFallback,
}: {
  resume?: TailoredResume;
  contentFallback?: string;
}) {
  // Prefer structured resume; fallback to ATS text if needed
  const r = resume;
  if (!r) {
    return (
      <Document>
        <Page size="LETTER" style={styles.page}>
          <Text style={styles.title}>Tailored Resume</Text>
          <FormattedATS content={contentFallback || ""} />
        </Page>
      </Document>
    );
  }

  const metaLine =
    [
      r.header.location,
      r.header.email,
      r.header.phone,
      ...(r.header.links ?? []).map((l) => l.url || l.label),
    ]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" | ") || "";

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.name}>{r.header.name}</Text>
        {!!metaLine && <Text style={styles.meta}>{metaLine}</Text>}

        <Section title="SUMMARY">
          <Text style={styles.line}>{r.summary?.trim() || "—"}</Text>
        </Section>

        <Section title="SKILLS">
          {(r.skills?.languages?.length ?? 0) > 0 && (
            <Text style={styles.line}>Languages: {r.skills!.languages!.join(", ")}</Text>
          )}
          {(r.skills?.frameworks?.length ?? 0) > 0 && (
            <Text style={styles.line}>Frameworks: {r.skills!.frameworks!.join(", ")}</Text>
          )}
          {(r.skills?.tools?.length ?? 0) > 0 && (
            <Text style={styles.line}>Tools: {r.skills!.tools!.join(", ")}</Text>
          )}
          {(r.skills?.other?.length ?? 0) > 0 && (
            <Text style={styles.line}>Other: {r.skills!.other!.join(", ")}</Text>
          )}
          {!(
            (r.skills?.languages?.length ?? 0) ||
            (r.skills?.frameworks?.length ?? 0) ||
            (r.skills?.tools?.length ?? 0) ||
            (r.skills?.other?.length ?? 0)
          ) && <Text style={styles.line}>—</Text>}
        </Section>

        <Section title="EXPERIENCE">
          {(r.experience ?? []).length ? (
            (r.experience ?? []).map((e, idx) => (
              <View key={idx} style={{ marginBottom: 8 }}>
                <Text style={styles.line}>
                  <Text style={{ fontWeight: 700 }}>{e.company}</Text>
                  {" — "}
                  <Text style={{ fontWeight: 700 }}>{e.title}</Text>
                  {e.location ? ` | ${e.location}` : ""}
                  {e.start || e.end ? ` | ${(e.start ?? "").trim()}–${(e.end ?? "").trim()}` : ""}
                </Text>
                <Bullets bullets={(e.bullets ?? []).filter(Boolean)} />
              </View>
            ))
          ) : (
            <Text style={styles.line}>—</Text>
          )}
        </Section>

        <Section title="PROJECTS">
          {(r.projects ?? []).length ? (
            (r.projects ?? []).map((p, idx) => (
              <View key={idx} style={{ marginBottom: 8 }}>
                <Text style={styles.line}>
                  <Text style={{ fontWeight: 700 }}>{p.name}</Text>
                  {(p.tech ?? []).length ? ` | Tech: ${(p.tech ?? []).join(", ")}` : ""}
                </Text>
                <Bullets bullets={(p.bullets ?? []).filter(Boolean)} />
              </View>
            ))
          ) : (
            <Text style={styles.line}>—</Text>
          )}
        </Section>

        <Section title="EDUCATION">
          {(r.education ?? []).length ? (
            (r.education ?? []).map((ed, idx) => (
              <View key={idx} style={{ marginBottom: 6 }}>
                <Text style={styles.line}>
                  <Text style={{ fontWeight: 700 }}>{ed.school}</Text>
                  {ed.degree ? ` — ${ed.degree}` : ""}
                  {ed.location ? ` | ${ed.location}` : ""}
                  {ed.year ? ` | ${ed.year}` : ""}
                </Text>
                {(ed.details ?? []).filter(Boolean).map((d, i) => (
                  <Text key={i} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{d}</Text>
                  </Text>
                ))}
              </View>
            ))
          ) : (
            <Text style={styles.line}>—</Text>
          )}
        </Section>
      </Page>
    </Document>
  );
}

export function CoverLetterPdf({ content }: { content: string }) {
  // Keep cover letter super ATS-safe: plain paragraphs
  const paras = (content || "")
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>Cover Letter</Text>
        {paras.length ? (
          paras.map((p, i) => (
            <Text key={i} style={{ marginBottom: 8 }}>
              {p}
            </Text>
          ))
        ) : (
          <Text>—</Text>
        )}
      </Page>
    </Document>
  );
}

export async function renderPdfToBuffer(doc: React.ReactElement) {
  const instance = pdf(doc as any);
  const blob: Blob = await instance.toBlob();
  const ab = await blob.arrayBuffer();
  return Buffer.from(ab);
}

// Convenience if you still want ATS text from a structured resume:
export function resumeToAtsText(resume: TailoredResume) {
  return formatResumeATS(resume);
}
