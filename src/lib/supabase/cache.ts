import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { unstable_cache, revalidateTag } from 'next/cache';
import { publicEnv } from '@/lib/env';
import { createSupabaseServerClient } from './server';

/**
 * La cache dei dati, senza rinunciare a RLS.
 *
 * ---------------------------------------------------------------------------
 * Il vincolo che sembrava insuperabile
 * ---------------------------------------------------------------------------
 * `unstable_cache` di Next **vieta** di leggere i cookie dentro la funzione
 * memorizzata — giustamente: una funzione che legge i cookie dipende da chi
 * chiama, e memorizzarne il risultato sotto una chiave che non contiene chi
 * chiama e' esattamente come si servono i dati di uno all'altro.
 *
 * Ma la nostra sessione sta nei cookie, e senza sessione la chiave anon non
 * legge niente: RLS blocca tutto. La strada ovvia era leggere con
 * `service_role`, che **scavalca RLS** — e a quel punto l'ultima difesa dei
 * dati bancari sarebbe stata la sola autenticazione.
 *
 * ---------------------------------------------------------------------------
 * La strada che non ci rinuncia
 * ---------------------------------------------------------------------------
 * Il divieto e' su *leggere i cookie dentro*, non su *sapere chi chiama*. Quindi
 * il gettone di sessione si legge **fuori** e si passa come primo argomento:
 *
 *   1. finisce nella **chiave** della cache, perche' `unstable_cache` include
 *      gli argomenti — quindi due sessioni diverse non si vedono mai i dati a
 *      vicenda, ed e' una garanzia strutturale e non una promessa;
 *   2. viaggia come `Authorization: Bearer`, quindi **Postgres continua a
 *      valutare RLS** riga per riga come se non ci fosse nessuna cache.
 *
 * La chiave `service_role` non serve, e non deve esistere da nessuna parte.
 *
 * Il gettone scade circa ogni ora: al rinnovo la chiave cambia e la cache si
 * ricostruisce. E' il prezzo, ed e' basso — dentro l'ora tutte le richieste si
 * riusano.
 *
 * ---------------------------------------------------------------------------
 * Invalidare non e' un'ottimizzazione, e' la correttezza
 * ---------------------------------------------------------------------------
 * Un totale vecchio mostrato come se fosse fresco e' il guasto che questa
 * applicazione non si puo' permettere. Ogni scrittura chiama `scadeTutto()`,
 * senza cercare di essere furba su quali chiavi buttare: il costo di essere
 * grossolani e' una manciata di query dopo una correzione, il costo di essere
 * precisi e sbagliare e' un numero falso.
 */

/** L'unica etichetta. Una sola, di proposito: vedi sopra. */
const ETICHETTA = 'dati';

/**
 * Per quanti secondi un dato resta fermo se **nessuno** ha scritto.
 *
 * Non e' la finestra entro cui i dati sono giusti — quella la garantisce
 * l'invalidazione — e' la rete di sicurezza per una scrittura arrivata da fuori
 * dall'applicazione: una query lanciata a mano sul pannello Supabase, o una
 * migration. Sessanta secondi sono meno di qualunque cosa si noti, e molto meno
 * dell'intervallo fra due sincronizzazioni.
 */
const SECONDI = 60;

/** Il gettone della sessione corrente. Si legge **fuori** dalla cache. */
export async function gettoneDiSessione(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  // `getSession()` legge il cookie senza rivalidarlo, e qui va bene: non si sta
  // decidendo se l'utente e' autorizzato — quello l'hanno gia' fatto il proxy e
  // il layout con `getUser()`. Qui serve solo il gettone da girare a Postgres,
  // che lo verifica lui e ci applica RLS.
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Un client senza cookie, che parla per conto della sessione ricevuta.
 *
 * `persistSession` e `autoRefreshToken` spenti: non deve scrivere niente da
 * nessuna parte e non deve rinnovare un gettone che non e' suo.
 */
function clientConGettone(gettone: string): SupabaseClient {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${gettone}` } },
  });
}

/**
 * Avvolge una lettura in cache.
 *
 * `nome` deve essere unico, e gli argomenti devono contenere **tutto** cio' che
 * cambia il risultato — il mese, il filtro, la pagina. Una chiave incompleta e'
 * il modo di far comparire i dati di luglio sotto l'intestazione di agosto.
 *
 * Senza sessione la lettura non si mette in cache e si esegue e basta: senza
 * gettone RLS non restituirebbe niente, e memorizzare un elenco vuoto sarebbe
 * il modo peggiore di sbagliare.
 */
export function inCache<A extends readonly unknown[], R>(
  nome: string,
  lettura: (sb: SupabaseClient, ...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  const memorizzata = unstable_cache(
    async (gettone: string, ...args: A) => lettura(clientConGettone(gettone), ...args),
    [nome],
    { tags: [ETICHETTA], revalidate: SECONDI },
  );

  return async (...args: A): Promise<R> => {
    const gettone = await gettoneDiSessione();
    if (gettone === null) return lettura(await createSupabaseServerClient(), ...args);
    return memorizzata(gettone, ...args);
  };
}

/**
 * Butta tutto. Da chiamare dopo **ogni** scrittura.
 *
 * Non fallisce mai verso l'alto: se l'invalidazione esplodesse, la scrittura e'
 * gia' avvenuta, e far fallire la richiesta direbbe all'utente una bugia
 * peggiore — «non e' andata» quando invece e' andata. Il costo di un errore qui
 * e' un minuto di dato fermo, e si vede nei log.
 */
export function scadeTutto(): void {
  try {
    // In Next 16 il secondo argomento e' il profilo di scadenza da invalidare;
    // `max` prende tutto.
    revalidateTag(ETICHETTA, 'max');
  } catch (errore) {
    console.error('[cache] invalidazione fallita:', errore);
  }
}
