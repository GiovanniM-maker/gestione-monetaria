/**
 * Lettura e validazione delle variabili d'ambiente.
 *
 * Regola non negoziabile: nessun segreto in variabili `NEXT_PUBLIC_*`.
 * Le sole variabili pubbliche ammesse qui sono URL e chiave anon/publishable
 * di Supabase, che sono progettate per stare nel bundle client e sono inutili
 * senza RLS a monte.
 *
 * Tutto cio' che e' segreto (CRON_SECRET, chiavi Enable Banking, service role)
 * si legge SOLO da moduli server-only.
 */

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Variabile d'ambiente mancante: ${name}. Vedi .env.example e la sezione "Setup" del README.`,
    );
  }
  return value.trim();
}

/**
 * Variabili pubbliche. Devono essere referenziate con il nome letterale
 * completo: Next sostituisce `process.env.NEXT_PUBLIC_X` staticamente al
 * build, un accesso dinamico non verrebbe inlined nel bundle client.
 */
export const publicEnv = {
  supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  siteUrl: required('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL).replace(/\/+$/, ''),
} as const;

/** Fuso e locale applicativi. Fissati qui una volta, mai dedotti dal runtime. */
export const APP_TIMEZONE = 'Europe/Rome';
export const APP_LOCALE = 'it-IT';
export const APP_CURRENCY = 'EUR';
