import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { leggiEsercenti, leggiSpesaPerClasse, scegliMese } from '@/lib/cruscotto/letture';
import { etichettaMese, meseValido } from '@/lib/cruscotto/mesi';
import { leggiRipartizione } from '@/lib/dove/leggi';
import { leggiClassi } from '@/lib/tassonomia/classi';
import { centesimiDi, formattaEuro } from '@/lib/abbonamenti/formato';
import { estremiDelMese } from '@/lib/movimenti/filtri';
import { BOTTONE_MINORE } from '@/lib/ui/controlli';
import { tinteDelleClassi } from '../grafici';
import { MesePerMese, Ripartizione } from '../livello';
import { TestataPagina } from '../testata';
import { ScheletroElenco } from '../scheletri';
import { SceltaMese } from '../mese';
import { Fisarmonica, type Nodo } from './fisarmonica';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dove' };

/**
 * «Dove sono finiti i soldi», in una schermata sola.
 *
 * ---------------------------------------------------------------------------
 * Perche' la discesa non e' piu' quattro pagine
 * ---------------------------------------------------------------------------
 * Classe, categoria, esercente, movimento: quattro schermate, quattro
 * caricamenti, quattro tasti indietro. Ma non sono quattro domande — sono la
 * stessa guardata da piu' vicino, e a ogni pagina nuova si perdeva il contesto:
 * quanto pesa questo ramo sul totale, e cosa c'e' accanto. Che e' esattamente
 * l'informazione per cui si apre questa schermata.
 *
 * Ora si apre in loco. Il primo livello arriva con la pagina; gli altri al
 * tocco, uno per volta — su un mese pieno, caricare tutto vorrebbe dire
 * spedire mille movimenti al browser perche' magari se ne guardano cinque.
 *
 * ---------------------------------------------------------------------------
 * Due modi, e la differenza non e' cosmetica
 * ---------------------------------------------------------------------------
 * **Per classe** risponde a «quanto di questo mese era voluttuario», che e' la
 * dimensione per cui l'applicazione esiste. **Per categoria** risponde a «in
 * cosa», che e' come si ragiona quando si cerca una spesa precisa.
 *
 * Non sono la stessa cosa con un ordinamento diverso: aperta la classe
 * «voluttuario · personale», sotto compaiono le categorie **dentro quella
 * classe**, con i loro totali parziali — che nell'altro modo non esistono da
 * nessuna parte.
 *
 * Il modo sta nell'indirizzo come il mese (`/dove?mese=2026-07&modo=classe`):
 * la pagina resta un componente server, e un modo si puo' mandare a se' stessi
 * come collegamento.
 *
 * ---------------------------------------------------------------------------
 * Cosa e' sparito da qui, e perche'
 * ---------------------------------------------------------------------------
 * La **ciambella** rispondeva a «in cosa si divide il mese»: e' letteralmente
 * il primo livello della fisarmonica, disegnato peggio — su un telefono una
 * fetta e' larga venti pixel e si sbaglia col pollice.
 *
 * L'**albero intero** era un inventario chiuso dentro un «apri». La
 * fisarmonica e' lo stesso albero, ma si apre dove serve invece che tutto
 * insieme.
 *
 * **«Da chi» resta**, in fondo: e' l'unica domanda che la discesa non sa
 * rispondere, perche' un esercente attraversa le categorie e la classifica dei
 * maggiori non si ottiene scendendo in nessun ramo.
 */

const MESI_ANDAMENTO = 12;
const MODI = ['classe', 'categoria'] as const;
type Modo = (typeof MODI)[number];

function modoValido(v: string | string[] | undefined): Modo {
  return typeof v === 'string' && (MODI as readonly string[]).includes(v) ? (v as Modo) : 'classe';
}

export default async function DovePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametri = await searchParams;
  const modo = modoValido(parametri['modo']);
  const { mese, totali, rigaMese, mesePrecedente, meseSuccessivo, inCorso } = await scegliMese(
    meseValido(parametri['mese']),
  );

  const andamento = totali.slice(-MESI_ANDAMENTO);
  const periodo = estremiDelMese(mese);
  const versoMovimenti =
    periodo === null ? '/movimenti' : `/movimenti?da=${periodo.da}&a=${periodo.a}`;

  return (
    <div className="space-y-6">
      <SceltaMese
        mese={mese}
        precedente={mesePrecedente}
        successivo={meseSuccessivo}
        inCorso={inCorso}
        indirizzo={(m) => `/dove?mese=${m}&modo=${modo}`}
      />

      <TestataPagina
        illustrazione="/illustrazioni/dove.webp"
        titolo="Dove"
        cifra={formattaEuro(centesimiDi(rigaMese?.spesa))}
        etichetta={`speso in ${etichettaMese(mese)}${
          rigaMese === null ? '' : ` · ${rigaMese.movimenti} movimenti`
        }`}
        azioni={
          <Link className={BOTTONE_MINORE} href={versoMovimenti}>
            tutti i movimenti del mese
          </Link>
        }
        perche={
          <p>
            Ogni riga si apre dove sta, e sotto compare di cosa &egrave; fatta: dalla classe alla
            categoria, alla sottocategoria, al singolo movimento. Un ramo con delle sottocategorie
            <em> e</em> della spesa propria mostra anche una riga
            <strong> &laquo;direttamente qui&raquo;</strong>: senza, la somma delle sottocategorie
            sarebbe minore del totale del ramo e la differenza non avrebbe un posto dove vedersi.
          </p>
        }
      />

      <Interruttore mese={mese} modo={modo} />

      <Suspense key={`${mese}-${modo}`} fallback={<ScheletroElenco />}>
        <PrimoLivello mese={mese} modo={modo} />
      </Suspense>

      <MesePerMese
        titolo="Mese per mese"
        righe={andamento.map((r) => ({ mese: r.mese, valore: centesimiDi(r.spesa) }))}
        corrente={mese}
        href={(m) => `/dove?mese=${m}&modo=${modo}`}
      />

      <Suspense fallback={<ScheletroElenco />}>
        <DaChi mese={mese} />
      </Suspense>
    </div>
  );
}

/**
 * L'interruttore fra i due modi.
 *
 * Due collegamenti e non due bottoni: cambiare modo cambia cosa si sta
 * guardando, quindi e' un indirizzo diverso — si puo' aprire in una scheda
 * nuova, tornare indietro, mandarselo. Un bottone che riscrive lo stato del
 * browser non fa nessuna di queste tre cose.
 */
function Interruttore({ mese, modo }: { mese: string; modo: Modo }) {
  const voci: readonly { chiave: Modo; testo: string }[] = [
    { chiave: 'classe', testo: 'per classe' },
    { chiave: 'categoria', testo: 'per categoria' },
  ];

  return (
    <div className="flex gap-2" role="group" aria-label="Come dividere il mese">
      {voci.map((v) => {
        const attivo = v.chiave === modo;
        return (
          <Link
            key={v.chiave}
            href={`/dove?mese=${mese}&modo=${v.chiave}`}
            aria-current={attivo ? 'true' : undefined}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-controllo px-4 text-[14px] font-medium ${
              attivo ? 'bg-accento text-accento-testo' : 'bg-s2 text-testo-2'
            }`}
          >
            {v.testo}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Il primo livello, disegnato dal server.
 *
 * Solo questo: e' quello che si vede senza toccare niente, e caricarlo qui
 * toglie un viaggio al momento in cui la pagina compare. Tutto il resto arriva
 * al tocco.
 */
async function PrimoLivello({ mese, modo }: { mese: string; modo: Modo }) {
  const radici = modo === 'classe' ? await perClasse(mese) : await perCategoria(mese);

  if (radici.length === 0) {
    return <p className="text-[14px] text-testo-2">Nessun movimento in questo mese.</p>;
  }

  return <Fisarmonica mese={mese} radici={radici} />;
}

async function perClasse(mese: string): Promise<readonly Nodo[]> {
  const [classi, definizioni] = await Promise.all([leggiSpesaPerClasse(mese), leggiClassi()]);
  const tinte = tinteDelleClassi(definizioni);

  return classi.map((c) => ({
    chiave: `${mese}|classe|${c.discrezionalita}|${c.contesto}`,
    // Il nome mostrato piu' il contesto: `utile · business` e `utile ·
    // personale` sono due righe diverse e devono leggersi come tali, o si
    // cerca per dieci secondi perche' la stessa classe compare due volte.
    etichetta:
      c.contesto === c.discrezionalita ? c.classe_nome : `${c.classe_nome} · ${c.contesto}`,
    dettaglio: `${c.movimenti} ${c.movimenti === 1 ? 'movimento' : 'movimenti'}`,
    importo: c.spesa,
    tinta: tinte[c.discrezionalita] ?? 'var(--neutro)',
    apertura: {
      tipo: 'categorie' as const,
      classe: c.discrezionalita,
      contesto: c.contesto,
      categoria: null,
    },
    href: null,
  }));
}

async function perCategoria(mese: string): Promise<readonly Nodo[]> {
  const righe = await leggiRipartizione({
    mese: `${mese}-01`,
    classe: null,
    contesto: null,
    categoria: null,
  });

  return righe.map((r) => ({
    chiave: `${mese}|cat|${r.category_id ?? 'nessuna'}`,
    etichetta: r.nome,
    dettaglio: `${r.movimenti} ${r.movimenti === 1 ? 'movimento' : 'movimenti'}`,
    importo: r.spesa,
    tinta: null,
    apertura:
      r.figli > 0
        ? { tipo: 'categorie' as const, classe: null, contesto: null, categoria: r.category_id }
        : {
            tipo: 'movimenti' as const,
            classe: null,
            contesto: null,
            categoria: r.category_id,
            soloQuesta: true,
          },
    href: null,
  }));
}

/**
 * Da chi.
 *
 * L'unica domanda che la discesa non sa rispondere: un esercente attraversa le
 * categorie, e la classifica dei maggiori non si ottiene scendendo in nessun
 * ramo. Resta in fondo perche' e' una seconda domanda, non un secondo modo di
 * fare la prima.
 */
async function DaChi({ mese }: { mese: string }) {
  const esercenti = await leggiEsercenti(mese);
  if (esercenti.length === 0) return null;

  return (
    <Ripartizione
      titolo="Da chi"
      voci={esercenti.map((e, i) => ({
        chiave: `${e.merchant_id ?? 'nessuno'}-${e.discrezionalita}-${i}`,
        etichetta: e.esercente,
        dettaglio: `${e.movimenti} ${e.movimenti === 1 ? 'movimento' : 'movimenti'}`,
        valore: centesimiDi(e.spesa),
        href: e.merchant_id === null ? null : `/esercente/${e.merchant_id}`,
      }))}
    />
  );
}
