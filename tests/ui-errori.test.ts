import { describe, expect, it } from 'vitest';
import { spiegaErrore, spiegaEccezione } from '@/lib/ui/errori';

/**
 * L'invariante di questo file e' uno: **nessun gettone tecnico e nessun numero
 * di stato deve poter raggiungere una schermata**. Era il difetto peggiore
 * dell'audit del 22 agosto — 22 route rispondevano `unauthorized` e 13
 * componenti lo rendevano alla lettera.
 */

const TECNICI = /unauthorized|forbidden|^\d+$/i;

describe('spiegaErrore', () => {
  it('la sessione scaduta si dice, e si offre il rientro', () => {
    const s = spiegaErrore(401, { error: 'unauthorized' });
    expect(s.titolo).toBe('La sessione è scaduta');
    expect(s.rientra).toBe(true);
    // Il gettone tecnico non arriva nemmeno nei dettagli: non aggiunge niente.
    expect(s.dettaglio).toBeNull();
  });

  it('nessun titolo contiene un gettone tecnico o un numero nudo', () => {
    for (const stato of [0, 400, 401, 403, 404, 408, 409, 422, 500, 502, 504]) {
      for (const corpo of [null, {}, { error: 'unauthorized' }, { error: 'forbidden' }]) {
        expect(spiegaErrore(stato, corpo).titolo).not.toMatch(TECNICI);
      }
    }
  });

  it('un 4xx con un messaggio vero usa quel messaggio', () => {
    // Il server sa dire meglio di noi cosa non andava in cio' che si e' scritto.
    const s = spiegaErrore(400, { error: 'Il nome della categoria è già in uso.' });
    expect(s.titolo).toBe('Il nome della categoria è già in uso.');
    expect(s.rientra).toBe(false);
    expect(s.riprova).toBe(false);
  });

  it('rete e guasto si possono riprovare, la validazione no', () => {
    expect(spiegaErrore(0, null).riprova).toBe(true);
    expect(spiegaErrore(504, null).riprova).toBe(true);
    expect(spiegaErrore(500, null).riprova).toBe(true);
    expect(spiegaErrore(422, { error: 'Importo non valido.' }).riprova).toBe(false);
  });

  it('dice sempre che i dati non sono stati toccati', () => {
    // E' la cosa che tiene in piedi la fiducia: un guasto di schermata non
    // rende falsi i numeri letti un minuto prima.
    for (const stato of [0, 500, 502]) {
      expect(spiegaErrore(stato, null).spiegazione).toMatch(/valid|modificat|ancora qui/i);
    }
  });

  it("un'eccezione di rete conserva il messaggio, ma nei dettagli", () => {
    const s = spiegaEccezione(new TypeError('Failed to fetch'));
    expect(s.titolo).not.toMatch(/fetch/i);
    expect(s.dettaglio).toBe('Failed to fetch');
    expect(s.riprova).toBe(true);
  });
});
