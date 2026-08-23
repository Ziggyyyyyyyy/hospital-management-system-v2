import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
  jsonWithCors,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { PrescriptionSchema } from '@/lib/validation/appointment'
import { generateRemindersForPrescription } from '@/lib/medications/reminder-service'
import type { NextRequest } from 'next/server'

export async function POST(req: Request) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Doctor'])
  if (deny) return err(deny)

  if (!identity.staffId) {
    return err(makeApptError('FORBIDDEN', 'Doctor profile missing'))
  }

  const body = (await req.json().catch(() => null)) as
    | {
        patient_id?: unknown
        doctor_id?: unknown
        appointment_id?: unknown
        items?: unknown
      }
    | null

  if (!body) {
    return err(makeApptError('VALIDATION_ERROR', 'Request body required'))
  }

  const validation = PrescriptionSchema.safeParse({
    patient_id: body.patient_id,
    doctor_id: body.doctor_id ?? identity.staffId,
    appointment_id: body.appointment_id,
    items: body.items,
  })

  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')
    return err(makeApptError('VALIDATION_ERROR', issues))
  }

  const prescriptionData = validation.data

  if (Number(prescriptionData.doctor_id) !== identity.staffId) {
    return err(
      makeApptError('FORBIDDEN', 'Cannot create prescription for another doctor'),
    )
  }

  const serviceSupabase = createServiceClient()
  const warnings: string[] = []

  try {
    const { data: patientCheck, error: patientErr } = await serviceSupabase
      .from('patients')
      .select('patient_id')
      .eq('patient_id', Number(prescriptionData.patient_id))
      .maybeSingle()

    if (patientErr) throw patientErr
    if (!patientCheck) {
      return err(makeApptError('VALIDATION_ERROR', 'Patient not found'))
    }

    if (prescriptionData.appointment_id) {
      const { data: apptCheck, error: apptErr } = await serviceSupabase
        .from('appointments')
        .select('appointment_id, patient_id, doctor_id')
        .eq('appointment_id', Number(prescriptionData.appointment_id))
        .maybeSingle()

      if (apptErr) throw apptErr
      if (apptCheck) {
        if (Number(apptCheck.doctor_id) !== identity.staffId) {
          return err(
            makeApptError('FORBIDDEN', 'Appointment does not belong to you'),
          )
        }
        if (Number(apptCheck.patient_id) !== Number(prescriptionData.patient_id)) {
          return err(
            makeApptError('VALIDATION_ERROR', 'Appointment patient mismatch'),
          )
        }
      }
    }

    const { data: insertedRx, error: rxErr } = await serviceSupabase
      .from('prescriptions')
      .insert({
        patient_id: Number(prescriptionData.patient_id),
        doctor_id: Number(prescriptionData.doctor_id),
        appointment_id: prescriptionData.appointment_id
          ? Number(prescriptionData.appointment_id)
          : null,
        issue_date: new Date().toISOString().split('T')[0],
        status: 'ACTIVE',
      })
      .select('prescription_id')
      .single()

    if (rxErr) throw rxErr

    const prescriptionId = Number(insertedRx.prescription_id)

    const itemsToInsert = prescriptionData.items.map((item) => ({
      prescription_id: prescriptionId,
      medicine_id: item.medicine_id ? Number(item.medicine_id) : null,
      medicine_name: item.medicine_name,
      dosage: item.dosage,
      frequency: item.frequency,
      duration_days: item.duration_days,
      quantity: item.quantity,
      instructions: item.instructions ?? null,
    }))

    const { data: insertedItems, error: itemsErr } = await serviceSupabase
      .from('prescription_items')
      .insert(itemsToInsert)
      .select('item_id')

    if (itemsErr) throw itemsErr

    const createdItemIds = (insertedItems ?? []).map((r: any) => Number(r.item_id))

    setImmediate(async () => {
      for (const itemId of createdItemIds) {
        try {
          await generateRemindersForPrescription(itemId)
        } catch {
          warnings.push(
            `Reminder generation failed for prescription item ${itemId}`,
          )
        }
      }
    })

    return jsonWithCors(
      {
        success: true,
        data: {
          prescription_id: prescriptionId,
          item_count: createdItemIds.length,
        },
        ...(warnings.length > 0 ? { warnings } : {}),
      },
      { status: 201 },
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return err(makeApptError('INTERNAL_ERROR', msg))
  }
}

export async function GET(req: NextRequest) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Patient', 'Pharmacist', 'Nurse'])
  if (deny) return err(deny)

  const { searchParams } = new URL(req.url)
  const patientFilter = searchParams.get('patient_id')
  const doctorFilter = searchParams.get('doctor_id')

  const supabase = await createClient()
  const serviceSupabase = createServiceClient()

  try {
    let query = serviceSupabase
      .from('prescriptions')
      .select(`
        prescription_id,
        appointment_id,
        patient_id,
        doctor_id,
        issue_date,
        expiry_date,
        notes,
        status,
        created_at,
        prescription_items (
          item_id,
          medicine_id,
          medicine_name,
          dosage,
          frequency,
          duration_days,
          quantity,
          instructions
        ),
        patients (
          patient_id,
          users (first_name, last_name)
        ),
        medical_staff (
          staff_id,
          users (first_name, last_name)
        )
      `)

    if (identity.role === 'Patient') {
      if (!identity.patientId) {
        return err(makeApptError('FORBIDDEN', 'Patient profile missing'))
      }
      query = query.eq('patient_id', identity.patientId)
    } else if (identity.role === 'Doctor') {
      if (!identity.staffId) {
        return err(makeApptError('FORBIDDEN', 'Doctor profile missing'))
      }
      query = query.eq('doctor_id', identity.staffId)
    } else {
      if (patientFilter) {
        const pid = Number(patientFilter)
        if (Number.isFinite(pid) && pid > 0) query = query.eq('patient_id', pid)
      }
      if (doctorFilter) {
        const did = Number(doctorFilter)
        if (Number.isFinite(did) && did > 0) query = query.eq('doctor_id', did)
      }
    }

    query = query.order('created_at', { ascending: false }).limit(500)

    const { data, error } = await query

    if (error) {
      return err(makeApptError('INTERNAL_ERROR', error.message))
    }

    void supabase
    return ok({ prescriptions: data ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return err(makeApptError('INTERNAL_ERROR', msg))
  }
}
