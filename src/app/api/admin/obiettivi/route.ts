import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import {
  ObiettivoNonValido,
  creaObiettivo,
  eliminaObiettivo,
  rinnovaObiettivo,
  TIPI_OBIETTIVO,
  type TipoObiettivo,
} from '@/lib/copilota/obiettivi';
import { scadeTutto } from '@/lib/supabase/cache';

export const dynamic = 'force-dynamic';

/**
 * Gli obiettivi: crearli, rinnovarli, dimenticarli.
 *
 * ---------------------------------------------------------------------------
 * Perche' questa route esiste, se il copilota sa gia' proporli
 * ---------------------------------------------------------------------------
 * Per il corollario scritto in `docs/copilota.md`: **ogni operazione del
 * copilota dev'essere raggiungibile anche senza copilota.** La regola della
 * Fase 0 diceva l'inverso — ogni operazione dev'essere raggiungibile *dal*
 * copilota — e insieme dicono che il copilota e' **una seconda porta, mai la
 * sola**. Se restasse l'unica strada verso gli obiettivi, di quelli diventerebbe
 * il proprietario, ed e' precisamente cio' che la sua definizione nega.
 *
 * Sotto `/api/admin/*`: dietro autenticazione di sessione (CLAUDE.md, regola 6).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return conCorpo(request, async (corpo) => {
    const tipo = String(corpo['tipo'] ?? '');
    if (!(TIPI_OBIETTIVO as readonly string[]).includes(tipo)) {
      throw new ObiettivoNonValido(`Tipo di obiettivo sconosciuto: ${tipo}.`);
    }

    const valore = corpo['valore'];
    await creaObiettivo({
      tipo: tipo as TipoObiettivo,
      // L'importo non passa mai da un float: arriva come stringa dal modulo e
      // stringa resta fino a Postgres. La forma la controlla il database.
      valore: typeof valore === 'string' && valore.trim() !== '' ? valore.trim() : null,
      categoriaId: testo(corpo['categoria_id']),
      classe: testo(corpo['classe']),
      nota: testo(corpo['nota']),
      mesi: typeof corpo['mesi'] === 'number' ? corpo['mesi'] : null,
    });
    return { ok: true };
  });
}

/** Rinnovare non e' modificare: sposta solo la scadenza in avanti. */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return conCorpo(request, async (corpo) => {
    const fatto = await rinnovaObiettivo(
      String(corpo['id'] ?? ''),
      typeof corpo['mesi'] === 'number' ? corpo['mesi'] : 6,
    );
    if (!fatto) throw new ObiettivoNonValido('Questo obiettivo non esiste più.');
    return { ok: true };
  });
}

/**
 * Dimenticare, non archiviare.
 *
 * Un obiettivo scaduto **resta**, ed e' il punto: dice che una volta lo si
 * voleva, e si puo' rinnovare. Questo bottone e' per quando non lo si vuole
 * proprio piu' — e allora tenerlo in giro significherebbe solo farsi chiedere
 * per sempre se vale ancora.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return conCorpo(request, async (corpo) => {
    const fatto = await eliminaObiettivo(String(corpo['id'] ?? ''));
    if (!fatto) throw new ObiettivoNonValido('Questo obiettivo non esiste più.');
    return { ok: true };
  });
}

/** Le tre fanno lo stesso giro intorno: leggere, provare, rispondere. */
async function conCorpo(
  request: NextRequest,
  cosa: (corpo: Record<string, unknown>) => Promise<unknown>,
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
    return risposta(await cosa(corpo));
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof ObiettivoNonValido ? 400 : 500;
    if (stato === 500) console.error('[obiettivi] scrittura fallita:', messaggio);
    return risposta({ error: messaggio }, { status: stato });
  }
}

function testo(valore: unknown): string | null {
  return typeof valore === 'string' && valore.trim() !== '' ? valore.trim() : null;
}

function risposta(corpo: unknown, opzioni?: ResponseInit): NextResponse {
  scadeTutto();
  return NextResponse.json(corpo, opzioni);
}
