import { signOut } from '@/app/login/actions';

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-3 text-sm hover:bg-neutral-100 sm:min-h-8 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        Esci
      </button>
    </form>
  );
}
