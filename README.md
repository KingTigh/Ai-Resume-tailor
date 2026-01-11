# AI Resume Tailor

AI Resume Tailor is a full-stack application that takes an existing resume and a job description and produces a tailored, ATS-friendly resume and cover letter. The system is designed to rewrite and reframe existing experience only, avoiding fabricated skills or experience while still improving clarity, relevance, and keyword alignment.

This project was built to demonstrate practical engineering skills around document processing, LLM integration, and user-controlled AI workflows.

---

## Overview

Job seekers (like myself) often struggle to adapt a single resume to multiple roles without rewriting everything manually. Many AI tools attempt to solve this problem but introduce risk by inventing experience or obscuring how changes are made.

This project takes a different approach:
- All output is grounded in the user’s original resume
- AI suggestions are editable before final generation
- Formatting is optimized for applicant tracking systems (ATS)
- The transformation from original to tailored content is transparent

---

## Features

- Upload an existing resume as a PDF
- Paste a target job description
- Generate:
  - A tailored resume
  - A tailored cover letter
- Inline editing:
  - Edit individual bullet points
  - Edit the professional summary
- Side-by-side comparison between original and tailored resume
- Export tailored resume and cover letter as PDFs
- Clean, ATS-safe formatting (single column, no tables or graphics)

---

## Design Principles

### Accuracy Over Automation
The system is explicitly designed to prevent hallucination. It does not invent tools, skills, metrics, or roles that do not exist in the original resume.

If a job requirement is not supported by the resume, the system avoids fabricating coverage and instead focuses on improving alignment where evidence exists.

### Human-in-the-Loop AI
AI output is not treated as final. Users can edit summaries and bullet points before regeneration, keeping control over wording and intent.

### ATS-First Output
All generated documents follow conservative formatting standards to maximize compatibility with applicant tracking systems:
- One-column layout
- Consistent bullet structure
- No icons, tables, or multi-column designs

---

## Technical Architecture

High-level pipeline:

1. Resume PDF upload  
2. Text extraction and normalization  
3. Structured resume parsing into a typed schema  
4. Constrained LLM prompting using the job description  
5. User-editable AI output in the UI  
6. Server-side PDF rendering of final documents  

Key implementation decisions:
- Server-side document generation using a Node.js runtime
- Strong typing to enforce resume structure and prevent drift
- Explicit separation between client UI and server rendering logic
- Regeneration based on edited content rather than one-shot prompts

---

## Tech Stack

- Next.js (App Router)
- TypeScript
- React
- Node.js
- Groq API for LLM inference
- PDF parsing and server-side rendering
- DOCX support for fallback generation

---

## Challenges Addressed

- Reliable PDF parsing and regeneration in a server environment
- Managing ESM and CommonJS compatibility issues
- Designing LLM prompts that improve content without inventing experience
- Building editable AI workflows instead of static AI output
- Producing consistent, ATS-friendly documents programmatically

---

## Motivation

This project was built for personal use as I continue to apply to positions as well as a portfolio piece to demonstrate:
- Full-stack system design
- Practical use of large language models
- Responsible handling of AI limitations
- Product-level decision making, not just feature implementation

It reflects how I approach building real software: focused, intentional, and designed for actual users rather than demos.

---

## Potential Improvements

- Keyword diff highlighting between resume and job description
- Resume–job alignment scoring
- Template customization
- Export to additional formats (Markdown, DOCX)
- Multi-language resume support

---

## License

MIT
