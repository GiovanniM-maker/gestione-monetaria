import type { ReactNode } from 'react';

/**
 * «Niente qui», detto in modo che si possa fare qualcosa.
 *
 * ---------------------------------------------------------------------------
 * Perche' tre righe e non una
 * ---------------------------------------------------------------------------
 * L'audit del 22 agosto ha contato cinque stati vuoti su cinque che dicevano
 * **cosa non c'e'** — «Nessun movimento in questo mese.» — e nessuno che dicesse
 * perche' o cosa fare. L'unico scritto bene era «Sei in pari», e non e' un caso:
 * era l'unico nato da una decisione esplicita.
 *
 * Le tre righe non sono uno schema grafico, sono tre domande che chi guarda si
 * fa in quest'ordine:
 *
 * 1. **cosa dovrebbe esserci** — il titolo;
 * 2. **perche' non c'e'** — quasi sempre e' una scelta di chi guarda (un filtro,
 *    un mese, una ricerca) e non un'assenza di dati. Dirlo trasforma un vicolo
 *    cieco in una cosa che si puo' disfare;
 * 3. **cosa si puo' fare** — e se non c'e' niente da fare, meglio non inventare
 *    un bottone: `azioni` e' facoltativo.
 *
 * Resta valida la regola della Fase 7: **«niente» e «non lo so» sono due
 * risposte diverse**. Questo componente serve al primo caso. Quando i dati sono
 * fermi o lo scarico e' fallito non si usa: si dice quello.
 */
export function Vuoto({
  titolo,
  perche,
  azioni,
  /** Dentro una scheda che ha gia' il suo riempimento: niente cornice. */
  nudo = false,
}: {
  titolo: string;
  perche?: ReactNode;
  azioni?: ReactNode;
  nudo?: boolean;
}) {
  return (
    <div className={nudo ? 'py-6 text-center' : 'scheda px-5 py-8 text-center'}>
      <p className="text-[15px] font-semibold">{titolo}</p>
      {perche !== undefined && (
        <p className="mx-auto mt-1.5 max-w-[34ch] text-[13px] text-testo-2">{perche}</p>
      )}
      {azioni !== undefined && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">{azioni}</div>
      )}
    </div>
  );
}
