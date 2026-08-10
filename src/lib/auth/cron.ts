import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Autorizzazione delle route `/api/cron/*`.
 *
 * Vercel Cron, quando la variabile d'ambiente `CRON_SECRET` e' impostata sul
 * progetto, invia automaticamente l'header `Authorization: Bearer ${CRON_SECRET}`
 * a ogni invocazione schedulata. Usiamo quel meccanismo nativo e non un header
 * custom, cosi' non c'e' un secondo canale da mantenere.
 *
 * Queste route sono escluse dal controllo di sessione nel proxy: questo
 * helper e' l'UNICA cosa che le protegge, quindi va chiamato come prima
 * istruzione di ogni handler cron, senza eccezioni.
 *
 * In Fase 0 non esiste ancora nessuna route cron: qui c'e' solo la convenzione.
 */

export class CronAuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CronAuthError';
    this.status = status;
  }
}

/** Confronto a tempo costante, per non trasformare il segreto in un oracolo. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // `timingSafeEqual` pretende buffer della stessa lunghezza; confrontare le
  // lunghezze prima rivela solo la lunghezza, non il contenuto.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Lancia `CronAuthError` se la richiesta non proviene dallo scheduler.
 * Non restituisce nulla: o passa, o solleva.
 */
export function assertCronRequest(request: NextRequest): void {
  const expected = process.env.CRON_SECRET;
  if (expected === undefined || expected.trim() === '') {
    // Meglio rifiutare tutto che accettare tutto quando la config e' rotta.
    throw new CronAuthError('CRON_SECRET non configurato', 500);
  }

  const header = request.headers.get('authorization');
  if (header === null || !header.startsWith('Bearer ')) {
    throw new CronAuthError('Header Authorization mancante o malformato', 401);
  }

  if (!secretsMatch(header.slice('Bearer '.length), expected.trim())) {
    throw new CronAuthError('Segreto cron non valido', 401);
  }
}
