import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { scadeTutto } from '@/lib/supabase/cache';
import {
  aggiornaClasse,
  ClasseNonValida,
  creaClasse,
  eliminaClasse,
  type CorrezioneClasse,
} from '@/lib/tassonomia/classi';

export const dynamic = 'force-dynamic';

/**
 * Le tre scritture sulle classi di discrezionalita'.
 *
 * `POST`   crea una classe.
 * `PATCH`  rinomina, ricolora, riordina, archivia, cambia `nel_ricorrente`.
 * `DELETE` elimina, dichiarando dove vanno le sue righe.
 *
 * Sotto `/api/admin/*`: dietro autenticazione di sessione e non dietro un
 * segreto condiviso (CLAUDE.md, regola 6). Tocca la classificazione di ogni
 * movimento, e la lancia un browser autenticato.
 */
async function protetta(
  request: NextRequest,
  azione: (corpo: Record<string, unknown>) => Promise<unknown>,
): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return risposta({ error: 'unauthorized' }, { status: 401 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return risposta({ error: 'Corpo della richiesta non leggibile.' }, { status: 400 });
  }

  try {
    return risposta((await azione(corpo)) ?? { ok: true });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof ClasseNonValida ? 400 : 500;
    if (stato === 500) console.error('[classi] scrittura fallita:', messaggio);
    return risposta({ error: messaggio }, { status: stato });
  }
}

function testo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return protetta(request, async (c) => ({
    slug: await creaClasse({
      nome: String(c['nome'] ?? ''),
      descrizione: testo(c['descrizione']),
      colore: testo(c['colore']),
      nelRicorrente: c['nelRicorrente'] !== false,
    }),
  }));
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return protetta(request, (c) => aggiornaClasse(c as unknown as CorrezioneClasse));
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return protetta(request, (c) => eliminaClasse(String(c['slug'] ?? ''), testo(c['verso'])));
}

/**
 * Ogni risposta butta la cache dei dati.
 *
 * Qui piu' che altrove: rinominare una classe cambia una parola che compare in
 * mezza applicazione, ed eliminarne una riscrive la classificazione di ogni
 * riga che la usava. Un aggregato vecchio mostrato come fresco dopo una di
 * queste due cose e' esattamente il numero di cui non ci si puo' fidare.
 */
function risposta(corpo: unknown, opzioni?: ResponseInit): NextResponse {
  scadeTutto();
  return NextResponse.json(corpo, opzioni);
}
