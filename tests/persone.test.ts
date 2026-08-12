import { describe, expect, it } from 'vitest';
import { selezionaInviabili, sembraPersona } from '@/lib/tassonomia/persone';

/**
 * Le etichette qui sotto sono reali. Il filtro esiste per la regola 8: le
 * controparti dei bonifici privati non escono verso un LLM, e il controllo
 * gira prima della chiamata — dopo, il dato è uscito.
 */

describe('selezionaInviabili — il tipo di operazione decide', () => {
  it('un pagamento con carta si può sempre inviare, comunque si chiami', () => {
    // `Bar Fucsia Di Spadaro Mi` e `Panfe Bologna` hanno la forma di un nome
    // proprio, ma dall'altra parte di una carta c'è un esercente per
    // costruzione: si paga con la carta in un negozio, non a un amico.
    const { inviabili, trattenute } = selezionaInviabili([
      { etichetta: 'Bar Fucsia Di Spadaro Mi', soloCarta: true },
      { etichetta: 'Panfe Bologna', soloCarta: true },
      { etichetta: 'Rock Modica', soloCarta: true },
    ]);
    expect(inviabili).toHaveLength(3);
    expect(trattenute).toHaveLength(0);
  });

  it('un bonifico con nome di persona resta all’utente', () => {
    const { inviabili, trattenute } = selezionaInviabili([
      { etichetta: 'Vincenzo Mavilla', soloCarta: false },
      { etichetta: 'Bovi Laura', soloCarta: false },
      { etichetta: 'Linda Nanni', soloCarta: false },
    ]);
    expect(inviabili).toHaveLength(0);
    expect(trattenute).toHaveLength(3);
  });

  it('basta un bonifico nel gruppo perché la garanzia cada', () => {
    // `soloCarta` deve valere per TUTTE le occorrenze: una maggioranza non
    // basta, perché il movimento che sfugge è proprio quello che non deve
    // uscire.
    const { trattenute } = selezionaInviabili([
      { etichetta: 'Sabrina Di Javadzade F', soloCarta: false },
    ]);
    expect(trattenute).toEqual(['Sabrina Di Javadzade F']);
  });

  it('un bonifico verso un’attività riconoscibile si può inviare', () => {
    const { inviabili } = selezionaInviabili([
      { etichetta: 'Green Lemon Srl', soloCarta: false },
      { etichetta: 'Klingai.com', soloCarta: false },
    ]);
    expect(inviabili).toEqual(['Green Lemon Srl', 'Klingai.com']);
  });
});

describe('sembraPersona — la seconda rete, quando il codice manca', () => {
  for (const nome of ['Vincenzo Mavilla', 'Bovi Laura', 'Linda Nanni', 'Cavallo Vincenzo']) {
    it(`trattiene «${nome}»`, () => expect(sembraPersona(nome)).toBe(true));
  }

  for (const esercente of [
    'Green Lemon Srl',
    'Little Garden S.a.s.',
    'Klingai.com',
    'Openrouter, Inc',
    'Lidl 1361',
    'Tabaccheria Della Stazio',
    'Studio Medico Alessi Lau',
  ]) {
    it(`lascia passare «${esercente}»`, () => expect(sembraPersona(esercente)).toBe(false));
  }

  it('in dubbio trattiene, e il costo dei due errori non è simmetrico', () => {
    // Falso positivo consapevole: `Rock Modica` non è una persona, ma senza il
    // codice dell'operazione non c'è modo di saperlo. Costa una
    // classificazione a mano invece di un dato uscito per sempre.
    expect(sembraPersona('Rock Modica')).toBe(true);
  });

  it('non si fa ingannare da una parola sola o da una stringa vuota', () => {
    expect(sembraPersona('Deliveroo')).toBe(false);
    expect(sembraPersona('')).toBe(false);
  });
});
