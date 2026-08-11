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
 * Variabili pubbliche.
 *
 * Sono getter, non costanti, e la differenza conta: la validazione scatta al
 * primo accesso e non al momento in cui il modulo viene importato. Con le
 * costanti, `next build` falliva in fase di "collect page data" ogni volta che
 * la configurazione non era presente — cioe' il build risultava dipendente
 * dalla configurazione di runtime. Un build deve compilare codice, non
 * pretendere le credenziali dell'ambiente in cui girera'.
 *
 * Una configurazione mancante viene comunque segnalata, ma alla prima
 * richiesta e con un messaggio esplicito, invece che come build rotto.
 *
 * Il nome della variabile resta scritto per esteso dentro il getter: Next
 * sostituisce `process.env.NEXT_PUBLIC_X` staticamente al build, e un accesso
 * costruito dinamicamente non verrebbe inlined nel bundle client.
 */
export const publicEnv = {
  get supabaseUrl(): string {
    return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey(): string {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
  /**
   * Origine pubblica dell'app: solo schema + host + porta, mai un percorso.
   *
   * Si tiene la sola `origin` invece del valore grezzo perche' e' facilissimo
   * incollare qui l'URL di callback completo — nella configurazione di Supabase
   * i due valori stanno a due righe di distanza. Se succedesse, il link di
   * accesso punterebbe a `/auth/callback/auth/callback` e darebbe 404, con un
   * errore che non dice niente su dove sia il problema.
   *
   * `new URL()` normalizza anche lo slash finale e, non accettando URL
   * relativi, intercetta il caso in cui manchi `https://`.
   */
  get siteUrl(): string {
    const raw = required('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL);
    try {
      return new URL(raw).origin;
    } catch {
      throw new Error(
        `NEXT_PUBLIC_SITE_URL non e' un URL assoluto valido: "${raw}". ` +
          'Atteso schema e dominio, per esempio https://esempio.vercel.app',
      );
    }
  },
} as const;

/** Fuso e locale applicativi. Fissati qui una volta, mai dedotti dal runtime. */
export const APP_TIMEZONE = 'Europe/Rome';
export const APP_LOCALE = 'it-IT';
export const APP_CURRENCY = 'EUR';
