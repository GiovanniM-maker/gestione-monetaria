import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import {
  aggiornaCategoria,
  CategoriaNonValida,
  creaCategoria,
  eliminaCategoria,
  type AggiornamentoCategoria,
} from '@/lib/tassonomia/categorie';

export const dynamic = 'force-dynamic';

/**
 * Le tre scritture sulla tassonomia.
 *
 * `POST`   crea una categoria, di primo o di secondo livello.
 * `PATCH`  rinomina, sposta, cambia la discrezionalita' predefinita.
 * `DELETE` elimina, dichiarando dove va il contenuto.
 *
 * Sotto `/api/admin/*`: dietro autenticazione di sessione e non dietro un
 * segreto condiviso (CLAUDE.md, regola 6).
 */
async function protetta(
  request: NextRequest,
  azione: (corpo: Record<string, unknown>) => Promise<unknown>,
): Promise<NextResponse> {
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
    return NextResponse.json((await azione(corpo)) ?? { ok: true });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof CategoriaNonValida ? 400 : 500;
    if (stato === 500) console.error('[categorie] scrittura fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: stato });
  }
}

function testo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return protetta(request, async (c) => ({
    id: await creaCategoria(
      String(c['nome'] ?? ''),
      testo(c['padreId']),
      testo(c['discrezionalita']),
    ),
  }));
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return protetta(request, (c) => aggiornaCategoria(c as unknown as AggiornamentoCategoria));
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return protetta(request, (c) => eliminaCategoria(String(c['id'] ?? ''), testo(c['spostaSu'])));
}
