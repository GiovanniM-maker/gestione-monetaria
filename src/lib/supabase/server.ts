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
 */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
