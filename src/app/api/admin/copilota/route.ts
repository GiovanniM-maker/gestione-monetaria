import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { aiConfigurata, ConfigurazioneAiMancante } from '@/lib/ai/modello';
import { applicaProposta, chiedi, PropostaNonTrovata } from '@/lib/copilota/conversazione';
import { ArgomentoNonValido } from '@/lib/copilota/strumenti';

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
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Corpo della richiesta non leggibile.' }, { status: 400 });
  }

  try {
    if (corpo['azione'] === 'applica') {
      const messaggioId = String(corpo['messaggioId'] ?? '');
      const indice = Number(corpo['indice']);
      if (messaggioId === '' || !Number.isInteger(indice) || indice < 0) {
        return NextResponse.json({ error: 'Proposta non indicata.' }, { status: 400 });
      }
      const proposta = await applicaProposta(messaggioId, indice);
      return NextResponse.json({ ok: true, descrizione: proposta.descrizione });
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
      return NextResponse.json({ error: 'Conversazione non indicata.' }, { status: 400 });
    }

    const turno = await chiedi(conversazioneId, domanda);
    return NextResponse.json(turno);
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const atteso =
      errore instanceof ArgomentoNonValido ||
      errore instanceof PropostaNonTrovata ||
      errore instanceof ConfigurazioneAiMancante;

    if (!atteso) console.error('[copilota] richiesta fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: atteso ? 400 : 500 });
  }
}
