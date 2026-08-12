import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { applicaTassonomia } from '@/lib/tassonomia/applica';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Applica la tassonomia all'intero storico.
 *
 * Sta sotto `/api/admin/*`, quindi dietro autenticazione di sessione e non
 * dietro un segreto condiviso: tocca dati bancari e la lancia un browser
 * autenticato (CLAUDE.md, regola 6).
 */
export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await applicaTassonomia());
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[tassonomia] categorizzazione fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: 500 });
  }
}
