import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { EsercenteNonValido, impostaVariabile } from '@/lib/tassonomia/esercenti';

export const dynamic = 'force-dynamic';

/**
 * «Su questo esercente chiedimelo ogni volta», o il contrario.
 *
 * Non tocca nessuna classificazione: cambia soltanto **a chi si chiede**. Per
 * questo non rilancia la tassonomia — non c'e' niente da riapplicare.
 *
 * Sotto `/api/admin/*`: dietro autenticazione di sessione (CLAUDE.md, regola 6).
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Corpo della richiesta non leggibile.' }, { status: 400 });
  }

  try {
    await impostaVariabile(String(corpo['id'] ?? ''), corpo['variabile'] === true);
    return NextResponse.json({ ok: true });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof EsercenteNonValido ? 400 : 500;
    if (stato === 500) console.error('[esercenti] scrittura fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: stato });
  }
}
