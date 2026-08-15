import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { aiConfigurata, ConfigurazioneAiMancante } from '@/lib/ai/modello';
import { applicaProposta, chiedi, PropostaNonTrovata } from '@/lib/copilota/conversazione';
import { ArgomentoNonValido } from '@/lib/copilota/strumenti';
import { scadeTutto } from '@/lib/supabase/cache';

/**
 * Le due azioni del copilot: chiedere, e applicare una proposta.
 *
 * Sta sotto `/api/admin/*` e quindi **dietro autenticazione di sessione**, non
 * dietro un segreto condiviso come le route del cron: la lancia un browser
 * autenticato e tocca dati bancari.
 *
 * `maxDuration` è alto perché un giro può contenere fino a cinque chiamate al
 * modello, ognuna con le sue query in mezzo. Il valore predefinito di Vercel
 * taglierebbe la risposta a metà, e l'utente vedrebbe un errore di rete al
 * posto di una risposta che era quasi pronta.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest): Promise<NextResponse> {
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
    if (corpo['azione'] === 'applica') {
      const messaggioId = String(corpo['messaggioId'] ?? '');
      const indice = Number(corpo['indice']);
      if (messaggioId === '' || !Number.isInteger(indice) || indice < 0) {
        return risposta({ error: 'Proposta non indicata.' }, { status: 400 });
      }
      const proposta = await applicaProposta(messaggioId, indice);
      return risposta({ ok: true, descrizione: proposta.descrizione });
    }

    if (!aiConfigurata()) {
      throw new ConfigurazioneAiMancante(
        'OPENROUTER_API_KEY non è impostata su questo ambiente: il copilot non può rispondere. ' +
          'I numeri restano tutti visibili dal cruscotto.',
      );
    }

    const conversazioneId = String(corpo['conversazioneId'] ?? '');
    const domanda = String(corpo['domanda'] ?? '');
    if (conversazioneId === '') {
      return risposta({ error: 'Conversazione non indicata.' }, { status: 400 });
    }

    const turno = await chiedi(conversazioneId, domanda);
    return risposta(turno);
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const atteso =
      errore instanceof ArgomentoNonValido ||
      errore instanceof PropostaNonTrovata ||
      errore instanceof ConfigurazioneAiMancante;

    if (!atteso) console.error('[copilota] richiesta fallita:', messaggio);
    return risposta({ error: messaggio }, { status: atteso ? 400 : 500 });
  }
}

/**
 * Ogni risposta di questa route butta la cache dei dati.
 *
 * Anche quelle di errore, ed e' voluto: invalidare di troppo costa una query,
 * invalidare di meno costa un numero vecchio mostrato come fresco. Nel dubbio
 * si butta.
 */
function risposta(corpo: unknown, opzioni?: ResponseInit): NextResponse {
  scadeTutto();
  return NextResponse.json(corpo, opzioni);
}
