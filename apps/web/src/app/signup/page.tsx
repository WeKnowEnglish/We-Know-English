import { Suspense } from "react";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        </main>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
