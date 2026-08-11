import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { creaBackfill, eseguiFettaBackfill } from '@/lib/sync/backfill';
import { comeArray } from '@/lib/enablebanking/redact';
import type { AccountRow, BankConnectionRow } from '@/lib/db/types';

export const dynamic = 'force-dynamic';

/**
 * Tetto di durata della funzione. Il budget del backfill sta sotto questo
 * valore, con un margine per scrivere lo stato prima di essere interrotti.
 */
export const maxDuration = 300;

const BUDGET_MS = 240_000;

/**
 * Budget minimo accettato. Serve a rendere la riavviabilita' verificabile:
 * con `?budget_ms=5000` una fetta esaurisce il tempo dopo poche pagine, quindi
 * il backfill si spezza davvero e il percorso di ripresa viene percorso invece
 * che dato per buono. Su uno storico corto, altrimenti, tutto finisce in una
 * fetta sola e quel codice non viene mai eseguito.
 */
const BUDGET_MS_MINIMO = 5_000;

function budgetRichiesto(parametri: URLSearchParams): number {
  const grezzo = parametri.get('budget_ms');
  if (grezzo === null) return BUDGET_MS;
  const valore = Number.parseInt(grezzo, 10);
  if (!Number.isFinite(valore)) return BUDGET_MS;
  return Math.min(Math.max(valore, BUDGET_MS_MINIMO), BUDGET_MS);
}

/** `YYYY-MM-DD`, l'unico formato che accettiamo per gli estremi dell'intervallo. */
const GIORNO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Avvia o riprende un backfill.
 *
 * Senza `run_id` ne crea uno nuovo sui conti della connessione indicata (o
 * dell'unica esistente). Con `run_id` riprende quello, dal cursore salvato.
 *
 * In entrambi i casi esegue **una fetta** e restituisce lo stato: se
 * `completato` e' `false`, va richiamata con lo stesso `run_id`. E' questo che
 * rende il backfill indipendente dal completamento di una singola invocazione.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parametri = request.nextUrl.searchParams;
  const runIdEsistente = parametri.get('run_id');
  const budget = budgetRichiesto(parametri);

  try {
    if (runIdEsistente !== null) {
      const esito = await eseguiFettaBackfill(runIdEsistente, budget);
      return NextResponse.json(esito, { status: esito.status === 'failed' ? 502 : 200 });
    }

    const dateFrom = parametri.get('date_from');
    const dateTo = parametri.get('date_to');

    for (const [nome, valore] of [
      ['date_from', dateFrom],
      ['date_to', dateTo],
    ] as const) {
      if (valore !== null && !GIORNO.test(valore)) {
        return NextResponse.json(
          { error: `${nome} deve essere nel formato YYYY-MM-DD` },
          { status: 400 },
        );
      }
    }

    const supabase = await createSupabaseServerClient();

    const { data: connessioni } = await supabase
      .from('bank_connections')
      .select('*')
      .order('created_at', { ascending: true });

    const elenco = comeArray<BankConnectionRow>(connessioni);
    const richiesta = parametri.get('connection_id');
    const connessione =
      richiesta !== null ? elenco.find((c) => c.id === richiesta) : (elenco[0] ?? undefined);

    if (connessione === undefined) {
      return NextResponse.json(
        { error: 'Nessuna connessione registrata. Lancia prima /api/admin/sync-accounts.' },
        { status: 409 },
      );
    }

    const { data: conti } = await supabase
      .from('accounts')
      .select('*')
      .eq('connection_id', connessione.id)
      .eq('is_active', true);

    const uids = comeArray<AccountRow>(conti).map((c) => c.eb_account_uid);
    if (uids.length === 0) {
      return NextResponse.json(
        { error: 'Nessun conto attivo per questa connessione.' },
        { status: 409 },
      );
    }

    const run = await creaBackfill({
      connectionId: connessione.id,
      accountUids: uids,
      dateFrom,
      dateTo,
    });

    const esito = await eseguiFettaBackfill(run.id, budget);
    return NextResponse.json(esito, { status: esito.status === 'failed' ? 502 : 200 });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[backfill] errore:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: 500 });
  }
}
