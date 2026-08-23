import { z } from 'zod'
import { generateAIResponse } from './gemini'
import { createServiceClientRaw } from '../../utils/supabase/service'
import {
  fireNotification,
  buildAiSummaryReady,
  buildDedupeKey,
} from '../notifications/notification-service'

const PREVISIT_MODEL = 'gemini-3.6-flash'
const PREVISIT_PROMPT_VERSION = 'PREVISIT_V1'

export const PrevisitOutputSchema = z.object({
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  chief_complaint: z.string(),
  suggested_questions: z.array(z.string()).length(3),
})

export type PrevisitOutput = z.infer<typeof PrevisitOutputSchema>

export interface SymptomIntake {
  symptom_intake_id?: number | bigint
  appointment_id: number | bigint
  patient_id: number | bigint
  symptoms: string
  severity?: string | null
  duration_text?: string | null
  worsening?: boolean | null
  additional_context?: string | null
  ai_processing_consent: boolean
}

export interface PrevisitSummaryResult {
  status: 'COMPLETED' | 'FAILED' | 'SKIPPED'
  summary_id?: number | bigint
  urgency?: string | null
  chief_complaint?: string | null
  suggested_questions?: string[] | null
  error_message?: string | null
}

export function buildPrompt(intake: SymptomIntake): string {
  const severityLine = intake.severity
    ? `- Severity: ${intake.severity}`
    : '- Severity: Not specified'

  const durationLine = intake.duration_text
    ? `- Duration: ${intake.duration_text}`
    : '- Duration: Not specified'

  const worseningLine =
    intake.worsening === true
      ? '- Worsening: Yes, symptoms are getting worse'
      : intake.worsening === false
        ? '- Worsening: No, symptoms are stable'
        : '- Worsening: Not specified'

  const contextLine = intake.additional_context
    ? `- Additional context: ${intake.additional_context}`
    : '- Additional context: None provided'

  return [
    'You are a medical scribe assistant preparing a pre-visit summary for a doctor.',
    'Your ONLY task is to SUMMARIZE the patient reported symptoms and context.',
    'DO NOT provide any diagnosis, medical advice, or treatment recommendations.',
    'DO NOT guess or infer conditions beyond what is explicitly stated.',
    '',
    'Patient reported symptoms and details:',
    `- Symptoms: ${intake.symptoms}`,
    severityLine,
    durationLine,
    worseningLine,
    contextLine,
    '',
    'Respond with STRICT JSON only. Do not include markdown, code fences, or any text outside the JSON object.',
    'The JSON must have exactly these keys:',
    '  - urgency: one of "LOW", "MEDIUM", "HIGH" based ONLY on reported severity and worsening',
    '  - chief_complaint: a concise 1-2 sentence summary of the patient main issue',
    '  - suggested_questions: an array of EXACTLY 3 clarifying questions the doctor may want to ask (do NOT answer them)',
    '',
    'Example output format:',
    '{',
    '  "urgency": "MEDIUM",',
    '  "chief_complaint": "Patient reports a 3-day history of headache with moderate intensity.",',
    '  "suggested_questions": [',
    '    "Does the headache occur at a specific time of day?",',
    '    "Have you tried any medications for relief?",',
    '    "Is there any associated nausea or visual changes?"',
    '  ]',
    '}',
  ].join('\n')
}

export async function generatePrevisitSummary(
  intake: SymptomIntake,
): Promise<PrevisitSummaryResult> {
  const supabase = createServiceClientRaw()

  try {
    const { data: apptData, error: apptError } = await supabase
      .from('appointments')
      .select('appointment_id, patient_id, doctor_id')
      .eq('appointment_id', String(intake.appointment_id))
      .single()

    if (apptError || !apptData) {
      await _insertFailedSummary(
        supabase,
        intake,
        null,
        `Appointment lookup failed: ${apptError?.message ?? 'not found'}`,
      )
      return { status: 'FAILED', error_message: apptError?.message ?? 'Appointment not found' }
    }

    const prompt = buildPrompt(intake)
    const rawResponse = await generateAIResponse(prompt)

    let parsed: unknown
    try {
      const cleaned = rawResponse
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
      parsed = JSON.parse(cleaned)
    } catch (parseErr) {
      const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)
      await _insertFailedSummary(supabase, intake, apptData.doctor_id, `JSON parse failed: ${errMsg}`, rawResponse)
      return { status: 'FAILED', error_message: `Failed to parse AI response: ${errMsg}` }
    }

    const validation = PrevisitOutputSchema.safeParse(parsed)
    if (!validation.success) {
      const errMsg = validation.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      await _insertFailedSummary(
        supabase,
        intake,
        apptData.doctor_id,
        `Zod validation failed: ${errMsg}`,
        parsed as Record<string, unknown>,
      )
      return { status: 'FAILED', error_message: `AI response validation failed: ${errMsg}` }
    }

    const output = validation.data
    const generatedAt = new Date().toISOString()

    const { data: inserted, error: insertError } = await supabase
      .from('ai_previsit_summaries')
      .upsert(
        {
          appointment_id: intake.appointment_id,
          patient_id: apptData.patient_id,
          doctor_id: apptData.doctor_id,
          urgency: output.urgency,
          chief_complaint: output.chief_complaint,
          suggested_questions: output.suggested_questions as unknown as JsonArray,
          model: PREVISIT_MODEL,
          prompt_version: PREVISIT_PROMPT_VERSION,
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
          .select('patient_id, user_id, users(first_name, last_name)')
          .eq('patient_id', String(apptData.patient_id))
          .maybeSingle()

        if (pData?.user_id) {
          const { data: authUser } = await supabase.auth.admin.getUserById(pData.user_id)
          const email = authUser?.user?.email
          if (email) {
            const usersObj = (pData as any).users
            const patientName = [usersObj?.first_name, usersObj?.last_name].filter(Boolean).join(' ') || 'Patient'
            const { subject, body } = buildAiSummaryReady({
              appointment_id: Number(intake.appointment_id),
              patient_name: patientName,
              summary_kind: 'Pre-Visit',
              generated_at: generatedAt,
            })
            fireNotification({
              type: 'PREVISIT_SUMMARY_READY',
              channel: 'EMAIL',
              recipient: email,
              subject,
              body,
              user_id: pData.user_id,
              patient_id: Number(pData.patient_id),
              appointment_id: Number(intake.appointment_id),
              dedupe_key: buildDedupeKey([
                'PREVISIT_SUMMARY_READY',
                String(intake.appointment_id),
                'EMAIL',
              ]),
            })
          }
        }
      } catch {
        // swallow - never propagate notification errors
      }
    })().catch(() => {})

    return {
      status: 'COMPLETED',
      summary_id: inserted?.summary_id,
      urgency: output.urgency,
      chief_complaint: output.chief_complaint,
      suggested_questions: output.suggested_questions,
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    try {
      await _insertFailedSummary(supabase, intake, null, `Uncaught error: ${errMsg}`)
    } catch {
      // swallow DB failures during fallback
    }
    return { status: 'FAILED', error_message: errMsg }
  }
}

export async function triggerOrSkip(
  intake: SymptomIntake,
): Promise<PrevisitSummaryResult> {
  if (!intake.ai_processing_consent) {
    const supabase = createServiceClientRaw()
    try {
      const { data: apptData } = await supabase
        .from('appointments')
        .select('appointment_id, patient_id, doctor_id')
        .eq('appointment_id', String(intake.appointment_id))
        .single()

      if (apptData) {
        await supabase.from('ai_previsit_summaries').upsert(
          {
            appointment_id: intake.appointment_id,
            patient_id: apptData.patient_id,
            doctor_id: apptData.doctor_id,
            urgency: null,
            chief_complaint: null,
            suggested_questions: [],
            model: PREVISIT_MODEL,
            prompt_version: PREVISIT_PROMPT_VERSION,
            status: 'FAILED',
            raw_response: null,
            error_message: 'Patient declined AI processing consent',
            generated_at: null,
          },
          { onConflict: 'appointment_id' },
        )
      }
    } catch {
      // swallow - consent skip is advisory only
    }
    return {
      status: 'SKIPPED',
      error_message: 'Patient declined AI processing consent',
    }
  }

  return generatePrevisitSummary(intake)
}

type JsonArray = string[]

async function _insertFailedSummary(
  supabase: ReturnType<typeof createServiceClientRaw>,
  intake: SymptomIntake,
  doctorIdFallback: number | bigint | null,
  errorMsg: string,
  rawResponse?: Record<string, unknown> | string,
): Promise<void> {
  try {
    const doctorId =
      doctorIdFallback ??
      (
        await supabase
          .from('appointments')
          .select('doctor_id, patient_id')
          .eq('appointment_id', String(intake.appointment_id))
          .single()
      ).data?.doctor_id

    const patientId =
      intake.patient_id ??
      (
        await supabase
          .from('appointments')
          .select('patient_id')
          .eq('appointment_id', String(intake.appointment_id))
          .single()
      ).data?.patient_id

    if (!doctorId || !patientId) return

    const rawPayload: Record<string, unknown> | null =
      typeof rawResponse === 'string'
        ? { raw_text: rawResponse }
        : rawResponse ?? null

    await supabase.from('ai_previsit_summaries').upsert(
      {
        appointment_id: intake.appointment_id,
        patient_id: patientId,
        doctor_id: doctorId,
        urgency: null,
        chief_complaint: null,
        suggested_questions: [],
        model: PREVISIT_MODEL,
        prompt_version: PREVISIT_PROMPT_VERSION,
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
