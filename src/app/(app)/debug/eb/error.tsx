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
      <h1 className="text-titolo font-bold tracking-[-0.03em]">Debug Enable Banking</h1>

      <div className="nota nota-errore text-sec">
        <p className="font-medium">La pagina ha sollevato un errore non gestito.</p>
        <p className="mt-2 break-words">{error.message}</p>
        {error.digest !== undefined && (
          <p className="mt-2">
            Digest: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>

      <p className="text-sec text-testo-2">
        Il testo completo sta nei <strong>Runtime Logs</strong> di Vercel: apri il deployment, vai
        su Logs e cerca il digest qui sopra.
      </p>

      <button type="button" onClick={reset} className="rounded-controllo bg-s3 px-3 py-1 text-sec">
        Riprova
      </button>
    </div>
  );
}
