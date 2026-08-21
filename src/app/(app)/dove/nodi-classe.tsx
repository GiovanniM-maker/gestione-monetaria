import { leggiSpesaPerClasse, leggiVariazioni } from '@/lib/cruscotto/letture';
import { leggiClassi } from '@/lib/tassonomia/classi';
import { leggiRipartizione } from '@/lib/dove/leggi';
import type { Variazione } from '@/lib/cruscotto/andamento';
import { categorieComeNodi, type Nodo } from '@/lib/dove/nodi';
import { Tessera } from '@/lib/ui/tessera';
import { tinteDelleClassi } from '../grafici';

/**
 * Il primo livello «per classe», pronto per la fisarmonica.
 *
 * Sta in un modulo suo perche' lo usano **due schermate** — la home e «Dove» —
 * e due copie della stessa lista di nodi divergono alla prima modifica: e' la
 * stessa ragione per cui `SceltaMese` e i pezzi di `livello.tsx` stanno in un
 * posto solo. La home lo ha adottato il 19 agosto: toccare una classe apriva
 * la lista dei movimenti, che per «dare un occhio veloce» e' il fondo della
 * discesa mostrato al posto del primo gradino. Ora la classe si apre dove sta,
 * sulle sue categorie, come su «Dove».
 *
 * Tre scelte dentro i nodi:
 * - **la tessera** al posto del pallino: stessa informazione — la tinta della
 *   classe — con dentro la sua icona di vetro (docs/aspetto.md §3.3);
 * - **la variazione** viaggia col nodo e compare sotto l'importo, mai sul non
 *   classificato (§4.3: un ▲594% su una categoria residuale insegna che le
 *   frecce non vogliono dire niente);
 * - **il non classificato sta in fondo, sbiadito**: non e' una classe, e' un
 *   lavoro da fare, e in mezzo alle classi vere si leggeva come una di loro.
 */
export async function nodiPerClasse(mese: string): Promise<readonly Nodo[]> {
  const [classi, definizioni, variazioni] = await Promise.all([
    leggiSpesaPerClasse(mese),
    leggiClassi(),
    leggiVariazioni(mese),
  ]);
  const tinte = tinteDelleClassi(definizioni);
  const perClasse = new Map(
    variazioni.classi.map((v) => [`${v.discrezionalita}|${v.contesto}`, v as Variazione]),
  );

  // Il non classificato in coda, con l'ordine relativo di tutto il resto
  // intatto: `sort` e' stabile, e la chiave e' vero/falso.
  const ordinate = [...classi].sort(
    (a, b) => Number(a.discrezionalita === a.contesto) - Number(b.discrezionalita === b.contesto),
  );

  // Il primo livello sotto ogni classe si PREFETCHA qui, col server: sono
  // poche letture in parallelo — deduplicate da `cache()` e riusate da
  // `inCache` — e comprano il tocco piu' frequente della schermata: aprire
  // una classe diventa un accordion locale, zero viaggi. I livelli sotto
  // continuano ad arrivare al tocco: prefetchare l'albero intero sarebbe
  // spedire mille righe per guardarne cinque.
  //
  // `catch` → niente figli precaricati, NON niente riga: se la lettura
  // fallisce il ramo resta apribile e l'errore compare li' dentro, al tocco,
  // dove la fisarmonica sa gia' mostrarlo.
  const figliDi = new Map<string, readonly Nodo[]>();
  await Promise.all(
    ordinate.map(async (c) => {
      try {
        const righe = await leggiRipartizione({
          mese: `${mese}-01`,
          classe: c.discrezionalita,
          contesto: c.contesto,
          categoria: null,
        });
        figliDi.set(
          `${c.discrezionalita}|${c.contesto}`,
          categorieComeNodi(righe, mese, c.discrezionalita, c.contesto),
        );
      } catch {
        // Il ramo si aprira' col viaggio, e se fallira' ancora si vedra' la
        // nota d'errore: un prefetch non deve poter rompere la pagina.
      }
    }),
  );

  return ordinate.map((c) => {
    const residuale = c.contesto === c.discrezionalita;
    const precaricati = figliDi.get(`${c.discrezionalita}|${c.contesto}`);
    return {
      chiave: `${mese}|classe|${c.discrezionalita}|${c.contesto}`,
      // Il nome mostrato piu' il contesto: `utile · business` e `utile ·
      // personale` sono due righe diverse e devono leggersi come tali, o si
      // cerca per dieci secondi perche' la stessa classe compare due volte.
      etichetta: residuale ? c.classe_nome : `${c.classe_nome} · ${c.contesto}`,
      dettaglio: `${c.movimenti} ${c.movimenti === 1 ? 'movimento' : 'movimenti'}`,
      importo: c.spesa,
      tinta: tinte[c.discrezionalita] ?? 'var(--neutro)',
      tessera: (
        <Tessera slug={c.discrezionalita} tinta={tinte[c.discrezionalita] ?? 'var(--neutro)'} />
      ),
      variazione: residuale ? undefined : perClasse.get(`${c.discrezionalita}|${c.contesto}`),
      sbiadito: residuale,
      apertura: {
        tipo: 'categorie' as const,
        classe: c.discrezionalita,
        contesto: c.contesto,
        categoria: null,
      },
      href: null,
      ...(precaricati === undefined ? {} : { precaricati }),
    };
  });
}
