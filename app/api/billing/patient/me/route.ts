export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import { getUserRole } from '@/utils/get-role'

export async function GET(req: NextRequest) {
  const result = await getUserRole()
  if (!result) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { role, userId } = result

  if (role !== 'Patient') {
    return NextResponse.json(
      { error: 'Only patients can view their billing here' },
      { status: 403 },
    )
  }

  // The patients/billing RLS policies participate in the self-referential
  // policy cycle that exceeds the PostgreSQL stack depth for any session
  // (SQLSTATE 54001). Ownership is enforced by resolving patient_id from
  // the verified JWT subject below, so read through the service client
  // (see utils/supabase/service.ts usage policy).
  const supabase = createServiceClient()

  const { data: patientRow, error: patientError } = await supabase
    .from('patients')
    .select('patient_id')
    .eq('user_id', userId)
    .single()

  if (patientError || !patientRow) {
    return NextResponse.json(
      { error: 'Patient record not found' },
      { status: 404 },
    )
  }

  const { patient_id } = patientRow

  const { data, error } = await supabase
    .from('billing')
    .select(
      `
      bill_id,
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
    .eq('patient_id', patient_id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}