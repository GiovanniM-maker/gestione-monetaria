import { describe, expect, it } from 'vitest';
import { haScritto } from '@/lib/sync/quotidiano';
import type { EsitoQuotidiano } from '@/lib/sync/quotidiano';
import type { EsitoNormalizzazione } from '@/lib/normalize/run';

/**
 * `haScritto` decide se il giro veloce butta la cache dei dati.
 *
 * L'errore da temere non e' «butta troppo» — costa qualche query — e' «non
 * butta quando doveva», che mostra un totale vecchio come se fosse fresco. Ogni
 * caso qui sotto verifica che il dubbio si risolva in quella direzione.
 */

function normalizzazione(campi: Partial<EsitoNormalizzazione> = {}): EsitoNormalizzazione {
  return {
    esaminate: 0,
    distinti: 0,
    girocontiStrutturali: 0,
    inserite: 0,
    aggiornate: 0,
    protette: 0,
    scartate: 0,
    girocontiSpeculari: 0,
    errori: [],
    ...campi,
  };
}

function esito(campi: Partial<EsitoQuotidiano> = {}): EsitoQuotidiano {
  return {
    saltata: null,
    runId: null,
    fette: 0,
    completato: true,
    righeLette: 0,
    righeNuove: 0,
    righeDuplicate: 0,
    avvisi: [],
    normalizzazione: normalizzazione(),
    categorizzazione: { speseAbbinate: 0, speseEsaminate: 0, assegnate: 0, svuotate: 0 },
    ricerca: null,
    proposte: null,
    ricorrenze: null,
    avvisiCreati: null,
    errore: null,
    durataMs: 0,
    ...campi,
  };
}

describe('haScritto', () => {
  it('un giro a vuoto non butta la cache', () => {
    expect(haScritto(esito())).toBe(false);
  });

  it('movimenti nuovi dalla banca la buttano', () => {
    expect(haScritto(esito({ righeNuove: 3 }))).toBe(true);
  });

  it('righe normalizzate nuove la buttano', () => {
    expect(haScritto(esito({ normalizzazione: normalizzazione({ inserite: 1 }) }))).toBe(true);
  });

  it('un giroconto riconosciuto la butta, anche senza righe nuove', () => {
    // Cambia `is_transfer`, quindi cambia la spesa reale: e' esattamente il
    // caso in cui un totale in cache diventerebbe falso.
    expect(
      haScritto(esito({ normalizzazione: normalizzazione({ girocontiStrutturali: 1 }) })),
    ).toBe(true);
    expect(haScritto(esito({ normalizzazione: normalizzazione({ girocontiSpeculari: 1 }) }))).toBe(
      true,
    );
  });

  it('una riassegnazione la butta', () => {
    const con = { speseAbbinate: 0, speseEsaminate: 0, assegnate: 1, svuotate: 0 };
    expect(haScritto(esito({ categorizzazione: con }))).toBe(true);
    expect(haScritto(esito({ categorizzazione: { ...con, assegnate: 0, svuotate: 1 } }))).toBe(
      true,
    );
  });

  it('«non lo so» vale «si»: errore, normalizzazione assente, resoconto mancante', () => {
    expect(haScritto(esito({ errore: 'la banca non risponde' }))).toBe(true);
    expect(haScritto(esito({ normalizzazione: null }))).toBe(true);
    expect(haScritto(esito({ categorizzazione: null }))).toBe(true);
  });

  it('`aggiornate` da solo NON la butta', () => {
    // Conta le righe riscritte, non quelle cambiate: l'upsert riscrive anche
    // una riga identica. Usarlo come segnale vorrebbe dire buttare sempre.
    expect(haScritto(esito({ normalizzazione: normalizzazione({ aggiornate: 2000 }) }))).toBe(
      false,
    );
  });
});
