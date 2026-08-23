export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/security/guards'
import { createServiceClientRaw } from '@/utils/supabase/service'
import { recordAuditLog } from '@/lib/services/audit-service'

type Status = 'Pending' | 'Paid' | 'Canceled'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const billId = Number(id)
  if (isNaN(billId)) {
    return NextResponse.json({ error: 'Invalid bill_id' }, { status: 400 })
  }

  const { status } = (await req.json().catch(() => ({}))) as { status?: Status }
  if (!status || !['Pending', 'Paid', 'Canceled'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { session, errorResponse } = await requireApiAuth(['Admin'])
  if (errorResponse) return errorResponse

  const supabase = createServiceClientRaw()

  const { data: previous, error: fetchErr } = await supabase
    .from('billing')
    .select('bill_id, status, patient_id, total_price')
    .eq('bill_id', billId)
    .single()

  if (fetchErr || !previous) {
    return NextResponse.json({ error: 'Billing record not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('billing')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('bill_id', billId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await recordAuditLog({
    actor_user_id: session.user.id,
    actor_role: session.role,
    action: 'UPDATE_BILL',
    resource_type: 'billing',
    resource_id: billId,
    diff_payload: {
      old_status: previous.status,
      new_status: status,
      patient_id: previous.patient_id,
      total_price: previous.total_price,
    },
  })

  return NextResponse.json({
    message: `Billing status updated to "${status}".`,
  })
}
