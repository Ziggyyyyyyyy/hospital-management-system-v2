import { z } from 'zod'
import { generateAIResponse } from './gemini'
import { createServiceClientRaw } from '../../utils/supabase/service'
import {
  fireNotification,
  buildAiSummaryReady,
  buildDedupeKey,
} from '../notifications/notification-service'

const POSTVISIT_MODEL = 'gemini-3.6-flash'
const POSTVISIT_PROMPT_VERSION = 'POSTVISIT_V1'

export const PostVisitOutputSchema = z.object({
  visit_explanation: z.string(),
  medication_sched: z.string(),
  follow_up_steps: z.string(),
  instructions: z.string(),
})

export type PostVisitOutput = z.infer<typeof PostVisitOutputSchema>

export interface PostVisitNote {
  note_id: number | bigint
  appointment_id: number | bigint
  patient_id: number | bigint
  doctor_id: number | bigint
  clinical_notes: string
  diagnosis?: string | null
  follow_up_instr?: string | null
}

export interface PrescriptionItem {
  medicine_name: string
  dosage: string
  frequency: string
  duration_days?: number | null
  quantity?: number | null
  instructions?: string | null
}

export interface Prescription {
  prescription_id?: number | bigint
  notes?: string | null
  items: PrescriptionItem[]
}

export interface PostVisitSummaryResult {
  status: 'COMPLETED' | 'FAILED'
  summary_id?: number | bigint
  visit_explanation?: string | null
  medication_sched?: string | null
  follow_up_steps?: string | null
  instructions?: string | null
  error_message?: string | null
}

export function buildPrompt(
  note: PostVisitNote,
  prescriptions: Prescription[],
): string {
  const diagnosisLine = note.diagnosis
    ? `- Doctor diagnosis: ${note.diagnosis}`
    : '- Doctor diagnosis: Not documented'

  const followUpLine = note.follow_up_instr
    ? `- Follow-up instructions: ${note.follow_up_instr}`
    : '- Follow-up instructions: None specified'

  const medsBlock: string[] = []
  if (prescriptions.length === 0) {
    medsBlock.push('No prescriptions issued for this visit.')
  } else {
    prescriptions.forEach((rx, rxIdx) => {
      medsBlock.push(`Prescription ${rxIdx + 1}${rx.notes ? ` (notes: ${rx.notes})` : ''}:`)
      if (rx.items.length === 0) {
        medsBlock.push('  (no items)')
      } else {
        rx.items.forEach((item) => {
          const parts: string[] = []
          parts.push(`- ${item.medicine_name}`)
          parts.push(`Dosage: ${item.dosage}`)
          parts.push(`Frequency: ${item.frequency}`)
          if (item.duration_days) parts.push(`Duration: ${item.duration_days} days`)
          if (item.quantity != null) parts.push(`Quantity: ${item.quantity}`)
          if (item.instructions) parts.push(`Special instructions: ${item.instructions}`)
          medsBlock.push('  ' + parts.join(' | '))
        })
      }
    })
  }

  return [
    'You are a patient-education assistant. Convert the doctor clinical notes',
    'into a friendly, plain-language summary the patient can easily understand.',
    'Use simple words. Do NOT add medical advice or warnings beyond what the doctor wrote.',
    'Do NOT invent any information - only use what is provided.',
    '',
    'DOCTOR CLINICAL NOTES (source of truth):',
    note.clinical_notes,
    '',
    diagnosisLine,
    followUpLine,
    '',
    'PRESCRIPTIONS:',
    medsBlock.join('\n'),
    '',
    'Respond with STRICT JSON only. Do not include markdown, code fences, or any text outside the JSON object.',
    'The JSON must have exactly these keys:',
    '  - visit_explanation: 2-4 sentences explaining what was discussed / the doctor assessment in simple patient language',
    '  - medication_sched: a clear, easy-to-follow list of each medicine, how much, and when to take it (if no meds, explain that clearly)',
    '  - follow_up_steps: clearly list any follow-up appointments, tests, or next steps the patient needs to take',
    '  - instructions: important self-care instructions, red-flag symptoms to watch for, and any activity/diet restrictions',
    '',
    'Example output format:',
    '{',
    '  "visit_explanation": "The doctor reviewed your symptoms and confirmed you have a mild upper respiratory infection. Your vitals were stable and lungs sounded clear.",',
    '  "medication_sched": "1. Amoxicillin 500mg - Take 1 capsule 3 times per day for 10 days. Finish all pills even if you feel better. 2. Ibuprofen 200mg - Take 1-2 tablets every 6 hours as needed for pain or fever.",',
    '  "follow_up_steps": "Return for a follow-up visit in 2 weeks if symptoms do not improve. Call the clinic immediately if you develop difficulty breathing or a fever over 102F.",',
    '  "instructions": "Drink plenty of fluids and rest as much as possible. Avoid strenuous activity for the next 3 days. Monitor your temperature daily."',
    '}',
  ].join('\n')
}

export async function generatePostVisitSummary(
  noteId: number | bigint,
): Promise<PostVisitSummaryResult> {
  const supabase = createServiceClientRaw()

  try {
    const { data: note, error: noteError } = await supabase
      .from('post_visit_notes')
      .select('*')
      .eq('note_id', String(noteId))
      .single()

    if (noteError || !note) {
      await _insertFailedSummary(
        supabase,
        null,
        `Post-visit note not found: ${noteError?.message ?? 'not found'}`,
      )
      return {
        status: 'FAILED',
        error_message: noteError?.message ?? 'Post-visit note not found',
      }
    }

    const typedNote = note as PostVisitNote

    const { data: rxData, error: rxError } = await supabase
      .from('prescriptions')
      .select(
        'prescription_id, notes, prescription_items(item_id, medicine_name, dosage, frequency, duration_days, quantity, instructions)',
      )
      .eq('appointment_id', String(typedNote.appointment_id))

    const prescriptions: Prescription[] = []
    if (!rxError && rxData) {
      for (const rx of rxData as Array<{
        prescription_id: number | bigint
        notes?: string | null
        prescription_items: PrescriptionItem[]
      }>) {
        prescriptions.push({
          prescription_id: rx.prescription_id,
          notes: rx.notes ?? null,
          items: (rx.prescription_items ?? []) as PrescriptionItem[],
        })
      }
    }

    const prompt = buildPrompt(typedNote, prescriptions)
    const rawResponse = await generateAIResponse(prompt)

    let parsed: unknown
    try {
      parsed = JSON.parse(rawResponse)
    } catch (parseErr) {
      const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)
      await _insertFailedSummary(
        supabase,
        typedNote,
        `JSON parse failed: ${errMsg}`,
        rawResponse,
      )
      return {
        status: 'FAILED',
        error_message: `Failed to parse AI response: ${errMsg}`,
      }
    }

    const validation = PostVisitOutputSchema.safeParse(parsed)
    if (!validation.success) {
      const errMsg = validation.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      await _insertFailedSummary(
        supabase,
        typedNote,
        `Zod validation failed: ${errMsg}`,
        parsed as Record<string, unknown>,
      )
      return {
        status: 'FAILED',
        error_message: `AI response validation failed: ${errMsg}`,
      }
    }

    const output = validation.data
    const generatedAt = new Date().toISOString()

    const { data: inserted, error: insertError } = await supabase
      .from('post_visit_summaries')
      .upsert(
        {
          appointment_id: typedNote.appointment_id,
          patient_id: typedNote.patient_id,
          doctor_id: typedNote.doctor_id,
          note_id: typedNote.note_id,
          visit_explanation: output.visit_explanation,
          medication_sched: output.medication_sched,
          follow_up_steps: output.follow_up_steps,
          instructions: output.instructions,
          model: POSTVISIT_MODEL,
          prompt_version: POSTVISIT_PROMPT_VERSION,
          status: 'COMPLETED',
          raw_response: parsed as Record<string, unknown>,
          error_message: null,
          generated_at: generatedAt,
        },
        { onConflict: 'appointment_id' },
      )
      .select('summary_id')
      .single()

    if (insertError) {
      return {
        status: 'FAILED',
        error_message: `DB insert failed: ${insertError.message}`,
      }
    }

    void (async () => {
      try {
        const { data: pData } = await supabase
          .from('patients')
          .select('patient_id, user_id, email, first_name, last_name')
          .eq('patient_id', String(typedNote.patient_id))
          .maybeSingle()
        if (pData && (pData as { email?: string }).email) {
          const p = pData as {
            patient_id: number
            user_id?: string | null
            email: string
            first_name?: string | null
            last_name?: string | null
          }
          const patientName = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Patient'
          const { subject, body } = buildAiSummaryReady({
            appointment_id: Number(typedNote.appointment_id),
            patient_name: patientName,
            summary_kind: 'Post-Visit',
            generated_at: generatedAt,
          })
          fireNotification({
            type: 'POSTVISIT_SUMMARY_READY',
            channel: 'EMAIL',
            recipient: p.email,
            subject,
            body,
            user_id: p.user_id ?? undefined,
            patient_id: p.patient_id,
            appointment_id: Number(typedNote.appointment_id),
            dedupe_key: buildDedupeKey([
              'POSTVISIT_SUMMARY_READY',
              String(typedNote.appointment_id),
              'EMAIL',
            ]),
          })
        }
      } catch {
        // swallow - never propagate notification errors
      }
    })().catch(() => {})

    return {
      status: 'COMPLETED',
      summary_id: inserted?.summary_id,
      visit_explanation: output.visit_explanation,
      medication_sched: output.medication_sched,
      follow_up_steps: output.follow_up_steps,
      instructions: output.instructions,
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    try {
      await _insertFailedSummary(supabase, null, `Uncaught error: ${errMsg}`)
    } catch {
      // swallow DB failures during fallback
    }
    return { status: 'FAILED', error_message: errMsg }
  }
}

async function _insertFailedSummary(
  supabase: ReturnType<typeof createServiceClientRaw>,
  note: PostVisitNote | null,
  errorMsg: string,
  rawResponse?: Record<string, unknown> | string,
): Promise<void> {
  try {
    let appointmentId: number | bigint | null = null
    let patientId: number | bigint | null = null
    let doctorId: number | bigint | null = null
    let noteIdVal: number | bigint | null = null

    if (note) {
      appointmentId = note.appointment_id
      patientId = note.patient_id
      doctorId = note.doctor_id
      noteIdVal = note.note_id
    } else {
      return
    }

    const rawPayload: Record<string, unknown> | null =
      typeof rawResponse === 'string'
        ? { raw_text: rawResponse }
        : rawResponse ?? null

    await supabase.from('post_visit_summaries').upsert(
      {
        appointment_id: appointmentId,
        patient_id: patientId,
        doctor_id: doctorId,
        note_id: noteIdVal,
        visit_explanation: '',
        medication_sched: '',
        follow_up_steps: '',
        instructions: '',
        model: POSTVISIT_MODEL,
        prompt_version: POSTVISIT_PROMPT_VERSION,
        status: 'FAILED',
        raw_response: rawPayload,
        error_message: errorMsg,
        generated_at: null,
      },
      { onConflict: 'appointment_id' },
    )
  } catch {
    // swallow all DB errors in failure path - never propagate
  }
}
