'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * I pannelli modali: il foglio che sale dal basso e il cassetto che entra da
 * destra.
 *
 * ---------------------------------------------------------------------------
 * E' un `<dialog>` vero
 * ---------------------------------------------------------------------------
 * `showModal()` porta gratis quattro cose che scritte a mano si sbagliano: il
 * fuoco resta dentro, Esc chiude, il resto della pagina diventa inerte per i
 * lettori di schermo, e il pannello sta sopra ogni altro contenuto senza una
 * gara di `z-index` con la barra in basso.
 *
 * ---------------------------------------------------------------------------
 * Quello che il `<dialog>` NON fa, e che qui va scritto
 * ---------------------------------------------------------------------------
 * Tre cose, e tutte e tre erano rotte finche' non le si e' provate col dito
 * invece che col mouse:
 *
 * 1. **il fondo non chiudeva.** Il gestore confrontava `event.target` con
 *    l'elemento `<dialog>`, ma dentro c'e' un contenitore che lo riempie tutto:
 *    il bersaglio del tocco era sempre quello, mai il dialogo, e toccare fuori
 *    non faceva niente. Ora si guarda se il punto toccato sta **dentro il
 *    pannello**, e si chiude solo se il gesto e' **cominciato e finito** fuori
 *    — se no, trascinare il dito da dentro a fuori mentre si scorre un elenco
 *    chiuderebbe il pannello;
 * 2. **non si poteva trascinare via.** La maniglia in cima e la forma stessa
 *    del foglio promettono quel gesto, e un'interfaccia che promette un gesto e
 *    non lo fa e' peggio di una che non lo promette. Ora il foglio si abbassa
 *    col dito e il cassetto si spinge a destra; oltre un quarto della propria
 *    misura, o con uno strappo veloce, se ne vanno. Sotto quella soglia tornano
 *    al loro posto con una molla;
 * 3. **la pagina dietro scorreva.** `showModal()` rende il resto inerte —
 *    niente fuoco, niente clic — ma non blocca lo scorrimento: con il foglio
 *    aperto un trascinamento sul fondo faceva scorrere di ottocento pixel
 *    l'elenco sotto, e si chiudeva il foglio ritrovandosi altrove.
 */

export type Verso = 'basso' | 'destra';

/** Quanto si deve trascinare, in frazione della misura del pannello. */
const SOGLIA = 0.25;
/** Uno strappo veloce chiude comunque: px al secondo. */
const STRAPPO = 550;

/**
 * Quanto dura l'entrata e l'uscita del pannello.
 *
 * Trecento millisecondi con la curva del sistema: sotto i duecento il movimento
 * non si legge come un movimento ma come uno sfarfallio, sopra i quattrocento
 * si aspetta. E' la durata dei fogli di sistema, e non e' un caso — e' quella a
 * cui la mano e' abituata.
 */
const USCITA_MS = 300;

/**
 * Dove sta il pannello, adesso.
 *
 * ---------------------------------------------------------------------------
 * Una sola trasformazione per due lavori, e l'ordine conta
 * ---------------------------------------------------------------------------
 * Mentre si trascina comanda il **dito**: qualunque altra cosa la sovrascriva
 * fa perdere il contatto fra il pannello e il polpastrello, che e' l'unica cosa
 * che rende quel gesto credibile. Quando non si trascina comanda lo **stato**:
 * fuori dallo schermo se sta entrando o uscendo, a riposo se e' arrivato.
 *
 * Sono due `transform` sullo stesso elemento, e in CSS la seconda vince sempre:
 * separarle in due proprieta' o in due classi era il modo di scoprire fra un
 * mese che il trascinamento aveva smesso di funzionare. Qui c'e' una sola
 * decisione, ed e' provata.
 */
export function trasformaPannello({
  verso,
  dentro,
  scostamento,
}: {
  verso: Verso;
  /** Il pannello e' arrivato: non sta ne' entrando ne' uscendo. */
  dentro: boolean;
  /** Quanto l'ha spostato il dito, in pixel. Zero quando non si trascina. */
  scostamento: number;
}): string | undefined {
  if (scostamento !== 0) {
    return verso === 'basso' ? `translateY(${scostamento}px)` : `translateX(${scostamento}px)`;
  }
  if (dentro) return undefined;
  // 101 e non 100: un pixel di margine, o su uno schermo a densita' frazionaria
  // resta a schermo una riga chiara del bordo del pannello.
  return verso === 'basso' ? 'translateY(101%)' : 'translateX(101%)';
}

/** Chi ha chiesto meno movimento non aspetta un'animazione che non vedra'. */
function riduciMovimento(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Il blocco dello scorrimento si conta, perche' i pannelli si annidano.
 *
 * Dal foglio «Correggi» si apre quello della categoria, e sono due `<dialog>`
 * uno dentro l'altro. Senza questo conteggio il secondo rileggerebbe
 * `window.scrollY` a corpo gia' fissato — che vale **zero** — e riscriverebbe
 * `top: -0px`: la pagina dietro salterebbe in cima, e chiudendo il secondo lo
 * scorrimento si sbloccherebbe mentre il primo e' ancora aperto.
 *
 * Fissa il primo che apre, ripristina l'ultimo che chiude.
 */
let pannelliAperti = 0;
let sbloccaCorpo: (() => void) | null = null;

export function Dialogo({
  aperto,
  etichetta,
  verso,
  onChiudi,
  testata,
  children,
}: {
  aperto: boolean;
  etichetta: string;
  verso: Verso;
  onChiudi: () => void;
  /** La parte da cui si trascina: e' `Dialogo` a legarci sopra il gesto. */
  testata: React.ReactNode;
  children: React.ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const pannello = useRef<HTMLDivElement>(null);
  const partitoFuori = useRef(false);
  const gesto = useRef<{ da: number; quando: number } | null>(null);
  const annullaSecondo = useRef<number | null>(null);
  const [scostamento, setScostamento] = useState(0);
  const [trascinando, setTrascinando] = useState(false);
  /**
   * Il pannello e' **arrivato**, cioe' non sta ne' entrando ne' uscendo.
   *
   * ---------------------------------------------------------------------------
   * Perche' serve uno stato, e non basta una transizione
   * ---------------------------------------------------------------------------
   * Fino al 22 agosto il foglio **compariva**: la transizione c'era ma solo sul
   * trascinamento, e all'apertura il pannello era gia' alla posizione di riposo.
   * E' l'unico punto dell'applicazione in cui il movimento e' obbligatorio — un
   * pannello che appare senza salire non dice da dove viene, e chiudendo
   * sparisce senza dire dove va. Tutto il resto e' giustamente immobile, e
   * questo lo rendeva piu' evidente, non meno.
   *
   * Non si puo' fare con la sola CSS: `showModal()` inserisce l'elemento nel
   * livello superiore **gia' visibile**, quindi la transizione non ha uno stato
   * di partenza da cui muoversi. Serve un fotogramma in mezzo — ed e' proprio
   * quello che fa il doppio `requestAnimationFrame` qui sotto.
   *
   * In uscita il problema e' l'opposto: `close()` e' immediato e toglierebbe il
   * pannello prima che abbia il tempo di scendere. Quindi si toglie prima lo
   * stato, si aspetta la durata dell'animazione, e solo allora si chiude.
   */
  const [dentro, setDentro] = useState(false);

  useEffect(() => {
    const d = dialogo.current;
    if (d === null) return;

    if (aperto) {
      // `open` da solo non basta: senza `showModal()` non c'e' ne' la trappola
      // del fuoco ne' Esc, e sarebbe un riquadro qualsiasi.
      if (!d.open) d.showModal();
      // Due fotogrammi: il primo mette l'elemento a schermo, il secondo lascia
      // al browser il tempo di calcolare lo stato iniziale da cui partire. Con
      // uno solo, in Safari, la transizione a volte non parte affatto.
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setDentro(true));
        annullaSecondo.current = r2;
      });
      return () => {
        cancelAnimationFrame(r1);
        if (annullaSecondo.current !== null) cancelAnimationFrame(annullaSecondo.current);
      };
    }

    if (!d.open) return;
    // Chi ha chiesto meno movimento non aspetta: la chiusura e' immediata.
    const attesa = riduciMovimento() ? 0 : USCITA_MS;
    // Un fotogramma prima di far scendere il pannello: e' anche il modo di non
    // cambiare stato dentro il corpo dell'effetto, che React 19 non ammette.
    const r = requestAnimationFrame(() => setDentro(false));
    const t = setTimeout(() => {
      if (d.open) d.close();
      // Lo scostamento torna a zero **dopo** la chiusura, non prima: azzerarlo
      // subito farebbe risalire il pannello di scatto mentre sta uscendo.
      setScostamento(0);
    }, attesa);
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(t);
    };
  }, [aperto]);

  /**
   * Il pannello segue la tastiera.
   *
   * `visualViewport.height` e' l'unica misura che su iOS cala davvero quando i
   * tasti salgono: `dvh` resta quello di prima, e il piede del foglio — dove
   * stanno «Salva» e «Annulla» — finisce sotto la tastiera. Su Chromium ci
   * pensa `interactive-widget=resizes-content` nel layout, ma su Safari no, e
   * Safari e' il caso che conta: questa applicazione si apre da un telefono.
   *
   * Si scrive una variabile CSS invece di uno stato React: cambia a ogni
   * fotogramma mentre la tastiera sale, e farne passare ognuno da un render
   * sarebbe l'unico posto dell'app in cui l'animazione scatta.
   */
  useEffect(() => {
    if (!aperto) return;
    const vv = window.visualViewport;
    if (vv === null || vv === undefined) return;

    const misura = () => {
      document.documentElement.style.setProperty('--altezza-utile', `${vv.height}px`);
    };
    misura();
    vv.addEventListener('resize', misura);
    vv.addEventListener('scroll', misura);
    return () => {
      vv.removeEventListener('resize', misura);
      vv.removeEventListener('scroll', misura);
      document.documentElement.style.removeProperty('--altezza-utile');
    };
  }, [aperto]);

  /**
   * La pagina dietro non deve scorrere.
   *
   * Il corpo si **fissa** invece di ricevere `overflow: hidden`, e la posizione
   * si conserva in un `top` negativo: su iOS il solo `overflow` lascia scorrere
   * lo stesso, e al ripristino la pagina risale in cima. Cosi' torna esattamente
   * dov'era.
   */
  useEffect(() => {
    if (!aperto) return;
    pannelliAperti += 1;
    if (pannelliAperti === 1) {
      const y = window.scrollY;
      const corpo = document.body;
      const prima = {
        position: corpo.style.position,
        top: corpo.style.top,
        width: corpo.style.width,
      };
      corpo.style.position = 'fixed';
      corpo.style.top = `-${y}px`;
      corpo.style.width = '100%';
      sbloccaCorpo = () => {
        corpo.style.position = prima.position;
        corpo.style.top = prima.top;
        corpo.style.width = prima.width;
        window.scrollTo(0, y);
      };
    }
    return () => {
      pannelliAperti -= 1;
      if (pannelliAperti === 0 && sbloccaCorpo !== null) {
        sbloccaCorpo();
        sbloccaCorpo = null;
      }
    };
  }, [aperto]);

  /**
   * Il punto toccato sta dentro il pannello?
   *
   * Si guardano le **coordinate**, non il nodo colpito. Prima era
   * `pannello.contains(event.target)`, e falliva in un modo che si vedeva solo
   * col dito: fra il `pointerdown` e il `click` la lista sotto puo'
   * ridisegnarsi — `router.refresh()` dopo una scrittura, o il contesto delle
   * classi che cambia identita' — e il nodo colpito finisce **staccato dal
   * documento**. Un nodo staccato non e' contenuto da niente, quindi il tocco
   * risultava «fuori» e il foglio si chiudeva da solo mentre lo si stava
   * compilando.
   *
   * Un rettangolo non ha questo problema: esiste finche' esiste il pannello, e
   * risponde alla domanda che si voleva fare davvero — «il dito era sopra il
   * foglio o sul fondo?».
   */
  const dentroIlPannello = (e: { clientX: number; clientY: number }): boolean => {
    if (pannello.current === null) return false;
    const r = pannello.current.getBoundingClientRect();
    return (
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    );
  };

  /* ---------------------------------------------------------------------- */
  /* Il trascinamento                                                        */
  /* ---------------------------------------------------------------------- */

  // Una coordinata sola: quale delle due dipende da dove se ne va il pannello.
  const punto = useCallback(
    (e: React.PointerEvent | PointerEvent): number => (verso === 'basso' ? e.clientY : e.clientX),
    [verso],
  );

  const prendi = useCallback(
    (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      gesto.current = { da: punto(e), quando: e.timeStamp };
      setTrascinando(true);
    },
    [punto],
  );

  useEffect(() => {
    if (!trascinando) return;

    const muovi = (e: PointerEvent) => {
      const g = gesto.current;
      if (g === null) return;
      // Solo in avanti: tirare il foglio verso l'alto non lo ingrandisce, e
      // lasciarlo scorrere in su darebbe l'idea che si possa.
      setScostamento(Math.max(0, punto(e) - g.da));
    };

    const molla = (e: PointerEvent) => {
      const g = gesto.current;
      gesto.current = null;
      setTrascinando(false);
      if (g === null || pannello.current === null) return;

      const percorso = Math.max(0, punto(e) - g.da);
      const misura =
        verso === 'basso'
          ? pannello.current.getBoundingClientRect().height
          : pannello.current.getBoundingClientRect().width;
      const durata = Math.max(1, e.timeStamp - g.quando);
      const velocita = (percorso / durata) * 1000;

      // Lo scostamento torna a zero in ogni caso, anche quando si chiude: il
      // pannello sparisce subito, e riaprendolo deve trovarsi al suo posto
      // invece che gia' meta' fuori dallo schermo.
      setScostamento(0);
      if (percorso > misura * SOGLIA || velocita > STRAPPO) onChiudi();
    };

    window.addEventListener('pointermove', muovi);
    window.addEventListener('pointerup', molla);
    window.addEventListener('pointercancel', molla);
    return () => {
      window.removeEventListener('pointermove', muovi);
      window.removeEventListener('pointerup', molla);
      window.removeEventListener('pointercancel', molla);
    };
  }, [trascinando, verso, punto, onChiudi]);

  const trasformazione = trasformaPannello({ verso, dentro, scostamento });

  return (
    <dialog
      ref={dialogo}
      /**
       * Solo se a chiudersi e' **questo** dialogo.
       *
       * `close` non risale nel DOM, ma React lo consegna lungo il proprio
       * albero: con il selettore di categoria dentro il foglio «Correggi», un
       * Esc sul pannello interno arrivava anche a quello esterno e si
       * chiudevano tutti e due. Misurato — due dialoghi aperti diventavano
       * zero con un tasto solo.
       */
      onClose={(e) => {
        if (e.target === dialogo.current) onChiudi();
      }}
      onPointerDown={(e) => {
        partitoFuori.current = !dentroIlPannello(e);
      }}
      onClick={(e) => {
        const fuori = partitoFuori.current && !dentroIlPannello(e);
        // Si azzera **sempre**, anche quando non si chiude. Restando vero,
        // un tocco cominciato sul fondo e finito dentro lascerebbe la
        // trappola armata per il clic successivo — che magari e' quello su
        // «Salva».
        partitoFuori.current = false;
        if (fuori) onChiudi();
      }}
      aria-label={etichetta}
      // Il velo sfuma insieme al pannello: comparire di scatto su una schermata
      // di numeri e' la cosa che si nota di piu' e che si spiega di meno.
      // La regola sta in `globals.css`, agganciata a questo attributo.
      data-dentro={dentro ? '' : undefined}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-transparent p-0
                 backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
    >
      <div
        className={`flex h-full ${verso === 'basso' ? 'items-end justify-center' : 'justify-end'}`}
      >
        <div
          ref={pannello}
          style={{
            transform: trasformazione,
            // Durante il gesto il pannello segue il dito senza ritardo; al
            // rilascio la molla lo riporta a posto, e all'apertura sale.
            transition: trascinando
              ? 'none'
              : `transform ${USCITA_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
            ...(verso === 'basso'
              ? {
                  // `--altezza-utile` la scrive `seguiTastiera` dal
                  // `visualViewport`: su iOS gli elementi fissi non si spostano
                  // quando salgono i tasti, e `dvh` non se ne accorge. Senza,
                  // il piede del foglio finisce sotto la tastiera.
                  maxHeight: 'calc(var(--altezza-utile, 100dvh) * 0.85)',
                  display: 'flex',
                  flexDirection: 'column',
                }
              : {}),
          }}
          className={
            verso === 'basso'
              ? `w-full max-w-md rounded-t-[26px] bg-s1
                 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_40px_rgb(0_0_0/0.28)]`
              : `flex w-[80%] max-w-xs flex-col bg-s1
                 pt-[max(1rem,env(safe-area-inset-top))]
                 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[-8px_0_40px_rgb(0_0_0/0.3)]`
          }
        >
          {/* La presa: `touch-action: none` o il browser interpreta il
              trascinamento come uno scorrimento e il gesto non arriva mai qui. */}
          <div
            onPointerDown={prendi}
            style={{ touchAction: 'none' }}
            className="shrink-0 cursor-grab active:cursor-grabbing"
          >
            {testata}
          </div>
          {children}
        </div>
      </div>
    </dialog>
  );
}

/**
 * Il foglio dal basso.
 *
 * Una finestra al centro dello schermo mette i suoi controlli dove il pollice
 * non arriva; un foglio che sale dal fondo li ha dove la mano gia' e'. La
 * maniglia in cima non e' decorazione: e' la presa, e trascinandola il foglio
 * se ne va.
 */
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
    <Dialogo
      aperto={aperto}
      etichetta={titolo}
      verso="basso"
      onChiudi={onChiudi}
      /* Si trascina dalla testata intera e non dalla sola maniglia: cinque
         millimetri di bersaglio sono una promessa che il pollice non mantiene.
         Il contenuto sotto resta libero di scorrere. */
      testata={
        <>
          <div aria-hidden="true" className="flex justify-center pt-2.5 pb-1">
            <span className="block h-1 w-9 rounded-full bg-(--testo-3)" />
          </div>

          <div className="flex items-start gap-3 px-5 pt-1 pb-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sez font-semibold tracking-[-0.02em]">{titolo}</h2>
              {nota !== undefined && <p className="mt-0.5 text-min text-testo-2">{nota}</p>}
            </div>
            <button
              type="button"
              onClick={onChiudi}
              className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-testo-2"
            >
              <span className="sr-only">Chiudi</span>
              <span aria-hidden="true" className="text-sez leading-none">
                ✕
              </span>
            </button>
          </div>
        </>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">{children}</div>
    </Dialogo>
  );
}
