import { NextResponse } from 'next/server';
import { VERSIONE } from '@/lib/versione';

export const dynamic = 'force-dynamic';

/**
 * Quale versione sta servendo il server **adesso**.
 *
 * La pagina che hai aperto conosce la versione con cui e' stata costruita; qui
 * si chiede quella corrente. Se le due differiscono, c'e' un deploy nuovo e
 * l'applicazione lo dice invece di lasciarti su una schermata vecchia.
 *
 * `no-store` non e' pignoleria: questa e' l'unica risposta dell'applicazione
 * che **deve** saltare ogni cache, perche' una risposta memorizzata direbbe per
 * sempre che la versione e' quella di quando e' stata memorizzata — cioe'
 * risponderebbe sempre «sei aggiornato».
 *
 * Non espone niente: un hash di commit accorciato, che chi usa l'app puo'
 * comunque leggere nel proprio browser. Resta dietro l'autenticazione di
 * sessione come ogni altra route, perche' il proxy non fa eccezioni.
 */
export function GET(): NextResponse {
  return NextResponse.json(
    { versione: VERSIONE },
    { headers: { 'cache-control': 'no-store, max-age=0' } },
  );
}
