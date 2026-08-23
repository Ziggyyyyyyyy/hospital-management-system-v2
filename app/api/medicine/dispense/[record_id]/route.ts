export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/security/guards'
import { createServiceClientRaw } from '@/utils/supabase/service'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ record_id: string }> },
) {
  const { record_id } = await params
  const recordId = Number(record_id)

  if (isNaN(recordId)) {
    return NextResponse.json({ error: 'Invalid record_id' }, { status: 400 })
  }

  const { errorResponse } = await requireApiAuth([
    'Doctor',
    'Pharmacist',
    'Admin',
    'Nurse',
  ])
  if (errorResponse) return errorResponse

  const supabase = createServiceClientRaw()

  const { data, error } = await supabase
    .from('medicine_dispense')
    .select(
      `
      dispense_id,
      record_id,
      quantity,
      dispense_date,
      medicine_stock (
        name
      ),
      pharmacist_id
    `,
    )
    .eq('record_id', recordId)
    .order('dispense_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
