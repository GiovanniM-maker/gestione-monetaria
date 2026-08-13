import { describe, expect, it } from 'vitest';
import { selezionaInviabili, sembraAttivita } from '@/lib/tassonomia/persone';

/**
 * Le etichette qui sotto sono tutte reali. Il filtro esiste per la regola 8:
 * le controparti dei bonifici privati non escono verso un LLM, e il controllo
 * gira prima della chiamata — dopo, il dato è uscito.
 */

describe('il guasto del 12 agosto: un bonifico privato è uscito davvero', () => {
  const NOME = 'Massimiliano De Jesus Sarta Naccarata';

  it('non lo invia', () => {
    const { inviabili, trattenute } = selezionaInviabili([{ etichetta: NOME, soloCarta: false }]);
    expect(inviabili).toHaveLength(0);
    expect(trattenute).toEqual([NOME]);
  });

  it('cinque parole non sono più un caso non previsto', () => {
    // La versione precedente riconosceva come persona solo i nomi da due a
    // quattro parole: questo ne ha cinque, non rientrava, e usciva. Il numero
    // di parole era il sintomo — il difetto era che si inviava per difetto.
    expect(sembraAttivita(NOME)).toBe(false);
    expect(sembraAttivita('Anna Maria Giuseppina De Filippis Di Santo')).toBe(false);
  });
});

describe('sembraAttivita — è un test positivo, non l’assenza di sospetto', () => {
  for (const azienda of [
    'Green Lemon Srl',
    'Little Garden S.a.s.',
    'Klingai.com',
    'Openrouter, Inc',
    'Lidl 1361',
    'Canva* I04731-63857386',
    'Tabaccheria Della Stazio',
    'Studio Medico Alessi Lau',
    'Sumup  *sabrina Di Jav',
    'Deliveroo',
    'www.ridedott.com*Dott scooter ride*AMSTERDAM',
  ]) {
    it(`riconosce «${azienda}» come attività`, () => {
      expect(sembraAttivita(azienda)).toBe(true);
    });
  }

  for (const persona of [
    'Vincenzo Mavilla',
    'Bovi Laura',
    'Linda Nanni',
    'Antonella Mole',
    'Cavallo Vincenzo',
    'Giuseppe Enzo Pinto Sanchez',
    'ROSSELLA BARAZZONI',
    'Massimiliano De Jesus Sarta Naccarata',
  ]) {
    it(`non riconosce «${persona}» come attività`, () => {
      expect(sembraAttivita(persona)).toBe(false);
    });
  }

  it('in dubbio risponde no: un nome sconosciuto non è un’azienda', () => {
    // `Rock Modica` è un locale, ma niente nel nome lo dice. Resta dentro, e
    // costa una classificazione a mano invece di un dato uscito per sempre.
    expect(sembraAttivita('Rock Modica')).toBe(false);
    expect(sembraAttivita('')).toBe(false);
  });
});

describe('selezionaInviabili — il tipo di operazione ha la precedenza', () => {
  it('un pagamento con carta esce comunque si chiami', () => {
    const { inviabili, trattenute } = selezionaInviabili([
      { etichetta: 'Bar Fucsia Di Spadaro Mi', soloCarta: true },
      { etichetta: 'Rock Modica', soloCarta: true },
      { etichetta: 'Severini Laura', soloCarta: true },
    ]);
    expect(inviabili).toHaveLength(3);
    expect(trattenute).toHaveLength(0);
  });

  it('un bonifico esce solo se il nome dichiara un’attività', () => {
    const { inviabili, trattenute } = selezionaInviabili([
      { etichetta: 'Green Lemon Srl', soloCarta: false },
      { etichetta: 'Vincenzo Mavilla', soloCarta: false },
      { etichetta: 'Klingai.com', soloCarta: false },
      { etichetta: 'Linda Nanni', soloCarta: false },
    ]);
    expect(inviabili).toEqual(['Green Lemon Srl', 'Klingai.com']);
    expect(trattenute).toEqual(['Vincenzo Mavilla', 'Linda Nanni']);
  });

  it('basta un bonifico nel gruppo perché la garanzia della carta cada', () => {
    const { trattenute } = selezionaInviabili([
      { etichetta: 'Sabrina Di Javadzade F', soloCarta: false },
    ]);
    expect(trattenute).toEqual(['Sabrina Di Javadzade F']);
  });
});
