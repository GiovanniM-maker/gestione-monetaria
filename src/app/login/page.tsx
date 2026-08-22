import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Accedi — Gestione monetaria' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametri = await searchParams;
  const grezzo = parametri['ritorno'];
  const ritorno = Array.isArray(grezzo) ? grezzo[0] : grezzo;

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      {/* L'unica schermata senza numeri con cui competere: l'illustrazione
          puo' essere grande. `alt` vuoto, e' decorazione dichiarata. */}
      <img
        src="/illustrazioni/accesso.webp"
        alt=""
        width={96}
        height={96}
        className="mb-4 drop-shadow-[0_8px_22px_rgb(90_80_224/0.3)]"
      />
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Gestione monetaria</h1>
      {/* Diceva «inserisci la tua email per ricevere un link di accesso»: era
          vero fino alla Fase 0, quando il magic link e' stato sostituito dalla
          password perche' il tetto SMTP di Supabase chiudeva fuori dall'unica
          porta d'ingresso. Il testo era rimasto indietro di dieci fasi. */}
      <p className="mb-6 text-sm text-testo-2">Accesso riservato a un solo indirizzo.</p>
      <LoginForm ritorno={ritorno} />
    </div>
  );
}
