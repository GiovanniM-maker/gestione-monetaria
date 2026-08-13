import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import {
  aggiornaCategoria,
  CategoriaNonValida,
  type AggiornamentoCategoria,
} from '@/lib/tassonomia/categorie';

export const dynamic = 'force-dynamic';

/**
 * La correzione della tassonomia, dalla scheda di una categoria.
 *
 * Sotto `/api/admin/*`: dietro autenticazione di sessione e non dietro un
 * segreto condiviso (CLAUDE.md, regola 6).
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
    await aggiornaCategoria(corpo as unknown as AggiornamentoCategoria);
    return NextResponse.json({ ok: true });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof CategoriaNonValida ? 400 : 500;
    if (stato === 500) console.error('[categorie] scrittura fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: stato });
  }
}
