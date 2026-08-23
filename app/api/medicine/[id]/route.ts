export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/security/guards'
import { createServiceClientRaw } from '@/utils/supabase/service'
import { recordAuditLog } from '@/lib/services/audit-service'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const medicineId = Number(id)
  if (isNaN(medicineId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const { quantity } = (await req.json().catch(() => ({}))) as {
    quantity?: number
  }
  if (typeof quantity !== 'number' || quantity < 0) {
    return NextResponse.json(
      { error: 'Missing or invalid quantity (must be >= 0)' },
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

  const { data: previous, error: fetchErr } = await supabase
    .from('medicine_stock')
    .select('medicine_id, name, quantity')
    .eq('medicine_id', medicineId)
    .single()

  if (fetchErr || !previous) {
    return NextResponse.json({ error: 'Medicine not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('medicine_stock')
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq('medicine_id', medicineId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await recordAuditLog({
    actor_user_id: session.user.id,
    actor_role: session.role,
    action: 'UPDATE_MEDICINE_STOCK',
    resource_type: 'medicine_stock',
    resource_id: medicineId,
    diff_payload: {
      medicine_name: previous.name,
      old_quantity: previous.quantity,
      new_quantity: quantity,
      delta: quantity - previous.quantity,
    },
  })

  return NextResponse.json({
    message: 'Quantity updated successfully',
    medicine_id: medicineId,
    new_quantity: quantity,
  })
}
