import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-[#e6dfd2] bg-[#fffcf7] p-8 shadow-sm">
        <p className="font-[var(--font-display)] text-sm font-bold tracking-wide text-[#1d4ed8]">
          REFRESH
        </p>
        <h1 className="mt-2 font-[var(--font-display)] text-3xl font-bold">Website intake</h1>
        <p className="mt-2 text-sm text-[#6a6573]">
          Privé intake-omgeving. Geen publieke inschrijving, geen link vanaf de website.
          Alleen uitgenodigde accounts komen erin.
        </p>
        <div className="mt-6">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
