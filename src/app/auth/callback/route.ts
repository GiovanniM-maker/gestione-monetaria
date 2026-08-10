import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isAllowedEmail } from '@/lib/auth/allowlist';

export const dynamic = 'force-dynamic';

/**
 * Atterraggio del magic link (flusso PKCE).
 *
 * Supabase reindirizza qui con un `code` monouso; lo si scambia per una
 * sessione usando il verifier salvato in cookie quando e' partita la richiesta
 * di login. Se il login e' stato avviato da un browser diverso da quello che
 * apre il link, il verifier non c'e' e lo scambio fallisce: e' il
 * comportamento corretto, non un bug.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  const errorRedirect = (reason: string): NextResponse =>
    NextResponse.redirect(`${origin}/auth/error?reason=${reason}`);

  if (code === null) {
    // Supabase rimanda qui anche gli errori (link scaduto, gia' usato).
    return errorRedirect(searchParams.get('error_code') ?? 'link_non_valido');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error !== null) {
    console.error('[auth] exchangeCodeForSession fallita:', error.message);
    return errorRedirect('scambio_fallito');
  }

  // Ultimo controllo di allowlist prima di lasciare aperta la sessione.
  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    return errorRedirect('not_allowed');
  }

  return NextResponse.redirect(`${origin}/`);
}
