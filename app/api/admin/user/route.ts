import { NextResponse } from 'next/server'
import { getUserRole } from '@/utils/get-role'
import { createServiceClient } from '@/utils/supabase/service'

// GET /api/admin/user → List all users who can be assigned as staff
export async function GET(req: Request) {
  const result = await getUserRole()
  if (!result)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role } = result
  if (role !== 'Admin') {
    return NextResponse.json(
      { error: 'Forbidden: Admin only' },
      { status: 403 },
    )
  }

  const staffType = new URL(req.url).searchParams.get('type')
  const supabase = createServiceClient()

  const { data: medicalStaff, error: medicalStaffError } = await supabase
    .from('medical_staff')
    .select('user_id')

  if (medicalStaffError) {
    return NextResponse.json(
      { error: medicalStaffError.message },
      { status: 500 },
    )
  }

  const excludedUserIds =
    medicalStaff && medicalStaff.length > 0
      ? `(${medicalStaff.map((staff: any) => staff.user_id).filter(Boolean).join(',')})`
      : '(00000000-0000-0000-0000-000000000000)'

  let query = supabase
    .from('users')
    .select('*')
    .not('user_id', 'in', excludedUserIds)

  if (staffType) query = query.eq('staff_type', staffType)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
