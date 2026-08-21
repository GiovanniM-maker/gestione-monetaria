import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { EsercenteNonValido, decidiEsercente, impostaVariabile } from '@/lib/tassonomia/esercenti';
import { scadeTutto } from '@/lib/supabase/cache';

export const dynamic = 'force-dynamic';

/**
 * «Su questo esercente chiedimelo ogni volta», o il contrario.
 *
 * Non tocca nessuna classificazione: cambia soltanto **a chi si chiede**. Per
 * questo non rilancia la tassonomia — non c'e' niente da riapplicare.
 *
 * Sotto `/api/admin/*`: dietro autenticazione di sessione (CLAUDE.md, regola 6).
 */
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
    await impostaVariabile(String(corpo['id'] ?? ''), corpo['variabile'] === true);
    return risposta({ ok: true });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof EsercenteNonValido ? 400 : 500;
    if (stato === 500) console.error('[esercenti] scrittura fallita:', messaggio);
    return risposta({ error: messaggio }, { status: stato });
  }
}

/**
 * La decisione su un esercente appena comparso.
 *
 * `POST` e non `PATCH` come sopra, e la differenza non e' cerimoniale: quella
 * cambia **a chi si chiede** e non tocca nessun numero, questa scrive una
 * categoria che si propaga a tutte le spese gia' registrate. Due verbi diversi
 * per due portate diverse, che e' anche cio' che si legge nel log.
 */
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
    const categoria = corpo['categoria_id'];
    await decidiEsercente({
      id: String(corpo['id'] ?? ''),
      // `null` esplicito e non `undefined`: qui si sta **decidendo**, e
      // «nessuna categoria» e' una decisione possibile — un bonifico ricorrente
      // a un privato puo' non averne una. Confonderla con «non l'ho detto»
      // lascerebbe l'esercente deciso a meta'.
      categoriaId: typeof categoria === 'string' && categoria !== '' ? categoria : null,
      variabile: corpo['variabile'] === true,
    });
    return risposta({ ok: true });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof EsercenteNonValido ? 400 : 500;
    if (stato === 500) console.error('[esercenti] decisione fallita:', messaggio);
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
