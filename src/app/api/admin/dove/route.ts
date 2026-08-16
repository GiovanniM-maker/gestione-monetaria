import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { leggiRipartizione } from '@/lib/dove/leggi';
import { cercaMovimenti } from '@/lib/movimenti/cerca';
import { estremiDelMese, leggiFiltri } from '@/lib/movimenti/filtri';

export const dynamic = 'force-dynamic';

/**
 * Un ramo della fisarmonica, alla sua prima apertura.
 *
 * ---------------------------------------------------------------------------
 * Perche' una route e non un componente server dentro un `<Suspense>`
 * ---------------------------------------------------------------------------
 * Un componente server si disegna quando la pagina si costruisce. La
 * fisarmonica deve caricare un ramo **al tocco**, e senza cambiare pagina: nel
 * router non esiste un modo di far comparire un pezzo di server dopo, se non
 * navigando — che e' esattamente cio' che questa schermata e' venuta a
 * togliere.
 *
 * Quindi il ramo si chiede da qui. Non e' un'eccezione alla regola «le
 * aggregazioni stanno in SQL»: la route non calcola niente, chiama
 * `ripartizione_dove` e `cerca_movimenti` e passa avanti le stringhe.
 *
 * ---------------------------------------------------------------------------
 * Gli importi restano stringhe fino al bordo
 * ---------------------------------------------------------------------------
 * Attraversano la rete come li ha scritti Postgres. Convertirli in numero qui
 * significherebbe farli passare da un float esattamente nel punto in cui non
 * serve, e tutta la catena di questa applicazione esiste per non farlo.
 *
 * Sotto `/api/admin/*`: dietro autenticazione di sessione (CLAUDE.md, regola
 * 6). Legge dati bancari, e la lancia un browser autenticato.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams;
  const mese = q.get('mese');
  if (mese === null || !/^\d{4}-\d{2}$/.test(mese)) {
    return NextResponse.json({ error: 'mese non valido' }, { status: 400 });
  }

  const classe = vuotoENullo(q.get('classe'));
  const contesto = vuotoENullo(q.get('contesto'));
  const categoria = vuotoENullo(q.get('categoria'));

  try {
    if (q.get('tipo') === 'movimenti') {
      const periodo = estremiDelMese(mese);
      if (periodo === null) {
        return NextResponse.json({ error: 'mese non valido' }, { status: 400 });
      }

      // I filtri si costruiscono con `leggiFiltri`, la stessa funzione che
      // legge l'indirizzo di `/movimenti`: due modi di comporre lo stesso
      // insieme di filtri potrebbero divergere, e la lista mostrerebbe righe
      // che il numero sopra non conta.
      const filtri = leggiFiltri({
        da: periodo.da,
        a: periodo.a,
        ...(classe === null ? {} : { classe }),
        ...(contesto === null ? {} : { contesto }),
        ...(categoria === null ? {} : { categoria }),
        ordine: 'importo',
      });

      const esito = await cercaMovimenti(filtri, q.get('solo_questa') === '1');
      return NextResponse.json({
        tipo: 'movimenti',
        righe: esito.righe.map((r) => ({
          id: r.id,
          data: r.booking_date,
          // Il nome dell'esercente, o la descrizione della banca quando non ce
          // n'e' uno. Non e' una fuga: questa risposta va al browser
          // dell'utente, non a un modello. La regola 8 vale sul confine con
          // l'LLM, e questo non lo e'.
          etichetta: r.esercente ?? r.raw_description ?? '(senza descrizione)',
          importo: r.amount_eur ?? r.amount,
          categoria: r.categoria,
        })),
        totale: esito.totaleImporto,
        totaleRighe: esito.totaleRighe,
      });
    }

    const righe = await leggiRipartizione({ mese: `${mese}-01`, classe, contesto, categoria });
    return NextResponse.json({ tipo: 'categorie', righe });
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[dove] lettura fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: 500 });
  }
}

function vuotoENullo(v: string | null): string | null {
  return v === null || v.trim() === '' ? null : v;
}
