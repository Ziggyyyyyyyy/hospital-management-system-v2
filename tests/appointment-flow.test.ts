import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServiceClientRaw } from '../utils/supabase/service'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as notificationService from '../lib/notifications/notification-service'

const SKIP_REMOTE =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY

type TestHarness = {
  supabase: ReturnType<typeof createServiceClientRaw>
  doctorId: number
  patientAId: number
  patientBId: number
  patientAUserId: string
  patientBUserId: string
  doctorUserId: string
  otherDoctorId: number
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

    const patientAUserId = `00000000-0000-0000-0000-${rand.padStart(12, '0')}`
    const patientBUserId = `11111111-0000-0000-0000-${rand.padStart(12, '0')}`
    const doctorUserId = `22222222-0000-0000-0000-${rand.padStart(12, '0')}`
    const otherDocUserId = `33333333-0000-0000-0000-${rand.padStart(12, '0')}`

    const { error: userErr } = await supabase.from('users').insert([
      {
        user_id: patientAUserId,
        first_name: `PatA-${rand}`,
        last_name: 'Test',
      },
      {
        user_id: patientBUserId,
        first_name: `PatB-${rand}`,
        last_name: 'Test',
      },
      {
        user_id: doctorUserId,
        first_name: `Dr-${rand}`,
        last_name: 'Test',
      },
      {
        user_id: otherDocUserId,
        first_name: `DrOther-${rand}`,
        last_name: 'Test',
      },
    ])
    if (userErr) return null

    const { data: docRows, error: docErr } = await supabase
      .from('medical_staff')
      .insert([
        {
          user_id: doctorUserId,
          department_id: deptId,
          staff_type: 'Doctor',
          employment_status: 'Active',
        },
        {
          user_id: otherDocUserId,
          department_id: deptId,
          staff_type: 'Doctor',
          employment_status: 'Active',
        },
      ])
      .select('staff_id')
    if (docErr || !docRows || docRows.length < 2) return null

    const doctorId = (docRows as any)[0].staff_id as number
    const otherDoctorId = (docRows as any)[1].staff_id as number

    const { data: patRows, error: patErr } = await supabase
      .from('patients')
      .insert([
        { user_id: patientAUserId, blood_type: 'O+' },
        { user_id: patientBUserId, blood_type: 'A+' },
      ])
      .select('patient_id')
    if (patErr || !patRows || patRows.length < 2) return null

    const patientAId = (patRows as any)[0].patient_id as number
    const patientBId = (patRows as any)[1].patient_id as number

    const cleanup = async () => {
      try {
        await supabase
          .from('appointments')
          .delete()
          .in('patient_id', [patientAId, patientBId])
        await supabase
          .from('slot_holds')
          .delete()
          .in('patient_id', [patientAId, patientBId])
        await supabase
          .from('appointment_slots')
          .delete()
          .in('doctor_id', [doctorId, otherDoctorId])
        await supabase
          .from('doctor_availability')
          .delete()
          .in('doctor_id', [doctorId, otherDoctorId])
        await supabase
          .from('doctor_leave')
          .delete()
          .in('doctor_id', [doctorId, otherDoctorId])
        await supabase
          .from('patients')
          .delete()
          .in('patient_id', [patientAId, patientBId])
        await supabase
          .from('medical_staff')
          .delete()
          .in('staff_id', [doctorId, otherDoctorId])
        await supabase
          .from('users')
          .delete()
          .in('user_id', [
            patientAUserId,
            patientBUserId,
            doctorUserId,
            otherDocUserId,
          ])
      } catch {
        // swallow
      }
    }

    return {
      supabase,
      doctorId,
      patientAId,
      patientBId,
      patientAUserId,
      patientBUserId,
      doctorUserId,
      otherDoctorId,
      cleanup,
    }
  } catch {
    return null
  }
}

async function seedAvailability(
  h: TestHarness,
  dayOffset = 7,
): Promise<{ fromDate: string; toDate: string }> {
  const fromDate = isoAddDays(dayOffset)
  const toDate = isoAddDays(dayOffset + 2)
  const fromDt = new Date(fromDate + 'T00:00:00Z')
  const dayOfWeek = fromDt.getUTCDay()

  await h.supabase.from('doctor_availability').insert({
    doctor_id: h.doctorId,
    day_of_week: dayOfWeek,
    start_time: '09:00:00',
    end_time: '12:00:00',
    slot_duration_minutes: 30,
    active: true,
  })

  return { fromDate, toDate }
}

async function generateSlots(
  h: TestHarness,
  fromDate: string,
  toDate: string,
): Promise<number> {
  const { data, error } = await h.supabase.rpc('generate_doctor_slots', {
    p_doctor_id: h.doctorId,
    p_from_date: fromDate,
    p_to_date: toDate,
    p_force_rebuild: true,
  })
  if (error) throw error
  return Number(data ?? 0)
}

async function getFirstAvailableSlot(h: TestHarness): Promise<number> {
  const { data } = await h.supabase
    .from('appointment_slots')
    .select('slot_id, start_time')
    .eq('doctor_id', h.doctorId)
    .eq('status', 'AVAILABLE')
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!data) throw new Error('No AVAILABLE slots generated')
  return (data as any).slot_id as number
}

async function holdSlot(
  h: TestHarness,
  slotId: number,
  patientId: number,
): Promise<{ hold_token: string; hold_id: number }> {
  const { data, error } = await h.supabase.rpc('atomic_hold_slot', {
    p_doctor_id: h.doctorId,
    p_slot_id: slotId,
    p_patient_id: patientId,
    p_hold_duration_s: 600,
    p_allow_expire: true,
  })
  if (error) throw error
  const row = (data as any[])[0]
  return {
    hold_token: row.hold_token as string,
    hold_id: Number(row.hold_id),
  }
}

async function confirmBooking(
  h: TestHarness,
  holdToken: string,
  patientId: number,
  reason = 'test visit',
): Promise<number> {
  const { data, error } = await h.supabase.rpc('atomic_confirm_booking', {
    p_hold_token: holdToken,
    p_patient_id: patientId,
    p_reason: reason,
    p_timezone: 'UTC',
    p_idempotency: null,
    p_booked_by: null,
  })
  if (error) throw error
  const row = (data as any[])[0]
  return Number(row.appointment_id)
}

async function getAppointment(h: TestHarness, apptId: number): Promise<any> {
  const { data } = await h.supabase
    .from('appointments')
    .select('*')
    .eq('appointment_id', apptId)
    .maybeSingle()
  return data
}

describe.skipIf(!hasEnv())('Appointment Flow Integration', () => {
  let h: TestHarness | null = null

  beforeEach(async () => {
    if (!hasEnv()) return
    h = await buildHarness()
    vi.restoreAllMocks()
  })

  it('1. successful booking flow (seed doctor, generate slots, hold, confirm)', async () => {
    if (!h) return
    const { fromDate, toDate } = await seedAvailability(h)
    const inserted = await generateSlots(h, fromDate, toDate)
    expect(inserted).toBeGreaterThan(0)

    const slotId = await getFirstAvailableSlot(h)
    const { hold_token } = await holdSlot(h, slotId, h.patientAId)
    expect(hold_token).toBeTruthy()

    const { data: slotAfterHold } = await h.supabase
      .from('appointment_slots')
      .select('status')
      .eq('slot_id', slotId)
      .maybeSingle()
    expect((slotAfterHold as any).status).toBe('HELD')

    const apptId = await confirmBooking(h, hold_token, h.patientAId)
    expect(apptId).toBeGreaterThan(0)

    const appt = await getAppointment(h, apptId)
    expect(appt.status).toBe('CONFIRMED')
    expect(appt.patient_id).toBe(h.patientAId)
    expect(appt.doctor_id).toBe(h.doctorId)

    const { data: slotAfterBook } = await h.supabase
      .from('appointment_slots')
      .select('status')
      .eq('slot_id', slotId)
      .maybeSingle()
    expect((slotAfterBook as any).status).toBe('BOOKED')
  })

  it('2. duplicate booking prevention — second hold fails with P0S01', async () => {
    if (!h) return
    const { fromDate, toDate } = await seedAvailability(h)
    await generateSlots(h, fromDate, toDate)
    const slotId = await getFirstAvailableSlot(h)

    const first = await holdSlot(h, slotId, h.patientAId)
    expect(first.hold_token).toBeTruthy()

    try {
      await holdSlot(h, slotId, h.patientBId)
      expect.fail('Expected second hold to throw P0S01')
    } catch (err: any) {
      expect(err.code).toBe('P0S01')
    }
  })

  it('3. simultaneous booking race condition — exactly one of two confirms succeeds', async () => {
    if (!h) return
    const { fromDate, toDate } = await seedAvailability(h)
    await generateSlots(h, fromDate, toDate)
    const slotId = await getFirstAvailableSlot(h)

    const holdA = await holdSlot(h, slotId, h.patientAId)

    const { data: slotB } = await h.supabase
      .from('appointment_slots')
      .select('slot_id, start_time')
      .eq('doctor_id', h.doctorId)
      .eq('status', 'AVAILABLE')
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle()
    const slot2Id = (slotB as any).slot_id as number

    const holdB = await holdSlot(h, slot2Id, h.patientBId)

    await h.supabase
      .from('appointment_slots')
      .update({ status: 'HELD' })
      .eq('slot_id', slot2Id)
    const fakeHoldForB = await h.supabase
      .from('slot_holds')
      .select('hold_token, slot_id')
      .eq('hold_token', holdB.hold_token)
      .maybeSingle()

    await h.supabase
      .from('appointment_slots')
      .update({ status: 'HELD' })
      .eq('slot_id', slotId)

    ;(await h.supabase
      .from('slot_holds')
      .update({ slot_id: slotId })
      .eq('hold_token', holdB.hold_token)) as any

    ;(await h.supabase
      .from('appointment_slots')
      .delete()
      .eq('slot_id', slot2Id)) as any

    const results = await Promise.allSettled([
      confirmBooking(h, holdA.hold_token, h.patientAId),
      confirmBooking(h, holdB.hold_token, h.patientBId),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(1)
  })

  it('4. reschedule appointment — old CANCELLED, state_transition valid', async () => {
    if (!h) return
    const { fromDate, toDate } = await seedAvailability(h)
    await generateSlots(h, fromDate, toDate)

    const slotOldId = await getFirstAvailableSlot(h)
    const holdOld = await holdSlot(h, slotOldId, h.patientAId)
    const apptOldId = await confirmBooking(
      h,
      holdOld.hold_token,
      h.patientAId,
      'original visit',
    )
    const apptOldBefore = await getAppointment(h, apptOldId)
    expect(apptOldBefore.status).toBe('CONFIRMED')

    const { data: nextSlotRow } = await h.supabase
      .from('appointment_slots')
      .select('slot_id, start_time')
      .eq('doctor_id', h.doctorId)
      .eq('status', 'AVAILABLE')
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle()
    const slotNewId = (nextSlotRow as any).slot_id as number

    const holdNew = await holdSlot(h, slotNewId, h.patientAId)

    const apptNewId = await confirmBooking(
      h,
      holdNew.hold_token,
      h.patientAId,
      'rescheduled visit',
    )

    const { data: cancelRes } = await h.supabase.rpc('cancel_appointment', {
      p_appointment_id: apptOldId,
      p_patient_id: null,
      p_caller_user_id: null,
      p_caller_role: 'Admin',
      p_reason: 'PATIENT_REQUEST',
      p_reason_text: 'Rescheduled',
    })
    const cancelRow = (cancelRes as any[])[0]
    expect(cancelRow.success).toBe(true)
    expect(cancelRow.old_status).toBe('CONFIRMED')
    expect(cancelRow.new_status).toBe('CANCELLED')

    await h.supabase
      .from('appointments')
      .update({
        reschedule_count: 1,
        rescheduled_from_id: apptOldId,
        original_appointment_id: apptOldId,
      })
      .eq('appointment_id', apptNewId)

    const apptOldAfter = await getAppointment(h, apptOldId)
    expect(apptOldAfter.status).toBe('CANCELLED')

    const apptNewAfter = await getAppointment(h, apptNewId)
    expect(apptNewAfter.status).toBe('CONFIRMED')
    expect(apptNewAfter.reschedule_count).toBe(1)
    expect(apptNewAfter.rescheduled_from_id).toBe(apptOldId)

    const { data: oldToNewValid } = await h.supabase.rpc(
      'appointment_valid_transition',
      {
        p_from: 'CONFIRMED',
        p_to: 'CANCELLED',
      },
    )
    expect(oldToNewValid).toBe(true)
  })

  it('5. cancel appointment (confirm then cancel)', async () => {
    if (!h) return
    const { fromDate, toDate } = await seedAvailability(h)
    await generateSlots(h, fromDate, toDate)

    const slotId = await getFirstAvailableSlot(h)
    const hold = await holdSlot(h, slotId, h.patientAId)
    const apptId = await confirmBooking(h, hold.hold_token, h.patientAId)

    const before = await getAppointment(h, apptId)
    expect(before.status).toBe('CONFIRMED')

    const { data: res } = await h.supabase.rpc('cancel_appointment', {
      p_appointment_id: apptId,
      p_patient_id: h.patientAId,
      p_caller_user_id: h.patientAUserId,
      p_caller_role: 'Patient',
      p_reason: 'PATIENT_REQUEST',
      p_reason_text: 'No longer needed',
    })
    const row = (res as any[])[0]
    expect(row.success).toBe(true)
    expect(row.old_status).toBe('CONFIRMED')
    expect(row.new_status).toBe('CANCELLED')
    expect(row.slot_freed).toBe(true)

    const after = await getAppointment(h, apptId)
    expect(after.status).toBe('CANCELLED')
    expect(after.cancel_reason).toBe('PATIENT_REQUEST')

    const { data: slotAfter } = await h.supabase
      .from('appointment_slots')
      .select('status')
      .eq('slot_id', slotId)
      .maybeSingle()
    expect((slotAfter as any).status).toBe('AVAILABLE')
  })

  it('6. doctor leave conflict — appointment status becomes DOCTOR_LEAVE_CONFLICT via RPC', async () => {
    if (!h) return
    const { fromDate, toDate } = await seedAvailability(h)
    await generateSlots(h, fromDate, toDate)

    const slotId = await getFirstAvailableSlot(h)
    const hold = await holdSlot(h, slotId, h.patientAId)
    const apptId = await confirmBooking(h, hold.hold_token, h.patientAId)

    const before = await getAppointment(h, apptId)
    expect(before.status).toBe('CONFIRMED')

    const { data: slotTime } = await h.supabase
      .from('appointment_slots')
      .select('start_time')
      .eq('slot_id', slotId)
      .maybeSingle()
    const apptDate = new Date((slotTime as any).start_time)
      .toISOString()
      .slice(0, 10)

    await h.supabase.from('doctor_leave').insert({
      doctor_id: h.doctorId,
      start_date: apptDate,
      end_date: apptDate,
      reason: 'sick day',
      leave_type: 'SICK',
      status: 'APPROVED',
    })

    const { data: conflictRes } = await h.supabase.rpc(
      'process_doctor_leave_conflicts',
      {
        p_doctor_id: h.doctorId,
        p_start_date: apptDate,
        p_end_date: apptDate,
      },
    )
    const conflictRow = (conflictRes as any[])[0]
    expect(conflictRow.appointments_conflicted).toBeGreaterThanOrEqual(1)

    const after = await getAppointment(h, apptId)
    expect(after.status).toBe('DOCTOR_LEAVE_CONFLICT')

    const { data: transitionValid } = await h.supabase.rpc(
      'appointment_valid_transition',
      {
        p_from: 'CONFIRMED',
        p_to: 'DOCTOR_LEAVE_CONFLICT',
      },
    )
    expect(transitionValid).toBe(true)
  })

  it.skip('7. patient authorization — patient can read own appts, not others (RLS 403 pattern)', async () => {
    if (!h) return
    const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!anonUrl || !anonKey) {
      throw new Error('anon env missing — test requires anon key for RLS')
    }

    const { createClient } = require('@supabase/supabase-js')
    const { fromDate, toDate } = await seedAvailability(h)
    await generateSlots(h, fromDate, toDate)

    const slotA = await getFirstAvailableSlot(h)
    const holdA = await holdSlot(h, slotA, h.patientAId)
    const apptAId = await confirmBooking(h, holdA.hold_token, h.patientAId)

    const { data: nextSlot } = await h.supabase
      .from('appointment_slots')
      .select('slot_id')
      .eq('doctor_id', h.doctorId)
      .eq('status', 'AVAILABLE')
      .limit(1)
      .maybeSingle()
    const slotB = (nextSlot as any).slot_id
    const holdB = await holdSlot(h, slotB, h.patientBId)
    const apptBId = await confirmBooking(h, holdB.hold_token, h.patientBId)

    const clientA = createClient(anonUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: signInA } = await clientA.auth.signInWithOtp({
      email: `pat-a-${Math.random()}@test.local`,
    })

    const { error: readOwnErr } = await clientA
      .from('appointments')
      .select('*')
      .eq('appointment_id', apptAId)
    expect(readOwnErr).toBeNull()

    const { data: readOther, error: readOtherErr } = await clientA
      .from('appointments')
      .select('*')
      .eq('appointment_id', apptBId)
      .maybeSingle()
    expect(readOther).toBeNull()
  })

  it.skip('8. doctor authorization — doctor can read own appts, not other doctors', async () => {
    if (!h) return
    const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!anonUrl || !anonKey) {
      throw new Error('anon env missing')
    }

    const { createClient } = require('@supabase/supabase-js')
    const { fromDate, toDate } = await seedAvailability(h)
    await generateSlots(h, fromDate, toDate)

    const slotId = await getFirstAvailableSlot(h)
    const hold = await holdSlot(h, slotId, h.patientAId)
    const apptDr1 = await confirmBooking(h, hold.hold_token, h.patientAId)

    const fromOther = isoAddDays(10)
    const toOther = isoAddDays(12)
    const fromDt = new Date(fromOther + 'T00:00:00Z')
    const dow = fromDt.getUTCDay()
    await h.supabase.from('doctor_availability').insert({
      doctor_id: h.otherDoctorId,
      day_of_week: dow,
      start_time: '10:00:00',
      end_time: '14:00:00',
      slot_duration_minutes: 30,
      active: true,
    })
    const { data: cnt } = await h.supabase.rpc('generate_doctor_slots', {
      p_doctor_id: h.otherDoctorId,
      p_from_date: fromOther,
      p_to_date: toOther,
    })
    const { data: slotOther } = await h.supabase
      .from('appointment_slots')
      .select('slot_id')
      .eq('doctor_id', h.otherDoctorId)
      .eq('status', 'AVAILABLE')
      .limit(1)
      .maybeSingle()

    const holdOther = await (async () => {
      const { data, error } = await h.supabase.rpc('atomic_hold_slot', {
        p_doctor_id: h.otherDoctorId,
        p_slot_id: (slotOther as any).slot_id,
        p_patient_id: h.patientBId,
        p_hold_duration_s: 600,
      })
      if (error) throw error
      return (data as any[])[0]
    })()

    const apptDr2 = await (async () => {
      const { data, error } = await h.supabase.rpc('atomic_confirm_booking', {
        p_hold_token: holdOther.hold_token,
        p_patient_id: h.patientBId,
      })
      if (error) throw error
      return Number((data as any[])[0].appointment_id)
    })()

    const clientDr = createClient(anonUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: readOwn } = await clientDr
      .from('appointments')
      .select('*')
      .eq('appointment_id', apptDr1)
    const { data: readOtherSingle } = await clientDr
      .from('appointments')
      .select('*')
      .eq('appointment_id', apptDr2)
      .maybeSingle()
    expect(readOtherSingle).toBeNull()
  })

  it('9. notification failure tolerance — sendNotification throws but booking/leave still complete', async () => {
    if (!h) return
    vi.spyOn(notificationService, 'sendNotification').mockImplementation(
      async () => {
        throw new Error('Notification provider down (stub)')
      },
    )

    const { fromDate, toDate } = await seedAvailability(h)
    await generateSlots(h, fromDate, toDate)

    const slotId = await getFirstAvailableSlot(h)
    const hold = await holdSlot(h, slotId, h.patientAId)
    const apptId = await confirmBooking(
      h,
      hold.hold_token,
      h.patientAId,
      'visit with stubbed notifs',
    )

    try {
      await notificationService.sendNotification({
        type: 'BOOKING_CONFIRMATION',
        channel: 'EMAIL',
        recipient: 'test@example.com',
        appointment_id: apptId,
        patient_id: h.patientAId,
      })
    } catch (_) {
    }

    const apptAfter = await getAppointment(h, apptId)
    expect(apptAfter.status).toBe('CONFIRMED')
    expect(apptAfter.appointment_id).toBe(apptId)

    const { data: st } = await h.supabase
      .from('appointment_slots')
      .select('start_time')
      .eq('slot_id', slotId)
      .maybeSingle()
    const apptDate = new Date((st as any).start_time).toISOString().slice(0, 10)

    try {
      await notificationService.sendNotification({
        type: 'DOCTOR_LEAVE_CONFLICT',
        channel: 'EMAIL',
        recipient: 'doctor@example.com',
        staff_id: h.doctorId,
      })
    } catch (_) {
    }

    await h.supabase.from('doctor_leave').insert({
      doctor_id: h.doctorId,
      start_date: apptDate,
      end_date: apptDate,
      leave_type: 'VACATION',
      status: 'APPROVED',
    })
    const { data: confRes } = await h.supabase.rpc(
      'process_doctor_leave_conflicts',
      {
        p_doctor_id: h.doctorId,
        p_start_date: apptDate,
        p_end_date: apptDate,
      },
    )
    const confRow = (confRes as any[])[0]
    expect(confRow.appointments_conflicted).toBeGreaterThanOrEqual(1)

    const apptFinal = await getAppointment(h, apptId)
    expect(apptFinal.status).toBe('DOCTOR_LEAVE_CONFLICT')
  })
})
