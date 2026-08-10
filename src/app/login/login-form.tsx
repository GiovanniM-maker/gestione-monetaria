'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestMagicLink, type LoginState } from './actions';

const initialState: LoginState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
    >
      {pending ? 'Invio in corso…' : 'Inviami il link'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(requestMagicLink, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <SubmitButton />

      {state.status === 'sent' && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Se l&apos;indirizzo e&apos; autorizzato, riceverai un link di accesso. Il link vale una
          volta sola e scade dopo pochi minuti.
        </p>
      )}
      {state.status === 'error' && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
      )}
    </form>
  );
}
