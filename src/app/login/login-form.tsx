'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type LoginState } from './actions';

const initialState: LoginState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-accento px-4 py-2 text-sm font-medium text-accento-testo disabled:opacity-50"
    >
      {pending ? 'Accesso in corso…' : 'Accedi'}
    </button>
  );
}

export function LoginForm({ ritorno }: { ritorno?: string | undefined }) {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {/* Dove tornare dopo l'accesso. Lo mette `NotaErrore` quando la sessione
          scade a meta' di un gesto: rientrare e ritrovarsi sul cruscotto invece
          che sulla schermata da cui si veniva e' la differenza fra «rientra» e
          «ricomincia». Il valore viene validato lato server. */}
      {ritorno !== undefined && <input type="hidden" name="ritorno" value={ritorno} />}
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="w-full rounded-controllo bg-s3 px-3.5 py-2.5 text-[15px]"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-controllo bg-s3 px-3.5 py-2.5 text-[15px]"
        />
      </div>

      <SubmitButton />

      {state.status === 'error' && <p className="text-sm text-allarme">{state.message}</p>}
    </form>
  );
}
