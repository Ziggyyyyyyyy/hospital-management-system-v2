import { NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'

/**
 * GET /api/specialties — small public-ish endpoint so the
 * patient-facing UI can show specialty list.
 */
export async function GET() {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Nurse', 'Patient'])
  if (deny) return err(deny)

  // The specialties RLS policy participates in the self-referential policy
  // cycle that exceeds the PostgreSQL stack depth for authenticated
  // sessions (SQLSTATE 54001). Access is already gated to authenticated
  // roles above, so read through the service client (see
  // utils/supabase/service.ts usage policy).
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('specialties')
    .select('*')
    .eq('active', true)
    .order('name')
  if (error) return err(makeApptError('INTERNAL_ERROR', error.message))
  return ok(data ?? [])
}
