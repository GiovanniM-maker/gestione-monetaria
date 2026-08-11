'use client';

/**
 * Confine d'errore della pagina di debug.
 *
 * In produzione React oscura il messaggio degli errori sollevati lato server e
 * lascia solo un `digest`: e' una misura di sicurezza corretta, perche' un
 * messaggio puo' contenere dettagli interni. La conseguenza pratica e' che il
 * testo dell'errore si legge solo nei Runtime Logs di Vercel, e il digest e'
 * la chiave per ritrovarlo in mezzo agli altri.
 *
 * Senza questo file la pagina verrebbe sostituita da "A server error occurred",
 * che non dice nemmeno quale sia il digest da cercare.
 */
export default function DebugEbError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Debug Enable Banking</h1>

      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        <p className="font-medium">La pagina ha sollevato un errore non gestito.</p>
        <p className="mt-2 break-words">{error.message}</p>
        {error.digest !== undefined && (
          <p className="mt-2">
            Digest: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Il testo completo sta nei <strong>Runtime Logs</strong> di Vercel: apri il deployment, vai
        su Logs e cerca il digest qui sopra.
      </p>

      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
      >
        Riprova
      </button>
    </div>
  );
}
