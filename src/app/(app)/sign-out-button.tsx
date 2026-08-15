import { signOut } from '@/app/login/actions';

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-controllo bg-s3 px-3 text-[13px] font-medium sm:min-h-9"
      >
        Esci
      </button>
    </form>
  );
}
