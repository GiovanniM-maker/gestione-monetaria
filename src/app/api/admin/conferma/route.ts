import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { confermaMovimento, ConfermaNonValida, type RichiestaConferma } from '@/lib/conferma/leggi';

export const dynamic = 'force-dynamic';

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
    await confermaMovimento(corpo as unknown as RichiestaConferma);
    return NextResponse.json({ ok: true });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const stato = errore instanceof ConfermaNonValida ? 400 : 500;
    if (stato === 500) console.error('[conferma] fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: stato });
  }
}
