import { signOut } from '@/app/login/actions';

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        Esci
      </button>
    </form>
  );
}
