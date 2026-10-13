import type { Context } from '@netlify/functions'
import { SignJWT, jwtVerify } from 'jose'
import { compare } from 'bcryptjs'
import { and, count, eq, gt } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { securityEvents } from '../../db/schema.js'

export type Role = 'teacher' | 'admin'
export type Session = { role: Role; username: string; csrf: string }
export const SESSION_COOKIE = 'smkb_session'
export const SESSION_MINUTES = 30

const secret = () => {
  const value = Netlify.env.get('SESSION_SECRET')
  if (!value || value.length < 32) throw new Error('SESSION_SECRET belum dikonfigurasi dengan selamat.')
  return new TextEncoder().encode(value)
}

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', ...headers },
})

export const errorResponse = (message: string, status = 400) => json({ error: message }, status)

export async function createSession(context: Context, role: Role, username: string, existingCsrf?: string) {
  const csrf = existingCsrf || crypto.randomUUID()
  const token = await new SignJWT({ role, username, csrf })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MINUTES}m`)
    .sign(secret())
  context.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: SESSION_MINUTES * 60,
  })
  return { role, username, csrf }
}

export async function getSession(context: Context): Promise<Session | null> {
  const token = context.cookies.get(SESSION_COOKIE)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    if ((payload.role !== 'teacher' && payload.role !== 'admin') || !payload.username || !payload.csrf) return null
    return { role: payload.role, username: String(payload.username), csrf: String(payload.csrf) }
  } catch {
    return null
  }
}

export async function requireRole(req: Request, context: Context, roles: Role[], csrf = false): Promise<{ response?: Response; session?: Session }> {
  const session = await getSession(context)
  if (!session || !roles.includes(session.role)) return { response: errorResponse('Sesi tidak sah atau telah tamat.', 401) }
  if (csrf && req.headers.get('x-csrf-token') !== session.csrf) return { response: errorResponse('Pengesahan keselamatan gagal. Sila muat semula halaman.', 403) }
  if (csrf) {
    const origin = req.headers.get('origin')
    if (origin && new URL(origin).host !== new URL(req.url).host) return { response: errorResponse('Permintaan tidak dibenarkan.', 403) }
  }
  await createSession(context, session.role, session.username, session.csrf)
  return { session }
}

export async function verifyCredentials(username: string, password: string) {
  const options = [
    { role: 'teacher' as const, username: Netlify.env.get('TEACHER_USERNAME'), hash: Netlify.env.get('TEACHER_PASSWORD_HASH') },
    { role: 'admin' as const, username: Netlify.env.get('ADMIN_USERNAME'), hash: Netlify.env.get('ADMIN_PASSWORD_HASH') },
  ]
  for (const option of options) {
    if (option.username && option.hash && username === option.username && await compare(password, option.hash)) return option.role
  }
  return null
}

export async function rateLimit(eventType: string, identifier: string, limit: number, minutes: number) {
  const since = new Date(Date.now() - minutes * 60_000)
  const [result] = await db.select({ value: count() }).from(securityEvents).where(and(
    eq(securityEvents.eventType, eventType),
    eq(securityEvents.identifier, identifier),
    gt(securityEvents.createdAt, since),
  ))
  if (Number(result?.value ?? 0) >= limit) return false
  await db.insert(securityEvents).values({ eventType, identifier })
  return true
}

export const safeFilename = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.\.+/g, '.').slice(0, 160)
