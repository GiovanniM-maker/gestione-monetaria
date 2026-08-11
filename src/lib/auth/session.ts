import 'server-only';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getCurrentUser } from '@/lib/supabase/server';
import { isAllowedEmail } from '@/lib/auth/allowlist';

/**
 * Guardia da usare nelle pagine e nelle route `/api/admin/*`.
 *
 * Il proxy gia' blocca le richieste non autenticate, ma il proxy e'
 * un filtro di rete: se un giorno il matcher cambia o una route viene spostata,
 * il buco non deve arrivare fino ai dati. Questa e' la seconda serratura, e
 * costa una chiamata gia' presente in cache di richiesta.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();

  if (user === null) {
    redirect('/login');
  }

  if (!isAllowedEmail(user.email)) {
    redirect('/auth/error?reason=not_allowed');
  }

  return user;
}

/**
 * Variante per le route `/api/admin/*`: restituisce l'utente oppure `null`,
 * senza redirect.
 *
 * `requireUser()` chiama `redirect()`, che in un route handler produrrebbe un
 * 307 verso una pagina HTML in risposta a una chiamata che si aspetta JSON.
 * Il chiamante qui decide da se': tipicamente 401.
 */
export async function getAuthorizedUser(): Promise<User | null> {
  const user = await getCurrentUser();
  if (user === null || !isAllowedEmail(user.email)) return null;
  return user;
}
