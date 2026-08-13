import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { SignOutButton } from './sign-out-button';

/**
 * Layout delle pagine autenticate. La guardia sta qui, non nelle singole
 * pagine: una pagina nuova dentro `(app)` nasce protetta senza doversene
 * ricordare.
 *
 * L'intestazione e' su due righe sul telefono e una sola da `sm` in su. Il
 * pezzo che sparisce per primo e' l'indirizzo email: in un'applicazione a
 * utente unico non dice niente che l'utente non sappia gia', e su 360 pixel
 * ruberebbe la riga alla navigazione, che invece serve.
 *
 * I margini `env(safe-area-inset-*)` non sono rifinitura: aggiunta alla
 * schermata iniziale l'applicazione si apre a schermo pieno, e senza di loro
 * l'intestazione finisce sotto l'orologio e l'ultima riga sotto la barra dei
 * gesti.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div
      className="mx-auto flex min-h-dvh max-w-5xl flex-col
                 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
                 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]
                 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-neutral-200 py-3 dark:border-neutral-800 sm:py-4">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-semibold tracking-tight sm:min-h-0"
        >
          Gestione monetaria
        </Link>

        {/* `order-last w-full` sul telefono: la navigazione scende su una riga
            propria invece di stringersi accanto al titolo. Da `sm` in su torna
            al suo posto, fra il titolo e l'utente. */}
        <nav className="order-last -ml-2 flex w-full gap-1 overflow-x-auto text-sm sm:order-none sm:ml-0 sm:w-auto sm:gap-4">
          <Voce href="/">Cruscotto</Voce>
          <Voce href="/avvisi">Avvisi</Voce>
          <Voce href="/report">Report</Voce>
          <Voce href="/da-confermare">Da confermare</Voce>
          <Voce href="/movimenti">Movimenti</Voce>
          <Voce href="/abbonamenti">Ricorrente</Voce>
          <Voce href="/revisione">Revisione</Voce>
        </nav>

        <div className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
          <span className="hidden sm:inline">{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <main className="flex-1 py-6 sm:py-10">{children}</main>
    </div>
  );
}

function Voce({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-neutral-600 hover:underline dark:text-neutral-400 sm:min-h-0 sm:px-0"
    >
      {children}
    </Link>
  );
}
