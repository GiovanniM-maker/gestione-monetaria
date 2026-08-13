import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { riclassificaConLeProve } from '@/lib/tassonomia/riclassifica';
import { ConfigurazioneAiMancante } from '@/lib/ai/modello';

/**
 * Una fetta di riclassificazione, con le descrizioni trovate davanti.
 *
 * Sotto `/api/admin/*`, quindi dietro autenticazione di sessione: la lancia un
 * browser autenticato e tocca dati bancari.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await riclassificaConLeProve());
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const atteso = errore instanceof ConfigurazioneAiMancante;
    if (!atteso) console.error('[riclassifica] fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: atteso ? 400 : 500 });
  }
}
