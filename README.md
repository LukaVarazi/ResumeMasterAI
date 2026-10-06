# ResumeMasterAI

An AI-powered resume analysis and interview preparation platform built with **FastAPI, JavaScript, and Google Gemini**.

ResumeMasterAI helps job seekers understand how well their resume fits a specific position, identify areas for improvement, tailor existing resume content to a job description, and practice through an AI-generated mock interview.

> **Bring Your Own API Key:** ResumeMasterAI uses a user's own Google Gemini API key. API keys are kept only in browser memory and are not stored in localStorage, sessionStorage, cookies, or the backend.

---

## Features

### Resume Parsing

Upload a resume in **PDF, DOCX, or TXT** format and have Gemini extract structured information including:

- Contact information
- Education
- Work experience
- Projects
- Skills
- Certifications
- Volunteering
- Professional summary
- Suggested job titles

The extracted information is presented for review before continuing.

### Job Description Analysis

Provide a job description by either:

- Pasting the description directly
- Uploading a PDF, DOCX, or TXT file

Uploaded job descriptions are processed locally by the backend to extract their text before being used by the AI analysis pipeline.

### Match Analysis

ResumeMasterAI evaluates a resume against a specific job description and provides:

- Overall match score
- Matching skills
- Missing skills
- Strengths
- Weaknesses
- Recommendations
- Hiring-style verdict
- Reasoning behind the evaluation

The evaluation is intentionally designed to be strict rather than automatically giving candidates high scores.

### Resume Optimization

The AI provides targeted suggestions for improving an existing resume based on the selected job.

The system is instructed **not to invent experience, skills, achievements, or other information**. Suggestions are limited to actions such as:

- Rephrasing existing content
- Improving word choice
- Reordering information
- Highlighting relevant experience
- Removing clearly irrelevant content

### AI Mock Interviews

Users can practice an interactive interview through a WebSocket connection.

Questions are generated dynamically based on:

- Resume content
- Job requirements
- Previous answers
- Experience gaps
- Career motivations

After the interview, Gemini evaluates the conversation and provides:

- Overall score
- Hiring verdict
- Strengths
- Weaknesses
- Key mistakes
- Better example answers
- Actionable interview tips

---

## Architecture

```text
┌───────────────────────────────┐
│         Web Frontend          │
│                               │
│ HTML / CSS / JavaScript       │
│                               │
│ • Resume upload               │
│ • Job description input       │
│ • Results visualization       │
│ • Resume optimization         │
│ • Mock interview UI           │
└───────────────┬───────────────┘
                │
                │ HTTP / WebSocket
                │
┌───────────────▼───────────────┐
│          FastAPI              │
│                               │
│ • Resume parsing              │
│ • Document text extraction    │
│ • Session management          │
│ • Gemini request handling     │
│ • Match evaluation            │
│ • Resume tailoring            │
│ • Interview orchestration     │
└───────────────┬───────────────┘
                │
                │ User-provided
                │ API key
                │
┌───────────────▼───────────────┐
│        Google Gemini          │
│                               │
│ • Resume extraction           │
│ • Job matching                │
│ • Resume recommendations      │
│ • Interview generation        │
│ • Interview evaluation        │
└───────────────────────────────┘
```
