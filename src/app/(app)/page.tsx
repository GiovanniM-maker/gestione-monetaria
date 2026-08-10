/**
 * Pagina autenticata vuota: il guscio della Fase 0.
 *
 * Qui andra' la metrica principale dell'app (costo ricorrente mensile per
 * classe di discrezionalita'), ma non prima della Fase 6.
 */
export default function HomePage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Sei autenticato.</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Fase 0 completata: fondamenta, autenticazione e protezione delle route. Nessun dato bancario
        &egrave; ancora collegato.
      </p>
    </div>
  );
}
