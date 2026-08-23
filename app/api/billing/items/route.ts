export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/security/guards'
import { createServiceClientRaw } from '@/utils/supabase/service'
import { recordAuditLog } from '@/lib/services/audit-service'

type ItemBody = {
  bill_id: number
  item_type: 'Medicine' | 'Treatment' | 'Room'
  item_id_ref: number
  description: string
  quantity: number
  unit_price: number
}

export async function POST(req: NextRequest) {
  const rawBody = (await req.json().catch(() => null)) as Record<string, any> | null

  if (!rawBody || typeof rawBody !== 'object') {
    return NextResponse.json(
      { error: 'Missing or invalid fields.' },
      { status: 400 },
    )
  }

  const bill_id = Number(rawBody.bill_id)
  const item_type = typeof rawBody.item_type === 'string' ? rawBody.item_type : ''
  const item_id_ref = Number(rawBody.item_id_ref)
  const description = typeof rawBody.description === 'string' ? rawBody.description.trim() : ''
  const quantity = Number(rawBody.quantity)
  const unit_price = Number(rawBody.unit_price)

  if (
    !bill_id ||
    isNaN(bill_id) ||
    !item_type ||
    !['Medicine', 'Treatment', 'Room'].includes(item_type) ||
    !item_id_ref ||
    isNaN(item_id_ref) ||
    !description ||
    isNaN(quantity) ||
    isNaN(unit_price)
  ) {
    return NextResponse.json(
      { error: 'Missing or invalid fields.' },
      { status: 400 },
    )
  }
  if (quantity <= 0 || unit_price < 0) {
    return NextResponse.json(
      { error: 'Quantity must be > 0 and price >= 0.' },
      { status: 400 },
    )
  }

  const body: ItemBody = {
    bill_id,
    item_type: item_type as 'Medicine' | 'Treatment' | 'Room',
    item_id_ref,
    description,
    quantity,
    unit_price,
  }

  const { session, errorResponse } = await requireApiAuth(['Admin'])
  if (errorResponse) return errorResponse

  const supabase = createServiceClientRaw()

  const { data: billRow, error: billErr } = await supabase
    .from('billing')
    .select('total_price, patient_id')
    .eq('bill_id', body.bill_id)
    .single()

  if (billErr || !billRow) {
    return NextResponse.json({ error: 'Bill not found.' }, { status: 400 })
  }

  const itemTotal = Number((body.quantity * body.unit_price).toFixed(2))

  const { data: insertedItem, error: insertErr } = await supabase
    .from('billing_items')
    .insert([
      {
        bill_id: body.bill_id,
        item_type: body.item_type,
        item_id_ref: body.item_id_ref,
        description: body.description,
        quantity: body.quantity,
        unit_price: body.unit_price,
        total_price: itemTotal,
      },
    ])
    .select('item_id')
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  const newTotalPrice = Number((Number(billRow.total_price) + itemTotal).toFixed(2))

  const { error: updErr } = await supabase
    .from('billing')
    .update({
      total_price: newTotalPrice,
      updated_at: new Date().toISOString(),
    })
    .eq('bill_id', body.bill_id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  await recordAuditLog({
    actor_user_id: session.user.id,
    actor_role: session.role,
    action: 'ADD_BILL_ITEM',
    resource_type: 'billing_items',
    resource_id: insertedItem?.item_id,
    diff_payload: {
      bill_id: body.bill_id,
      patient_id: billRow.patient_id,
      item_type: body.item_type,
      description: body.description,
      quantity: body.quantity,
      unit_price: body.unit_price,
      item_total: itemTotal,
      new_bill_total: newTotalPrice,
    },
  })

  return NextResponse.json(
    {
      message: 'Item added and bill total updated.',
      new_item_total: itemTotal,
      bill_total: newTotalPrice,
    },
    { status: 201 },
  )
}
