import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

type UserRoleResult = {
  role: string
  userId: string
}

export async function getUserRole(): Promise<UserRoleResult | null> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    console.error('Authentication failed:', userError)
    return null
  }

  // Resolve the staff type through the service client. The medical_staff
  // RLS policy is self-referential, so evaluating it for an authenticated
  // session recurses until PostgreSQL aborts with SQLSTATE 54001 (stack
  // depth limit exceeded). Role resolution is an authorization decision
  // keyed off the verified JWT subject (never client input), so this
  // elevated read is safe and keeps every caller's behavior unchanged.
  const service = createServiceClient()

  const { data: staffData, error: staffError } = await service
    .from('medical_staff')
    .select('staff_type')
    .eq('user_id', user.id)
    .single()

  if (staffError) {
    if (staffError.code === 'PGRST116') {
      // No matching staff: probably a patient
      return { role: 'Patient', userId: user.id }
    }
    console.error('Error checking role:', staffError)
    return null
  }

  return {
    role: staffData?.staff_type || 'Patient',
    userId: user.id,
  }
}