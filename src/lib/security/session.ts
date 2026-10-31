import 'server-only';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';

export const SESSION_COOKIE = 'claimsathi_sid';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type SessionUser = {
  id: string;
  simulatedNow: Date;
};

/**
 * Resolve the demo session for the current request, creating it when the
 * cookie is absent or stale. The cookie is HTTP-only; browsers can never read
 * it, and every data read/write in the app is scoped to this session id.
 */
export async function getOrCreateSession(): Promise<SessionUser> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;

  if (existing) {
    const found = await prisma.demoSession.findUnique({ where: { id: existing } });
    if (found) return { id: found.id, simulatedNow: found.simulatedNow };
  }

  const id = randomUUID();
  const created = await prisma.demoSession.create({ data: { id } });
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
  return { id: created.id, simulatedNow: created.simulatedNow };
}

export async function requireSession(): Promise<SessionUser> {
  return getOrCreateSession();
}

/** Advance the session-wide simulated clock by `minutes`. */
export async function advanceSimulatedTime(sessionId: string, minutes: number): Promise<Date> {
  const session = await prisma.demoSession.update({
    where: { id: sessionId },
    data: { simulatedNow: new Date(Date.now() + 0) },
  });
  // Apply the delta to the persisted value.
  const updated = await prisma.demoSession.update({
    where: { id: sessionId },
    data: { simulatedNow: new Date(session.simulatedNow.getTime() + minutes * 60_000) },
  });
  return updated.simulatedNow;
}
