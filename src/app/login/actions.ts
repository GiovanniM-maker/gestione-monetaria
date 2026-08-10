'use server';

import { redirect } from 'next/navigation';
import { publicEnv } from '@/lib/env';
import { isAllowedEmail, isPlausibleEmail, normalizeEmail } from '@/lib/auth/allowlist';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type LoginState =
  { status: 'idle' } | { status: 'sent' } | { status: 'error'; message: string };

export async function requestMagicLink(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const raw = formData.get('email');
  if (typeof raw !== 'string') {
    return { status: 'error', message: 'Richiesta non valida.' };
  }

  const email = normalizeEmail(raw);
  if (!isPlausibleEmail(email)) {
    return { status: 'error', message: 'Indirizzo email non valido.' };
  }

  // Se l'indirizzo non e' in allowlist ci si ferma qui: non si contatta nemmeno
  // Supabase. La risposta e' comunque identica al caso di successo, per non
  // trasformare la pagina di login in un oracolo che dice quale indirizzo esiste.
  if (!isAllowedEmail(email)) {
    return { status: 'sent' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Non negoziabile: senza questo, chiunque richieda un magic link si
      // auto-crea un utente in `auth.users`.
      shouldCreateUser: false,
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback`,
    },
  });

  if (error !== null) {
    // Il messaggio di Supabase non viene mostrato all'utente: puo' distinguere
    // "utente inesistente" da "rate limit", ed e' esattamente l'informazione
    // che non vogliamo esporre.
    console.error('[auth] signInWithOtp fallita:', error.message);
    return { status: 'sent' };
  }

  return { status: 'sent' };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
