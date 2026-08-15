import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import {
  classificaMovimento,
  ClassificazioneNonValida,
  type Classificazione,
} from '@/lib/movimenti/classifica';

export const dynamic = 'force-dynamic';

/**
 * La classificazione di una singola riga, dalla sua scheda.
 *
 * Sotto `/api/admin/*`: dietro autenticazione di sessione (CLAUDE.md, regola 6).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Corpo della richiesta non leggibile.' }, { status: 400 });
  }

  try {
    await classificaMovimento(corpo as unknown as Classificazione);
    return NextResponse.json({ ok: true });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof ClassificazioneNonValida ? 400 : 500;
    if (stato === 500) console.error('[classifica] fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: stato });
  }
}
