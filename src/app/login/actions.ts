'use server';

import { redirect } from 'next/navigation';
import { isAllowedEmail, isPlausibleEmail, normalizeEmail } from '@/lib/auth/allowlist';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type LoginState = { status: 'idle' } | { status: 'error'; message: string };

/**
 * Un solo messaggio di errore per tutti i casi di fallimento: email fuori
 * allowlist, utente inesistente, password sbagliata. Distinguerli direbbe a chi
 * prova quale delle due meta' ha indovinato.
 */
const CREDENZIALI_NON_VALIDE = 'Email o password non corretti.';

export async function signIn(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get('email');
  const rawPassword = formData.get('password');

  if (typeof rawEmail !== 'string' || typeof rawPassword !== 'string') {
    return { status: 'error', message: 'Richiesta non valida.' };
  }

  const email = normalizeEmail(rawEmail);
  if (!isPlausibleEmail(email) || rawPassword === '') {
    return { status: 'error', message: CREDENZIALI_NON_VALIDE };
  }

  // Se l'indirizzo non e' in allowlist ci si ferma prima di contattare Supabase.
  if (!isAllowedEmail(email)) {
    return { status: 'error', message: CREDENZIALI_NON_VALIDE };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: rawPassword,
  });

  if (error !== null) {
    // Il messaggio di Supabase distingue "utente inesistente" da "password
    // errata" da "rate limit": resta nei log, non arriva alla pagina.
    console.error('[auth] signInWithPassword fallita:', error.message);
    return { status: 'error', message: CREDENZIALI_NON_VALIDE };
  }

  // Secondo controllo dopo l'autenticazione: l'utente potrebbe essere stato
  // creato a mano nel pannello Supabase con un indirizzo diverso.
  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    return { status: 'error', message: CREDENZIALI_NON_VALIDE };
  }

  redirect('/');
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
