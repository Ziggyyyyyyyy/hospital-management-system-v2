import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export const updateSession = async (request: NextRequest) => {
  // This `try/catch` block is only here for the interactive tutorial.
  // Feel free to remove once you have Supabase connected.
  try {
    // Create an unmodified response
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            )
            response = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            )
          },
        },
      },
    )

    // This will refresh session if expired - required for Server Components
    // https://supabase.com/docs/guides/auth/server-side/nextjs
    const user = await supabase.auth.getUser()

    // Protected routes — any authenticated-only area redirects anonymous
    // visitors to sign-in instead of rendering pages whose data fetches
    // would fail with 401s. Uses the same session resolved above.
    const protectedPrefixes = [
      '/page',
      '/admin',
      '/doctor',
      '/nurse',
      '/patient',
      '/pharmacy',
    ]
    const { pathname } = request.nextUrl
    const isProtectedRoute = protectedPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )

    if (isProtectedRoute && user.error) {
      return NextResponse.redirect(new URL('/sign-in', request.url))
    }

    if (request.nextUrl.pathname === '/' && !user.error) {
      return NextResponse.redirect(new URL('/page', request.url))
    }

    return response
  } catch (e) {
    // If you are here, a Supabase client could not be created!
    // This is likely because you have not set up environment variables.
    // Check out http://localhost:3000 for Next Steps.
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    })
  }
}
