import { NextResponse, type NextRequest } from 'next/server';
import { assertCronRequest, CronAuthError } from '@/lib/auth/cron';
import { generaReport, mesePrecedente } from '@/lib/report/genera';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Il report del mese appena chiuso, il primo del mese.
 *
 * Si scrive **dopo** che il mese e' finito e non durante: un mese in corso non
 * si racconta, si guarda. E' la stessa ragione per cui il picco di categoria
 * guarda l'ultimo mese completo — un racconto su undici giorni presentato come
 * il mese sarebbe falso comunque lo si scriva.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    assertCronRequest(request);
  } catch (errore) {
    if (errore instanceof CronAuthError) {
      return NextResponse.json({ error: errore.message }, { status: errore.status });
    }
    throw errore;
  }

  try {
    const esito = await generaReport(mesePrecedente());
    return NextResponse.json(esito);
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[cron] report fallito:', messaggio);
    // 200 come la sincronizzazione: lo scheduler non sa reagire a un 500 se
    // non ritentando, e ritentare una scrittura fallita per mancanza di chiave
    // non la fa riuscire.
    return NextResponse.json({ errore: messaggio });
  }
}
