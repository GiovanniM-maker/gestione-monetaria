import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { registerSessionAccounts, UidRuotati } from '@/lib/sync/accounts';
import { scadeTutto } from '@/lib/supabase/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Registra connessione e conti a partire dalla sessione Enable Banking corrente.
 *
 * Sta sotto `/api/admin/*`, quindi dietro autenticazione di sessione e non
 * dietro un segreto condiviso: tocca dati bancari e la lancia un browser
 * autenticato. Il proxy la protegge gia', il controllo qui e' la seconda
 * serratura (vedi `CLAUDE.md`, regola 6).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return risposta({ error: 'unauthorized' }, { status: 401 });
  }

  const sessionId = request.cookies.get('eb_session_id')?.value;
  if (sessionId === undefined) {
    return risposta(
      { error: 'Nessuna sessione Enable Banking attiva. Autorizza da /debug/eb.' },
      { status: 409 },
    );
  }

  try {
    const { connection, accounts } = await registerSessionAccounts(sessionId);
    return risposta({
      connection: {
        id: connection.id,
        aspsp: `${connection.aspsp_name} (${connection.aspsp_country})`,
        valid_until: connection.valid_until,
      },
      accounts: accounts.map((a) => ({
        id: a.id,
        eb_account_uid: a.eb_account_uid,
        name: a.name,
        iban_masked: a.iban_masked,
        currency: a.currency,
        account_type: a.account_type,
        include_in_totals: a.include_in_totals,
      })),
    });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[sync] registrazione conti fallita:', messaggio);
    // Gli uid ruotati non sono un guasto dell'API: e' uno stato che richiede un
    // intervento, e 409 lo dice meglio di 502.
    const stato = errore instanceof UidRuotati ? 409 : 502;
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
