import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/lib/env';

/**
 * Client Supabase per Server Component, Server Action e Route Handler.
 * Usa la chiave anon: ogni accesso ai dati passa da RLS.
 *
 * Va creato a ogni richiesta, mai messo in una variabile module-level: i cookie
 * appartengono alla singola richiesta.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chiamato da un Server Component: la scrittura dei cookie non e'
          // permessa. Il refresh del token e' comunque gia' gestito dal
          // proxy, quindi ignorare qui e' corretto e non perde la sessione.
        }
      },
    },
  });
}

/**
 * Utente autenticato della richiesta corrente, oppure `null`.
 *
 * Usa `getUser()` e non `getSession()`: `getSession()` si fida del cookie senza
 * verificarlo contro il server di auth, quindi non e' una base valida per
 * decisioni di autorizzazione.
 *
 * ---------------------------------------------------------------------------
 * `cache()` toglie il costo, non il controllo
 * ---------------------------------------------------------------------------
 * `getUser()` e' una **chiamata di rete** al server di auth, e chiunque la
 * invochi due volte nella stessa richiesta la paga due volte. Succedeva: il
 * layout con `requireUser()` e, sulle route, `getAuthorizedUser()`.
 *
 * `cache()` di React la memorizza per la durata di **una singola richiesta**,
 * e non oltre: non e' una cache di dati, e' la deduplica di una domanda fatta
 * due volte nello stesso istante. Ogni richiesta nuova rivalida da capo, quindi
 * la seconda serratura della regola 6 resta una serratura vera.
 *
 * Non dedupica invece fra il proxy e i componenti server: sono due runtime
 * diversi e non condividono niente. Quella chiamata resta, ed e' voluta — e'
 * proprio il controllo che deve sopravvivere a un cambio del matcher.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
