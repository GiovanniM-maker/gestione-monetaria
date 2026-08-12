import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { ConfigurazioneAiMancante } from '@/lib/ai/modello';
import { proponiClassificazioni } from '@/lib/tassonomia/proposte';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Chiede al modello una classificazione per gli esercenti mai visti.
 *
 * Sotto `/api/admin/*`: dietro autenticazione di sessione, e la chiamata ad
 * Anthropic parte da qui — server-side, come impone la regola 3.
 */
export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await proponiClassificazioni());
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    // La chiave mancante non e' un guasto: e' una configurazione da fare, e
    // 503 con il messaggio giusto lo dice meglio di un 500 muto.
    const stato = errore instanceof ConfigurazioneAiMancante ? 503 : 500;
    if (stato === 500) console.error('[ai] proposte fallite:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: stato });
  }
}
