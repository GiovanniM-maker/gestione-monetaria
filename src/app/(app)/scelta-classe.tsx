'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClassiSceglibili } from './classi-note';
import { TAVOLOZZA_CLASSI } from './grafici';
import { spiegaEccezione, spiegaRisposta, type Spiegazione } from '@/lib/ui/errori';
import { NotaErrore } from '@/lib/ui/nota-errore';

/**
 * La classe di una riga, scelta dall'elenco.
 *
 * ---------------------------------------------------------------------------
 * Perche' esiste
 * ---------------------------------------------------------------------------
 * Fino al 22 agosto una riga senza classe si poteva sistemare in un modo solo:
 * dandole una **categoria**, e lasciando che la classe arrivasse di riflesso —
 * il che, prima della 0058, non funzionava nemmeno. Restava la scheda del
 * movimento, che ha il selettore giusto ma costa due navigazioni e un ritorno
 * indietro per riga.
 *
 * Su venti righe non e' una via manuale, e' un muro. E la via manuale qui non
 * e' un ripiego: **e' la sola fonte dell'informazione** quando una categoria
 * non c'e' e nessun automatismo puo' inventarla — la stessa ragione per cui
 * `own_counterparties` si dichiara a mano.
 *
 * ---------------------------------------------------------------------------
 * Pastiglie e non un foglio
 * ---------------------------------------------------------------------------
 * Il selettore di categoria apre un foglio perche' le categorie sono
 * trentacinque e portano un percorso intero. Le classi sono quattro, al massimo
 * sette per costruzione (la tavolozza si ferma li'), e sono parole singole:
 * aprire un pannello per scegliere fra quattro parole e' un tocco in piu' per
 * ogni riga, cioe' esattamente il costo che questo controllo esiste per
 * togliere. Stanno in fila, alte 44, con il pallino della loro tinta.
 *
 * ---------------------------------------------------------------------------
 * Si vede solo dove manca
 * ---------------------------------------------------------------------------
 * Non su ogni riga. Una riga che la classe ce l'ha non ha un lavoro da fare, e
 * un secondo selettore accanto a quello di categoria su ogni riga sarebbe
 * cinquanta ripetizioni in una schermata — la stessa cosa che l'audit ha tolto
 * dal selettore di categoria. Dove la classe c'e' si cambia dalla scheda, che
 * e' il posto delle eccezioni.
 *
 * Chi decide e' chi disegna la riga: qui si riceve `mostra` gia' deciso, cosi'
 * la regola sta in un posto solo invece che in questo componente e in chi lo
 * usa.
 *
 * ---------------------------------------------------------------------------
 * La portata e' una riga, e si vede
 * ---------------------------------------------------------------------------
 * `categorizza_movimento` marca `manually_categorized`, quindi da qui in poi
 * nessun automatismo tocca piu' questa riga — ed e' giusto: scegliere una
 * classe **e'** una decisione, ed e' precisamente cio' che quel flag esiste per
 * proteggere. Ma va detto, non lasciato scoprire: la nota sotto le pastiglie lo
 * dice, ed e' la stessa regola per cui il selettore di categoria dichiara se
 * tocca una riga o trecento.
 */
export function SceltaClasse({
  movimentoId,
  attuale,
  mostra,
}: {
  movimentoId: string;
  attuale: string | null;
  /** Disegnala solo dove serve. La regola sta in chi costruisce la riga. */
  mostra: boolean;
}) {
  const classi = useClassiSceglibili();
  const router = useRouter();
  // Il valore a schermo, che si muove **prima** della risposta: su una lista da
  // sistemare il ritorno del server e' un viaggio intero, e venti attese da
  // mezzo secondo sono la ragione per cui una lista di arretrati si chiude
  // invece di smaltirsi. Se la scrittura fallisce si torna indietro.
  const [scelto, setScelto] = useState<string | null>(attuale);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<Spiegazione | null>(null);

  if (!mostra || classi.length === 0) return null;

  async function scegli(slug: string) {
    if (inCorso) return;
    const prima = scelto;
    setScelto(slug);
    setInCorso(true);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/movimenti/classifica', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: movimentoId, discrezionalita: slug }),
      });
      if (!risposta.ok) {
        // A schermo non deve restare una scelta che il database non ha.
        setScelto(prima);
        setErrore(await spiegaRisposta(risposta));
        return;
      }
      router.refresh();
    } catch (e) {
      setScelto(prima);
      setErrore(spiegaEccezione(e));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Classe di questo movimento">
        {classi.map((c) => {
          const acceso = scelto === c.slug;
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => void scegli(c.slug)}
              disabled={inCorso}
              aria-pressed={acceso}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sec sm:min-h-9 ${
                acceso ? 'bg-(--accento) text-(--accento-testo)' : 'bg-s3 text-testo-2'
              } ${inCorso ? 'opacity-60' : ''}`}
            >
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{
                  background: acceso
                    ? 'currentColor'
                    : (TAVOLOZZA_CLASSI[c.colore] ?? 'var(--neutro)'),
                }}
              />
              {c.nome}
            </button>
          );
        })}
      </div>

      <p className="mt-1 text-eti text-testo-2">
        vale per questa riga, e la protegge dagli automatismi
      </p>

      <NotaErrore errore={errore} />
    </div>
  );
}
