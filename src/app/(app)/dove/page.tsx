import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { VERSIONE } from '@/lib/versione';
import { leggiEsercenti, scegliMese } from '@/lib/cruscotto/letture';
import { etichettaMese, meseValido } from '@/lib/cruscotto/mesi';
import { leggiRipartizione } from '@/lib/dove/leggi';
import { versoMovimenti } from '@/lib/dove/nodi';
import { leggiClassi } from '@/lib/tassonomia/classi';
import { centesimiDi, formattaEuro } from '@/lib/abbonamenti/formato';
import { estremiDelMese } from '@/lib/movimenti/filtri';
import { BOTTONE_MINORE } from '@/lib/ui/controlli';
import { Avatar } from '@/lib/ui/tessera';
import { tinteDelleClassi } from '../grafici';
import { MesePerMese, Ripartizione } from '../livello';
import { TestataPagina } from '../testata';
import { ScheletroElenco } from '../scheletri';
import { Menu } from '../menu';
import { SceltaMese } from '../mese';
import { Fisarmonica, type Nodo } from './fisarmonica';
import { nodiPerClasse } from './nodi-classe';
import { Segmentato } from '../segmentato';

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
  // Gia' verificato dal layout e memorizzato per richiesta: qui serve solo
  // l'email da mettere nel cassetto del menu, che su questa schermata sta
  // nella riga del mese e non in un'intestazione a parte.
  const user = await requireUser();
  const { mese, totali, rigaMese, mesiDisponibili, mesePrecedente, meseSuccessivo, inCorso } =
    await scegliMese(meseValido(parametri['mese']));

  const andamento = totali.slice(-MESI_ANDAMENTO);
  const periodo = estremiDelMese(mese);
  const versoMovimenti =
    periodo === null ? '/movimenti' : `/movimenti?da=${periodo.da}&a=${periodo.a}`;

  return (
    <div className="space-y-6">
      <SceltaMese
        mese={mese}
        mesi={mesiDisponibili}
        precedente={mesePrecedente}
        successivo={meseSuccessivo}
        inCorso={inCorso}
        indirizzo={`/dove?mese=%m&modo=${modo}`}
        menu={<Menu email={user.email ?? null} versione={VERSIONE} />}
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
  return (
    <Segmentato
      etichetta="Come dividere il mese"
      voci={MODI.map((m) => ({
        chiave: m,
        testo: m === 'classe' ? 'per classe' : 'per categoria',
        attiva: m === modo,
        href: `/dove?mese=${mese}&modo=${m}`,
      }))}
    />
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
  const radici = modo === 'classe' ? await nodiPerClasse(mese) : await perCategoria(mese);

  if (radici.length === 0) {
    return <p className="text-[14px] text-testo-2">Nessun movimento in questo mese.</p>;
  }

  return <Fisarmonica mese={mese} radici={radici} />;
}

async function perCategoria(mese: string): Promise<readonly Nodo[]> {
  const righe = await leggiRipartizione({
    mese: `${mese}-01`,
    classe: null,
    contesto: null,
    categoria: null,
  });

  // Le foglie navigano alla lista movimenti filtrata invece di srotolarsi in
  // loco: e' la regola globale della discesa (vedi `versoMovimenti`).
  return righe.map((r) => ({
    chiave: `${mese}|cat|${r.category_id ?? 'nessuna'}`,
    etichetta: r.nome,
    dettaglio: `${r.movimenti} ${r.movimenti === 1 ? 'movimento' : 'movimenti'}`,
    importo: r.spesa,
    tinta: null,
    apertura:
      r.figli > 0
        ? { tipo: 'categorie' as const, classe: null, contesto: null, categoria: r.category_id }
        : null,
    href: r.figli > 0 ? null : versoMovimenti(mese, null, null, r.category_id),
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
  const [esercenti, definizioni] = await Promise.all([leggiEsercenti(mese), leggiClassi()]);
  if (esercenti.length === 0) return null;
  const tinte = tinteDelleClassi(definizioni);

  return (
    <Ripartizione
      titolo="Da chi"
      voci={esercenti.map((e, i) => ({
        chiave: `${e.merchant_id ?? 'nessuno'}-${e.discrezionalita}-${i}`,
        etichetta: e.esercente,
        dettaglio: `${e.movimenti} ${e.movimenti === 1 ? 'movimento' : 'movimenti'}`,
        valore: centesimiDi(e.spesa),
        href: e.merchant_id === null ? null : `/esercente/${e.merchant_id}`,
        // L'iniziale sulla velatura della sua classe: deterministico e locale,
        // nessun logo chiesto a un terzo (docs/aspetto.md §3.5).
        tessera: (
          <Avatar
            nome={e.esercente}
            tinta={
              e.discrezionalita !== null
                ? (tinte[e.discrezionalita] ?? 'var(--neutro)')
                : 'var(--neutro)'
            }
          />
        ),
      }))}
    />
  );
}
