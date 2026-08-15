import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Informativa privacy — Gestione monetaria',
  robots: { index: false, follow: false },
};

/**
 * Pagina pubblica, richiesta da Enable Banking per registrare un'applicazione
 * in ambiente production. Descrive il trattamento reale: e' un documento
 * fattuale, non un modello generico, e va tenuto allineato se il trattamento
 * cambia nelle fasi successive.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Informativa privacy</h1>
      <p className="mb-8 text-sm text-testo-2">Ultimo aggiornamento: agosto 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-testo-2">
        <section>
          <h2 className="mb-2 text-base font-semibold text-testo">Natura del servizio</h2>
          <p>
            &laquo;Gestione monetaria&raquo; e&rsquo; un&rsquo;applicazione strettamente personale,
            usata da una sola persona, che e&rsquo; anche l&rsquo;unico titolare del trattamento.
            Non e&rsquo; aperta a registrazioni: l&rsquo;accesso e&rsquo; limitato a un solo
            indirizzo email tramite allowlist. Non tratta dati di terzi e non ha altri utenti.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-testo">Dati trattati</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Credenziali di accesso all&rsquo;applicazione: indirizzo email e password.</li>
            <li>
              Dati dei conti di pagamento dell&rsquo;unico utente, letti tramite Enable Banking:
              identificativi e IBAN dei conti, saldi, movimenti con data, importo, valuta,
              descrizione e controparte.
            </li>
            <li>
              Dati derivati calcolati dall&rsquo;applicazione: categorie, ricorrenze, aggregati di
              spesa.
            </li>
          </ul>
          <p className="mt-2">
            L&rsquo;accesso e&rsquo; di sola lettura. L&rsquo;applicazione non dispone ordini di
            pagamento e non puo&rsquo; movimentare denaro.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-testo">
            Finalita&rsquo; e base giuridica
          </h2>
          <p>
            I dati sono trattati per la sola analisi delle spese personali dell&rsquo;utente. La
            base giuridica e&rsquo; il consenso esplicito dell&rsquo;interessato, che coincide con
            l&rsquo;unico utente, prestato tramite l&rsquo;autorizzazione presso la propria banca e
            revocabile in qualsiasi momento. Non si effettua profilazione per finalita&rsquo; di
            marketing e non vi e&rsquo; alcun processo decisionale automatizzato con effetti
            giuridici.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-testo">Destinatari</h2>
          <p>I dati non sono ceduti o venduti a terzi. Sono coinvolti i seguenti fornitori:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Enable Banking</strong> (Finlandia) — prestatore di servizi di informazione
              sui conti autorizzato, fornisce l&rsquo;accesso ai dati bancari.
            </li>
            <li>
              <strong>Supabase</strong> — banca dati, ospitata nell&rsquo;Unione Europea
              (Francoforte).
            </li>
            <li>
              <strong>Vercel</strong> — hosting dell&rsquo;applicazione.
            </li>
            <li>
              <strong>Anthropic</strong> — modello linguistico usato per classificare gli esercenti
              e redigere i riepiloghi. Riceve esclusivamente dati minimizzati: nome
              dell&rsquo;esercente normalizzato, importo, data, categoria e valori aggregati. Non
              riceve IBAN, non riceve descrizioni integrali dei movimenti, non riceve le controparti
              di bonifici tra privati.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-testo">Conservazione</h2>
          <p>
            I dati restano memorizzati finche&rsquo; l&rsquo;utente mantiene attiva
            l&rsquo;applicazione. La revoca del consenso presso la banca interrompe
            l&rsquo;acquisizione di nuovi dati. L&rsquo;utente puo&rsquo; cancellare in qualunque
            momento l&rsquo;intera banca dati, di cui e&rsquo; amministratore.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-testo">
            Diritti dell&rsquo;interessato
          </h2>
          <p>
            L&rsquo;interessato ha diritto di accesso, rettifica, cancellazione, limitazione,
            portabilita&rsquo; e opposizione ai sensi degli articoli 15-22 del Regolamento (UE)
            2016/679, oltre al diritto di reclamo al Garante per la protezione dei dati personali.
            Trattandosi di un&rsquo;applicazione a uso esclusivamente personale, tali diritti sono
            esercitati direttamente dall&rsquo;utente, che ha accesso amministrativo completo ai
            propri dati.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-testo">Contatto</h2>
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
