import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import {
  confermaMovimenti,
  confermaMovimento,
  ConfermaNonValida,
  disconfermaMovimenti,
  type RichiestaConferma,
} from '@/lib/conferma/leggi';
import { scadeTutto } from '@/lib/supabase/cache';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
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
    // Un elenco di identificativi e' «va bene su tutte quelle che sto
    // guardando»; senza elenco e' la conferma o la correzione di una sola. Due
    // forme e non un parametro opzionale, come le due funzioni SQL sotto.
    // L'annulla dell'avviso passeggero. Una forma sua e non un parametro
    // `confermato: false`: sono due intenzioni diverse, e un booleano al posto
    // di un nome e' il modo di scoprire fra sei mesi che qualcuno lo passava
    // per sbaglio.
    const daDisfare = corpo['disconferma'];
    if (Array.isArray(daDisfare)) {
      const disfatte = await disconfermaMovimenti(daDisfare.map((i) => String(i)));
      return risposta({ ok: true, disfatte });
    }

    const ids = corpo['ids'];
    if (Array.isArray(ids)) {
      const confermate = await confermaMovimenti(ids.map((i) => String(i)));
      return risposta({ ok: true, confermate });
    }
    await confermaMovimento(corpo as unknown as RichiestaConferma);
    return risposta({ ok: true });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof ConfermaNonValida ? 400 : 500;
    if (stato === 500) console.error('[conferma] fallita:', messaggio);
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
