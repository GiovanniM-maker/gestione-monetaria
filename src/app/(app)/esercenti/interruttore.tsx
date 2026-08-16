'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * I due flag dell'esercente: **fisso** o **variabile**.
 *
 * Due bottoni e non una casella di spunta, per una ragione precisa: una casella
 * ha uno stato spento che si legge come «non ancora deciso», e qui i due stati
 * sono due scelte pari — «la classificazione dell'esercente vale sempre» e «ogni
 * spesa fa storia a se'». Vederli tutti e due, con quello attivo evidenziato,
 * dice cosa si sta scegliendo invece di far indovinare cosa significhi il vuoto.
 *
 * Non cambia nessuna classificazione: cambia **a chi si chiede**. Per questo il
 * tocco e' immediato e senza conferma — non c'e' niente da disfare che non si
 * disfi con l'altro bottone.
 */
export function Interruttore({
  id,
  variabile,
  compatto = false,
}: {
  id: string;
  variabile: boolean;
  compatto?: boolean;
}) {
  const router = useRouter();
  const [valore, setValore] = useState(variabile);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function scegli(nuovo: boolean) {
    if (nuovo === valore || inCorso) return;
    setInCorso(true);
    setErrore(null);
    const prima = valore;
    setValore(nuovo); // ottimistico: il tocco deve rispondere subito
    try {
      const risposta = await fetch('/api/admin/esercenti', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, variabile: nuovo }),
      });
      if (!risposta.ok) {
        const esito = (await risposta.json()) as Record<string, unknown>;
        setValore(prima); // torna indietro: non deve restare a schermo un valore che il database non ha
        setErrore(String(esito['error'] ?? risposta.status));
        return;
      }
      router.refresh();
    } catch (e) {
      setValore(prima);
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  }

  // Compatto: due pastiglie dentro un solco, come un interruttore di sistema —
  // dice «o l'una o l'altra» senza doverlo scrivere, e sta in una riga di
  // elenco. Esteso: due bottoni larghi, perche' li' e' la scelta principale
  // della schermata.
  const base = compatto
    ? 'inline-flex min-h-11 items-center rounded-[10px] px-2.5 text-[12px] sm:min-h-7'
    : 'inline-flex min-h-11 flex-1 items-center justify-center rounded-controllo px-3 text-[15px]';

  const stile = (attivo: boolean) =>
    `${base} ${
      attivo ? 'bg-accento font-medium text-accento-testo' : 'text-testo-3'
    } ${inCorso ? 'opacity-60' : ''}`;

  return (
    <div className={compatto ? 'shrink-0' : 'space-y-2'}>
      <div className={compatto ? 'flex gap-0.5 rounded-controllo bg-s3 p-0.5' : 'flex gap-2'}>
        <button type="button" className={stile(!valore)} onClick={() => void scegli(false)}>
          fisso
        </button>
        <button type="button" className={stile(valore)} onClick={() => void scegli(true)}>
          variabile
        </button>
      </div>
      {!compatto && (
        <p className="text-xs text-testo-2">
          {valore ? (
            <>
              Ogni sua spesa si classifica <strong>una per una</strong>: la categoria qui sotto è
              solo la proposta di partenza. È il caso di un negozio dove compri sia un computer per
              lavorare sia una sciocchezza.
            </>
          ) : (
            <>
              La classificazione qui sotto vale per <strong>tutte le sue spese</strong>, passate e
              future. Le singole righe non chiedono niente.
            </>
          )}
        </p>
      )}
      {errore !== null && <p className="nota nota-errore text-[13px]">{errore}</p>}
    </div>
  );
}
