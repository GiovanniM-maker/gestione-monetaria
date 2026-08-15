import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { cercaEsercenti, spostaMovimento, SpostamentoNonValido } from '@/lib/movimenti/sposta';
import { scadeTutto } from '@/lib/supabase/cache';

/**
 * Cercare un esercente e spostarci sopra un movimento.
 *
 * Sotto `/api/admin/*`, quindi dietro autenticazione di sessione e non dietro
 * il segreto del cron: la lancia un browser autenticato e tocca dati bancari.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return risposta({ error: 'unauthorized' }, { status: 401 });
  }

  const testo = request.nextUrl.searchParams.get('q') ?? '';
  return risposta({ esercenti: await cercaEsercenti(testo) });
}

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
    await spostaMovimento({
      id: String(corpo['id'] ?? ''),
      merchantId: typeof corpo['merchantId'] === 'string' ? corpo['merchantId'] : null,
      ...(corpo['nuovo'] === undefined ? {} : { nuovo: corpo['nuovo'] as { nome: string } }),
    });
    return risposta({ ok: true });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof SpostamentoNonValido ? 400 : 500;
    if (stato === 500) console.error('[sposta movimento] fallito:', messaggio);
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
