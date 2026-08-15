import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { Menu } from './menu';
import { Barra } from './barra';

/**
 * Layout delle pagine autenticate. La guardia sta qui, non nelle singole
 * pagine: una pagina nuova dentro `(app)` nasce protetta senza doversene
 * ricordare.
 *
 * ---------------------------------------------------------------------------
 * Due navigazioni che non si sovrappongono
 * ---------------------------------------------------------------------------
 * In basso le **quattro schede**, dove arriva il pollice: dove si va. In alto
 * il menu, ridotto a cio' che e' **manutenzione e non uso**: dove si sistema.
 * Non e' un doppione — nessuna voce compare in tutte e due — ed e' il motivo per
 * cui non possono divergere.
 *
 * I margini `env(safe-area-inset-*)` non sono rifinitura: aggiunta alla
 * schermata iniziale l'applicazione si apre a schermo pieno, e senza di loro
 * l'intestazione finisce sotto l'orologio.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div
      className="mx-auto flex min-h-dvh max-w-3xl flex-col
                 pt-[env(safe-area-inset-top)]
                 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]
                 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]"
    >
      {/* L'intestazione e' ridotta a una riga sottile: il nome
          dell'applicazione e il bottone per uscire occupavano il posto piu'
          visibile della schermata per due cose che non si guardano mai. Il
          titolo di ogni pagina sta sotto, dove va letto. */}
      <header className="flex items-center gap-x-2 py-1">
        <Link
          href="/"
          className="inline-flex min-h-11 flex-1 items-center text-[13px] font-medium text-testo-3"
        >
          Gestione monetaria
        </Link>
        <Menu email={user.email ?? null} />
      </header>

      {/* Lo spazio in fondo e' la barra piu' un respiro: senza, l'ultima riga
          di ogni schermata finisce sotto le quattro schede. */}
      <main className="flex-1 pt-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">{children}</main>

      <Barra />
    </div>
  );
}
