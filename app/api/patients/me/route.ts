import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import { getUserRole } from '@/utils/get-role'

// GET /api/patients/me → Get own patient profile
export async function GET(req: NextRequest) {
  const result = await getUserRole()

  if (!result) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { role, userId } = result

  if (role !== 'Patient') {
    return NextResponse.json(
      { error: 'Only patients have a patient profile' },
      { status: 403 },
    )
  }

  // The patients RLS policy participates in the self-referential policy
  // cycle that exceeds the PostgreSQL stack depth for authenticated
  // sessions (SQLSTATE 54001). Ownership is enforced by filtering on the
  // verified JWT subject below, so read through the service client (see
  // utils/supabase/service.ts usage policy).
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('patients')
    .select(
      'patient_id, users(national_id, first_name, last_name, date_of_birth, phone_number, address), blood_type, emergency_contact_id',
    )
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    console.error('Fetch patient error:', error?.message || error)
    return NextResponse.json(
      { error: 'Patient profile not found' },
      { status: 404 },
    )
  }

  return NextResponse.json(data, { status: 200 })
}

// PATCH /api/patients/me → Update logged-in patient's profile (partially)
export async function PATCH(req: Request) {
  const { phone_number } = await req.json()
  const result = await getUserRole()
  if (!result) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { userId, role } = result

  if (role !== 'Patient') {
    return NextResponse.json(
      { error: 'Only patients can update their profile here' },
      { status: 403 },
    )
  }

  // Validate that at least one field (phone_number or address) is provided
  if (!phone_number) {
    return NextResponse.json(
      { error: 'phone_number is required' },
      { status: 400 },
    )
  }

  // Same RLS-recursion rationale as GET: self-scoped update filtered on
  // the verified JWT subject runs through the service client.
  const supabase = createServiceClient()

  // Update patient info (only the fields that are provided)
  const { data, error } = await supabase
    .from('users')
    .update({ phone_number })
    .eq('user_id', userId)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { message: 'Profile updated successfully', data },
    { status: 200 },
  )
}