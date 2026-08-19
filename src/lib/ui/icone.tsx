/**
 * Le icone: un insieme chiuso, copiato nel repository.
 *
 * ---------------------------------------------------------------------------
 * Perche' non una libreria
 * ---------------------------------------------------------------------------
 * Una libreria di icone porta migliaia di disegni per usarne venti, e lo stack
 * vieta le dipendenze non strettamente necessarie. Venti `<path>` sono pochi
 * chilobyte e li vediamo tutti. I tracciati vengono da **Lucide** (licenza
 * ISC), scelti uno per uno e a volte semplificati: un insieme disegnato
 * insieme e' l'unica garanzia che i pesi non stonino fra loro — trenta glifi
 * generati uno per uno non condividerebbero mai la stessa griglia, ed e'
 * precisamente cio' che fa sembrare fatta in casa un'interfaccia.
 *
 * ---------------------------------------------------------------------------
 * Le regole del tratto
 * ---------------------------------------------------------------------------
 * Griglia 24, tratto 1,75, terminali arrotondati, `currentColor`: l'icona
 * prende il colore del testo accanto e non ne possiede uno suo. Se un giorno
 * un'icona deve essere di un colore, quel colore lo mette chi la usa — il
 * colore e' un dato, e queste sono forma.
 *
 * `aria-hidden` di default: quasi ovunque l'icona sta accanto alla parola che
 * la spiega, e un lettore di schermo non deve sentirla due volte. Dove
 * l'icona e' sola, chi la usa passa `etichetta`.
 */

export type NomeIcona = keyof typeof TRACCIATI;

/** I tracciati, da Lucide (ISC), sulla griglia 24. */
const TRACCIATI = {
  /* le quattro schede */
  casa: 'M4 11l8-7 8 7v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z',
  spunta: 'm5 12.5 4.5 4.5L19 7.5',
  strati: 'm12 3 9 5-9 5-9-5 9-5zm-6.5 9.6-2.5 1.4 9 5 9-5-2.5-1.4',
  scintilla:
    'M12 3c.8 3.9 2 5.6 6.5 6.5-4.5 1.4-5.7 3-6.5 7.5-.8-4.5-2-6.1-6.5-7.5C10 8.6 11.2 6.9 12 3z',
  /* i gesti */
  chevron: 'm9 6 6 6-6 6',
  piu: 'M12 5v14M5 12h14',
  chiudi: 'M6 6l12 12M18 6 6 18',
  cerca: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-3.5-3.5',
  filtro: 'M4 6h16M7 12h10M10 18h4',
  matita: 'M17 3.5 20.5 7 8 19.5 4 20l.5-4L17 3.5z',
  /* gli avvisi e lo stato */
  avviso: 'M12 4 2.5 20h19L12 4zm0 7v4m0 3v.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v.01M12 11v6',
  ripeti: 'M3 12a9 9 0 0 1 15.5-6L21 8.5M21 4v4.5h-4.5M21 12a9 9 0 0 1-15.5 6L3 15.5M3 20v-4.5h4.5',
  calendario:
    'M5 6h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 6zm-1.5 5h17M8 3.5V8M16 3.5V8',
  /* le forme delle classi, per quando l'icona di vetro non c'e' */
  cuore:
    'M12 20s-7-4.3-9-8.5C1.6 8 3.6 5 6.8 5c2 0 3.5 1.2 5.2 3 1.7-1.8 3.2-3 5.2-3 3.2 0 5.2 3 3.8 6.5-2 4.2-9 8.5-9 8.5z',
  valigetta:
    'M3 8h18a0 0 0 0 1 0 0v10a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18V8zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2',
  stella: 'M12 3.5 14.7 9l6 .8-4.4 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.3 9.8l6-.8z',
  crescita: 'M4 17 10 11l4 4 6-7M15 8h5v5',
  punti: 'M6 12h.01M12 12h.01M18 12h.01',
} as const;

export function Icona({
  nome,
  misura = 20,
  spessore = 1.75,
  etichetta,
  className,
}: {
  nome: NomeIcona;
  /** Lato in pixel. La barra usa 21, le righe 18. */
  misura?: number;
  spessore?: number;
  /** Solo per le icone che stanno da sole, senza una parola accanto. */
  etichetta?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={misura}
      height={misura}
      fill="none"
      stroke="currentColor"
      strokeWidth={spessore}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={etichetta === undefined ? true : undefined}
      aria-label={etichetta}
      role={etichetta === undefined ? undefined : 'img'}
      className={className}
    >
      <path d={TRACCIATI[nome]} />
    </svg>
  );
}
