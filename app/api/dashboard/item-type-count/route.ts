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

  // The billing_items RLS policy participates in the self-referential
  // policy cycle that exceeds the PostgreSQL stack depth for
  // authenticated sessions (SQLSTATE 54001). Access is already gated to
  // Admin above, so read through the service client (see
  // utils/supabase/service.ts).
  const supabase = createServiceClient()

  try {
    // All possible item types from the schema
    const itemTypes = ['Medicine', 'Room', 'Treatment']

    // Get counts for each item type
    const itemTypeCounts = await Promise.all(
      itemTypes.map(async (type) => {
        const { count, error } = await supabase
          .from('billing_items')
          .select('*', { count: 'exact', head: true })
          .eq('item_type', type)

        if (error) throw error

        return {
          type: type,
          count: count || 0,
        }
      }),
    )

    // Filter out item types with 0 counts (optional)
    const filteredData = itemTypeCounts.filter((item) => item.count > 0)

    // Sort by count in descending order (optional)
    filteredData.sort((a, b) => b.count - a.count)

    return NextResponse.json(filteredData)
  } catch (error) {
    console.error('Error fetching item type count data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch item type count data' },
      { status: 500 },
    )
  }
}