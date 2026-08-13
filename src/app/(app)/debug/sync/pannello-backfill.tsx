'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BOTTONE } from '@/lib/ui/controlli';

type EsitoFetta = {
  runId: string;
  status: string;
  completato: boolean;
  pagineLette: number;
  righeLette: number;
  righeNuove: number;
  righeDuplicate: number;
  contiCompletati: number;
  contiRimanenti: number;
  avvisi?: readonly string[];
  errore: string | null;
};

/**
 * Pannello di comando del backfill.
 *
 * Il ciclo di ripresa vive qui, nel browser: il server esegue una fetta e
 * risponde "non ho finito", il browser richiama con lo stesso `run_id` finche'
 * non arriva "finito". E' il motivo per cui il backfill non dipende dal
 * completamento di una singola invocazione serverless — e anche il motivo per
 * cui chiudere questa scheda a meta' non rompe niente: lo stato e' nel cursore
 * salvato sul database, e basta ripremere Riprendi.
 */
export type CorsaRiprendibile = {
  id: string;
  started_at: string;
  status: string;
  rows_fetched: number;
};

export function PannelloBackfill({
  corseRiprendibili,
}: {
  corseRiprendibili: readonly CorsaRiprendibile[];
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [messaggi, setMessaggi] = useState<readonly string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fetteCorte, setFetteCorte] = useState(false);

  const aggiungi = (testo: string) => setMessaggi((precedenti) => [...precedenti, testo]);

  /**
   * `YYYY-MM-DD` di N mesi fa, nel fuso applicativo.
   *
   * Non `toISOString()`: quello formatta in UTC, e vicino a mezzanotte
   * restituirebbe il giorno prima. E' la stessa regola dei giorni civili che
   * vale per `booking_date`, e vale anche per un estremo di intervallo.
   */
  const mesiFa = (mesi: number): string => {
    const data = new Date();
    data.setMonth(data.getMonth() - mesi);
    return data.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  };

  async function registraConti() {
    setInCorso(true);
    aggiungi('Registrazione conti…');
    try {
      const risposta = await fetch('/api/admin/sync-accounts', { method: 'POST' });
      const corpo: unknown = await risposta.json();
      if (!risposta.ok) {
        aggiungi(`Errore: ${(corpo as { error?: string }).error ?? risposta.status}`);
      } else {
        const conti = (corpo as { accounts?: unknown[] }).accounts ?? [];
        aggiungi(`Registrati ${conti.length} conti.`);
        router.refresh();
      }
    } catch (errore) {
      aggiungi(`Errore di rete: ${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  /** Il budget viaggia anche nelle riprese, o la fetta successiva tornerebbe lunga. */
  const urlRipresa = (id: string) => {
    const parametri = new URLSearchParams({ run_id: id });
    if (fetteCorte) parametri.set('budget_ms', '5000');
    return `/api/admin/backfill?${parametri.toString()}`;
  };

  /** Esegue fette finche' il server non dichiara il backfill completato. */
  async function eseguiCiclo(primaChiamata: string) {
    let url = primaChiamata;
    for (;;) {
      const risposta = await fetch(url, { method: 'POST' });
      const corpo: unknown = await risposta.json();

      if (!risposta.ok && (corpo as EsitoFetta).runId === undefined) {
        aggiungi(`Errore: ${(corpo as { error?: string }).error ?? risposta.status}`);
        return;
      }

      const esito = corpo as EsitoFetta;
      aggiungi(
        `${esito.pagineLette} pagine · ${esito.righeLette} righe lette · ${esito.righeNuove} nuove · ` +
          `${esito.righeDuplicate} duplicate · ${esito.contiRimanenti} conti da fare`,
      );

      for (const avviso of esito.avvisi ?? []) aggiungi(`  ⚠ ${avviso}`);

      if (esito.errore !== null) {
        aggiungi(`Interrotto: ${esito.errore}. Il cursore e' salvato, puoi riprendere.`);
        return;
      }

      if (esito.completato) {
        aggiungi('Backfill completato.');
        router.refresh();
        return;
      }

      url = urlRipresa(esito.runId);
    }
  }

  async function avvia() {
    setInCorso(true);
    setMessaggi([]);
    const parametri = new URLSearchParams();
    if (dateFrom !== '') parametri.set('date_from', dateFrom);
    if (dateTo !== '') parametri.set('date_to', dateTo);
    if (fetteCorte) parametri.set('budget_ms', '5000');
    aggiungi('Avvio backfill…');
    try {
      await eseguiCiclo(`/api/admin/backfill?${parametri.toString()}`);
    } catch (errore) {
      aggiungi(`Errore di rete: ${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  async function normalizza() {
    setInCorso(true);
    aggiungi('Normalizzazione dell\u2019intero registro grezzo\u2026');
    try {
      const risposta = await fetch('/api/admin/normalize', { method: 'POST' });
      const corpo = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        aggiungi(`Errore: ${String(corpo['error'] ?? risposta.status)}`);
      } else {
        aggiungi(
          `${corpo['esaminate']} righe grezze esaminate \u00b7 ${corpo['inserite']} inserite \u00b7 ` +
            `${corpo['aggiornate']} aggiornate \u00b7 ${corpo['protette']} protette da correzione manuale \u00b7 ` +
            `${corpo['scartate']} scartate \u00b7 ${corpo['girocontiSpeculari']} giroconti speculari marcati`,
        );
        const errori = corpo['errori'];
        if (Array.isArray(errori) && errori.length > 0) {
          for (const e of errori) aggiungi(`  ${String(e)}`);
        }
        router.refresh();
      }
    } catch (errore) {
      aggiungi(`Errore di rete: ${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  async function categorizza() {
    setInCorso(true);
    aggiungi('Applicazione della tassonomia…');
    try {
      const risposta = await fetch('/api/admin/categorize', { method: 'POST' });
      const corpo = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        aggiungi(`Errore: ${String(corpo['error'] ?? risposta.status)}`);
        setInCorso(false);
        return;
      }

      const quota = (parte: number, tutto: number) =>
        tutto === 0 ? '0' : String(Math.round((parte / tutto) * 1000) / 10);

      const speseEsaminate = Number(corpo['speseEsaminate'] ?? 0);
      const speseAbbinate = Number(corpo['speseAbbinate'] ?? 0);

      // La copertura sulle spese reali per prima: e' l'unica che dice qualcosa.
      // Sul totale delle transazioni si misurerebbe anche quanto bene
      // categorizziamo i giroconti, che non vanno categorizzati.
      // In euro per prima: contare i movimenti sopravvaluta la coda, e la
      // metrica dell'app e' un importo, non un numero di righe.
      const euro = (v: unknown) => Number(String(v ?? '0'));
      const totale = euro(corpo['speseTotale']);
      const abbinato = euro(corpo['speseTotaleAbbinato']);
      aggiungi(
        `SPESE REALI in euro: ${abbinato.toFixed(2)} su ${totale.toFixed(2)} classificati ` +
          `(${quota(abbinato, totale)}%)`,
      );
      aggiungi(
        `SPESE REALI in movimenti: ${speseAbbinate} su ${speseEsaminate} ` +
          `(${quota(speseAbbinate, speseEsaminate)}%) · ` +
          `${speseEsaminate - speseAbbinate} da assegnare a mano`,
      );
      aggiungi(
        `In tutto: ${corpo['esaminate']} transazioni esaminate · ${corpo['abbinate']} abbinate · ` +
          `${corpo['protette']} protette da correzione manuale`,
      );

      const nonLetti = Number(corpo['importiNonLetti'] ?? 0);
      if (nonLetti > 0) {
        aggiungi(`  ⚠ ${nonLetti} importi non letti: l’ordine della lista qui sotto e’ parziale.`);
      }

      // L'elenco degli scoperti non e' un dettaglio diagnostico: e' la lista di
      // lavoro, ordinata per quanto costa ignorarla.
      const daGuardare = corpo['daGuardare'];
      if (Array.isArray(daGuardare) && daGuardare.length > 0) {
        aggiungi('  da assegnare a mano, per spesa decrescente:');
        for (const v of daGuardare.slice(0, 15)) {
          const r = v as { etichetta?: unknown; movimenti?: unknown; totale?: unknown };
          aggiungi(`    ${String(r.totale)}  ${String(r.movimenti)}x  ${String(r.etichetta)}`);
        }
      }
      router.refresh();
    } catch (errore) {
      aggiungi(`Errore di rete: ${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  /**
   * Legge la risposta senza dare per scontato che sia JSON.
   *
   * Quando Vercel interrompe una funzione, il corpo e' HTML: `response.json()`
   * esplode e il `catch` di turno stampa "errore di rete", che e' vero e non
   * dice niente. Questo e' esattamente il modo in cui il primo tentativo di
   * proposta ha nascosto un timeout.
   */
  /**
   * `fetch` con un tetto di attesa esplicito.
   *
   * Senza, una richiesta che non torna muore con il messaggio del browser —
   * su Safari «Load failed» — che non dice ne' quanto ha aspettato ne' cosa
   * stava chiedendo. Con l'interruzione esplicita si sa almeno quello.
   */
  async function fetchConAttesa(url: string, secondi: number): Promise<Response> {
    const interruttore = new AbortController();
    const timer = setTimeout(() => interruttore.abort(), secondi * 1000);
    try {
      return await fetch(url, { method: 'POST', signal: interruttore.signal });
    } catch (errore) {
      if (interruttore.signal.aborted) {
        throw new Error(`Nessuna risposta da ${url} dopo ${secondi} secondi.`);
      }
      throw errore;
    } finally {
      clearTimeout(timer);
    }
  }

  async function leggiRisposta(risposta: Response): Promise<Record<string, unknown>> {
    const testo = await risposta.text();
    try {
      return JSON.parse(testo) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Il server ha risposto ${risposta.status} con qualcosa che non e' JSON: ` +
          `${testo.slice(0, 200).replace(/\s+/g, ' ')}`,
      );
    }
  }

  /**
   * Chiede le proposte a fette, finche' ce ne sono.
   *
   * Stesso schema del backfill: il server fa un lotto e dice quante ne
   * restano, il browser richiama. Serve perche' dieci chiamate al modello in
   * fila superano il tetto di durata di una funzione serverless.
   */
  async function proponi() {
    setInCorso(true);
    aggiungi('Chiedo al modello una proposta per gli esercenti mai visti\u2026');
    try {
      let costoTotale = 0;
      let tokenTotali = 0;
      let ultimoModello: unknown = '';
      // Quante ne restavano al giro prima. Se non cala, il ciclo sta girando
      // a vuoto: e' successo davvero, sette chiamate identiche pagate tutte
      // prima che qualcuno guardasse i numeri e notasse che erano uguali.
      let rimasteAlGiroPrima = Number.POSITIVE_INFINITY;
      for (let fetta = 1; ; fetta += 1) {
        const risposta = await fetchConAttesa('/api/admin/proponi', 90);
        const corpo = await leggiRisposta(risposta);

        if (!risposta.ok) {
          aggiungi(`Errore: ${String(corpo['error'] ?? risposta.status)}`);
          return;
        }

        ultimoModello = corpo['modello'] ?? ultimoModello;
        const token = Number(corpo['token'] ?? 0);
        const costo = Number(corpo['costo'] ?? 0);
        tokenTotali += Number.isFinite(token) ? token : 0;
        costoTotale += Number.isFinite(costo) ? costo : 0;

        aggiungi(
          `fetta ${fetta}: ${corpo['inviate']} inviate \u00b7 ${corpo['proposte']} proposte \u00b7 ` +
            `${corpo['scartate']} scartate \u00b7 ${corpo['rimaste']} rimaste` +
            (token > 0 ? ` \u00b7 ${token} token` : '') +
            (costo > 0 ? ` \u00b7 $${costo.toFixed(5)}` : ''),
        );

        const errori = corpo['errori'];
        if (Array.isArray(errori)) for (const e of errori) aggiungi(`  \u26a0 ${String(e)}`);

        const rimaste = Number(corpo['rimaste'] ?? 0);
        if (rimaste >= rimasteAlGiroPrima) {
          aggiungi(
            `Mi fermo: dopo questa fetta ne restano ancora ${rimaste}, ` +
              'come prima. Il ciclo non sta avanzando e continuare costerebbe ' +
              'solo chiamate identiche.',
          );
          break;
        }
        rimasteAlGiroPrima = rimaste;

        if (corpo['progresso'] !== true) {
          aggiungi(
            Number(corpo['rimaste'] ?? 0) === 0
              ? 'Finito: non resta niente da proporre.'
              : 'Mi fermo: questa fetta non ha prodotto nessuna proposta valida.',
          );
          break;
        }
        if (rimaste === 0) {
          aggiungi('Finito: tutte le etichette inviabili hanno una proposta.');
          break;
        }
      }

      // Il totale in fondo: e' la risposta alla domanda "quanto costa", detta
      // con un numero misurato invece che con una stima.
      if (tokenTotali > 0) {
        aggiungi(
          `Totale: ${tokenTotali} token` +
            (costoTotale > 0 ? ` \u00b7 $${costoTotale.toFixed(4)}` : '') +
            ` \u00b7 modello ${String(ultimoModello)}`,
        );
      }
      // Una volta sola, qui: applicarla dopo ogni fetta rendeva ogni richiesta
      // lenta quanto una categorizzazione completa.
      aggiungi('Applico la tassonomia con le proposte nuove\u2026');
      await categorizza();

      aggiungi(
        'Le proposte sono in /revisione, marcate come da confermare. ' +
          'Quelle su cui il modello non era sicuro lo dichiarano nella motivazione.',
      );
      router.refresh();
    } catch (errore) {
      aggiungi(`${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  /**
   * Ricalcola gli abbonamenti dai movimenti gia' categorizzati.
   *
   * Va dopo la categorizzazione e non prima: il rilevamento raggruppa per
   * esercente, e un movimento senza esercente non entra in nessuna serie.
   */
  /**
   * Quanto il rilevamento non ha potuto vedere.
   *
   * Si stampa **solo quando c'e' qualcosa**: una riga «0 movimenti fuori»
   * ripetuta a ogni esecuzione e' rumore, e il rumore in un resoconto insegna a
   * non leggerlo. Quando invece compare, sta dicendo che il costo ricorrente
   * manca di qualcosa — ed e' l'unico posto in cui lo direbbe.
   */
  function avvisaSenzaCambio(valore: unknown) {
    const senza = valore as { movimenti?: unknown; esercenti?: unknown } | null | undefined;
    const movimenti = Number(senza?.movimenti ?? 0);
    if (!Number.isFinite(movimenti) || movimenti <= 0) return;

    aggiungi(
      `  ATTENZIONE: ${movimenti} movimenti di ${Number(senza?.esercenti ?? 0)} esercenti sono ` +
        'restati fuori dal rilevamento perche\u2019 senza importo in euro. Il costo ricorrente ' +
        'non li conta.',
    );
  }

  /**
   * Cerca a fette finche' non resta niente.
   *
   * Il ciclo sta qui e non nel server, come per il backfill: una richiesta che
   * dura due minuti non torna: il primo giro vero ha cercato e salvato 56
   * esercenti e poi il browser ha detto «Load failed» — il lavoro c'era, il
   * resoconto no.
   *
   * Con fette da quaranta secondi ogni risposta arriva, e il resoconto cresce
   * mentre va invece di comparire tutto alla fine.
   */
  async function cercaSulMondo() {
    setInCorso(true);
    aggiungi('Ricerca degli esercenti mai visti\u2026');
    try {
      let trovatiInTutto = 0;
      let vuotiInTutto = 0;

      for (let fetta = 1; ; fetta += 1) {
        const risposta = await fetchConAttesa('/api/admin/ricerca', 90);
        const corpo = await leggiRisposta(risposta);
        if (!risposta.ok) {
          aggiungi(`Errore: ${String(corpo['error'] ?? risposta.status)}`);
          return;
        }

        trovatiInTutto += Number(corpo['trovati'] ?? 0);
        vuotiInTutto += Number(corpo['vuoti'] ?? 0);
        const rimasti = Number(corpo['rimasti'] ?? 0);

        aggiungi(
          `  fetta ${fetta}: ${String(corpo['esaminati'])} esaminati, ` +
            `${String(corpo['trovati'])} trovati \u00b7 ${rimasti} rimasti`,
        );

        // Chi la regola 8b ha trattenuto, e perche'. Va detto: sono esercenti
        // che resteranno classificati a occhio, e chi legge deve saperlo.
        const trattenuti = corpo['trattenuti'];
        if (Array.isArray(trattenuti) && trattenuti.length > 0) {
          for (const v of trattenuti) {
            const t = v as Record<string, unknown>;
            aggiungi(`    trattenuto ${String(t['esercente'])}: ${String(t['motivo'])}`);
          }
        }

        // Un errore vero ferma il ciclo. Il budget di tempo no: e' il modo
        // normale in cui una fetta finisce, e ricominciare e' esattamente cio'
        // che si deve fare.
        const errore = corpo['errore'];
        if (typeof errore === 'string' && !errore.startsWith('Budget')) {
          aggiungi(`  fermata: ${errore}`);
          return;
        }

        if (rimasti === 0 || Number(corpo['esaminati'] ?? 0) === 0) {
          aggiungi(
            `Ricerca finita: ${trovatiInTutto} trovati, ${vuotiInTutto} senza risultato utile.`,
          );
          return;
        }
      }
    } catch (e) {
      aggiungi(`Errore: ${e instanceof Error ? e.message : String(e)}`);
      aggiungi('  Il lavoro fatto e’ salvato: rilancia e riprende da dove era arrivata.');
    } finally {
      setInCorso(false);
    }
  }

  async function riclassifica() {
    setInCorso(true);
    aggiungi('Riclassificazione con le descrizioni trovate\u2026');
    try {
      const risposta = await fetchConAttesa('/api/admin/riclassifica', 120);
      const corpo = await leggiRisposta(risposta);
      if (!risposta.ok) {
        aggiungi(`Errore: ${String(corpo['error'] ?? risposta.status)}`);
        return;
      }

      aggiungi(
        `${String(corpo['inviati'])} inviati \u00b7 ${String(corpo['cambiati'])} cambiati \u00b7 ` +
          `${String(corpo['invariati'])} confermati \u00b7 ${String(corpo['scartati'])} scartati \u00b7 ` +
          `${String(corpo['rimasti'])} rimasti`,
      );

      // Cosa e' cambiato davvero, con il perche'. Un conteggio senza le righe
      // non permette di capire se la riclassificazione ha migliorato o rovinato
      // — ed e' il momento in cui va guardato, non dopo.
      const cambi = corpo['cambi'];
      if (Array.isArray(cambi) && cambi.length > 0) {
        aggiungi('  COSA E’ CAMBIATO:');
        for (const v of cambi) {
          const c = v as Record<string, unknown>;
          aggiungi(`    ${String(c['esercente'])}: ${String(c['da'])} \u2192 ${String(c['a'])}`);
          if (String(c['motivo'] ?? '') !== '') aggiungi(`      ${String(c['motivo'])}`);
        }
      }

      if (Number(corpo['saltati'] ?? 0) > 0) {
        aggiungi(
          `  ${String(corpo['saltati'])} saltati: confermati da te mentre chiedevo, e non si toccano.`,
        );
      }

      const errori = corpo['errori'];
      if (Array.isArray(errori) && errori.length > 0) {
        for (const e of errori) aggiungi(`  ${String(e)}`);
      }
      if (Number(corpo['rimasti'] ?? 0) > 0) aggiungi('  Rilancia per la fetta successiva.');
    } catch (e) {
      aggiungi(`Errore: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setInCorso(false);
    }
  }

  async function rilevaAbbonamenti() {
    setInCorso(true);
    aggiungi('Rilevamento delle ricorrenze…');
    try {
      const risposta = await fetchConAttesa('/api/admin/abbonamenti', 90);
      const corpo = await leggiRisposta(risposta);
      if (!risposta.ok) {
        aggiungi(`Errore: ${String(corpo['error'] ?? risposta.status)}`);
        return;
      }

      aggiungi(
        `${corpo['scritte']} ricorrenze scritte · ${corpo['nellaMetrica']} nel numero su ` +
          `${corpo['totali']} rilevate`,
      );

      avvisaSenzaCambio(corpo['senzaCambio']);

      // La metrica per cui l'app esiste, stampata qui e non solo nella
      // schermata: e' il primo momento in cui il numero esiste davvero.
      const metrica = corpo['metrica'];
      if (Array.isArray(metrica) && metrica.length > 0) {
        aggiungi('  COSTO RICORRENTE MENSILE:');
        for (const v of metrica) {
          const r = v as Record<string, unknown>;
          aggiungi(
            `    [${String(r['tipo'])}] ${String(r['discrezionalita'])} / ` +
              `${String(r['contesto'])}: ${String(r['costo_mensile'])} €/mese su ` +
              `${String(r['ricorrenze'])} voci`,
          );
        }
      } else {
        aggiungi('  Nessuna ricorrenza entra nella metrica.');
      }

      const escluse = corpo['escluse'];
      if (Array.isArray(escluse) && escluse.length > 0) {
        aggiungi('  cosa resta fuori:');
        for (const v of escluse) {
          const r = v as Record<string, unknown>;
          aggiungi(
            `    ${String(r['motivo'])}: ${String(r['esercenti'])} esercenti, ` +
              `${String(r['totale_speso'])} € spesi in tutto`,
          );
        }
      }

      aggiungi('Il dettaglio e’ in /abbonamenti.');
      router.refresh();
    } catch (errore) {
      aggiungi(`${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  /**
   * La stessa sequenza che gira ogni notte, lanciata a mano.
   *
   * Serve a poterla provare: un lavoro schedulato che si puo' osservare solo
   * una volta al giorno, di fatto, non si prova mai.
   */
  async function quotidiano() {
    setInCorso(true);
    setMessaggi([]);
    aggiungi('Sincronizzazione quotidiana\u2026 (scarico, normalizza, categorizza, rileva)');
    try {
      const risposta = await fetchConAttesa('/api/admin/quotidiano', 290);
      const corpo = await leggiRisposta(risposta);
      if (!risposta.ok) {
        aggiungi(`Errore: ${String(corpo['error'] ?? risposta.status)}`);
        return;
      }

      if (corpo['saltata'] !== null && corpo['saltata'] !== undefined) {
        aggiungi(`SALTATA: ${String(corpo['saltata'])}`);
      } else {
        aggiungi(
          `Scarico: ${corpo['fette']} fette \u00b7 ${corpo['righeLette']} righe lette \u00b7 ` +
            `${corpo['righeNuove']} nuove \u00b7 ${corpo['righeDuplicate']} duplicate \u00b7 ` +
            `${corpo['completato'] === true ? 'completato' : 'INTERROTTO, riprende al giro dopo'}`,
        );
      }

      for (const avviso of (corpo['avvisi'] as string[] | undefined) ?? []) {
        aggiungi(`  \u26a0 ${avviso}`);
      }

      const n = corpo['normalizzazione'] as Record<string, unknown> | null;
      if (n !== null && n !== undefined) {
        // `scartate` va stampata sempre, anche a zero: una riga grezza che non
        // diventa un movimento e sparisce senza dirlo e' esattamente il tipo
        // di perdita silenziosa che le regole di questo progetto vietano.
        aggiungi(
          `Normalizzazione: ${String(n['esaminate'])} righe grezze \u2192 ${String(n['distinti'])} movimenti distinti \u00b7 ` +
            `${String(n['inserite'])} inserite \u00b7 ` +
            `${String(n['aggiornate'])} aggiornate \u00b7 ${String(n['protette'])} protette \u00b7 ` +
            `${String(n['scartate'])} scartate \u00b7 ${String(n['girocontiSpeculari'])} giroconti speculari`,
        );
        for (const e of (n['errori'] as string[] | undefined) ?? []) aggiungi(`  \u26a0 ${e}`);
      }

      const c = corpo['categorizzazione'] as Record<string, unknown> | null;
      if (c !== null && c !== undefined) {
        const abbinate = Number(c['speseAbbinate'] ?? 0);
        const esaminate = Number(c['speseEsaminate'] ?? 0);
        const scoperte = esaminate - abbinate;
        // La copertura in percentuale e non solo in valore assoluto: e'
        // l'unico modo di accorgersi che sta scendendo. Il conteggio delle
        // classificate puo' restare identico mentre il totale cresce, e
        // "1294" da solo sembra un numero stabile.
        aggiungi(
          `Categorizzazione: ${abbinate} su ${esaminate} spese classificate ` +
            `(${esaminate === 0 ? '0' : String(Math.round((abbinate / esaminate) * 1000) / 10)}%) \u00b7 ` +
            `${scoperte} scoperte`,
        );
        if (scoperte > 0) {
          // Il messaggio precedente diceva che il cron non chiama il modello.
          // Da quando lo chiama e' diventato falso, e un resoconto che spiega
          // male e' peggio di uno che tace: manda a cercare la causa nel posto
          // sbagliato.
          aggiungi(
            `  \u26a0 Cosa resta scoperto lo dice la riga sotto: se le "trattenute" sono la ` +
              `maggioranza, sono nomi di persona che la regola 8 non manda a un modello, e si ` +
              `assegnano solo a mano da /revisione.`,
          );
        }
      }

      const pr = corpo['proposte'] as Record<string, unknown> | null;
      if (pr !== null && pr !== undefined) {
        aggiungi(
          `Proposte AI: ${String(pr['inviate'])} etichette inviate \u00b7 ${String(pr['proposte'])} proposte \u00b7 ` +
            `${String(pr['scartate'])} scartate \u00b7 ${String(pr['trattenute'])} trattenute dalla regola 8 \u00b7 ` +
            `${String(pr['rimaste'])} rimaste \u00b7 costo ${Number(pr['costo'] ?? 0).toFixed(4)} $`,
        );
      }

      const ric = corpo['ricerca'] as Record<string, unknown> | null;
      if (ric !== null && ric !== undefined) {
        aggiungi(
          `Ricerca sul mondo: ${String(ric['esaminati'])} esaminati \u00b7 ` +
            `${String(ric['trovati'])} trovati \u00b7 ${String(ric['rimasti'])} rimasti`,
        );
      }

      const r = corpo['ricorrenze'] as Record<string, unknown> | null;
      if (r !== null && r !== undefined) {
        aggiungi(
          `Ricorrenze: ${String(r['scritte'])} scritte \u00b7 ${String(r['nellaMetrica'])} nel numero`,
        );
        avvisaSenzaCambio(r['senzaCambio']);
      }

      if (corpo['avvisiCreati'] !== null && corpo['avvisiCreati'] !== undefined) {
        aggiungi(`Avvisi: ${String(corpo['avvisiCreati'])} nuovi`);
      }

      if (corpo['errore'] !== null && corpo['errore'] !== undefined) {
        aggiungi(`Errore: ${String(corpo['errore'])}`);
      }
      aggiungi(`Durata: ${Math.round(Number(corpo['durataMs'] ?? 0) / 1000)} s`);
      router.refresh();
    } catch (errore) {
      aggiungi(`${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  async function riprendi(id: string) {
    setInCorso(true);
    aggiungi(`Ripresa della corsa ${id.slice(0, 8)}…`);
    try {
      await eseguiCiclo(urlRipresa(id));
    } catch (errore) {
      aggiungi(`Errore di rete: ${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  // I sei bottoni sono la sequenza operativa dell'applicazione, e si premono
  // anche dal telefono: alti 44 px e su due colonne finche' lo schermo e'
  // stretto, invece che sette bersagli da venti pixel in fila.
  const stileBottone = `${BOTTONE} w-full sm:w-auto`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <div>
          <label className="text-xs text-neutral-500">
            da
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 block rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          {/* Lo storico lungo si ottiene solo chiedendolo: a date vuote la banca
              risponde con la sua finestra predefinita. Il bottone esiste perche'
              quella data si digita una volta sola, nell'ora dopo
              l'autorizzazione, e sbagliarla non e' recuperabile. */}
          <button
            type="button"
            onClick={() => setDateFrom(mesiFa(24))}
            disabled={inCorso}
            className="mt-1 text-[11px] text-neutral-500 underline underline-offset-2 disabled:opacity-40"
          >
            24 mesi fa
          </button>
        </div>
        <label className="text-xs text-neutral-500">
          a
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 block rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <button type="button" onClick={registraConti} disabled={inCorso} className={stileBottone}>
          1 · Registra conti
        </button>
        <button type="button" onClick={avvia} disabled={inCorso} className={stileBottone}>
          2 · Avvia backfill
        </button>
        <button type="button" onClick={normalizza} disabled={inCorso} className={stileBottone}>
          3 · Normalizza
        </button>
        <button type="button" onClick={categorizza} disabled={inCorso} className={stileBottone}>
          4 · Categorizza
        </button>
        <button type="button" onClick={cercaSulMondo} disabled={inCorso} className={stileBottone}>
          5 · Cerca sul mondo
        </button>
        <button type="button" onClick={riclassifica} disabled={inCorso} className={stileBottone}>
          5-bis · Riclassifica
        </button>
        <button type="button" onClick={proponi} disabled={inCorso} className={stileBottone}>
          6 · Proponi con l&rsquo;AI
        </button>
        <button
          type="button"
          onClick={rilevaAbbonamenti}
          disabled={inCorso}
          className={stileBottone}
        >
          7 · Rileva abbonamenti
        </button>
        <button type="button" onClick={quotidiano} disabled={inCorso} className={stileBottone}>
          8 · Sequenza quotidiana
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        Il bottone 7 esegue in un colpo ciò che Vercel Cron lancia ogni notte alle 05:00 UTC:
        scarica gli ultimi 7 giorni, normalizza, categorizza e rileva le ricorrenze. Chiama la
        stessa funzione del cron — se divergessero, provarla non direbbe niente.
      </p>

      {corseRiprendibili.length > 0 && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {corseRiprendibili.length === 1
              ? 'Una corsa non e\u2019 arrivata in fondo. Il suo cursore e\u2019 salvato: riprenderla continua da dove si era fermata, senza riscaricare nulla.'
              : `${corseRiprendibili.length} corse non sono arrivate in fondo. I loro cursori sono salvati: riprenderle continua da dove si erano fermate.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {corseRiprendibili.map((corsa) => (
              <button
                key={corsa.id}
                type="button"
                onClick={() => void riprendi(corsa.id)}
                disabled={inCorso}
                className="rounded-md border border-amber-400 px-3 py-1 text-xs disabled:opacity-40 dark:border-amber-800"
              >
                Riprendi{' '}
                {new Date(corsa.started_at).toLocaleString('it-IT', {
                  timeZone: 'Europe/Rome',
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {corsa.status} · {corsa.rows_fetched} righe
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-neutral-500">
        <input
          type="checkbox"
          checked={fetteCorte}
          onChange={(e) => setFetteCorte(e.target.checked)}
          disabled={inCorso}
        />
        Fette da 5 secondi — serve a verificare la ripresa: il backfill si spezza in piu&rsquo;
        tranche anche su uno storico corto.
      </label>

      <p className="text-xs text-neutral-500">
        A date vuote la banca risponde con la sua <strong>finestra predefinita</strong>, che su
        Revolut si e&rsquo; vista di 90 giorni: per lo storico lungo la data va chiesta
        esplicitamente. Se la banca la rifiuta, il backfill ripiega sulla finestra predefinita e lo
        dice, invece di fallire. Procede a fette: se chiudi la pagina a meta&rsquo;, lo stato resta
        salvato e riparte da li&rsquo;.
      </p>

      {messaggi.length > 0 && (
        <pre className="max-h-64 overflow-auto rounded bg-neutral-100 p-2 text-[11px] leading-snug dark:bg-neutral-900">
          {messaggi.join('\n')}
        </pre>
      )}
    </div>
  );
}
