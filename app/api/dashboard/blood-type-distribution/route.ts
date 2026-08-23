import { NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import { getUserRole } from '@/utils/get-role'

export async function GET() {
  const auth = await getUserRole()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (auth.role !== 'Admin') {
    return NextResponse.json(
      { error: 'Only admins can view dashboard analytics' },
      { status: 403 },
    )
  }

  // The patients RLS policy participates in the self-referential policy
  // cycle that exceeds the PostgreSQL stack depth for authenticated
  // sessions (SQLSTATE 54001). Access is already gated to Admin above,
  // so read through the service client (see utils/supabase/service.ts).
  const supabase = createServiceClient()

  try {
    // All possible blood types from the schema
    const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

    // Get counts for each blood type
    const bloodTypeCounts = await Promise.all(
      bloodTypes.map(async (type) => {
        const { count, error } = await supabase
          .from('patients')
          .select('*', { count: 'exact', head: true })
          .eq('blood_type', type)

        if (error) throw error

        return {
          type: type,
          count: count || 0,
        }
      }),
    )

    // Filter out blood types with 0 counts (optional)
    const filteredData = bloodTypeCounts.filter((item) => item.count > 0)

    // Sort by count in descending order (optional)
    filteredData.sort((a, b) => b.count - a.count)

    return NextResponse.json(filteredData)
  } catch (error) {
    console.error('Error fetching blood type distribution:', error)
    return NextResponse.json(
      { error: 'Failed to fetch blood type distribution data' },
      { status: 500 },
    )
  }
}