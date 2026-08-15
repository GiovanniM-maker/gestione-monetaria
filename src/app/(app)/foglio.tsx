'use client';

import { useEffect, useRef } from 'react';

/**
 * Il foglio dal basso.
 *
 * ---------------------------------------------------------------------------
 * Perche' dal basso e non al centro
 * ---------------------------------------------------------------------------
 * Una finestra al centro dello schermo mette i suoi controlli dove il pollice
 * non arriva, e su un telefono da sei pollici il bordo superiore e' il punto
 * piu' lontano dalla mano. Un foglio che sale dal fondo ha i bersagli dove la
 * mano gia' e', e il gesto per chiuderlo — toccare fuori, in alto — e' l'unico
 * posto della schermata che non contiene niente da premere per sbaglio.
 *
 * ---------------------------------------------------------------------------
 * E' un `<dialog>` vero
 * ---------------------------------------------------------------------------
 * `showModal()` porta gratis quattro cose che scritte a mano si sbagliano: il
 * fuoco resta dentro, Esc chiude, il resto della pagina diventa inerte per i
 * lettori di schermo, e il foglio sta sopra ogni altro contenuto senza una
 * gara di `z-index` con la barra in basso.
 *
 * Quello che va scritto a mano e' poco e sta qui, in un posto solo:
 *
 * - **il fondo si tocca per chiudere.** Il `<dialog>` occupa tutto lo schermo e
 *   il click su di lui — non sul foglio dentro — chiude. Confrontare
 *   `event.target` con l'elemento e' l'unico modo che non chiuda anche quando
 *   si trascina il dito da dentro a fuori scorrendo un elenco;
 * - **`env(safe-area-inset-bottom)`**, o sui telefoni con la barra dei gesti
 *   l'ultimo bottone finisce sotto il dito del sistema;
 * - **l'altezza massima e' l'85% dello schermo**, con lo scorrimento dentro il
 *   foglio: un elenco di trentacinque categorie non deve poter spingere il
 *   titolo fuori dalla vista.
 */
export function Dialogo({
  aperto,
  etichetta,
  onChiudi,
  children,
}: {
  aperto: boolean;
  etichetta: string;
  onChiudi: () => void;
  children: React.ReactNode;
}) {
  const riferimento = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = riferimento.current;
    if (d === null) return;
    // `open` da solo non basta: senza `showModal()` non c'e' ne' la trappola
    // del fuoco ne' Esc, e sarebbe un riquadro qualsiasi.
    if (aperto && !d.open) d.showModal();
    if (!aperto && d.open) d.close();
  }, [aperto]);

  return (
    <dialog
      ref={riferimento}
      onClose={onChiudi}
      onClick={(e) => {
        // Solo il fondo, non cio' che ci sta sopra: confrontare l'elemento e'
        // l'unico modo che non chiuda anche trascinando il dito da dentro a
        // fuori mentre si scorre un elenco.
        if (e.target === riferimento.current) onChiudi();
      }}
      aria-label={etichetta}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-transparent p-0
                 backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
    >
      {children}
    </dialog>
  );
}

export function Foglio({
  aperto,
  titolo,
  nota,
  onChiudi,
  children,
}: {
  aperto: boolean;
  titolo: string;
  nota?: React.ReactNode;
  onChiudi: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialogo aperto={aperto} etichetta={titolo} onChiudi={onChiudi}>
      <div className="flex h-full items-end justify-center">
        <div
          className="w-full max-w-md rounded-t-[26px] bg-s1 pb-[max(1rem,env(safe-area-inset-bottom))]
                     shadow-[0_-8px_40px_rgb(0_0_0/0.28)]"
          style={{ maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}
        >
          {/* La maniglia non si tocca ed e' `aria-hidden`: dice «questo sale dal
              basso» a chi guarda, e non aggiunge un bersaglio finto per chi no. */}
          <div aria-hidden="true" className="flex justify-center pt-2.5 pb-1">
            <span className="block h-1 w-9 rounded-full bg-(--testo-3)" />
          </div>

          <div className="flex items-start gap-3 px-5 pt-1 pb-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{titolo}</h2>
              {nota !== undefined && <p className="mt-0.5 text-[12px] text-testo-3">{nota}</p>}
            </div>
            <button
              type="button"
              onClick={onChiudi}
              className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-testo-2"
            >
              <span className="sr-only">Chiudi</span>
              <span aria-hidden="true" className="text-[17px] leading-none">
                ✕
              </span>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">{children}</div>
        </div>
      </div>
    </Dialogo>
  );
}
