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
