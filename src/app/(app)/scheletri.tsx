/**
 * Gli scheletri: la forma della schermata prima dei numeri.
 *
 * ---------------------------------------------------------------------------
 * A cosa servono davvero
 * ---------------------------------------------------------------------------
 * Non fanno arrivare i dati prima. Fanno arrivare **la pagina** prima: la
 * struttura si disegna subito e i blocchi si riempiono man mano, invece di
 * restare su una schermata bianca finche' l'ultima query non ha risposto.
 *
 * Il tempo totale non cambia di un millisecondo. Quello che cambia e' il tempo
 * prima di vedere qualcosa, ed e' quello che si percepisce come «lenta» — un
 * secondo di schermata bianca e' un secondo di dubbio che l'applicazione sia
 * rotta; un secondo di scheletro e' un secondo di attesa.
 *
 * ---------------------------------------------------------------------------
 * Hanno la forma di cio' che sostituiscono
 * ---------------------------------------------------------------------------
 * Un rettangolo generico dice solo «sto caricando». Uno scheletro della forma
 * giusta dice **cosa** sta caricando, e soprattutto non fa saltare il contenuto
 * quando arriva: se il segnaposto e' alto quanto la cosa vera, la pagina non si
 * riassesta sotto il dito.
 *
 * `animate-pulse` e basta: niente onde luminose che attraversano, che sono
 * decorazione e su uno schermo piccolo distraggono da cio' che nel frattempo e'
 * arrivato per davvero.
 */

function Barra({ className = '' }: { className?: string }) {
  return <span className={`block rounded bg-neutral-200 dark:bg-neutral-800 ${className}`} />;
}

/** Un blocco qualsiasi, quando non vale la pena imitarne la forma. */
export function ScheletroRiquadro({ righe = 3 }: { righe?: number }) {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      {Array.from({ length: righe }, (_, i) => (
        <Barra key={i} className={`h-4 ${i === righe - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

/** Il numerone, la barra delle classi e le quattro righe sotto. */
export function ScheletroTestata() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden="true">
      <Barra className="h-10 w-48 sm:h-12" />
      <Barra className="h-3 w-full rounded-full" />
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <Barra className="h-4 w-40" />
            <Barra className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** L'anello e il suo elenco. */
export function ScheletroCiambella() {
  return (
    <div
      className="flex animate-pulse flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6"
      aria-hidden="true"
    >
      <span className="size-40 shrink-0 rounded-full border-[16px] border-neutral-200 dark:border-neutral-800" />
      <div className="w-full flex-1 space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Barra className="size-2.5 shrink-0 rounded-full" />
            <Barra className="h-4 flex-1" />
            <Barra className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Un elenco di righe con un nome a sinistra e un importo a destra. */
export function ScheletroElenco({ righe = 6 }: { righe?: number }) {
  return (
    <ul className="animate-pulse space-y-3" aria-hidden="true">
      {Array.from({ length: righe }, (_, i) => (
        <li key={i} className="flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1 space-y-1">
            <Barra className="h-4 w-2/3" />
            <Barra className="h-3 w-1/3" />
          </span>
          <Barra className="h-4 w-20 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/** Due riquadri affiancati: abbonamenti e abitudini. */
export function ScheletroCoppia() {
  return (
    <div className="grid animate-pulse grid-cols-2 gap-2 sm:gap-3" aria-hidden="true">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="space-y-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <Barra className="h-3 w-24" />
          <Barra className="h-7 w-28" />
          <Barra className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * L'intestazione di una pagina qualsiasi, per `loading.tsx`.
 *
 * Quello che si vede fra un tocco e l'arrivo della schermata nuova. Senza,
 * Next tiene la pagina vecchia e non succede **niente** per tutto il tempo del
 * viaggio fino a Washington: il tocco sembra non aver funzionato, e si tocca di
 * nuovo.
 */
export function ScheletroPagina() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse space-y-2" aria-hidden="true">
        <Barra className="h-6 w-56" />
        <Barra className="h-4 w-72" />
      </div>
      <ScheletroElenco righe={8} />
      <span className="sr-only">Caricamento in corso</span>
    </div>
  );
}
