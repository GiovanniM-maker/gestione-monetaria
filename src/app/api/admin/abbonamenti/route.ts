import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import {
  aggiornaGiudizio,
  GiudizioNonValido,
  rilevaAbbonamenti,
  type RichiestaGiudizio,
} from '@/lib/abbonamenti/rileva';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Le due operazioni della Fase 5.
 *
 * `POST`  ricalcola gli abbonamenti dai movimenti.
 * `PATCH` registra il giudizio d'uso, o la disdetta, su un abbonamento.
 *
 * Sotto `/api/admin/*`, quindi dietro autenticazione di sessione e non dietro
 * un segreto condiviso: tocca dati bancari e la lancia un browser autenticato
 * (CLAUDE.md, regola 6).
 */

async function protetta(azione: () => Promise<unknown>): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await azione());
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof GiudizioNonValido ? 400 : 500;
    if (stato === 500) console.error('[abbonamenti] operazione fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: stato });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Il minimo di occorrenze e' un parametro perche' e' la soglia che decide
  // cosa e' una ricorrenza: con 11 mesi di storico un canone annuale non
  // arriva a tre, e abbassarla e' l'unico modo di guardarlo — sapendo che
  // sotto tre la confidenza vale poco.
  const grezzo = request.nextUrl.searchParams.get('minimo');
  const minimo = grezzo === null ? 3 : Number(grezzo);
  return protetta(() => rilevaAbbonamenti(Number.isInteger(minimo) && minimo >= 2 ? minimo : 3));
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Corpo della richiesta non leggibile.' }, { status: 400 });
  }
  return protetta(() => aggiornaGiudizio(corpo as unknown as RichiestaGiudizio));
}
