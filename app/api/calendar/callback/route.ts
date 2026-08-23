import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  resolveIdentity,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import {
  exchangeCodeForTokens,
  storeUserTokens,
} from '@/lib/calendar/google-calendar-service'

const STATE_SALT =
  process.env.ENCRYPTION_SALT ?? 'hospital-mgmt-calendar-salt-placeholder-v1'

function decodeUserIdFromState(state: string): string | null {
  try {
    const reversed = state.split('').reverse().join('')
    const salted = Buffer.from(reversed, 'base64').toString('utf8')
    const parts = salted.split('::')
    if (parts.length >= 2) {
      return parts[1]
    }
    return Buffer.from(state.split('').reverse().join(''), 'base64').toString(
      'utf8',
    )
  } catch {
    try {
      return Buffer.from(state.split('').reverse().join(''), 'base64').toString(
        'utf8',
      )
    } catch {
      return null
    }
  }
}

function successHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Calendar Connected</title>
    <style>
      body {
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #ecfeff 0%, #e0f2fe 100%);
        color: #0f172a;
      }
      .card {
        background: #ffffff;
        padding: 2.5rem 2rem;
        border-radius: 1rem;
        box-shadow: 0 10px 25px rgba(2, 132, 199, 0.12);
        max-width: 420px;
        text-align: center;
      }
      .check {
        width: 56px;
        height: 56px;
        border-radius: 999px;
        background: #059669;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1rem;
        font-size: 28px;
      }
      h1 {
        margin: 0 0 0.5rem;
        font-size: 1.5rem;
      }
      p {
        margin: 0 0 1.5rem;
        color: #475569;
        line-height: 1.5;
      }
      button {
        background: #0284c7;
        color: white;
        border: 0;
        border-radius: 0.5rem;
        padding: 0.65rem 1.25rem;
        font-weight: 600;
        cursor: pointer;
      }
      button:hover {
        background: #0369a1;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="check">✓</div>
      <h1>Google Calendar Connected</h1>
      <p>
        Your Google Calendar has been successfully linked. You can now close
        this window and return to the app.
      </p>
      <button onclick="window.close()">Close</button>
    </div>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'google_calendar_connected', success: true }, '*');
        }
      } catch (_) {}
    </script>
  </body>
</html>`
}

function errorHtml(message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Calendar Connection Failed</title>
    <style>
      body {
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
        color: #0f172a;
      }
      .card {
        background: #ffffff;
        padding: 2.5rem 2rem;
        border-radius: 1rem;
        box-shadow: 0 10px 25px rgba(220, 38, 38, 0.12);
        max-width: 420px;
        text-align: center;
      }
      .cross {
        width: 56px;
        height: 56px;
        border-radius: 999px;
        background: #dc2626;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1rem;
        font-size: 28px;
      }
      h1 {
        margin: 0 0 0.5rem;
        font-size: 1.5rem;
      }
      p {
        margin: 0 0 1.5rem;
        color: #475569;
        line-height: 1.5;
      }
      .msg {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
        padding: 0.75rem;
        border-radius: 0.5rem;
        font-size: 0.875rem;
        margin-bottom: 1.5rem;
        text-align: left;
      }
      button {
        background: #dc2626;
        color: white;
        border: 0;
        border-radius: 0.5rem;
        padding: 0.65rem 1.25rem;
        font-weight: 600;
        cursor: pointer;
      }
      button:hover {
        background: #b91c1c;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="cross">!</div>
      <h1>Connection Failed</h1>
      <div class="msg">${message.replace(/</g, '&lt;')}</div>
      <p>Please close this window and try again.</p>
      <button onclick="window.close()">Close</button>
    </div>
  </body>
</html>`
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  const fmt = url.searchParams.get('format')

  if (error) {
    const msg = errorDescription ?? `OAuth error: ${error}`
    if (fmt === 'json') {
      return err(makeApptError('VALIDATION_ERROR', msg))
    }
    return new NextResponse(errorHtml(msg), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (!code) {
    const msg = 'Authorization code is missing from callback'
    if (fmt === 'json') {
      return err(makeApptError('VALIDATION_ERROR', msg))
    }
    return new NextResponse(errorHtml(msg), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  let userId: string | null = null
  if (state) {
    userId = decodeUserIdFromState(state)
  }
  if (!userId) {
    const identity = await resolveIdentity()
    if (!('code' in identity)) {
      userId = identity.userId
    }
  }
  if (!userId) {
    try {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) userId = user.id
    } catch {
      // swallow
    }
  }
  if (!userId) {
    const msg = 'Could not determine authenticated user. Please try again.'
    if (fmt === 'json') {
      return err(makeApptError('UNAUTHORIZED', msg))
    }
    return new NextResponse(errorHtml(msg), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  try {
    const exchangeResult = await exchangeCodeForTokens(code)
    if (!exchangeResult.success || !exchangeResult.access_token) {
      const msg =
        exchangeResult.error ?? 'Failed to exchange authorization code for tokens'
      if (fmt === 'json') {
        return err(makeApptError('INTERNAL_ERROR', msg))
      }
      return new NextResponse(errorHtml(msg), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const storeResult = await storeUserTokens({
      user_id: userId,
      access_token: exchangeResult.access_token,
      refresh_token: exchangeResult.refresh_token ?? null,
      expires_at: exchangeResult.expires_at ?? null,
      scope: exchangeResult.scope,
    })

    if (!storeResult.success) {
      const msg = storeResult.error ?? 'Failed to securely store calendar tokens'
      if (fmt === 'json') {
        return err(makeApptError('INTERNAL_ERROR', msg))
      }
      return new NextResponse(errorHtml(msg), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    if (fmt === 'json') {
      return ok({
        connected: true,
        expires_at: exchangeResult.expires_at
          ? new Date(exchangeResult.expires_at).toISOString()
          : null,
        scope: exchangeResult.scope ?? null,
      })
    }

    return new NextResponse(successHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (e: any) {
    const msg = e?.message ?? 'Unexpected error during OAuth callback'
    if (fmt === 'json') {
      return err(makeApptError('INTERNAL_ERROR', msg))
    }
    return new NextResponse(errorHtml(msg), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}
