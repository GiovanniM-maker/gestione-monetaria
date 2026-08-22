'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type LoginState } from './actions';
import { BOTTONE, CAMPO_PIENO } from '@/lib/ui/controlli';

const initialState: LoginState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${BOTTONE} w-full`}>
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
          className={CAMPO_PIENO}
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
          className={CAMPO_PIENO}
        />
      </div>

      <SubmitButton />

      {state.status === 'error' && <p className="text-sm text-allarme">{state.message}</p>}
    </form>
  );
}
