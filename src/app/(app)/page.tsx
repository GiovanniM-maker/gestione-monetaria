import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { RigaClasse, RigaTotaleMese } from '@/lib/cruscotto/leggi';
import {
  leggiAvvisiNuovi,
  leggiSpesaPerClasse,
  leggiConfronto,
  leggiDaConfermare,
  leggiEntrate,
  leggiFinestra,
  leggiAspettoCategorie,
  leggiRicorrente,
  leggiStato,
  leggiVariazioni,
  scegliMese,
} from '@/lib/cruscotto/letture';
import { requireUser } from '@/lib/auth/session';
import { VERSIONE } from '@/lib/versione';
import { etichettaBreve, etichettaMese, meseValido, quotaPercentuale } from '@/lib/cruscotto/mesi';
import { comeSiConfronta } from '@/lib/cruscotto/andamento';
import { daQuanto, freschezza } from '@/lib/cruscotto/freschezza';
import {
  formattaEuro,
  fuoriDalTotale,
  ordinaPerPeso,
  sommaCosti,
  totalePerTipo,
} from '@/lib/abbonamenti/formato';
import { leggiClassi } from '@/lib/tassonomia/classi';
import { CATEGORIA_SENZA, estremiDelMese } from '@/lib/movimenti/filtri';
import type { RigaStato } from '@/lib/movimenti/cerca';
import { TesseraCategoria } from '@/lib/ui/tessera';
import { BarraClassi, ordineDelleClassi, tinteDelleClassi } from './grafici';
import { Fisarmonica } from './dove/fisarmonica';
import { nodiPerClasse } from './dove/nodi-classe';
import { Menu } from './menu';
import { SceltaMese } from './mese';
import { ScheletroCoppia, ScheletroTestata } from './scheletri';
import { Vuoto } from '@/lib/ui/vuoto';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Cruscotto' };

/**
 * Il cruscotto: **quello che si guarda in dieci secondi**.
 *
 * ---------------------------------------------------------------------------
 * Cosa e' stato tolto, e perche'
 * ---------------------------------------------------------------------------
 * Rispondeva a sei domande una sotto l'altra — quanto ho speso, quanto torna
 * ogni mese, come si muove nel tempo, in cosa, da chi, e c'e' qualcosa che non
 * va — su cinque schermate di scorrimento. Cinque schermate sono il modo piu'
 * sicuro di non far leggere **nessuna** delle sei: la prima risposta e' anche
 * l'unica che si vede senza scorrere, e tutto il resto e' rumore che le sta
 * intorno.
 *
 * Le quattro schede in basso sono quattro domande, e due di quelle stavano
 * nella stessa pagina. «In cosa», «da chi», «mese per mese» e l'albero sono
 * passati a **`/dove`**, che e' la scheda che risponde a quella domanda.
 *
 * Qui restano tre cose e un invito: **quanto** ho speso e come si divide,
 * **quanto di quello torna ogni mese** — la metrica per cui l'app esiste — e
 * **cosa c'e' da fare**. L'invito e' la riga che porta a «Dove».
 *
 * L'ordine e' l'ordine delle domande, non quello di importanza grafica.
 *
 * ---------------------------------------------------------------------------
 * Ogni blocco aspetta solo i propri dati
 * ---------------------------------------------------------------------------
 * Prima una funzione sola leggeva undici cose e la pagina compariva quando la
 * piu' lenta aveva finito. Ora la pagina fa **una** query — quali mesi
 * esistono — e da li' in poi ogni sezione arriva per conto suo, dentro il
 * proprio `<Suspense>`, con al posto suo uno scheletro della forma giusta.
 *
 * Il tempo totale non cambia. Il tempo prima di vedere il numerone crolla, ed
 * e' quello che si percepisce come velocita'.
 *
 * Le letture sono deduplicate con `cache()`: due sezioni che chiedono la stessa
 * finestra di confronto fanno una query sola. Senza, spezzare avrebbe
 * moltiplicato le query invece di riordinarle.
 *
 * Il mese sta nell'indirizzo (`/?mese=2026-07`) e non in uno stato del browser:
 * la pagina resta un componente server e un mese si puo' mandare a se' stessi
 * come collegamento.
 */

function centesimi(valore: string | null): bigint {
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? 0n : totale;
}

function sommaClassi(righe: readonly { spesa: string }[]): bigint {
  return righe.reduce((s, r) => s + centesimi(r.spesa), 0n);
}

/**
 * Le classi, nell'ordine dichiarato della barra.
 *
 * `personale` e `business` si sommano **qui e solo qui**: la barra risponde a
 * «come si divide il mese fra le classi», che ha sempre le stesse voci ed e'
 * per questo che la sua forma si impara. La distinzione fra i due contesti
 * resta intera nell'elenco sotto, dove c'e' spazio per dirla.
 *
 * L'ordine arriva da `sort_order` e non e' piu' una costante: le classi si
 * riordinano, e una barra che le mettesse in ordine alfabetico cambierebbe
 * forma a ogni rinomina.
 */
function perLaBarra(classi: readonly RigaClasse[], ordine: readonly string[]) {
  const note = ordine.map((nome) => ({
    chiave: nome,
    valore: sommaClassi(classi.filter((c) => c.discrezionalita === nome)),
  }));
  const resto = classi.filter((c) => !ordine.includes(c.discrezionalita));
  return resto.length === 0
    ? note
    : [...note, { chiave: 'non classificato', valore: sommaClassi(resto) }];
}

const perMese = (mese: string, extra: Record<string, string> = {}): string => {
  const periodo = estremiDelMese(mese);
  const p = new URLSearchParams(periodo === null ? {} : { da: periodo.da, a: periodo.a });
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return `/movimenti?${p.toString()}`;
};

export default async function CruscottoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametri = await searchParams;
  // Gia' verificato dal layout e memorizzato per richiesta: qui serve solo
  // l'email per il cassetto del menu, che sulla home sta nella riga del mese.
  const user = await requireUser();
  // L'unica lettura che la pagina aspetta davvero: senza sapere quali mesi
  // esistono non si sa nemmeno quale mostrare.
  const { mese, rigaMese, mesiDisponibili, mesePrecedente, meseSuccessivo, inCorso } =
    await scegliMese(meseValido(parametri['mese']));

  return (
    <div className="space-y-9">
      {/* La prima riga e' il mese, non il nome dell'applicazione: e' l'unica
          cosa li' sopra che si tocca davvero, e il menu resta nel suo angolo.
          L'intestazione del layout su questa pagina non c'e' (Intestazione). */}
      <SceltaMese
        mese={mese}
        mesi={mesiDisponibili}
        precedente={mesePrecedente}
        successivo={meseSuccessivo}
        inCorso={inCorso}
        indirizzo="/?mese=%m"
        menu={<Menu email={user.email ?? null} versione={VERSIONE} />}
      />

      {/* Prima dei numeri, e solo quando c'e' qualcosa che li rende falsi:
          dire «sono di tre giorni fa» sotto ai numeri e' dirlo a chi ha gia'
          finito di leggerli. Quando va tutto bene qui non c'e' niente. */}
      <Suspense fallback={null}>
        <PrimaDiCrederci />
      </Suspense>

      <Suspense fallback={<ScheletroTestata />}>
        <QuantoHoSpeso mese={mese} rigaMese={rigaMese} />
      </Suspense>

      {/* «In cosa» non c'e' piu': era le categorie di primo livello, e ora le
          stesse righe stanno **dentro** le classi — si tocca la classe e le
          sue categorie si aprono li'. Due elenchi con le stesse voci erano
          un'informazione doppia e mezza schermata in piu'. */}

      <section className="space-y-3">
        {/* «Di questo, quanto torna ogni mese» andava a capo e spingeva su
            il collegamento accanto. Quattro parole dicono la stessa cosa.
            Il collegamento al dettaglio non serve piu' qui: le due tessere
            sotto SONO il collegamento. */}
        <h2 className="eti px-1">Quanto torna ogni mese</h2>
        <Suspense fallback={<ScheletroCoppia />}>
          <Ricorrente mese={mese} />
        </Suspense>
      </section>

      {/* L'Inbox: tutto cio' che chiede un'occhiata o un gesto, in un posto
          solo e in fondo. In fondo e non in cima: un avviso che compare prima
          del numero si legge come «c'e' un problema» ogni volta che apri
          l'app, e dopo una settimana non lo leggi piu'. E' il modo in cui
          muoiono i canali di notifica, gia' scritto nelle decisioni della
          Fase 8. */}
      <Suspense fallback={null}>
        <Inbox mese={mese} rigaMese={rigaMese} />
      </Suspense>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* I blocchi, ognuno con le sue letture                                        */
/* -------------------------------------------------------------------------- */

/**
 * Il riquadro che va letto prima dei numeri, quando c'e'.
 *
 * `leggiStato` e' memorizzata per richiesta, quindi questo blocco e quello in
 * fondo leggono la stessa risposta: e' un componente in piu', non una query in
 * piu'.
 */
async function PrimaDiCrederci() {
  const stato = await leggiStato();
  return (
    <>
      {stato.map((s) => (
        <StatoSistema key={s.connection_id} riga={s} dove="cima" />
      ))}
    </>
  );
}

/**
 * L'Inbox: tutto cio' che aspetta un gesto, in un posto solo.
 *
 * Prima erano quattro blocchi indipendenti in fondo al cruscotto — la riga
 * verso «Dove», le note diagnostiche, i movimenti da confermare, gli avvisi —
 * e quattro riquadri slegati si leggono come rumore, non come una lista di
 * cose da fare. Sotto un titolo solo diventano quello che sono: la posta.
 *
 * La riga «Dove sono finiti» non c'e' piu': «Dove» e' una scheda della barra,
 * e un invito verso un posto gia' segnato in basso era un doppione.
 *
 * Lo **storico** e' `/avvisi`, dove un avviso ignorato o gestito resta
 * consultabile: qui stanno solo quelli nuovi, ed e' il collegamento in alto a
 * destra. Ogni voce ha la stessa anatomia — icona, titolo, riga di contesto,
 * invito — cosi' l'occhio impara una forma sola.
 */
async function Inbox({ mese, rigaMese }: { mese: string; rigaMese: RigaTotaleMese | null }) {
  const [stato, avvisi, daConfermare] = await Promise.all([
    leggiStato(),
    leggiAvvisiNuovi(),
    leggiDaConfermare(),
  ]);

  const note = rigaMese !== null && (rigaMese.senza_cambio > 0 || rigaMese.senza_categoria > 0);
  const vuota = daConfermare === 0 && avvisi.length === 0 && !note;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="eti">Inbox</h2>
        <Link
          className="inline-flex min-h-11 items-center text-[13px] text-accento sm:min-h-0"
          href="/avvisi"
        >
          storico ›
        </Link>
      </div>

      {/* «Sei in pari» non e' una schermata vuota: quando l'abitudine ha
          preso, questa e' la riga che si vede piu' spesso. */}
      {vuota && (
        <p className="px-1 text-[13px] text-testo-3">
          Niente che aspetti un tuo gesto. I movimenti nuovi e gli avvisi compariranno qui.
        </p>
      )}

      {/* Con il conteggio e non con un pallino: un numero e' un invito, un
          pallino rosso e' un'ansia. */}
      {daConfermare > 0 && (
        <Link href="/da-confermare" className="scheda flex items-center gap-3 p-4 text-[15px]">
          <TesseraCategoria icona="spunta" tinta="var(--accento)" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              {daConfermare} {daConfermare === 1 ? 'movimento nuovo' : 'movimenti nuovi'} da
              confermare
            </span>
            <span className="block text-[12px] text-testo-3">
              pagamenti arrivati che aspettano una conferma o una correzione
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-medium text-accento">Controlla ›</span>
        </Link>
      )}

      {/* Le due note che raccontano cosa manca al totale: sono **cose da
          fare**, non parti della risposta, e in mezzo alla risposta erano due
          riquadri fra l'utente e la metrica. */}
      {note && rigaMese !== null && (
        <div className="scheda flex items-start gap-3 p-4">
          <TesseraCategoria icona="info" tinta="var(--neutro)" />
          <p className="min-w-0 flex-1 text-[13px] text-testo-2">
            {rigaMese.senza_cambio > 0 && (
              <>
                <strong className="text-testo">{rigaMese.senza_cambio}</strong> movimenti in valuta
                senza tasso di cambio non sono nel totale.{' '}
              </>
            )}
            {rigaMese.senza_categoria > 0 && (
              <>
                <strong className="text-testo">{rigaMese.senza_categoria}</strong> movimenti per{' '}
                {formattaEuro(centesimi(rigaMese.spesa_senza_categoria))} sono nel totale ma senza
                categoria.{' '}
                {/* Alla lista filtrata, non a /revisione: quella lavora sugli
                    **esercenti**, e un bonifico a un privato non ne ha uno —
                    quindi per le righe che piu' spesso restano scoperte era un
                    collegamento che non portava da nessuna parte. */}
                <Link className="text-accento" href={perMese(mese, { categoria: CATEGORIA_SENZA })}>
                  Assegnali
                </Link>
                .
              </>
            )}
          </p>
        </div>
      )}

      {/* Al massimo tre: una lista lunga di avvisi non e' piu' una lista di
          avvisi. Il resto sta nello storico. */}
      {avvisi.length > 0 && (
        <div className="space-y-2">
          {avvisi.slice(0, 3).map((a) => (
            <Avviso key={a.id} titolo={a.title} corpo={a.body} gravita={a.severity} />
          ))}
          {avvisi.length > 3 && (
            <Link
              className="inline-flex min-h-11 items-center text-[13px] text-accento"
              href="/avvisi"
            >
              altri {avvisi.length - 3} avvisi ›
            </Link>
          )}
        </div>
      )}

      {stato.map((s) => (
        <StatoSistema key={s.connection_id} riga={s} dove="fondo" />
      ))}
    </section>
  );
}

/**
 * Il riquadro di un avviso.
 *
 * Il fondo e' una velatura del colore, non il colore: su un telefono al buio un
 * riquadro rosso pieno e' l'unica cosa che si vede della schermata, e un avviso
 * che grida piu' del numerone insegna a chiudere l'app invece che a leggerlo.
 * I due toni sono gia' nella tavolozza — `voluttuario` e `utile` — perche' una
 * quinta e una sesta tinta renderebbero il colore un'informazione in meno.
 */
function Avviso({
  titolo,
  corpo,
  gravita,
  href = '/avvisi',
}: {
  titolo: string;
  corpo: string | null;
  gravita: string;
  href?: string;
}) {
  const tinta =
    gravita === 'critical'
      ? 'var(--allarme)'
      : gravita === 'warning'
        ? 'var(--attenzione)'
        : 'var(--neutro)';

  return (
    <Link
      href={href}
      className="scheda block p-4 text-[14px]"
      style={{ background: `color-mix(in oklab, ${tinta} 12%, var(--s2))` }}
    >
      <span className="flex items-center gap-2 font-semibold">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ background: tinta }}
        />
        {titolo}
      </span>
      {corpo !== null && <span className="mt-1 block text-testo-2">{corpo}</span>}
    </Link>
  );
}

async function QuantoHoSpeso({
  mese,
  rigaMese,
}: {
  mese: string;
  rigaMese: RigaTotaleMese | null;
}) {
  const [classi, definizioni, variazioni, confronto, { giorniCoperti }, entrate, radici, aspetto] =
    await Promise.all([
      leggiSpesaPerClasse(mese),
      leggiClassi(),
      leggiVariazioni(mese),
      leggiConfronto(mese),
      leggiFinestra(mese),
      leggiEntrate(mese),
      // Le stesse letture qui sopra, gia' deduplicate da `cache()`: i nodi
      // sono una forma, non una query in piu'.
      nodiPerClasse(mese),
      // Per i marchietti delle categorie dentro la fisarmonica.
      leggiAspettoCategorie(),
    ]);

  // Il totale viene da `v_monthly_totals`, la vista che lo definisce. Le classi
  // darebbero lo stesso numero, ma farlo dipendere da due letture invece che da
  // una non porta niente.
  const speso = rigaMese === null ? sommaClassi(classi) : centesimi(rigaMese.spesa);
  const incassato = entrate === null ? null : centesimi(entrate.entrate);
  const spiegaIlConfronto = comeSiConfronta(variazioni.classi[0]);

  // Le tinte e l'ordine vengono dalla tabella delle classi, non da una
  // costante: si riordinano e si ricolorano, e una barra che se lo ricavasse da
  // sola cambierebbe forma alla prima rinomina.
  const tinte = tinteDelleClassi(definizioni);
  const perLaBarraOra = perLaBarra(classi, ordineDelleClassi(definizioni));

  return (
    <section className="space-y-4">
      {/* L'eroe, senza carta (alla Revolut): il numero del mese vive sul fondo
          della pagina, e la gerarchia gliela danno la taglia e lo spazio — non
          un riquadro. Centrato e grande: e' IL dato della schermata, e deve
          respirare — l'etichetta sopra e il confronto sotto restano piccoli
          apposta, perche' il peso stia tutto sull'importo. */}
      <div className="px-1">
        <div className="space-y-3 py-6 text-center">
          {giorniCoperti !== null && confronto !== null && (
            <p className="eti">nei primi {giorniCoperti} giorni</p>
          )}
          <p className="numerone text-[54px] whitespace-nowrap sm:text-[64px]">
            {formattaEuro(speso)}
          </p>

          {confronto !== null && confronto.riferimento !== null ? (
            <p className="cifra text-[13px] text-testo-2">
              di solito {formattaEuro(confronto.riferimento)}
              {confronto.scostamento !== null && (
                <span className={confronto.scostamento > 0 ? 'text-attenzione' : 'text-conferma'}>
                  {' '}
                  · {confronto.scostamento > 0 ? '▲' : '▼'}{' '}
                  {Math.abs(confronto.scostamento).toFixed(0)}%
                </span>
              )}
            </p>
          ) : (
            spiegaIlConfronto !== null && (
              <p className="text-[13px] text-testo-2">{spiegaIlConfronto}</p>
            )
          )}
        </div>

        {classi.length > 0 && (
          <BarraClassi
            voci={perLaBarraOra}
            tinte={tinte}
            // Il nome mostrato, non lo slug: dopo un rinomina la legenda
            // direbbe una parola che non esiste piu' da nessun'altra parte.
            nomi={Object.fromEntries(definizioni.map((d) => [d.slug, d.nome]))}
          />
        )}
      </div>

      {classi.length === 0 ? (
        <Vuoto
          nudo
          titolo="Nessuna spesa in questo mese"
          perche="La banca non ha contabilizzato niente, oppure il mese non è ancora cominciato. Cambia mese dalla capsula in alto."
        />
      ) : (
        <div className="space-y-3 pt-2">
          {/* Un titolo su questo elenco, ora che sotto ce n'e' un secondo.
              Subito sotto, il «perche'?»: la prosa metodologica e' vera e va
              detta, ma alla decima apertura occupa lo spazio dei numeri — sta
              chiusa, e il collegamento si veste da collegamento (accento, non
              grigio: un elemento interattivo che sembra testo non si tocca). */}
          <h2 className="eti px-1">Per classe</h2>
          {(confronto !== null || spiegaIlConfronto !== null) && (
            <details className="px-1 text-[13px] text-testo-2">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-medium text-accento">
                perch&eacute; questi confronti?
              </summary>
              <div className="space-y-2 pb-2">
                {spiegaIlConfronto !== null && (
                  <p>
                    {spiegaIlConfronto} Il termine di paragone &egrave; la mediana{' '}
                    <strong className="text-testo">scelta</strong> — un mese realmente osservato,
                    non una media. Le frecce con un asterisco poggiano su meno della met&agrave; dei
                    mesi guardati.
                  </p>
                )}
                {confronto !== null && confronto.precedenti.length > 0 && (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-testo-3">
                    {confronto.precedenti.map((pr) => (
                      <li key={pr.mese} className="cifra">
                        {etichettaBreve(pr.mese)} {formattaEuro(pr.spesa)}
                      </li>
                    ))}
                  </ul>
                )}
                <p>
                  Finestre della stessa lunghezza, non una proiezione a fine mese: «a questo ritmo
                  spenderai X» sarebbe un&rsquo;estrapolazione travestita da informazione.
                </p>
              </div>
            </details>
          )}

          {/* La fisarmonica di «Dove», qui: toccare una classe apre le sue
              categorie **in loco** — gia' precaricate col server, quindi
              senza nessun viaggio — e toccare una categoria apre la lista dei
              movimenti gia' filtrata. Mai classe → transazioni in un colpo:
              prima si vede di cosa e' fatta. E' la stessa componente e gli
              stessi nodi di /dove, perche' due copie della stessa discesa
              divergono alla prima modifica. */}
          <Fisarmonica mese={mese} radici={radici} aspetto={aspetto} tinte={tinte} />
        </div>
      )}

      {incassato !== null && incassato !== 0n && (
        <p className="px-1 text-[13px] text-testo-2">
          Entrate <span className="cifra font-medium text-testo">{formattaEuro(incassato)}</span> —
          la spesa ne &egrave; il {quotaPercentuale(speso, incassato).toFixed(0)}%.
        </p>
      )}

      {/* Se i confronti non arrivano, le frecce spariscono senza dirlo — e una
          freccia che manca non si nota. Una riga, non un riquadro: le cifre
          sopra restano corrette, e non e' un allarme. */}
      {variazioni.mancanti !== null && (
        <p className="px-1 text-[13px] text-attenzione">
          I confronti col mese tipico non sono disponibili, quindi le frecce non compaiono.{' '}
          <strong>Le cifre qui sopra sono corrette.</strong>
        </p>
      )}
    </section>
  );
}

async function Ricorrente({ mese }: { mese: string }) {
  const voci = ordinaPerPeso(await leggiRicorrente());
  const abbonamenti = totalePerTipo(voci, 'abbonamento');
  const abitudini = totalePerTipo(voci, 'abitudine');
  const fuori = fuoriDalTotale(voci);

  return (
    <>
      {/* Il «perche'?» sta sopra le tessere e si veste da collegamento: un
          elemento interattivo che sembra testo secondario non si tocca. */}
      <details className="px-1 text-[13px] text-testo-2">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-medium text-accento">
          perch&eacute; due numeri e non uno?
        </summary>
        <p className="pb-2">
          Sono tassi calcolati su tutto lo storico, non su {etichettaMese(mese)}: dicono quanto
          costa ciò che si ripete, non quanto è uscito questo mese. Non si sommano fra loro perché
          suggeriscono due azioni diverse — un abbonamento si disdice, un&rsquo;abitudine si cambia.
        </p>
      </details>

      {/* Due collegamenti, non due riquadri: ognuno apre la SUA pagina, con
          la stessa gerarchia della home ristretta a quel tipo. Una tessera
          con un numero che non si puo' aprire e' una domanda a cui la
          schermata rifiuta di rispondere. */}
      <div className="grid grid-cols-2 gap-3">
        {/* Le illustrazioni stanno nell'angolo basso e il testo gli lascia
            spazio con un margine, non con la speranza: a 141 pixel di colonna
            «il risparmio e' certo» arrivava esattamente li' sotto. */}
        <Link href="/ricorrente/abbonamento" className="scheda relative overflow-hidden p-4">
          <img
            src="/illustrazioni/abbonamenti.webp"
            alt=""
            width={46}
            height={46}
            loading="lazy"
            className="absolute right-1 bottom-1"
          />
          <p className="text-[13px] text-testo-2">Abbonamenti</p>
          {/* Diciannove e non ventisei: mezza colonna larga 141 pixel non
              tiene «−1.610,17 €» a ventisei, e l'euro andava a capo da solo. */}
          <p className="numerone mt-1.5 text-[19px] whitespace-nowrap">
            {formattaEuro(abbonamenti)}
          </p>
          <p className="mt-1.5 pr-9 text-[12px] text-testo-3">
            Si disdicono. Il risparmio è certo.
          </p>
        </Link>
        <Link href="/ricorrente/abitudine" className="scheda relative overflow-hidden p-4">
          <img
            src="/illustrazioni/abitudini.webp"
            alt=""
            width={46}
            height={46}
            loading="lazy"
            className="absolute right-1 bottom-1"
          />
          <p className="text-[13px] text-testo-2">Abitudini</p>
          <p className="numerone mt-1.5 text-[19px] whitespace-nowrap">{formattaEuro(abitudini)}</p>
          <p className="mt-1.5 pr-9 text-[12px] text-testo-3">
            Niente da disdire: si ripete perché lo si rifà.
          </p>
        </Link>
      </div>
      {/* Sotto la linea: il ricorrente che l'utente ha dichiarato di non voler
          togliere. Non e' un numero nascosto e non e' un avviso — e' la parte
          della ripartizione che il totale non conta, e dirlo e' l'unica cosa
          che rende onesto il totale.

          Una riga sola, non due: qui la distinzione fra abbonamento e
          abitudine non serve, perche' non c'e' niente da disdire ne' da
          cambiare. */}
      {fuori.costoMensile !== 0n && (
        <p className="text-[13px] text-testo-3">
          Fuori dal totale:{' '}
          <span className="cifra font-medium text-testo-2">{formattaEuro(fuori.costoMensile)}</span>{' '}
          al mese su {fuori.ricorrenze} {fuori.ricorrenze === 1 ? 'voce' : 'voci'} di{' '}
          {fuori.classi.join(', ')} — ricorrente, ma non da togliere.
        </p>
      )}
    </>
  );
}

/**
 * Lo stato della connessione bancaria.
 *
 * Sta in cima a tutto e non in una pagina di diagnostica, per una ragione
 * sola: `valid_until` non era mostrato da nessuna parte, e il consenso Enable
 * Banking scade. Quando scade **i dati smettono di arrivare in silenzio** — il
 * cruscotto continuerebbe a mostrare numeri, sempre piu' vecchi, senza dire
 * niente. Per un'applicazione che esiste per essere creduta e' il guasto
 * peggiore possibile.
 *
 * Quando va tutto bene e' una riga grigia di una frase. Compare in evidenza
 * solo quando c'e' qualcosa da fare, perche' un avviso che c'e' sempre non e'
 * piu' un avviso.
 *
 * ---------------------------------------------------------------------------
 * Il consenso non e' l'unico modo in cui i dati smettono di arrivare
 * ---------------------------------------------------------------------------
 * Questo riquadro sorvegliava una scadenza sola, e il 16 agosto 2026 il guasto
 * e' arrivato dall'altra parte: il **lavoro notturno non e' partito** per tre
 * giorni. Il consenso era valido ancora 175 giorni, quindi qui si leggeva una
 * riga grigia — cioe' l'aria di quando va tutto bene — mentre l'applicazione
 * mostrava i numeri di mercoledi'.
 *
 * `sync_runs` non aveva nemmeno una riga `failed`: non c'era un errore, c'era
 * un'assenza. Ed e' il motivo per cui il controllo sta **qui e non fra gli
 * avvisi**: l'avviso `sync_failed` lo genera il lavoro notturno, e un
 * sorvegliante che vive dentro la cosa che sorveglia non puo' accorgersi che
 * quella cosa e' ferma.
 *
 * ---------------------------------------------------------------------------
 * Due posti, una regola sola
 * ---------------------------------------------------------------------------
 * Gli avvisi stanno in fondo al cruscotto, e resta giusto: un riquadro prima
 * del numero si legge come «c'e' un problema» a ogni apertura, e dopo una
 * settimana non lo si legge piu'.
 *
 * Questo pero' non e' un avviso su un numero: dice che i numeri **sotto sono
 * vecchi**. Sotto ai numeri che invalida servirebbe a chi ha gia' finito di
 * crederci. Quindi il riquadro sale in cima e la riga grigia resta in fondo —
 * ma la condizione che decide quale delle due si vede e' scritta **una volta
 * sola**, qui dentro, perche' due copie divergono e la schermata finirebbe per
 * mostrarle tutte e due o nessuna.
 */
function StatoSistema({ riga, dove }: { riga: RigaStato; dove: 'cima' | 'fondo' }) {
  const giorni = riga.giorni_al_rinnovo;
  const scaduto = giorni !== null && giorni < 0;
  const inScadenza = giorni !== null && giorni >= 0 && giorni <= 30;
  const f = freschezza(riga.ultima_sync_riuscita);
  const grave = scaduto || riga.stato_connessione === 'error' || f.grave;
  const daMostrare = grave || inScadenza || f.ferma;

  if (!daMostrare) {
    return dove === 'cima' ? null : (
      <p className="text-[12px] text-testo-3">
        {riga.banca}: ultimo movimento {riga.ultimo_movimento ?? '—'}
        {giorni !== null && ` · consenso valido ancora ${giorni} giorni`}
        {riga.movimenti_provvisori > 0 &&
          ` · ${riga.movimenti_provvisori} movimenti provvisori, l’importo può ancora cambiare`}
      </p>
    );
  }

  if (dove === 'fondo') return null;

  // `--allarme` e `--attenzione` e non `--voluttuario` e `--utile`: le tinte
  // non si chiamano piu' come le classi, perche' le classi si rinominano.
  const tinta = grave ? 'var(--allarme)' : 'var(--attenzione)';
  // Il consenso viene prima: se e' scaduto, e' anche la ragione per cui i dati
  // sono fermi, e dire due volte la stessa cosa con due titoli diversi
  // manderebbe a rinnovare e a controllare lo scheduler per un guasto solo.
  const parlaDelConsenso = scaduto || inScadenza || riga.stato_connessione === 'error';

  return (
    <div
      className="scheda p-4 text-[14px]"
      style={{ background: `color-mix(in oklab, ${tinta} 12%, var(--s2))` }}
    >
      <p className="flex items-center gap-2 font-semibold">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ background: tinta }}
        />
        {parlaDelConsenso
          ? scaduto
            ? `Il consenso ${riga.banca} è scaduto da ${-(giorni ?? 0)} giorni.`
            : `Il consenso ${riga.banca} scade fra ${giorni} giorni.`
          : `I dati sono fermi: ultimo scarico dalla banca ${daQuanto(f)}.`}
      </p>
      <p className="mt-1.5 text-testo-2">
        {parlaDelConsenso ? (
          <>
            {scaduto
              ? 'I movimenti nuovi non arrivano più, e i numeri smettono di aggiornarsi senza che nulla lo segnali. Va rinnovato dal '
              : 'Va rinnovato prima della scadenza, altrimenti i dati smettono di arrivare in silenzio. Si rinnova dal '}
            <Link className="text-accento" href="/debug/eb">
              pannello Enable Banking
            </Link>
            .
          </>
        ) : (
          <>
            Il consenso è valido: quello che non è partito è la sincronizzazione. Ogni numero qui
            sotto è vecchio di altrettanto. Si recupera subito dalla{' '}
            <Link className="text-accento" href="/debug/sync">
              sequenza quotidiana
            </Link>
            , che scarica anche i giorni saltati.
          </>
        )}
      </p>
      <p className="mt-1.5 text-[12px] text-testo-3">
        Ultimo movimento {riga.ultimo_movimento ?? '—'} · ultima sincronizzazione riuscita{' '}
        {riga.ultima_sync_riuscita?.slice(0, 10) ?? 'mai'}
        {riga.ultimo_errore !== null && ` · ultimo errore: ${riga.ultimo_errore}`}
      </p>
    </div>
  );
}
