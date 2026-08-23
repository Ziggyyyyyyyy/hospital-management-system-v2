import { NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import { getUserRole } from '@/utils/get-role'

// Format
// {
//   "admission_id": 1,
//   "nurse_id": 10,
//   "room_id": 2
// }

// PATCH /api/admin/assign-nurse → Assign nurse and room to a patient admission
export async function PATCH(req: Request) {
  const { admission_id, nurse_id, room_id } = await req.json()
  const result = await getUserRole()

  if (!result) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { role } = result
  if (role !== 'Admin' && role !== 'Doctor') {
    return NextResponse.json(
      { error: 'Forbidden: Only admins or doctors can assign nurses' },
      { status: 403 },
    )
  }

  // The rooms/medical_staff/admissions RLS policies are self-referential
  // and exceed the PostgreSQL stack depth for authenticated sessions (SQLSTATE 54001).
  // Caller authorization and role filtering are strictly enforced above.
  const supabase = createServiceClient()

  // Validate required fields
  if (!admission_id || !nurse_id || !room_id) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 },
    )
  }

  // Check if room exists
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('room_id')
    .eq('room_id', room_id)
    .single()

  if (roomError || !room) {
    return NextResponse.json({ error: 'Invalid room_id' }, { status: 400 })
  }

  // Check if nurse exists and is of type 'Nurse'
  const { data: nurse, error: nurseError } = await supabase
    .from('medical_staff')
    .select('staff_id, staff_type')
    .eq('staff_id', nurse_id)
    .single()

  if (nurseError || !nurse || nurse.staff_type !== 'Nurse') {
    return NextResponse.json(
      { error: 'Invalid nurse_id or not a Nurse' },
      { status: 400 },
    )
  }

  // Update the admission record
  const { data, error } = await supabase
    .from('admissions')
    .update({
      nurse_id,
      room_id,
      updated_at: new Date().toISOString(),
    })
    .eq('admission_id', admission_id)
    .select()
    .single()

  if (error) {
    console.error('Assign nurse error:', error)
    return NextResponse.json(
      { error: 'Failed to assign nurse or room' },
      { status: 500 },
    )
  }

  return NextResponse.json(data, { status: 200 })
}
