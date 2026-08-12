import { requireUser } from '@/lib/auth/session';
import { SignOutButton } from './sign-out-button';

/**
 * Layout delle pagine autenticate. La guardia sta qui, non nelle singole
 * pagine: una pagina nuova dentro `(app)` nasce protetta senza doversene
 * ricordare.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between border-b border-neutral-200 py-4 dark:border-neutral-800">
        <div className="flex items-baseline gap-5">
          <a href="/" className="font-semibold tracking-tight">
            Gestione monetaria
          </a>
          <nav className="flex gap-4 text-sm text-neutral-600 dark:text-neutral-400">
            <a href="/abbonamenti" className="hover:underline">
              Abbonamenti
            </a>
            <a href="/revisione" className="hover:underline">
              Revisione
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
          <span>{user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 py-10">{children}</main>
    </div>
  );
}
