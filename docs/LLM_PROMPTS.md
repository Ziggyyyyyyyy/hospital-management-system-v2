# 🤖 Hospital Management System (HMS) — AI/LLM Prompts & Intelligence Reference

Comprehensive reference of all Large Language Model (LLM) prompts, structured JSON output schemas, validation pipelines, and resilience fallbacks implemented across the Hospital Management System.

---

## 📑 Table of Contents

1. [AI Architecture & Model Configuration](#-ai-architecture--model-configuration)
2. [Feature 1: Pre-Visit Symptom Intake & Clinical Briefing](#1-feature-1-pre-visit-symptom-intake--clinical-briefing)
3. [Feature 2: Post-Visit Patient Education & Care Summary](#2-feature-2-post-visit-patient-education--care-summary)
4. [Safety, Medical Guardrails & Disclaimers](#3-safety-medical-guardrails--disclaimers)
5. [Error Handling, Consent & Fallback Mechanisms](#4-error-handling-consent--fallback-mechanisms)

---

## 🧠 AI Architecture & Model Configuration

All AI interactions in HMS are routed through a centralized client service powered by the official Google Gemini SDK (`@google/genai`).

- **Engine:** Google Gemini
- **Model ID:** `gemini-3.6-flash`
- **Client Implementation:** [`lib/ai/gemini.ts`](file:///c:/Users/hp/hospital-management-system/lib/ai/gemini.ts)
- **Environment Variable:** `GEMINI_API_KEY` (Server-only)
- **Response Format:** Strict JSON generation with programmatic markdown fence stripping (`/^```(?:json)?\s*/i`) and strict Zod runtime schema validation.

```text
Patient / Doctor Input
       │
       ▼
Prompt Template Construction (`buildPrompt`)
       │
       ▼
Google Gemini API (`gemini-3.6-flash`)
       │
       ▼
Raw JSON Response
       │
       ▼
Markdown Strip & `JSON.parse()`
       │
       ▼
Zod Schema Validation (`safeParse`)
       │
       ├──────────────────────────────────────────┐
       ▼ (Success)                                ▼ (Validation / Parse / API Failure)
Save `status: 'COMPLETED'` to Supabase    Save `status: 'FAILED'` to Supabase
       │                                          │
       ▼                                          ▼
Trigger Outbox Email Notification         Display Non-Blocking UI Error with Retry
```

---

## 1. Feature 1: Pre-Visit Symptom Intake & Clinical Briefing

### 📌 Purpose & Use Case
Assists doctors prior to a clinical consultation by converting patient-submitted symptoms into a structured pre-visit briefing featuring an urgency rating, a chief complaint summary, and 3 targeted clarifying questions.

- **Service Module:** [`lib/ai/previsit-service.ts`](file:///c:/Users/hp/hospital-management-system/lib/ai/previsit-service.ts)
- **API Trigger Endpoint:** `POST /api/symptoms`
- **Retrieval Endpoint:** `GET /api/ai/previsit/[appointment_id]`
- **Prompt Version:** `PREVISIT_V1`
- **Model:** `gemini-3.6-flash`

---

### 📥 Input Fields
From the `symptom_intakes` submission:
- `symptoms` (string, required): Comma-separated or narrative symptom description.
- `severity` (string, optional): e.g., `"MILD"`, `"MODERATE"`, `"SEVERE"`.
- `duration_text` (string, optional): e.g., `"3 days"`, `"2 weeks"`.
- `worsening` (boolean, optional): `true` if symptoms are deteriorating; `false` if stable.
- `additional_context` (string, optional): Relevant medical history, onset details, or trigger factors.
- `ai_processing_consent` (boolean, required): Patient explicit opt-in for AI analysis.

---

### 📝 Prompt Template

```text
You are a medical scribe assistant preparing a pre-visit summary for a doctor.
Your ONLY task is to SUMMARIZE the patient reported symptoms and context.
DO NOT provide any diagnosis, medical advice, or treatment recommendations.
DO NOT guess or infer conditions beyond what is explicitly stated.

Patient reported symptoms and details:
- Symptoms: {{intake.symptoms}}
- Severity: {{intake.severity}}
- Duration: {{intake.duration_text}}
- Worsening: {{intake.worsening}}
- Additional context: {{intake.additional_context}}

Respond with STRICT JSON only. Do not include markdown, code fences, or any text outside the JSON object.
The JSON must have exactly these keys:
  - urgency: one of "LOW", "MEDIUM", "HIGH" based ONLY on reported severity and worsening
  - chief_complaint: a concise 1-2 sentence summary of the patient main issue
  - suggested_questions: an array of EXACTLY 3 clarifying questions the doctor may want to ask (do NOT answer them)

Example output format:
{
  "urgency": "MEDIUM",
  "chief_complaint": "Patient reports a 3-day history of headache with moderate intensity.",
  "suggested_questions": [
    "Does the headache occur at a specific time of day?",
    "Have you tried any medications for relief?",
    "Is there any associated nausea or visual changes?"
  ]
}
```

---

### 🔍 Output Schema & Zod Validation

```typescript
export const PrevisitOutputSchema = z.object({
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  chief_complaint: z.string(),
  suggested_questions: z.array(z.string()).length(3),
})
```

---

### 🗄️ Database Persistence Target
- **Table:** `ai_previsit_summaries`
- **Columns Written:**
  - `appointment_id`: Link to parent appointment
  - `patient_id` / `doctor_id`: Resolved foreign keys
  - `urgency`: `'LOW'` | `'MEDIUM'` | `'HIGH'`
  - `chief_complaint`: Concise summary string
  - `suggested_questions`: Array of 3 strings stored as JSONB
  - `model`: `'gemini-3.6-flash'`
  - `prompt_version`: `'PREVISIT_V1'`
  - `status`: `'COMPLETED'` (or `'FAILED'`)
  - `raw_response`: Full parsed JSON object
  - `generated_at`: ISO 8601 timestamp

---

### 💡 Verified Example

#### Input Payload
```json
{
  "appointment_id": 42,
  "symptoms": "High fever, persistent dry cough, shortness of breath on exertion",
  "severity": "MODERATE",
  "duration_text": "3 days",
  "worsening": true,
  "additional_context": "No known asthma; nonsmoker",
  "ai_processing_consent": true
}
```

#### Validated AI Output
```json
{
  "urgency": "HIGH",
  "chief_complaint": "Patient presents with a 3-day history of high fever and persistent dry cough accompanied by worsening exertional dyspnea.",
  "suggested_questions": [
    "Are you experiencing any chest pain or difficulty breathing while at rest?",
    "Have you been in close contact with anyone who tested positive for COVID-19 or influenza?",
    "Have you checked your blood oxygen levels or temperature with a home device?"
  ]
}
```

---

## 2. Feature 2: Post-Visit Patient Education & Care Summary

### 📌 Purpose & Use Case
Translates complex doctor clinical notes, official diagnoses, and multi-item prescription instructions into a friendly, plain-language takeaway summary for the patient.

- **Service Module:** [`lib/ai/postvisit-service.ts`](file:///c:/Users/hp/hospital-management-system/lib/ai/postvisit-service.ts)
- **API Trigger Endpoint:** `POST /api/post-visit-notes`
- **Retrieval Endpoint:** `GET /api/ai/postvisit/[appointment_id]`
- **Prompt Version:** `POSTVISIT_V1`
- **Model:** `gemini-3.6-flash`

---

### 📥 Input Fields
From the doctor's consultation record & issued prescriptions:
- `clinical_notes` (string, required): Doctor's raw clinical observations and examination notes.
- `diagnosis` (string, optional): Formal diagnosis recorded by doctor.
- `follow_up_instr` (string, optional): Direct instructions recorded by doctor.
- `prescriptions` (array of objects, optional):
  - `medicine_name`, `dosage`, `frequency`, `duration_days`, `quantity`, `instructions`, `notes`.

---

### 📝 Prompt Template

```text
You are a patient-education assistant. Convert the doctor clinical notes
into a friendly, plain-language summary the patient can easily understand.
Use simple words. Do NOT add medical advice or warnings beyond what the doctor wrote.
Do NOT invent any information - only use what is provided.

DOCTOR CLINICAL NOTES (source of truth):
{{note.clinical_notes}}

- Doctor diagnosis: {{note.diagnosis}}
- Follow-up instructions: {{note.follow_up_instr}}

PRESCRIPTIONS:
{{formatted_prescriptions_block}}

Respond with STRICT JSON only. Do not include markdown, code fences, or any text outside the JSON object.
The JSON must have exactly these keys:
  - visit_explanation: 2-4 sentences explaining what was discussed / the doctor assessment in simple patient language
  - medication_sched: a clear, easy-to-follow list of each medicine, how much, and when to take it (if no meds, explain that clearly)
  - follow_up_steps: clearly list any follow-up appointments, tests, or next steps the patient needs to take
  - instructions: important self-care instructions, red-flag symptoms to watch for, and any activity/diet restrictions

Example output format:
{
  "visit_explanation": "The doctor reviewed your symptoms and confirmed you have a mild upper respiratory infection. Your vitals were stable and lungs sounded clear.",
  "medication_sched": "1. Amoxicillin 500mg - Take 1 capsule 3 times per day for 10 days. Finish all pills even if you feel better. 2. Ibuprofen 200mg - Take 1-2 tablets every 6 hours as needed for pain or fever.",
  "follow_up_steps": "Return for a follow-up visit in 2 weeks if symptoms do not improve. Call the clinic immediately if you develop difficulty breathing or a fever over 102F.",
  "instructions": "Drink plenty of fluids and rest as much as possible. Avoid strenuous activity for the next 3 days. Monitor your temperature daily."
}
```

---

### 🔍 Output Schema & Zod Validation

```typescript
export const PostVisitOutputSchema = z.object({
  visit_explanation: z.string(),
  medication_sched: z.string(),
  follow_up_steps: z.string(),
  instructions: z.string(),
})
```

---

### 🗄️ Database Persistence Target
- **Table:** `post_visit_summaries`
- **Columns Written:**
  - `appointment_id`, `patient_id`, `doctor_id`, `note_id`
  - `visit_explanation`: Plain language visit overview
  - `medication_sched`: Medication regimen instructions
  - `follow_up_steps`: Follow-up appointments and lab tests
  - `instructions`: Self-care precautions and red-flag symptoms
  - `model`: `'gemini-3.6-flash'`
  - `prompt_version`: `'POSTVISIT_V1'`
  - `status`: `'COMPLETED'` (or `'FAILED'`)
  - `raw_response`: Full parsed JSON object
  - `generated_at`: ISO 8601 timestamp

---

### 💡 Verified Example

#### Input Payload
- **Doctor Diagnosis:** Acute Bronchitis
- **Doctor Notes:** Patient presented with a 4-day history of dry cough and mild chest soreness. Vitals stable; lungs clear with bilateral rhonchi. No signs of pneumonia.
- **Prescription:** Azithromycin 500mg, 1 tablet daily for 5 days with food.
- **Follow-up:** Review in 7 days if symptoms persist.

#### Validated AI Output
```json
{
  "visit_explanation": "The doctor examined you today for your cough and chest soreness and diagnosed you with acute bronchitis. Your vital signs were normal and your lungs showed no signs of pneumonia.",
  "medication_sched": "1. Azithromycin 500mg: Take 1 tablet once daily with food for 5 days. Be sure to finish the full 5-day course.",
  "follow_up_steps": "Schedule a follow-up appointment in 7 days if your cough or symptoms do not improve. Seek immediate medical attention if you experience severe shortness of breath or high fever.",
  "instructions": "Get plenty of rest and stay well hydrated. Avoid smoke exposure and strenuous physical activity until your cough subsides."
}
```

---

## 3. Safety, Medical Guardrails & Disclaimers

1. **System Directives:** Every prompt explicitly commands the model to act solely as a summarization or translation scribe and forbids generating autonomous diagnoses, prescribing unlisted medications, or offering speculative medical treatments.
2. **Authoritative Source of Truth:** Doctor clinical notes and official prescriptions remain the binding medical record; AI outputs are stored in separate dedicated summary tables.
3. **Mandatory UI Disclaimer:** All patient-facing AI outputs display a prominent notice:
   > *"AI-generated clinical decision-support. Not a medical diagnosis. Consult your healthcare provider for all medical decisions."*

---

## 4. Error Handling, Consent & Fallback Mechanisms

| Failure Scenario | Engine Behavior | Database Record | User Experience |
| :--- | :--- | :--- | :--- |
| **Patient declines consent** (`ai_processing_consent: false`) | AI invocation is bypassed entirely (`triggerOrSkip`). | Inserted with `status: 'FAILED'`, `error_message: 'Patient declined AI processing consent'`. | Intake saved normally without triggering LLM. |
| **`GEMINI_API_KEY` missing / invalid** | Caught in `getClient()` (`lib/ai/gemini.ts`) and caught by service boundary. | Inserted with `status: 'FAILED'`, `error_message: 'GEMINI_API_KEY is not configured'`. | Dashboard displays non-blocking failure notice with retry button. |
| **Network timeout / API failure** | Catches `Error` / HTTP status exceptions. | Inserted with `status: 'FAILED'`, `error_message: <API error message>`. | Outbox notifications continue; doctor consultation is not blocked. |
| **Malformed JSON / Code fences in response** | Regex clean strips ```` ```json ````; `JSON.parse` wrapped in `try/catch`. | If JSON unparseable: `status: 'FAILED'`, `error_message: 'JSON parse failed: ...'`. | Raw text preserved in `raw_response` for debugging. |
| **Zod Schema validation failure** | `PrevisitOutputSchema.safeParse` or `PostVisitOutputSchema.safeParse` detects missing keys or invalid arrays. | Inserted with `status: 'FAILED'`, `error_message: 'Zod validation failed: ...'`. | Clear error breakdown logged in `error_message`. |
