import { NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import { getUserRole } from '@/utils/get-role'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getUserRole()

  if (!result) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { role, userId } = result
  const { id: patientId } = await params

  // The patients/users/medical_staff RLS policies are mutually self-referential
  // and exceed the PostgreSQL stack depth for authenticated sessions (SQLSTATE 54001).
  // Caller authorization is strictly enforced below (Admin, Doctor, Nurse, or patient owner).
  const supabase = createServiceClient()

  const { data: patient, error } = await supabase
    .from('patients')
    .select(
      `*, users( national_id,first_name,last_name,date_of_birth,phone_number,address),
            medical_records(record_id, visit_date, visit_status, doctor_id (users(first_name,last_name)))`,
    )
    .eq('patient_id', patientId)
    .single()
  console.log('Patient data:', patient)

  if (error || !patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  if (
    role !== 'Admin' &&
    role !== 'Doctor' &&
    role !== 'Nurse' &&
    userId !== patient.user_id
  ) {
    return NextResponse.json(
      { error: "Forbidden: You can't access this patient's data" },
      { status: 403 },
    )
  }

  return NextResponse.json(patient, { status: 200 })
}
