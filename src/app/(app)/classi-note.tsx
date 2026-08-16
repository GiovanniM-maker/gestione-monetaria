'use client';

import { createContext, useContext } from 'react';
import type { DiscretionClassRow } from '@/lib/db/types';

/**
 * Le classi di discrezionalita', disponibili a ogni componente client.
 *
 * ---------------------------------------------------------------------------
 * Perche' un contesto e non una prop
 * ---------------------------------------------------------------------------
 * Cinque pannelli client — conferma, revisione, categorie, correggi, sposta —
 * mostrano un selettore di classe, e ognuno vive dentro una pagina diversa.
 * Passare l'elenco a mano vorrebbe dire cinque catene di prop identiche, e
 * cinque catene identiche divergono: quella che resta indietro e' sempre la
 * schermata che si usa meno, cioe' quella che nessuno prova.
 *
 * Non e' uno state manager, che lo stack vieta. Non c'e' nessuno stato: e' un
 * valore letto una volta dal layout — che e' un componente **server**, quindi
 * la query e' una sola per richiesta e passa da `inCache` — e reso disponibile
 * a chi lo disegna. Non si scrive mai da qui: le scritture stanno in
 * `lib/tassonomia/classi.ts`, con la loro firma esplicita, come le chiamera' il
 * copilota.
 *
 * ---------------------------------------------------------------------------
 * Il valore predefinito e' vuoto, e va bene cosi'
 * ---------------------------------------------------------------------------
 * Un componente montato fuori dal fornitore vede un elenco vuoto: un selettore
 * senza opzioni, che si nota subito. L'alternativa — ripiegare sulle quattro
 * classi di ieri — mostrerebbe un elenco **plausibile e sbagliato**, che e' il
 * tipo di guasto che non si nota.
 */

const Contesto = createContext<readonly DiscretionClassRow[]>([]);

export function ClassiNote({
  classi,
  children,
}: {
  classi: readonly DiscretionClassRow[];
  children: React.ReactNode;
}) {
  return <Contesto.Provider value={classi}>{children}</Contesto.Provider>;
}

/** Tutte le classi, archiviate comprese, nell'ordine dichiarato. */
export function useClassi(): readonly DiscretionClassRow[] {
  return useContext(Contesto);
}

/**
 * Quelle che si possono ancora **scegliere**.
 *
 * Un'archiviata resta valida in scrittura — lo storico classificato con lei non
 * si tocca — ma non va offerta: archiviare significa «non usarla piu'», e un
 * selettore che continua a proporla non archivia niente.
 */
export function useClassiSceglibili(): readonly DiscretionClassRow[] {
  return useContext(Contesto).filter((c) => !c.is_archived);
}

/** Dallo slug al nome mostrato. Uno slug senza riga torna com'e': vedi `nomeClasse`. */
export function useNomeClasse(): (slug: string | null) => string {
  const classi = useContext(Contesto);
  return (slug) => (slug === null ? '—' : (classi.find((c) => c.slug === slug)?.nome ?? slug));
}
