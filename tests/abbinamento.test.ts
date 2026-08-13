import { describe, expect, it } from 'vitest';
import {
  abbinaMerchant,
  etichettaDiRiferimento,
  normalizzaEtichetta,
  type Alias,
} from '@/lib/tassonomia/abbinamento';

/**
 * I casi qui sotto sono presi dai 60 esercenti veri del database, non
 * inventati. Se questi passano, la pipeline risolve la frammentazione che
 * abbiamo effettivamente misurato.
 */

function alias(
  pattern: string,
  merchantId: string,
  priority = 0,
  matchType: Alias['matchType'] = 'contains',
): Alias {
  return { merchantId, pattern, matchType, priority };
}

describe('normalizzaEtichetta', () => {
  it('uniforma maiuscole, punteggiatura e spazi', () => {
    expect(normalizzaEtichetta('Apple.com/bill')).toBe('apple com bill');
    expect(normalizzaEtichetta('  Notion  Labs, Inc. ')).toBe('notion labs inc');
    expect(normalizzaEtichetta('Cursor, Ai Powered Ide')).toBe('cursor ai powered ide');
  });

  it('non fonde esercenti diversi che condividono una parola', () => {
    // La versione aggressiva scartata toglieva i suffissi societari e univa
    // questi due. Sono un negozio di elettronica e un bar.
    expect(normalizzaEtichetta('Comet Spa')).not.toBe(normalizzaEtichetta('Bruno Spa-modica'));
  });
});

describe('abbinaMerchant — i casi di frammentazione veri', () => {
  const elenco = [
    alias('claude', 'anthropic'),
    alias('dott scooter', 'dott'),
    alias('booking', 'booking'),
    alias('n8n', 'n8n'),
    alias('redcare', 'redcare'),
    alias('cash at', 'contanti'),
    alias('trenitalia', 'trenitalia'),
    alias('fiscozen', 'fiscozen'),
    alias('lidl', 'lidl'),
  ];

  const casi: ReadonlyArray<[string, string]> = [
    ['Claude.ai Subscription', 'anthropic'],
    ['Anthropic* Claude Sub', 'anthropic'],
    ['Dott Scooter Ride', 'dott'],
    ['www.ridedott.com*Dott scooter ride*AMSTERDAM', 'dott'],
    ['Hotel At Booking.com', 'booking'],
    ['Booking.com Hotel', 'booking'],
    ['Bkg*booking.com Flight', 'booking'],
    ['Paddle.net* N8n Cloud1', 'n8n'],
    ['Redcare S.r.l.', 'redcare'],
    ['Redcare', 'redcare'],
    ['Cash at Unicredit - Ferrara', 'contanti'],
    ['Cash at Bnl Atm 1005804f', 'contanti'],
    ['Trenitalia - Pt Wl', 'trenitalia'],
    ['Fiscozen* Fiscozen', 'fiscozen'],
    ['Lidl 1361', 'lidl'],
  ];

  for (const [etichetta, atteso] of casi) {
    it(`«${etichetta}» → ${atteso}`, () => {
      expect(abbinaMerchant(etichetta, elenco)?.merchantId).toBe(atteso);
    });
  }

  it('non abbina cio che non corrisponde a nessun alias', () => {
    expect(abbinaMerchant('Panificio Reggiano', elenco)).toBeNull();
  });

  it('non abbina un etichetta vuota', () => {
    expect(abbinaMerchant('   ', elenco)).toBeNull();
  });
});

describe('abbinaMerchant — precedenze', () => {
  it('il pattern piu lungo vince: un abbonamento non sparisce dentro gli acquisti', () => {
    const elenco = [alias('amazon', 'amazon-acquisti'), alias('amazon prime', 'amazon-prime')];
    expect(abbinaMerchant('Amazon Prime IT', elenco)?.merchantId).toBe('amazon-prime');
    // E in ordine inverso deve dare lo stesso risultato: l'esito non puo'
    // dipendere da come il database restituisce le righe.
    expect(abbinaMerchant('Amazon Prime IT', [...elenco].reverse())?.merchantId).toBe(
      'amazon-prime',
    );
    expect(abbinaMerchant('Amazon* Ry88l8ll5', elenco)?.merchantId).toBe('amazon-acquisti');
  });

  it('la priorita batte la lunghezza, perche e il comando manuale', () => {
    const elenco = [alias('booking com hotel', 'generico'), alias('booking', 'specifico', 10)];
    expect(abbinaMerchant('Booking.com Hotel', elenco)?.merchantId).toBe('specifico');
  });

  it('a parita di priorita e lunghezza, exact batte contains batte regex', () => {
    const elenco = [
      alias('deliveroo', 'per-contains', 0, 'contains'),
      alias('deliveroo', 'per-exact', 0, 'exact'),
      alias('deliveroo', 'per-regex', 0, 'regex'),
    ];
    expect(abbinaMerchant('Deliveroo', elenco)?.merchantId).toBe('per-exact');
  });

  it('exact non corrisponde a un nome piu lungo', () => {
    const elenco = [alias('redcare', 'redcare', 0, 'exact')];
    expect(abbinaMerchant('Redcare', elenco)?.merchantId).toBe('redcare');
    expect(abbinaMerchant('Redcare S.r.l.', elenco)).toBeNull();
  });

  it('un regex malformato vale come nessuna corrispondenza, non come un errore', () => {
    const elenco = [alias('[non chiuso', 'rotto', 0, 'regex'), alias('coop', 'coop')];
    expect(() => abbinaMerchant('Coop Canalina', elenco)).not.toThrow();
    expect(abbinaMerchant('Coop Canalina', elenco)?.merchantId).toBe('coop');
  });
});

describe('etichettaDiRiferimento', () => {
  it('preferisce la controparte, che e il nome dell esercente', () => {
    expect(
      etichettaDiRiferimento({ counterparty_raw: 'Deliveroo', raw_description: 'Pagamento' }),
    ).toBe('Deliveroo');
  });

  it('ripiega sulla causale dove il creditore manca — bonifici e prelievi', () => {
    expect(
      etichettaDiRiferimento({ counterparty_raw: null, raw_description: 'Cash at Unicredit' }),
    ).toBe('Cash at Unicredit');
    expect(
      etichettaDiRiferimento({ counterparty_raw: '   ', raw_description: 'Cash at Unicredit' }),
    ).toBe('Cash at Unicredit');
  });

  it('restituisce null quando non c e niente su cui lavorare', () => {
    expect(etichettaDiRiferimento({ counterparty_raw: null, raw_description: null })).toBeNull();
  });
});
