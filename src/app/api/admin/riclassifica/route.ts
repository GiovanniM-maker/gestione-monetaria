import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { riclassificaConLeProve } from '@/lib/tassonomia/riclassifica';
import { ConfigurazioneAiMancante } from '@/lib/ai/modello';
import { scadeTutto } from '@/lib/supabase/cache';

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
    return risposta({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return risposta(await riclassificaConLeProve());
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const atteso = errore instanceof ConfigurazioneAiMancante;
    if (!atteso) console.error('[riclassifica] fallita:', messaggio);
    return risposta({ error: messaggio }, { status: atteso ? 400 : 500 });
  }
}

/**
 * Ogni risposta di questa route butta la cache dei dati.
 *
 * Anche quelle di errore, ed e' voluto: invalidare di troppo costa una query,
 * invalidare di meno costa un numero vecchio mostrato come fresco. Nel dubbio
 * si butta.
 */
function risposta(corpo: unknown, opzioni?: ResponseInit): NextResponse {
  scadeTutto();
  return NextResponse.json(corpo, opzioni);
}
