import { describe, expect, it } from 'vitest';
import { CORSA, SOGLIA, faScattare, rispostaDi, rispostaPerErrore, scesa } from '@/lib/ui/tirata';

describe('scesa — l’attrito', () => {
  it('scende della metà di quanto si muove il dito', () => {
    expect(scesa(100)).toBe(50);
    expect(scesa(20)).toBe(10);
  });

  it('si ferma alla corsa massima', () => {
    // Il dito può correre per tutto lo schermo; l'indicatore no.
    expect(scesa(1000)).toBe(CORSA);
    expect(scesa(400)).toBe(CORSA);
  });

  it('verso l’alto non scende', () => {
    expect(scesa(-50)).toBe(0);
    expect(scesa(0)).toBe(0);
  });

  it('su un valore assurdo non scende affatto, e non e’ la stessa cosa', () => {
    // Fallisce **chiuso**: NaN e Infinity danno zero, cioè «nessuna tirata»,
    // non «tirata completa». Da un evento vero non arrivano; ma se arrivassero,
    // il verso giusto in cui sbagliare è non chiamare la banca, non
    // chiamarla per un gesto che nessuno ha fatto.
    expect(scesa(Number.NaN)).toBe(0);
    expect(scesa(Number.POSITIVE_INFINITY)).toBe(0);
    expect(faScattare(scesa(Number.POSITIVE_INFINITY))).toBe(false);
  });

  it('serve un gesto deliberato per arrivare alla soglia', () => {
    // Con l'attrito, la soglia da 72 px costa 144 px di dito: è la differenza
    // fra uno sfioramento e una tirata.
    expect(faScattare(scesa(140))).toBe(false);
    expect(faScattare(scesa(150))).toBe(true);
  });
});

describe('rispostaDi — le quattro risposte non sono intercambiabili', () => {
  it('dei movimenti nuovi: si dice, e si ricostruisce la pagina', () => {
    const r = rispostaDi({ righeNuove: 3, saltata: null });
    expect(r.tipo).toBe('nuovi');
    expect(r.testo).toContain('3');
    expect(r.ricarica).toBe(true);
  });

  it('un movimento solo si dice al singolare', () => {
    expect(rispostaDi({ righeNuove: 1 }).testo).toBe('1 movimento nuovo.');
  });

  it('la banca ha risposto e non aveva niente', () => {
    const r = rispostaDi({ righeNuove: 0, saltata: null });
    expect(r.tipo).toBe('niente');
    expect(r.ricarica).toBe(false);
  });

  it('la banca NON è stata chiamata: è un’altra cosa, e si dice', () => {
    // È la bugia più facile da scrivere in questo file: «niente di nuovo»
    // sarebbe la risposta a una domanda che non è stata fatta.
    const r = rispostaDi({ righeNuove: 0, saltata: 'Scaricato meno di quattro minuti fa.' });
    expect(r.tipo).toBe('saltato');
    expect(r.testo).not.toContain('Niente');
  });

  it('una `saltata` vuota non conta come salto', () => {
    expect(rispostaDi({ righeNuove: 0, saltata: '' }).tipo).toBe('niente');
    expect(rispostaDi({ righeNuove: 0, saltata: '   ' }).tipo).toBe('niente');
  });

  it('dei movimenti battono il salto', () => {
    // Un giro può aver saltato la banca e aver comunque normalizzato righe
    // arrivate prima: la notizia è che ci sono dei movimenti.
    const r = rispostaDi({ righeNuove: 2, saltata: 'Scaricato poco fa.' });
    expect(r.tipo).toBe('nuovi');
    expect(r.ricarica).toBe(true);
  });

  it('un esito senza i campi attesi non finge che sia andato bene', () => {
    // La risposta della rete non si controlla: se `righeNuove` manca o è una
    // stringa, si dice «niente», mai un numero inventato.
    expect(rispostaDi({}).tipo).toBe('niente');
    expect(rispostaDi({ righeNuove: 'tre' }).tipo).toBe('niente');
  });
});

describe('rispostaPerErrore', () => {
  it('la sessione scaduta si distingue, perché il rimedio è diverso', () => {
    expect(rispostaPerErrore(401).testo).toContain('Sessione');
    expect(rispostaPerErrore(500).testo).toContain('banca');
    expect(rispostaPerErrore(null).tipo).toBe('errore');
  });

  it('un errore non ricostruisce mai la pagina', () => {
    expect(rispostaPerErrore(500).ricarica).toBe(false);
  });
});

describe('la soglia sta sotto la corsa', () => {
  it('o non si potrebbe mai far scattare l’aggiornamento', () => {
    expect(SOGLIA).toBeLessThan(CORSA);
  });
});
