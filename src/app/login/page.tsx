import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Accedi — Gestione monetaria' };

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Gestione monetaria</h1>
      <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
        Accesso riservato. Inserisci la tua email per ricevere un link di accesso.
      </p>
      <LoginForm />
    </div>
  );
}
