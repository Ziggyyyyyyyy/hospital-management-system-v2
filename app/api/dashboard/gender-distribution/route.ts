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

  // The users RLS policy participates in the self-referential policy
  // cycle that exceeds the PostgreSQL stack depth for authenticated
  // sessions (SQLSTATE 54001). Access is already gated to Admin above,
  // so read through the service client (see utils/supabase/service.ts).
  const supabase = createServiceClient()

  try {
    // Query users table to count by gender using the count() method
    const { count: maleCount, error: maleError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('gender', 'Male')

    const { count: femaleCount, error: femaleError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('gender', 'Female')

    const { count: otherCount, error: otherError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('gender', 'Other')

    if (maleError || femaleError || otherError) {
      throw new Error('Error fetching gender distribution data')
    }

    const genderData = [
      { name: 'Male', value: maleCount || 0 },
      { name: 'Female', value: femaleCount || 0 },
      { name: 'Other', value: otherCount || 0 },
    ]

    return NextResponse.json(genderData)
  } catch (error) {
    console.error('Error fetching gender distribution:', error)
    return NextResponse.json(
      { error: 'Failed to fetch gender distribution data' },
      { status: 500 },
    )
  }
}