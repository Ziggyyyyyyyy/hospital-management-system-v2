import { NextResponse } from 'next/server'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { generateAuthUrl } from '@/lib/calendar/google-calendar-service'

const STATE_SALT =
  process.env.ENCRYPTION_SALT ?? 'hospital-mgmt-calendar-salt-placeholder-v1'

function encodeState(userId: string): string {
  try {
    const salted = STATE_SALT + '::' + userId + '::' + Date.now()
    const utf8 = Buffer.from(salted, 'utf8').toString('base64')
    return utf8.split('').reverse().join('')
  } catch {
    const utf8 = Buffer.from(userId, 'utf8').toString('base64')
    return utf8.split('').reverse().join('')
  }
}

export async function GET(req: Request) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, [
    'Admin',
    'Doctor',
    'Nurse',
    'Pharmacist',
    'Patient',
  ])
  if (deny) return err(deny)

  try {
    const state = encodeState(identity.userId)
    const result = generateAuthUrl({ state })
    if (!result.success || !result.auth_url) {
      return err(
        makeApptError('INTERNAL_ERROR', result.error ?? 'Failed to generate auth URL'),
      )
    }

    const url = new URL(req.url)
    const redirectRaw = url.searchParams.get('redirect')
    const shouldRedirect =
      redirectRaw === '1' || redirectRaw === 'true' || redirectRaw === null

    if (shouldRedirect) {
      return NextResponse.redirect(result.auth_url)
    }

    return ok({ auth_url: result.auth_url })
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Failed to start OAuth flow'))
  }
}
