import { Link, Outlet } from "react-router";
import { BrandWordmark } from "../components/brand";

/** Sign-in and sign-up: the brand and one centred form, nothing else. */
export default function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <Link
        to="/"
        className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <BrandWordmark height={28} />
      </Link>
      <main className="w-full max-w-sm">
        <Outlet />
      </main>
    </div>
  );
}
