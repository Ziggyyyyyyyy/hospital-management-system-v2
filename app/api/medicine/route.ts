export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/security/guards'
import { createServiceClientRaw } from '@/utils/supabase/service'

export async function GET(req: NextRequest) {
  const { errorResponse } = await requireApiAuth([
    'Doctor',
    'Pharmacist',
    'Admin',
    'Nurse',
  ])
  if (errorResponse) return errorResponse

  const supabase = createServiceClientRaw()

  const { data, error } = await supabase
    .from('medicine_stock')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const normalized = (data ?? []).map((item: Record<string, any>) => ({
    ...item,
    min_stock_level: item.min_stock_level ?? item.reorder_level ?? 10,
    dosage: item.dosage ?? item.strength ?? '',
    supplier: item.supplier ?? item.manufacturer ?? '',
  }))

  return NextResponse.json(normalized)
}
