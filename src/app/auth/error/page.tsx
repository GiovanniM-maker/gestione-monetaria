import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Accesso non riuscito — Gestione monetaria' };

const MESSAGES: Record<string, string> = {
  not_allowed: 'Questo indirizzo non e’ autorizzato ad accedere all’applicazione.',
  scambio_fallito:
    'Il link non e’ stato accettato. Succede se lo apri da un browser diverso da quello da cui hai richiesto l’accesso.',
  link_non_valido: 'Il link e’ scaduto o e’ gia’ stato usato.',
  otp_expired: 'Il link e’ scaduto. Richiedine uno nuovo.',
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message =
    (reason !== undefined ? MESSAGES[reason] : undefined) ?? 'Accesso non riuscito. Riprova.';

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="mb-2 text-xl font-semibold tracking-tight">Accesso non riuscito</h1>
      <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">{message}</p>
      <Link href="/login" className="text-sm underline underline-offset-4">
        Torna al login
      </Link>
    </div>
  );
}
