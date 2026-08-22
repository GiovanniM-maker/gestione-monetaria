import { describe, expect, it } from 'vitest';
import { messaggioUtente } from '@/lib/db/messaggio';

const errore = (code: string, message: string) =>
  ({ code, message, details: '', hint: '', name: 'PostgrestError' }) as never;
const RIPIEGO = 'Non e’ stato possibile salvare.';

describe('quale messaggio del database puo arrivare all utente', () => {
  it('lascia passare i messaggi scritti da noi (P0001)', () => {
    // `valida_classe` elenca le classi di adesso: e' il motivo per cui quella
    // validazione vive in SQL, e zittirla sarebbe un difetto al posto di un altro.
    expect(
      messaggioUtente(
        errore('P0001', 'Discrezionalita’ non ammessa: pippo. Valori validi: essenziale, utile.'),
        RIPIEGO,
      ),
    ).toContain('Valori validi');
  });

  it.each([
    [
      '23505',
      'duplicate key value violates unique constraint "merchant_aliases_pattern_match_type_key"',
    ],
    ['23503', 'insert or update on table "transactions" violates foreign key constraint'],
    [
      '23514',
      'new row for relation "categories" violates check constraint "categories_slug_forma"',
    ],
    ['22P02', 'invalid input syntax for type uuid: "abc"'],
    ['42501', 'permission denied for table transactions'],
    ['42P01', 'relation "public.v_inesistente" does not exist'],
    ['PGRST202', 'Could not find the function public.crea_categoria(p_nome) in the schema cache'],
  ])('trattiene %s, che viene dal motore e non da una frase', (code, msg) => {
    const visto = messaggioUtente(errore(code, msg), RIPIEGO);
    expect(visto).toBe(RIPIEGO);
    // Nessun nome di vincolo, nessuna tabella, nessun gergo inglese a schermo.
    expect(visto).not.toMatch(/constraint|relation|syntax|permission|schema cache/i);
  });

  /**
   * Il verso in cui puo' sbagliare. Un codice sconosciuto — o assente — resta
   * fuori: fallisce **chiusa**, come la regola 8. Un messaggio nostro che
   * diventa generico e' leggibile e meno utile; un errore interno che passa e'
   * il difetto che questa funzione esiste per chiudere.
   */
  it('trattiene anche un codice mai visto o mancante', () => {
    expect(messaggioUtente(errore('XX999', 'internal error'), RIPIEGO)).toBe(RIPIEGO);
    expect(messaggioUtente(errore('', 'boh'), RIPIEGO)).toBe(RIPIEGO);
  });
});
