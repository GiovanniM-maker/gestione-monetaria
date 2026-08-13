import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { generaReport, mesePrecedente } from '@/lib/report/genera';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const chiesto = request.nextUrl.searchParams.get('mese');
  const mese =
    chiesto !== null && /^\d{4}-\d{2}$/.test(chiesto) ? `${chiesto}-01` : mesePrecedente();

  try {
    return NextResponse.json(await generaReport(mese));
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[report] generazione fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: 500 });
  }
}
