/**
 * STRATO 2 dell'allowlist (vedi CLAUDE.md).
 *
 * Strato 1: signup pubblico disabilitato su Supabase + `shouldCreateUser: false`
 *           nella chiamata a `signInWithOtp`.
 * Strato 2: questo modulo — l'email viene confrontata con `ALLOWED_EMAIL`
 *           prima di inviare il magic link e a ogni richiesta nel proxy.
 * Strato 3: RLS in Postgres, legata alla tabella `app_users`.
 *
 * Nessuno dei tre strati basta da solo, e nessuno dei tre e' ridondante.
 *
 * NB: questo modulo NON importa `server-only` perche' viene usato anche dal
 * proxy, che gira in edge runtime senza la condizione `react-server`.
 * La garanzia di non-esposizione resta comunque intatta: `ALLOWED_EMAIL` non e'
 * una variabile `NEXT_PUBLIC_*`, quindi non viene inlined in nessun bundle
 * client, e in un ipotetico import lato client la lettura fallirebbe.
 */

/**
 * Normalizzazione conservativa: trim + lowercase.
 *
 * Deliberatamente NON si applicano normalizzazioni "furbe" tipo rimuovere i
 * punti nella parte locale o troncare il suffisso `+tag` come fa Gmail: sono
 * regole specifiche di un provider e allargherebbero l'allowlist a indirizzi
 * che non sono quello autorizzato. Meglio un confronto stretto.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Sintassi minima: una chiocciola, testo prima e dopo, un punto nel dominio. */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}

function allowedEmails(): readonly string[] {
  const raw = process.env.ALLOWED_EMAIL;
  if (raw === undefined || raw.trim() === '') {
    throw new Error("Variabile d'ambiente mancante: ALLOWED_EMAIL.");
  }
  return raw
    .split(',')
    .map(normalizeEmail)
    .filter((value) => value !== '');
}

/**
 * Unica funzione autorizzata a rispondere "questo utente puo' entrare".
 * `email` puo' essere `undefined` perche' `User.email` di Supabase e' opzionale.
 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (email == null) return false;
  const candidate = normalizeEmail(email);
  if (candidate === '') return false;
  return allowedEmails().includes(candidate);
}
