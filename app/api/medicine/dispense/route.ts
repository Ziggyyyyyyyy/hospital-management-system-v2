export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/security/guards'
import { createServiceClientRaw } from '@/utils/supabase/service'
import { recordAuditLog } from '@/lib/services/audit-service'

interface DispenseBody {
  record_id: number
  medicine_id: number
  quantity: number
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as DispenseBody | null

  if (
    !body ||
    typeof body.record_id !== 'number' ||
    typeof body.medicine_id !== 'number' ||
    typeof body.quantity !== 'number' ||
    body.quantity <= 0
  ) {
    return NextResponse.json(
      { error: 'Missing or invalid fields. Quantity must be > 0.' },
      { status: 400 },
    )
  }

  const { session, errorResponse } = await requireApiAuth([
    'Doctor',
    'Pharmacist',
    'Admin',
  ])
  if (errorResponse) return errorResponse

  const supabase = createServiceClientRaw()

  // 1. Verify medical record exists
  const { data: record, error: recordErr } = await supabase
    .from('medical_records')
    .select('record_id, patient_id')
    .eq('record_id', body.record_id)
    .single()

  if (recordErr || !record) {
    return NextResponse.json(
      { error: 'Medical record not found' },
      { status: 404 },
    )
  }

  // 2. Fetch current medicine stock
  const { data: medicine, error: stockError } = await supabase
    .from('medicine_stock')
    .select('medicine_id, name, quantity')
    .eq('medicine_id', body.medicine_id)
    .single()

  if (stockError || !medicine) {
    return NextResponse.json({ error: 'Invalid medicine ID' }, { status: 400 })
  }

  if (medicine.quantity < body.quantity) {
    return NextResponse.json(
      {
        error: `Insufficient stock. Requested ${body.quantity}, available ${medicine.quantity}`,
      },
      { status: 400 },
    )
  }

  const pharmacistStaffId = session.staffId ?? null
  const newStock = medicine.quantity - body.quantity

  // 3. Deduct stock
  const { error: updateError } = await supabase
    .from('medicine_stock')
    .update({
      quantity: newStock,
      updated_at: new Date().toISOString(),
    })
    .eq('medicine_id', body.medicine_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // 4. Insert dispense record
  const { data: dispenseRow, error: insertError } = await supabase
    .from('medicine_dispense')
    .insert([
      {
        record_id: body.record_id,
        pharmacist_id: pharmacistStaffId,
        medicine_id: body.medicine_id,
        quantity: body.quantity,
        dispense_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select('dispense_id')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // 5. Record audit trail
  await recordAuditLog({
    actor_user_id: session.user.id,
    actor_role: session.role,
    action: 'DISPENSE_MEDICINE',
    resource_type: 'medicine_dispense',
    resource_id: dispenseRow?.dispense_id,
    diff_payload: {
      record_id: body.record_id,
      patient_id: record.patient_id,
      medicine_id: body.medicine_id,
      medicine_name: medicine.name,
      dispensed_quantity: body.quantity,
      previous_stock: medicine.quantity,
      remaining_stock: newStock,
      pharmacist_staff_id: pharmacistStaffId,
    },
  })

  return NextResponse.json(
    {
      message: 'Medicine dispensed and stock updated successfully',
      dispense_id: dispenseRow?.dispense_id,
      remaining_stock: newStock,
    },
    { status: 201 },
  )
}
