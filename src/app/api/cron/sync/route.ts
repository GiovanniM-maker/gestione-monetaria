import { NextResponse, type NextRequest } from 'next/server';
import { assertCronRequest, CronAuthError } from '@/lib/auth/cron';
import { eseguiSincronizzazioneQuotidiana } from '@/lib/sync/quotidiano';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * La sincronizzazione quotidiana, invocata da Vercel Cron.
 *
 * Sta sotto `/api/cron/*`, l'unica famiglia esclusa dal controllo di sessione
 * nel proxy: non ha un browser dietro. `assertCronRequest` e' quindi **l'unica
 * cosa che la protegge**, e va chiamata come prima istruzione — Vercel invia
 * `Authorization: Bearer ${CRON_SECRET}` in automatico quando la variabile e'
 * impostata sul progetto.
 *
 * Risponde sempre con il resoconto, anche quando qualcosa e' andato storto: un
 * cron che risponde 500 e basta lascia come unica traccia una riga di log, e
 * il resoconto invece dice *quanto* e' stato fatto prima di fermarsi. Lo stato
 * duraturo sta comunque in `sync_runs`, che il cruscotto legge da
 * `v_stato_sistema`.
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

  const esito = await eseguiSincronizzazioneQuotidiana();

  if (esito.errore !== null) {
    console.error('[cron] sincronizzazione con errori:', esito.errore);
  }
  if (esito.saltata !== null) {
    console.warn('[cron] sincronizzazione saltata:', esito.saltata);
  }

  // 200 anche con errori: lo scheduler non ha modo di reagire a un 500 se non
  // ritentando, e ritentare uno scarico gia' fatto a meta' non aiuta — il
  // cursore e' salvato e il giro dopo riprende da solo.
  return NextResponse.json(esito);
}
