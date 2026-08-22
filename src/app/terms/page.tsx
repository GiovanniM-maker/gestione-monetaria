import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Termini di servizio — Gestione monetaria',
  robots: { index: false, follow: false },
};

/**
 * Pagina pubblica, richiesta da Enable Banking per registrare un'applicazione
 * in ambiente production.
 */
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-titolo font-semibold tracking-tight">Termini di servizio</h1>
      <p className="mb-8 text-sec text-testo-2">Ultimo aggiornamento: agosto 2026</p>

      <div className="space-y-6 text-sec leading-relaxed text-testo-2">
        <section>
          <h2 className="mb-2 text-corpo font-semibold text-testo">1. Oggetto</h2>
          <p>
            &laquo;Gestione monetaria&raquo; e&rsquo; un&rsquo;applicazione privata che aggrega e
            analizza i movimenti dei conti di pagamento del proprio unico utente. Non e&rsquo; un
            servizio offerto al pubblico: non accetta registrazioni e l&rsquo;accesso e&rsquo;
            limitato a un solo account tramite allowlist.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-corpo font-semibold text-testo">2. Accesso ai dati bancari</h2>
          <p>
            L&rsquo;accesso avviene tramite Enable Banking, prestatore di servizi di informazione
            sui conti autorizzato, previo consenso esplicito prestato dall&rsquo;utente presso il
            proprio istituto. L&rsquo;accesso e&rsquo; di <strong>sola lettura</strong>:
            l&rsquo;applicazione non puo&rsquo; disporre pagamenti ne&rsquo; movimentare denaro. Il
            consenso ha durata limitata e va rinnovato periodicamente; puo&rsquo; essere revocato in
            qualsiasi momento dall&rsquo;utente presso la propria banca.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-corpo font-semibold text-testo">3. Natura delle elaborazioni</h2>
          <p>
            Categorie, ricorrenze, riepiloghi e avvisi prodotti dall&rsquo;applicazione hanno
            finalita&rsquo; puramente informativa. Non costituiscono consulenza finanziaria, fiscale
            o di investimento, e non sostituiscono gli estratti conto ufficiali della banca, che
            restano l&rsquo;unico documento contabile valido.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-corpo font-semibold text-testo">4. Assenza di garanzie</h2>
          <p>
            Il servizio e&rsquo; fornito &laquo;cosi&rsquo; com&rsquo;e&rsquo;&raquo;, senza
            garanzia di continuita&rsquo;, completezza o accuratezza dei dati. La
            disponibilita&rsquo; dipende da servizi di terzi, fra cui gli istituti bancari e i
            fornitori tecnici indicati nell&rsquo;informativa privacy.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-corpo font-semibold text-testo">
            5. Trattamento dei dati personali
          </h2>
          <p>
            Le modalita&rsquo; di trattamento sono descritte nell&rsquo;
            <a href="/privacy" className="underline underline-offset-4">
              informativa privacy
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-corpo font-semibold text-testo">6. Contatto</h2>
          <p>
            <a
              href="mailto:giovanni.mavilla.grz@gmail.com"
              className="underline underline-offset-4"
            >
              giovanni.mavilla.grz@gmail.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
