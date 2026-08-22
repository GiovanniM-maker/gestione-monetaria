'use client';

import { useClassiSceglibili } from '../classi-note';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CategoryRow } from '@/lib/db/types';
import { centesimiDi, formattaEuro } from '@/lib/abbonamenti/formato';
import { BOTTONE, CAMPO_PIENO, CASELLA, ETICHETTA_CASELLA } from '@/lib/ui/controlli';
import { Foglio } from '../foglio';
import { spiegaEccezione, spiegaErrore, type Spiegazione } from '@/lib/ui/errori';
import { NotaErrore } from '@/lib/ui/nota-errore';
import { Icona } from '@/lib/ui/icone';
import { Vuoto } from '@/lib/ui/vuoto';

/**
 * Il pannello di revisione.
 *
 * Una scelta di forma che vale la pena spiegare: accanto a ogni voce c'e'
 * sempre l'importo e il numero di movimenti. Classificare senza sapere quanto
 * vale una voce porta a spendere lo stesso tempo su 2.000 euro e su 12, ed e'
 * il motivo per cui le liste di lavoro in ordine alfabetico non si finiscono
 * mai.
 */

const CONTESTI = ['personale', 'business'] as const;

type DaClassificare = {
  etichetta: string;
  movimenti: number;
  totale: string;
  prima: string;
  ultima: string;
};

type MerchantTotale = {
  id: string;
  canonical_name: string;
  category_id: string | null;
  discretion: string | null;
  context: string | null;
  is_subscription: boolean;
  movimenti: number;
  totale: string;
};

/**
 * Gli importi passano per i centesimi come ovunque nell'applicazione.
 *
 * Qui c'era `Intl.NumberFormat` su un `Number(valore)`: e' esattamente il
 * transito da un float che le regole di correttezza vietano, fatto
 * nell'ultimo passaggio dopo che tutta la catena l'aveva evitato. E si vedeva
 * anche a occhio — stampava `-485,00 €` col trattino, mentre il resto
 * dell'applicazione scrive `−485,00 €` col segno meno vero.
 */
const euro = (valore: string): string => formattaEuro(centesimiDi(valore));

// I controlli vengono da `@/lib/ui/controlli`: 44 pixel sul telefono, compatti
// da `sm` in su. Le misure stanno in un posto solo perche' quattro copie della
// stessa altezza divergono alla prima modifica.
const bordo = CAMPO_PIENO;
const bottone = BOTTONE;

export function PannelloRevisione({
  daClassificare,
  quanteInTutto,
  esercenti,
  categorie,
}: {
  daClassificare: readonly DaClassificare[];
  quanteInTutto: number;
  esercenti: readonly MerchantTotale[];
  categorie: readonly CategoryRow[];
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [errore, setErrore] = useState<Spiegazione | null>(null);
  /**
   * Predefinito acceso, e non e' una scorciatoia per far sembrare corta la
   * lista. La metrica per cui l'app esiste e' il costo **ricorrente**: un
   * negozio visitato una volta sola non ci entra, qualunque categoria gli si
   * dia. Classificarlo e' lavoro che non cambia il numero.
   *
   * Quello che si nasconde viene comunque contato e scritto sotto: nascondere
   * senza dire quanto si nasconde e' la stessa cosa che tagliare una lista
   * fingendo che sia intera.
   */
  const [soloRicorrenti, setSoloRicorrenti] = useState(true);
  /** Trecento esercenti non si scorrono: si cercano. Il filtro e' in memoria. */
  const [cerca, setCerca] = useState('');

  const visibili = soloRicorrenti ? daClassificare.filter((v) => v.movimenti >= 2) : daClassificare;
  const nascoste = daClassificare.filter((v) => v.movimenti < 2);
  const importoNascosto = nascoste.reduce((somma, v) => somma + centesimiDi(v.totale), 0n);
  const ago = cerca.trim().toLowerCase();
  const cercati =
    ago === '' ? esercenti : esercenti.filter((m) => m.canonical_name.toLowerCase().includes(ago));

  async function chiama(metodo: 'POST' | 'PATCH', corpo: unknown, chiave: string) {
    setInCorso(chiave);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/tassonomia', {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const dati = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(spiegaErrore(risposta.status, dati));
        return;
      }
      const totale = Number(String(dati['speseTotale'] ?? '0'));
      const abbinato = Number(String(dati['speseTotaleAbbinato'] ?? '0'));
      const quota = totale === 0 ? 0 : Math.round((abbinato / totale) * 1000) / 10;
      setEsito(
        `Copertura: ${quota}% della spesa · ${dati['speseAbbinate']} movimenti classificati`,
      );
      router.refresh();
    } catch (e) {
      setErrore(spiegaEccezione(e));
    } finally {
      setInCorso(null);
    }
  }

  return (
    <div className="space-y-8">
      <NotaErrore errore={errore} />
      {esito !== null && errore === null && <p className="nota nota-esito text-sec">{esito}</p>}

      <section>
        <h2 className="mb-1 text-sez font-semibold tracking-[-0.02em]">
          Da classificare · {quanteInTutto} etichette
          {quanteInTutto > daClassificare.length && (
            <span className="font-normal text-testo-2">
              {' '}
              (ne vedi le {daClassificare.length} piu&rsquo; costose)
            </span>
          )}
        </h2>
        <p className="mb-2 text-sec text-testo-2">In ordine di quanto costa lasciarle così.</p>
        <label className="mb-3 flex flex-wrap items-center gap-2 py-2 text-min text-testo-2">
          <input
            type="checkbox"
            className={CASELLA}
            checked={soloRicorrenti}
            onChange={(e) => setSoloRicorrenti(e.target.checked)}
          />
          Solo quelle che tornano almeno due volte
          {soloRicorrenti && nascoste.length > 0 && (
            <span>
              — ne restano fuori <strong>{nascoste.length}</strong> viste una volta sola, per{' '}
              <strong>{formattaEuro(importoNascosto)}</strong>. Sono spesa vera, ma non ricorrente:
              non entrano nel costo mensile per discrezionalità, che è il numero per cui quest’app
              esiste.
            </span>
          )}
        </label>
        <ul className="scheda elenco px-4">
          {visibili.map((voce) => (
            <RigaDaClassificare
              key={voce.etichetta}
              voce={voce}
              esercenti={esercenti}
              categorie={categorie}
              inCorso={inCorso === voce.etichetta}
              disabilitato={inCorso !== null}
              onAssegna={(corpo) => chiama('POST', corpo, voce.etichetta)}
            />
          ))}
        </ul>
        {visibili.length === 0 && (
          <p className="scheda p-6 text-center text-sec text-testo-2">
            {daClassificare.length === 0
              ? 'Nessuna etichetta scoperta. Ogni spesa reale ha il suo esercente.'
              : 'Nessuna etichetta ricorrente da classificare: quel che resta compare una volta sola.'}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-sez font-semibold tracking-[-0.02em]">
          Esercenti · {esercenti.length}
        </h2>
        <p className="mb-3 text-sec text-testo-2">
          Cambiare qui la discrezionalità la riscrive su tutte le transazioni dell&rsquo;esercente.
          Il totale accanto serve a sapere quanto pesa la modifica prima di farla.
        </p>
        <input
          type="search"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="cerca un esercente"
          className={`${CAMPO_PIENO} mb-3`}
        />
        <ul className="scheda elenco px-4">
          {cercati.map((m) => (
            <RigaMerchant
              key={m.id}
              merchant={m}
              categorie={categorie}
              inCorso={inCorso === m.id}
              disabilitato={inCorso !== null}
              onSalva={(corpo) => chiama('PATCH', corpo, m.id)}
            />
          ))}
        </ul>
        {cercati.length === 0 && (
          <Vuoto
            titolo={`Nessun esercente contiene «${cerca.trim()}»`}
            perche="La ricerca guarda il nome canonico, non la causale grezza della banca. Prova con meno lettere."
          />
        )}
      </section>
    </div>
  );
}

function RigaDaClassificare({
  voce,
  esercenti,
  categorie,
  inCorso,
  disabilitato,
  onAssegna,
}: {
  voce: DaClassificare;
  esercenti: readonly MerchantTotale[];
  categorie: readonly CategoryRow[];
  inCorso: boolean;
  disabilitato: boolean;
  onAssegna: (corpo: unknown) => void;
}) {
  const classiSceglibili = useClassiSceglibili();
  const [merchantId, setMerchantId] = useState('');
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [discrezionalita, setDiscrezionalita] = useState('');
  const [contesto, setContesto] = useState('personale');
  const [abbonamento, setAbbonamento] = useState(false);
  const [frammento, setFrammento] = useState(false);
  const [aperto, setAperto] = useState(false);

  const creaNuovo = merchantId === '';
  const pronto = creaNuovo ? nome.trim() !== '' : true;

  return (
    <li>
      {/* La riga e' un sommario e il modulo sta nel foglio. Aperti, tredici
          moduli da sei controlli facevano una schermata alta novantasettemila
          pixel: centosedici schermate per assegnare tredici etichette. */}
      <button
        type="button"
        onClick={() => setAperto(true)}
        disabled={disabilitato}
        className="flex min-h-14 w-full items-center gap-3 py-1.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-sec">{voce.etichetta}</span>
          <span className="cifra block truncate text-min text-testo-2">
            {voce.movimenti}× · {voce.prima} → {voce.ultima}
          </span>
        </span>
        <span className="cifra shrink-0 text-corpo">{euro(voce.totale)}</span>
        <Icona nome="chevron" misura={16} className="shrink-0 text-testo-3" />
      </button>

      <Foglio
        aperto={aperto}
        titolo={voce.etichetta}
        nota={`${euro(voce.totale)} · ${voce.movimenti} movimenti · ${voce.prima} → ${voce.ultima}`}
        onChiudi={() => setAperto(false)}
      >
        <div className="grid grid-cols-1 items-center gap-2">
          <select
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            className={bordo}
            disabled={disabilitato}
          >
            <option value="">— crea un esercente nuovo —</option>
            {esercenti.map((m) => (
              <option key={m.id} value={m.id}>
                {m.canonical_name}
              </option>
            ))}
          </select>

          {creaNuovo && (
            <>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="nome dell'esercente"
                className={bordo}
                disabled={disabilitato}
              />
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className={bordo}
                disabled={disabilitato}
              >
                <option value="">— categoria —</option>
                {categorie.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parent_id === null ? c.name : `· ${c.name}`}
                  </option>
                ))}
              </select>
              <select
                value={discrezionalita}
                onChange={(e) => setDiscrezionalita(e.target.value)}
                className={bordo}
                disabled={disabilitato}
              >
                <option value="">— dalla categoria —</option>
                {classiSceglibili.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.nome}
                  </option>
                ))}
              </select>
              <select
                value={contesto}
                onChange={(e) => setContesto(e.target.value)}
                className={bordo}
                disabled={disabilitato}
              >
                {CONTESTI.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <label className={ETICHETTA_CASELLA}>
                <input
                  type="checkbox"
                  className={CASELLA}
                  checked={abbonamento}
                  onChange={(e) => setAbbonamento(e.target.checked)}
                  disabled={disabilitato}
                />
                abbonamento
              </label>
            </>
          )}

          <label className={ETICHETTA_CASELLA}>
            <input
              type="checkbox"
              className={CASELLA}
              checked={frammento}
              onChange={(e) => setFrammento(e.target.checked)}
              disabled={disabilitato}
            />
            {/* Predefinito spento: con `exact` il pattern e' l'etichetta intera,
              quindi non puo' pescare niente che non sia gia' sotto gli occhi. */}
            usa come frammento
          </label>

          <button
            type="button"
            className={bottone}
            disabled={disabilitato || !pronto}
            onClick={() =>
              onAssegna({
                etichetta: voce.etichetta,
                matchType: frammento ? 'contains' : 'exact',
                ...(creaNuovo
                  ? {
                      nuovo: {
                        canonical_name: nome.trim(),
                        category_id: categoria === '' ? null : categoria,
                        discretion: discrezionalita === '' ? null : discrezionalita,
                        context: contesto === '' ? null : contesto,
                        is_subscription: abbonamento,
                      },
                    }
                  : { merchantId }),
              })
            }
          >
            {inCorso ? 'Assegno…' : 'Assegna'}
          </button>
        </div>
      </Foglio>
    </li>
  );
}

function RigaMerchant({
  merchant,
  categorie,
  inCorso,
  disabilitato,
  onSalva,
}: {
  merchant: MerchantTotale;
  categorie: readonly CategoryRow[];
  inCorso: boolean;
  disabilitato: boolean;
  onSalva: (corpo: unknown) => void;
}) {
  const classiSceglibili = useClassiSceglibili();
  const [categoria, setCategoria] = useState(merchant.category_id ?? '');
  const [discrezionalita, setDiscrezionalita] = useState(merchant.discretion ?? '');
  const [contesto, setContesto] = useState(merchant.context ?? '');
  const [abbonamento, setAbbonamento] = useState(merchant.is_subscription);
  const [aperto, setAperto] = useState(false);

  return (
    <li>
      <button
        type="button"
        onClick={() => setAperto(true)}
        disabled={disabilitato}
        className="flex min-h-14 w-full items-center gap-3 py-1.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-corpo">{merchant.canonical_name}</span>
          <span className="block truncate text-min text-testo-2">
            {merchant.discretion ?? 'senza classe'}
            {merchant.is_subscription && ' · abbonamento'}
          </span>
        </span>
        <span className="cifra shrink-0 text-corpo">{euro(merchant.totale)}</span>
        <Icona nome="chevron" misura={16} className="shrink-0 text-testo-3" />
      </button>

      <Foglio
        aperto={aperto}
        titolo={merchant.canonical_name}
        nota={`${euro(merchant.totale)} · ${merchant.movimenti} movimenti — quel che cambi qui vale per tutti`}
        onChiudi={() => setAperto(false)}
      >
        <div className="grid grid-cols-1 items-center gap-2">
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className={bordo}
            disabled={disabilitato}
          >
            <option value="">— nessuna —</option>
            {categorie.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id === null ? c.name : `· ${c.name}`}
              </option>
            ))}
          </select>

          <select
            value={discrezionalita}
            onChange={(e) => setDiscrezionalita(e.target.value)}
            className={bordo}
            disabled={disabilitato}
          >
            <option value="">— dalla categoria —</option>
            {classiSceglibili.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nome}
              </option>
            ))}
          </select>

          <select
            value={contesto}
            onChange={(e) => setContesto(e.target.value)}
            className={bordo}
            disabled={disabilitato}
          >
            <option value="">— nessuno —</option>
            {CONTESTI.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label className={ETICHETTA_CASELLA}>
            <input
              type="checkbox"
              className={CASELLA}
              checked={abbonamento}
              onChange={(e) => setAbbonamento(e.target.checked)}
              disabled={disabilitato}
            />
            abbonamento
          </label>

          <button
            type="button"
            className={bottone}
            disabled={disabilitato}
            onClick={() =>
              onSalva({
                id: merchant.id,
                category_id: categoria === '' ? null : categoria,
                discretion: discrezionalita === '' ? null : discrezionalita,
                context: contesto === '' ? null : contesto,
                is_subscription: abbonamento,
              })
            }
          >
            {inCorso ? 'Salvo…' : 'Salva'}
          </button>
        </div>
      </Foglio>
    </li>
  );
}
