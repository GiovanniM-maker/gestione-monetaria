/**
 * Elenco tipizzato delle variabili d'ambiente dell'applicazione.
 *
 * Serve a due cose:
 *  - permettere l'accesso con la notazione a punto (`process.env.FOO`), che e'
 *    l'unica forma che Next sostituisce staticamente al build per le
 *    `NEXT_PUBLIC_*`. Con `process.env['FOO']` la variabile non finirebbe nel
 *    bundle client e sarebbe `undefined` a runtime;
 *  - tenere in un solo posto la lista di cio' che l'app si aspetta.
 *
 * Tutte opzionali di proposito: la validazione e' a runtime, in `src/lib/env.ts`
 * e negli helper di autorizzazione, non nei tipi.
 *
 * Aggiungendo una variabile qui, aggiungerla anche a `.env.example`.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /** URL del progetto Supabase. Pubblica. */
    readonly NEXT_PUBLIC_SUPABASE_URL?: string;
    /** Chiave anon/publishable di Supabase. Pubblica, inutile senza RLS. */
    readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
    /** Origine pubblica dell'app, base del link di accesso via email. */
    readonly NEXT_PUBLIC_SITE_URL?: string;
    /** Unico indirizzo autorizzato. NON pubblica. */
    readonly ALLOWED_EMAIL?: string;
    /** Segreto inviato da Vercel Cron come Bearer token. NON pubblica. */
    readonly CRON_SECRET?: string;
  }
}
