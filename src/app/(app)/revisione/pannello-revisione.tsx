'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CategoryRow } from '@/lib/db/types';

/**
 * Il pannello di revisione.
 *
 * Una scelta di forma che vale la pena spiegare: accanto a ogni voce c'e'
 * sempre l'importo e il numero di movimenti. Classificare senza sapere quanto
 * vale una voce porta a spendere lo stesso tempo su 2.000 euro e su 12, ed e'
 * il motivo per cui le liste di lavoro in ordine alfabetico non si finiscono
 * mai.
 */

const DISCREZIONALITA = ['essenziale', 'investimento', 'utile', 'voluttuario'] as const;
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

const euro = (valore: string): string =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(
    Number(valore || '0'),
  );

const bordo = 'rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900';
const bottone =
  'rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900';

export function PannelloRevisione({
  daClassificare,
  esercenti,
  categorie,
}: {
  daClassificare: readonly DaClassificare[];
  esercenti: readonly MerchantTotale[];
  categorie: readonly CategoryRow[];
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

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
        setErrore(String(dati['error'] ?? risposta.status));
        return;
      }
      const totale = Number(String(dati['speseTotale'] ?? '0'));
      const abbinato = Number(String(dati['speseTotaleAbbinato'] ?? '0'));
      const quota = totale === 0 ? 0 : Math.round((abbinato / totale) * 1000) / 10;
      setEsito(`Copertura: ${quota}% della spesa · ${dati['speseAbbinate']} movimenti classificati`);
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(null);
    }
  }

  return (
    <div className="space-y-8">
      {errore !== null && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {errore}
        </p>
      )}
      {esito !== null && errore === null && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {esito}
        </p>
      )}

      <section>
        <h2 className="mb-1 text-sm font-semibold">
          Da classificare · {daClassificare.length} etichette
        </h2>
        <p className="mb-3 text-xs text-neutral-500">
          In ordine di quanto costa lasciarle così. Assegna a un esercente esistente, oppure creane
          uno nuovo scrivendone il nome.
        </p>
        <div className="space-y-2">
          {daClassificare.map((voce) => (
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
          {daClassificare.length === 0 && (
            <p className="text-sm text-neutral-500">
              Nessuna etichetta scoperta. Ogni spesa reale ha il suo esercente.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Esercenti · {esercenti.length}</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Cambiare qui la discrezionalità la riscrive su tutte le transazioni dell&rsquo;esercente.
          Il totale accanto serve a sapere quanto pesa la modifica prima di farla.
        </p>
        <div className="space-y-2">
          {esercenti.map((m) => (
            <RigaMerchant
              key={m.id}
              merchant={m}
              categorie={categorie}
              inCorso={inCorso === m.id}
              disabilitato={inCorso !== null}
              onSalva={(corpo) => chiama('PATCH', corpo, m.id)}
            />
          ))}
        </div>
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
  const [merchantId, setMerchantId] = useState('');
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [discrezionalita, setDiscrezionalita] = useState('');
  const [contesto, setContesto] = useState('personale');
  const [abbonamento, setAbbonamento] = useState(false);
  const [frammento, setFrammento] = useState(false);

  const creaNuovo = merchantId === '';
  const pronto = creaNuovo ? nome.trim() !== '' : true;

  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-sm break-all">{voce.etichetta}</span>
        <span className="text-sm text-neutral-500">
          <strong className="text-neutral-900 dark:text-neutral-100">{euro(voce.totale)}</strong> ·{' '}
          {voce.movimenti}× · {voce.prima} → {voce.ultima}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
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
              {DISCREZIONALITA.map((d) => (
                <option key={d} value={d}>
                  {d}
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
            <label className="flex items-center gap-1 text-xs text-neutral-500">
              <input
                type="checkbox"
                checked={abbonamento}
                onChange={(e) => setAbbonamento(e.target.checked)}
                disabled={disabilitato}
              />
              abbonamento
            </label>
          </>
        )}

        <label className="flex items-center gap-1 text-xs text-neutral-500">
          <input
            type="checkbox"
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
    </div>
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
  const [categoria, setCategoria] = useState(merchant.category_id ?? '');
  const [discrezionalita, setDiscrezionalita] = useState(merchant.discretion ?? '');
  const [contesto, setContesto] = useState(merchant.context ?? '');
  const [abbonamento, setAbbonamento] = useState(merchant.is_subscription);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
      <span className="min-w-40 text-sm font-medium">{merchant.canonical_name}</span>
      <span className="min-w-32 text-xs text-neutral-500">
        {euro(merchant.totale)} · {merchant.movimenti}×
      </span>

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
        {DISCREZIONALITA.map((d) => (
          <option key={d} value={d}>
            {d}
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

      <label className="flex items-center gap-1 text-xs text-neutral-500">
        <input
          type="checkbox"
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
  );
}
