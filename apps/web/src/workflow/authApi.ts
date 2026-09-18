export type SessionUser = {
  id: string
  email: string
  name?: string
}

async function messageFrom(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { message?: unknown } | null
  return typeof data?.message === 'string' ? data.message : fallback
}

// The session lives in an HttpOnly cookie, so the browser attaches it to these
// same-origin requests and the dashboard never handles the token itself.
export async function getSessionUser(): Promise<SessionUser | null> {
  let response: Response
  try {
    response = await fetch('/api/auth/me', { credentials: 'include' })
  } catch {
    throw new Error('NexFlow API is unavailable.')
  }
  if (response.status === 401) return null
  if (!response.ok) throw new Error(await messageFrom(response, 'Could not verify your session.'))
  return (await response.json()) as SessionUser
}

async function authenticate(
  path: '/api/auth/login' | '/api/auth/register',
  email: string,
  password: string,
  name: string,
  fallback: string,
): Promise<SessionUser> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...(name ? { name } : {}) }),
    })
  } catch {
    throw new Error('NexFlow API is unavailable.')
  }
  if (!response.ok) throw new Error(await messageFrom(response, fallback))
  return (await response.json()) as SessionUser
}

export function signUpRemote(email: string, password: string, name: string) {
  return authenticate('/api/auth/register', email, password, name, 'Could not create the account.')
}

export function logInRemote(email: string, password: string) {
  return authenticate('/api/auth/login', email, password, '', 'Could not sign in.')
}

export async function logOutRemote() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined)
}
