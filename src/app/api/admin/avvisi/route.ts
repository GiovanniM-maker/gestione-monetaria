import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { AvvisoNonValido, cambiaStatoAvviso, generaAvvisi } from '@/lib/avvisi/leggi';

export const dynamic = 'force-dynamic';

/** `POST` rigenera gli avvisi, `PATCH` cambia lo stato di uno. */
export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ creati: await generaAvvisi() });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[avvisi] generazione fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: 500 });
  }
}

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
    await cambiaStatoAvviso(String(corpo['id'] ?? ''), String(corpo['stato'] ?? ''));
    return NextResponse.json({ ok: true });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof AvvisoNonValido ? 400 : 500;
    if (stato === 500) console.error('[avvisi] aggiornamento fallito:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: stato });
  }
}
