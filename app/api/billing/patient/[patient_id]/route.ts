export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, assertOwnership } from '@/lib/security/guards'
import { createServiceClientRaw } from '@/utils/supabase/service'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ patient_id: string }> },
) {
  const { patient_id } = await params
  const patientId = Number(patient_id)
  if (isNaN(patientId)) {
    return NextResponse.json({ error: 'Invalid patient_id' }, { status: 400 })
  }

  const { session, errorResponse } = await requireApiAuth()
  if (errorResponse) return errorResponse

  // If patient, assert they only view their own billings.
  // Staff (Admin, Doctor, Nurse, Pharmacist) can view as well.
  if (session.role === 'Patient') {
    try {
      assertOwnership(
        session.patientId,
        patientId,
        'Forbidden: You can only view your own billing records',
      )
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
  }

  const supabase = createServiceClientRaw()

  const { data, error } = await supabase
    .from('billing')
    .select(
      `
      bill_id,
      patient_id,
      admission_id,
      total_price,
      status,
      created_at,
      updated_at,
      billing_items (
        item_id,
        item_type,
        item_id_ref,
        description,
        quantity,
        unit_price,
        total_price
      )
    `,
    )
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
