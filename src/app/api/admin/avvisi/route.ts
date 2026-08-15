import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { AvvisoNonValido, cambiaStatoAvviso, generaAvvisi } from '@/lib/avvisi/leggi';
import { scadeTutto } from '@/lib/supabase/cache';

export const dynamic = 'force-dynamic';

/** `POST` rigenera gli avvisi, `PATCH` cambia lo stato di uno. */
export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return risposta({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return risposta({ creati: await generaAvvisi() });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[avvisi] generazione fallita:', messaggio);
    return risposta({ error: messaggio }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return risposta({ error: 'unauthorized' }, { status: 401 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return risposta({ error: 'Corpo della richiesta non leggibile.' }, { status: 400 });
  }

  try {
    await cambiaStatoAvviso(String(corpo['id'] ?? ''), String(corpo['stato'] ?? ''));
    return risposta({ ok: true });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof AvvisoNonValido ? 400 : 500;
    if (stato === 500) console.error('[avvisi] aggiornamento fallito:', messaggio);
    return risposta({ error: messaggio }, { status: stato });
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
