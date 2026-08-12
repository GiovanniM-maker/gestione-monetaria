import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import {
  aggiornaMerchant,
  assegnaEtichetta,
  AssegnazioneNonValida,
  type AggiornamentoMerchant,
  type RichiestaAssegnazione,
} from '@/lib/tassonomia/assegna';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Le due scritture della schermata di revisione.
 *
 * `POST`  assegna un'etichetta a un esercente, creando l'alias.
 * `PATCH` cambia categoria, discrezionalita' o contesto di un esercente.
 *
 * Entrambe rilanciano la categorizzazione e restituiscono il suo esito, cosi'
 * la schermata puo' mostrare subito quanto e' cambiata la copertura invece di
 * far ricaricare la pagina per scoprirlo.
 *
 * Sotto `/api/admin/*`: dietro autenticazione di sessione, non dietro un
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
    return NextResponse.json(await azione(corpo));
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    // Un dato rifiutato e' colpa di chi chiama, un errore qualsiasi e' nostro:
    // 400 e 500 dicono cose diverse a chi legge i log fra sei mesi.
    const stato = errore instanceof AssegnazioneNonValida ? 400 : 500;
    if (stato === 500) console.error('[tassonomia] scrittura fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: stato });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return protetta(request, (corpo) => assegnaEtichetta(corpo as unknown as RichiestaAssegnazione));
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return protetta(request, (corpo) => aggiornaMerchant(corpo as unknown as AggiornamentoMerchant));
}
