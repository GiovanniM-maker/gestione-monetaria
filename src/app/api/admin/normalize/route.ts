import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { normalizzaTutto } from '@/lib/normalize/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Rielabora l'intero registro grezzo in `transactions`.
 *
 * Rieseguibile quante volte si vuole: e' il criterio di uscita della Fase 3.
 * Lanciarlo due volte di fila non deve cambiare il conteggio di una riga.
 */
export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await normalizzaTutto());
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[normalize] errore:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: 500 });
  }
}
