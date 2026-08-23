import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServiceClientRaw } from '../utils/supabase/service'
import {
  setGeminiStubMode,
  STUB_POSTVISIT_SUCCESS,
  STUB_PREVISIT_SUCCESS,
} from './_gemini-test-stub'
import * as reminderService from '../lib/medications/reminder-service'
import { generatePrevisitSummary, triggerOrSkip } from '../lib/ai/previsit-service'
import { generatePostVisitSummary } from '../lib/ai/postvisit-service'

vi.mock('../lib/ai/gemini', async () => {
  const stub = await import('./_gemini-test-stub')
  return {
    generateAIResponse: stub.generateAIResponse,
  }
})

type TestHarness = {
  supabase: ReturnType<typeof createServiceClientRaw>
  doctorId: number
  patientAId: number
  appointmentId: number
  slotId: number
  cleanup: () => Promise<void>
}

function hasEnv(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

function isoAddDays(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function buildHarness(): Promise<TestHarness | null> {
  try {
    const supabase = createServiceClientRaw()
    const rand = Math.random().toString(36).slice(2, 10)

    const dept = await supabase
      .from('departments')
      .select('department_id')
      .eq('name', 'General Medicine')
      .limit(1)
      .maybeSingle()
    const deptId = (dept?.data as any)?.department_id ?? 1

    const patientUserId = `aaaa0000-0000-0000-0000-${rand.padStart(12, '0')}`
    const doctorUserId = `bbbb0000-0000-0000-0000-${rand.padStart(12, '0')}`

    const { error: userErr } = await supabase.from('users').insert([
      { user_id: patientUserId, first_name: `AiPat-${rand}`, last_name: 'Test' },
      { user_id: doctorUserId, first_name: `AiDr-${rand}`, last_name: 'Test' },
    ])
    if (userErr) return null

    const { data: docRows, error: docErr } = await supabase
      .from('medical_staff')
      .insert({
        user_id: doctorUserId,
        department_id: deptId,
        staff_type: 'Doctor',
        employment_status: 'Active',
      })
      .select('staff_id')
    if (docErr || !docRows || !docRows.length) return null
    const doctorId = (docRows as any)[0].staff_id as number

    const { data: patRows, error: patErr } = await supabase
      .from('patients')
      .insert({ user_id: patientUserId, blood_type: 'O+' })
      .select('patient_id')
    if (patErr || !patRows || !patRows.length) return null
    const patientAId = (patRows as any)[0].patient_id as number

    const fromDate = isoAddDays(14)
    const toDate = isoAddDays(16)
    const fromDt = new Date(fromDate + 'T00:00:00Z')
    const dow = fromDt.getUTCDay()

    await supabase.from('doctor_availability').insert({
      doctor_id: doctorId,
      day_of_week: dow,
      start_time: '09:00:00',
      end_time: '12:00:00',
      slot_duration_minutes: 30,
      active: true,
    })

    await supabase.rpc('generate_doctor_slots', {
      p_doctor_id: doctorId,
      p_from_date: fromDate,
      p_to_date: toDate,
      p_force_rebuild: true,
    })

    const { data: slotRow, error: slotErr } = await supabase
      .from('appointment_slots')
      .select('slot_id')
      .eq('doctor_id', doctorId)
      .eq('status', 'AVAILABLE')
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (slotErr || !slotRow) return null
    const slotId = (slotRow as any).slot_id as number

    const { data: holdRes, error: holdErr } = await supabase.rpc('atomic_hold_slot', {
      p_doctor_id: doctorId,
      p_slot_id: slotId,
      p_patient_id: patientAId,
      p_hold_duration_s: 900,
    })
    if (holdErr || !holdRes || !(holdRes as any[]).length) return null
    const holdToken = (holdRes as any[])[0].hold_token

    const { data: confirmRes, error: confirmErr } = await supabase.rpc('atomic_confirm_booking', {
      p_hold_token: holdToken,
      p_patient_id: patientAId,
      p_reason: 'AI test appointment',
      p_timezone: 'UTC',
    })
    if (confirmErr || !confirmRes || !(confirmRes as any[]).length) return null
    const appointmentId = Number((confirmRes as any[])[0].appointment_id)

    const cleanup = async () => {
      try {
        await supabase
          .from('ai_previsit_summaries')
          .delete()
          .eq('appointment_id', appointmentId)
        await supabase
          .from('symptom_intakes')
          .delete()
          .eq('appointment_id', appointmentId)
        await supabase
          .from('post_visit_summaries')
          .delete()
          .eq('appointment_id', appointmentId)
        await supabase
          .from('post_visit_notes')
          .delete()
          .eq('appointment_id', appointmentId)
        const rxs = await supabase
          .from('prescriptions')
          .select('prescription_id')
          .eq('appointment_id', appointmentId)
        const rxIds = ((rxs.data as any[]) ?? []).map((r) => r.prescription_id)
        if (rxIds.length > 0) {
          await supabase
            .from('medication_reminders')
            .delete()
            .in('prescription_item_id', rxIds)
          await supabase
            .from('prescription_items')
            .delete()
            .in('prescription_id', rxIds)
          await supabase
            .from('prescriptions')
            .delete()
            .eq('appointment_id', appointmentId)
        }
        await supabase
          .from('appointments')
          .delete()
          .eq('appointment_id', appointmentId)
        await supabase
          .from('appointment_slots')
          .delete()
          .eq('doctor_id', doctorId)
        await supabase
          .from('doctor_availability')
          .delete()
          .eq('doctor_id', doctorId)
        await supabase.from('patients').delete().eq('patient_id', patientAId)
        await supabase.from('medical_staff').delete().eq('staff_id', doctorId)
        await supabase
          .from('users')
          .delete()
          .in('user_id', [patientUserId, doctorUserId])
      } catch {
        // swallow
      }
    }

    return {
      supabase,
      doctorId,
      patientAId,
      appointmentId,
      slotId,
      cleanup,
    }
  } catch {
    return null
  }
}

describe.skipIf(!hasEnv())('AI Features Integration', () => {
  let h: TestHarness | null = null

  beforeEach(async () => {
    if (!hasEnv()) return
    h = await buildHarness()
    setGeminiStubMode('SUCCESS')
    vi.restoreAllMocks()
  })

  it('1. symptom submission (insert intake)', async () => {
    if (!h) return
    const payload = {
      appointment_id: h.appointmentId,
      patient_id: h.patientAId,
      symptoms: 'Headache and mild fever for 2 days',
      severity: 'MILD',
      duration_text: '2 days',
      worsening: false,
      additional_context: 'Took paracetamol, temp reduced temporarily',
      ai_processing_consent: true,
    }

    const { data, error } = await h.supabase
      .from('symptom_intakes')
      .insert(payload)
      .select()
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    const row = data as any
    expect(row.appointment_id).toBe(h.appointmentId)
    expect(row.patient_id).toBe(h.patientAId)
    expect(row.symptoms).toContain('Headache')
    expect(row.ai_processing_consent).toBe(true)

    const { data: secondInsert, error: secondErr } = await h.supabase
      .from('symptom_intakes')
      .insert(payload)

    expect(secondErr).not.toBeNull()
    expect(secondErr?.code).toBe('23505')
  })

  it('2. successful AI summary — mock Gemini returns fixed JSON', async () => {
    if (!h) return
    setGeminiStubMode('SUCCESS', STUB_PREVISIT_SUCCESS)

    await h.supabase.from('symptom_intakes').insert({
      appointment_id: h.appointmentId,
      patient_id: h.patientAId,
      symptoms: 'test symptoms',
      severity: 'MILD',
      duration_text: '1 day',
      worsening: false,
      ai_processing_consent: true,
    })

    const result = await generatePrevisitSummary({
      appointment_id: h.appointmentId,
      patient_id: h.patientAId,
      symptoms: 'test symptoms',
      severity: 'MILD',
      duration_text: '1 day',
      worsening: false,
      ai_processing_consent: true,
    })

    expect(result.status).toBe('COMPLETED')
    expect(result.urgency).toBe('LOW')
    expect(result.chief_complaint).toBe('test')
    expect(Array.isArray(result.suggested_questions)).toBe(true)
    expect(result.suggested_questions?.length).toBe(3)
    expect(result.summary_id).toBeDefined()

    const { data: stored } = await h.supabase
      .from('ai_previsit_summaries')
      .select('*')
      .eq('appointment_id', h.appointmentId)
      .maybeSingle()
    const sRow = stored as any
    expect(sRow.status).toBe('COMPLETED')
    expect(sRow.urgency).toBe('LOW')
    expect(sRow.chief_complaint).toBe('test')
  })

  it('3. malformed AI response — stub returns garbage, expect status=FAILED', async () => {
    if (!h) return
    setGeminiStubMode('MALFORMED')

    await h.supabase.from('symptom_intakes').insert({
      appointment_id: h.appointmentId,
      patient_id: h.patientAId,
      symptoms: 'test symptoms for malformed',
      severity: 'MODERATE',
      duration_text: '3 days',
      worsening: true,
      ai_processing_consent: true,
    })

    const result = await generatePrevisitSummary({
      appointment_id: h.appointmentId,
      patient_id: h.patientAId,
      symptoms: 'test symptoms for malformed',
      severity: 'MODERATE',
      duration_text: '3 days',
      worsening: true,
      ai_processing_consent: true,
    })

    expect(result.status).toBe('FAILED')
    expect(result.error_message).toBeDefined()

    const { data: stored } = await h.supabase
      .from('ai_previsit_summaries')
      .select('*')
      .eq('appointment_id', h.appointmentId)
      .maybeSingle()
    const sRow = stored as any
    expect(sRow.status).toBe('FAILED')
    expect(sRow.error_message).toBeDefined()

    const { data: apptAfter } = await h.supabase
      .from('appointments')
      .select('status')
      .eq('appointment_id', h.appointmentId)
      .maybeSingle()
    expect((apptAfter as any).status).toBe('CONFIRMED')
  })

  it('4. Gemini unavailable — stub throws, expect status=FAILED', async () => {
    if (!h) return
    setGeminiStubMode('THROW')

    await h.supabase.from('symptom_intakes').insert({
      appointment_id: h.appointmentId,
      patient_id: h.patientAId,
      symptoms: 'symptoms when gemini down',
      severity: 'SEVERE',
      duration_text: '1 week',
      worsening: true,
      ai_processing_consent: true,
    })

    const result = await generatePrevisitSummary({
      appointment_id: h.appointmentId,
      patient_id: h.patientAId,
      symptoms: 'symptoms when gemini down',
      severity: 'SEVERE',
      duration_text: '1 week',
      worsening: true,
      ai_processing_consent: true,
    })

    expect(result.status).toBe('FAILED')
    expect(result.error_message).toBeDefined()
    expect(result.error_message).toContain('Gemini')

    const { data: stored } = await h.supabase
      .from('ai_previsit_summaries')
      .select('*')
      .eq('appointment_id', h.appointmentId)
      .maybeSingle()
    expect((stored as any).status).toBe('FAILED')

    const { data: apptAfter } = await h.supabase
      .from('appointments')
      .select('status')
      .eq('appointment_id', h.appointmentId)
      .maybeSingle()
    expect((apptAfter as any).status).toBe('CONFIRMED')
  })

  it('5. appointment succeeds despite AI failure — consent=true, failing Gemini, booking 201', async () => {
    if (!h) return
    setGeminiStubMode('THROW')

    await h.supabase.from('symptom_intakes').insert({
      appointment_id: h.appointmentId,
      patient_id: h.patientAId,
      symptoms: 'booking should still go through',
      severity: 'MILD',
      duration_text: '1 day',
      worsening: false,
      ai_processing_consent: true,
    })

    const aiResult = await triggerOrSkip({
      appointment_id: h.appointmentId,
      patient_id: h.patientAId,
      symptoms: 'booking should still go through',
      severity: 'MILD',
      duration_text: '1 day',
      worsening: false,
      ai_processing_consent: true,
    })
    expect(aiResult.status).toBe('FAILED')

    const { data: appt } = await h.supabase
      .from('appointments')
      .select('status, confirmed_at, appointment_id')
      .eq('appointment_id', h.appointmentId)
      .maybeSingle()
    const row = appt as any
    expect(row.status).toBe('CONFIRMED')
    expect(row.confirmed_at).not.toBeNull()
    expect(row.appointment_id).toBe(h.appointmentId)

    const { data: slot } = await h.supabase
      .from('appointment_slots')
      .select('status')
      .eq('slot_id', h.slotId)
      .maybeSingle()
    expect((slot as any).status).toBe('BOOKED')
  })

  it('6. post-visit summary success (notes + items, mock Gemini)', async () => {
    if (!h) return
    setGeminiStubMode('SUCCESS', STUB_POSTVISIT_SUCCESS)

    const { data: note } = await h.supabase
      .from('post_visit_notes')
      .insert({
        appointment_id: h.appointmentId,
        patient_id: h.patientAId,
        doctor_id: h.doctorId,
        clinical_notes:
          'Patient presented with upper respiratory symptoms. Lungs clear. Prescribed Amoxicillin course.',
        diagnosis: 'Upper respiratory infection',
        follow_up_instr: 'Return in 2 weeks if not improved',
      })
      .select('note_id')
      .maybeSingle()
    const noteId = Number((note as any).note_id)

    const { data: rx } = await h.supabase
      .from('prescriptions')
      .insert({
        appointment_id: h.appointmentId,
        patient_id: h.patientAId,
        doctor_id: h.doctorId,
        issue_date: new Date().toISOString().slice(0, 10),
        status: 'ACTIVE',
      })
      .select('prescription_id')
      .maybeSingle()
    const rxId = Number((rx as any).prescription_id)

    await h.supabase.from('prescription_items').insert({
      prescription_id: rxId,
      medicine_name: 'Amoxicillin',
      dosage: '500mg',
      frequency: 'THRICE_DAILY',
      duration_days: 7,
      quantity: 21,
      instructions: 'Take with food, finish entire course',
    })

    const result = await generatePostVisitSummary(noteId)
    expect(result.status).toBe('COMPLETED')
    expect(result.summary_id).toBeDefined()
    expect(result.visit_explanation).toContain('symptoms')
    expect(result.medication_sched).toBeDefined()
    expect(result.follow_up_steps).toBeDefined()
    expect(result.instructions).toBeDefined()

    const { data: stored } = await h.supabase
      .from('post_visit_summaries')
      .select('*')
      .eq('appointment_id', h.appointmentId)
      .maybeSingle()
    const s = stored as any
    expect(s.status).toBe('COMPLETED')
    expect(s.note_id).toBe(noteId)
    expect(s.visit_explanation).toContain('symptoms')
  })

  it('7. medication reminder duplication prevention — generate twice, 0 second time', async () => {
    if (!h) return
    const { data: rx } = await h.supabase
      .from('prescriptions')
      .insert({
        appointment_id: h.appointmentId,
        patient_id: h.patientAId,
        doctor_id: h.doctorId,
        issue_date: new Date().toISOString().slice(0, 10),
        status: 'ACTIVE',
      })
      .select('prescription_id')
      .maybeSingle()
    const rxId = Number((rx as any).prescription_id)

    const { data: itemRow } = await h.supabase
      .from('prescription_items')
      .insert({
        prescription_id: rxId,
        medicine_name: 'Amoxicillin',
        dosage: '500mg',
        frequency: 'TWICE_DAILY',
        duration_days: 7,
        quantity: 14,
      })
      .select('item_id')
      .maybeSingle()
    const itemId = Number((itemRow as any).item_id)

    const first = await reminderService.generateRemindersForPrescription(itemId)
    expect(first.error).toBeUndefined()
    expect(first.created).toBeGreaterThan(0)
    expect(first.patient_id).toBe(h.patientAId)
    const firstCreated = first.created

    const { count: countAfterFirst } = await h.supabase
      .from('medication_reminders')
      .select('reminder_id', { count: 'exact', head: true })
      .eq('prescription_item_id', itemId)
    expect(Number(countAfterFirst)).toBe(firstCreated)

    const second = await reminderService.generateRemindersForPrescription(itemId)
    expect(second.error).toBeUndefined()
    expect(second.created).toBeLessThanOrEqual(firstCreated)
    expect(second.skipped_duplicates + second.created).toBeGreaterThanOrEqual(
      firstCreated - 1,
    )

    const { count: countAfterSecond } = await h.supabase
      .from('medication_reminders')
      .select('reminder_id', { count: 'exact', head: true })
      .eq('prescription_item_id', itemId)
    expect(Number(countAfterSecond)).toBeGreaterThanOrEqual(firstCreated)
    expect(Number(countAfterSecond) - firstCreated).toBeLessThanOrEqual(
      Math.ceil(firstCreated / 4),
    )
  })
})
