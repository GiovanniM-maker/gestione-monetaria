import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { SignOutButton } from './sign-out-button';
import { Menu } from './menu';

/**
 * Layout delle pagine autenticate. La guardia sta qui, non nelle singole
 * pagine: una pagina nuova dentro `(app)` nasce protetta senza doversene
 * ricordare.
 *
 * L'intestazione tiene tre cose sulla stessa riga: il menu, il nome, l'uscita.
 * Le pagine stanno **dentro il menu** e non su una barra che scorre di lato —
 * con otto voci su 360 pixel se ne vedevano tre, e le altre esistevano solo per
 * chi sapeva che c'erano. L'indirizzo email e' sceso li' dentro: in
 * un'applicazione a utente unico non dice niente che l'utente non sappia gia'.
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
      <header className="flex flex-wrap items-center gap-x-2 border-b border-neutral-200 py-2 dark:border-neutral-800">
        {/* Il menu apre un pannello che occupa la riga sotto: `order-last
            w-full` sulla nav, dentro lo stesso contenitore flex. */}
        <Menu email={user.email ?? null} />

        <Link
          href="/"
          className="inline-flex min-h-11 flex-1 items-center font-semibold tracking-tight"
        >
          Gestione monetaria
        </Link>

        <SignOutButton />
      </header>

      <main className="flex-1 py-6 sm:py-10">{children}</main>
    </div>
  );
}
