import { describe, expect, it } from 'vitest';
import { interpretaProposta } from '@/lib/tassonomia/interpreta';

/**
 * Alla prima prova sul campo questa funzione ha bocciato quindici risposte su
 * quindici, e il resoconto diceva soltanto «15 scartate». I casi qui sotto
 * sono le forme che un modello restituisce davvero.
 */

const SLUG = new Set(['ristorazione-bar', 'trasporti-treni', 'lavoro-software']);
const LOTTO = ['Sumup  *bar Job', 'Tper Spa', 'Klingai.com'];

const valida = {
  etichetta: 'Tper Spa',
  nome: 'TPER',
  categoria: 'trasporti-treni',
  discrezionalita: 'utile',
  contesto: 'personale',
  abbonamento: false,
  motivo: 'Trasporto pubblico',
  sicuro: true,
};

function proposta(v: unknown) {
  const esito = interpretaProposta(v, SLUG, LOTTO);
  return 'proposta' in esito ? esito.proposta : null;
}

function scarto(v: unknown) {
  const esito = interpretaProposta(v, SLUG, LOTTO);
  return 'scarto' in esito ? esito.scarto : null;
}

describe('interpretaProposta — accetta le variazioni di forma', () => {
  it('accetta la risposta canonica', () => {
    expect(proposta(valida)?.nome).toBe('TPER');
  });

  it('accetta «discrezionalità» con l’accento', () => {
    const { discrezionalita: _via, ...resto } = valida;
    expect(proposta({ ...resto, discrezionalità: 'utile' })?.discrezionalita).toBe('utile');
  });

  it('accetta i nomi di campo in inglese', () => {
    expect(
      proposta({
        label: 'Tper Spa',
        name: 'TPER',
        category: 'trasporti-treni',
        discretion: 'utile',
        context: 'personale',
        is_subscription: true,
        reason: 'bus',
        confident: true,
      }),
    ).toMatchObject({ nome: 'TPER', abbonamento: true, sicuro: true });
  });

  it('ritrova l’etichetta anche se il modello compatta gli spazi', () => {
    // `Sumup  *bar Job` ha due spazi. Un modello che ne restituisce uno ha
    // risposto bene: rifiutarlo butterebbe una classificazione giusta.
    const p = proposta({ ...valida, etichetta: 'Sumup *bar Job', categoria: 'ristorazione-bar' });
    expect(p?.etichetta).toBe('Sumup  *bar Job');
  });

  it('restituisce sempre l’etichetta ORIGINALE, non quella del modello', () => {
    // L'alias si scrive con questa stringa: se fosse quella riscritta dal
    // modello, non abbinerebbe nessun movimento.
    const p = proposta({ ...valida, etichetta: 'tper spa' });
    expect(p?.etichetta).toBe('Tper Spa');
  });
});

describe('interpretaProposta — rifiuta, e dice perché', () => {
  it('categoria inesistente', () => {
    expect(scarto({ ...valida, categoria: 'trasporti-aerei' })).toContain('categoria inesistente');
  });

  it('discrezionalità inventata', () => {
    expect(scarto({ ...valida, discrezionalita: 'superfluo' })).toContain(
      'discrezionalità non ammessa',
    );
  });

  it('contesto inventato', () => {
    expect(scarto({ ...valida, contesto: 'aziendale' })).toContain('contesto non ammesso');
  });

  it('etichetta mai inviata', () => {
    expect(scarto({ ...valida, etichetta: 'Coop Canalina' })).toContain(
      "non è fra le etichette inviate",
    );
  });

  it('quando manca l’etichetta elenca i campi trovati, per capire cos’ha risposto', () => {
    const motivo = scarto({ nome: 'TPER', categoria: 'trasporti-treni' });
    expect(motivo).toContain('campi trovati');
    expect(motivo).toContain('nome');
  });

  it('non esplode su valori che non sono oggetti', () => {
    for (const v of [null, 'testo', 42, []]) {
      expect(scarto(v)).not.toBeNull();
    }
  });
});
