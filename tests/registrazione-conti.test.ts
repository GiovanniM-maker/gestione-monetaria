import { describe, expect, it } from 'vitest';
import { abbinaConti, UidRuotati } from '@/lib/sync/accounts';
import type { EbAccount } from '@/lib/enablebanking/types';
import type { AccountRow } from '@/lib/db/types';

/**
 * Il caso che questi test proteggono e' successo davvero, l'11 agosto 2026:
 * dopo una riautorizzazione Revolut ha restituito gli stessi tre conti con
 * `eb_account_uid` tutti nuovi. Cercandoli solo per uid se ne creano tre
 * paralleli, lo storico si spacca in due meta', e il riconoscimento
 * strutturale dei giroconti marca come giroconto tutto il periodo scaricato
 * due volte — facendo sparire meta' delle spese reali senza un errore.
 */

const CONNESSIONE = 'c0000000-0000-0000-0000-000000000000';

function conto(parziale: Partial<AccountRow> & Pick<AccountRow, 'id' | 'eb_account_uid'>): AccountRow {
  return {
    connection_id: CONNESSIONE,
    iban_masked: null,
    name: 'Giovanni Graziano Mavilla',
    currency: 'EUR',
    account_type: 'current',
    is_active: true,
    include_in_totals: true,
    created_at: '2026-05-13T10:00:00.000Z',
    ...parziale,
  };
}

function dettagli(iban?: string): EbAccount {
  return {
    ...(iban === undefined ? {} : { account_id: { iban } }),
    currency: 'EUR',
    cash_account_type: 'CACC',
  } as EbAccount;
}

describe('abbinaConti', () => {
  it('riconosce i conti invariati dall’uid', () => {
    const esistente = conto({ id: 'a', eb_account_uid: 'uid-1' });
    const piano = abbinaConti([esistente], new Map([['uid-1', dettagli('LT111111111111113513')]]));

    expect(piano).toHaveLength(1);
    expect(piano[0]?.esistente).toBe(esistente);
  });

  it('ritrova per IBAN il conto a cui la banca ha cambiato l’uid', () => {
    const esistente = conto({
      id: 'a',
      eb_account_uid: 'uid-vecchio',
      iban_masked: '****3513',
    });

    const piano = abbinaConti(
      [esistente],
      new Map([['uid-nuovo', dettagli('LT111111111111113513')]]),
    );

    // Lo stesso conto, non uno nuovo: l'uid verra' riscritto sulla riga
    // esistente invece di generarne una parallela.
    expect(piano[0]?.esistente).toBe(esistente);
    expect(piano[0]?.uid).toBe('uid-nuovo');
  });

  it('non abbina per IBAN quando le ultime quattro cifre non sono univoche', () => {
    const primo = conto({ id: 'a', eb_account_uid: 'uid-a', iban_masked: '****3513' });
    const secondo = conto({ id: 'b', eb_account_uid: 'uid-b', iban_masked: '****3513' });

    // Due candidati sono un'ambiguita', non un abbinamento: meglio fermarsi.
    expect(() =>
      abbinaConti([primo, secondo], new Map([['uid-nuovo', dettagli('LT111111111111113513')]])),
    ).toThrow(UidRuotati);
  });

  it('si ferma quando gli uid ruotano su conti senza IBAN', () => {
    // I pocket Revolut hanno `iban_masked` nullo: l'abbinamento per IBAN non
    // li copre, e senza la guardia diventerebbero conti duplicati in silenzio.
    const pocket = conto({ id: 'p1', eb_account_uid: 'vecchio-1', account_type: 'savings' });
    const altro = conto({ id: 'p2', eb_account_uid: 'vecchio-2', account_type: 'savings' });

    expect(() =>
      abbinaConti(
        [pocket, altro],
        new Map([
          ['nuovo-1', dettagli()],
          ['nuovo-2', dettagli()],
        ]),
      ),
    ).toThrow(UidRuotati);
  });

  it('riproduce il guasto dell’11 agosto: un conto con IBAN e due pocket senza', () => {
    const esistenti = [
      conto({ id: 'c', eb_account_uid: 'v-corrente', iban_masked: '****3513' }),
      conto({ id: 'p1', eb_account_uid: 'v-pocket-1', account_type: 'savings' }),
      conto({ id: 'p2', eb_account_uid: 'v-pocket-2', account_type: 'savings' }),
    ];

    // Il corrente si ritrova per IBAN, i due pocket no: e' esattamente la
    // situazione da fermare, perche' produrrebbe due conti duplicati.
    expect(() =>
      abbinaConti(
        esistenti,
        new Map([
          ['n-corrente', dettagli('LT111111111111113513')],
          ['n-pocket-1', dettagli()],
          ['n-pocket-2', dettagli()],
        ]),
      ),
    ).toThrow(UidRuotati);
  });

  it('accetta un conto nuovo davvero, quando nessun conto noto resta spaiato', () => {
    const esistente = conto({ id: 'a', eb_account_uid: 'uid-1', iban_masked: '****3513' });

    const piano = abbinaConti(
      [esistente],
      new Map([
        ['uid-1', dettagli('LT111111111111113513')],
        ['uid-2', dettagli('LT222222222222229999')],
      ]),
    );

    expect(piano).toHaveLength(2);
    expect(piano[0]?.esistente).toBe(esistente);
    expect(piano[1]?.esistente).toBeNull();
  });

  it('non si ferma se un conto sparisce senza che ne arrivino di nuovi', () => {
    // Un conto chiuso e' un caso legittimo: niente uid mai visti, niente
    // rotazione, nessun motivo di bloccare la registrazione.
    const restato = conto({ id: 'a', eb_account_uid: 'uid-1' });
    const sparito = conto({ id: 'b', eb_account_uid: 'uid-2' });

    const piano = abbinaConti([restato, sparito], new Map([['uid-1', dettagli()]]));
    expect(piano).toHaveLength(1);
    expect(piano[0]?.esistente).toBe(restato);
  });

  it('sulla prima registrazione in assoluto crea tutto', () => {
    const piano = abbinaConti(
      [],
      new Map([
        ['uid-1', dettagli('LT111111111111113513')],
        ['uid-2', dettagli()],
      ]),
    );

    expect(piano.every((p) => p.esistente === null)).toBe(true);
  });
});
