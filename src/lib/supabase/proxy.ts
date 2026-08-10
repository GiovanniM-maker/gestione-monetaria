import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';

export type SessionUpdate = {
  /** Risposta "passa oltre", con gli eventuali cookie di sessione rinfrescati. */
  response: NextResponse;
  user: User | null;
  supabase: SupabaseClient;
};

/**
 * Rinfresca il token di sessione (usato dal proxy) e restituisce l'utente verificato.
 *
 * I cookie aggiornati vengono scritti sia sulla request (perche' i Server
 * Component a valle leggano il valore nuovo nella stessa richiesta) sia sulla
 * response (perche' il browser lo persista). Saltare uno dei due lati produce
 * logout casuali difficili da diagnosticare.
 */
export async function updateSession(request: NextRequest): Promise<SessionUpdate> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser()` rivalida il token contro il server di auth. `getSession()` no,
  // quindi non e' utilizzabile per prendere decisioni di autorizzazione.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user, supabase };
}

/**
 * Costruisce una redirect preservando i cookie gia' impostati su `carrier`.
 * Senza questo travaso, un refresh di token che avviene nella stessa richiesta
 * di una redirect andrebbe perso.
 */
export function redirectPreservingCookies(
  request: NextRequest,
  pathname: string,
  carrier: NextResponse,
  searchParams?: Record<string, string>,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const redirect = NextResponse.redirect(url);
  for (const cookie of carrier.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
