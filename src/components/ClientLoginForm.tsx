"use client";

import { useActionState } from "react";
import { loginClient } from "@/app/actions";
import type { ClientLoginState } from "@/lib/action-types";

const initialState: ClientLoginState = {};

export default function ClientLoginForm() {
  const [state, action, pending] = useActionState<ClientLoginState, FormData>(
    loginClient,
    initialState,
  );

  return (
    <form action={action} className="space-y-3">
      <input
        name="username"
        type="text"
        required
        autoComplete="username"
        placeholder="Usuario"
        className="w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-primary"
      />
      <input
        name="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="Contraseña"
        className="w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-primary"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full min-h-11 rounded-lg bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Ingresando..." : "Ingresar"}
      </button>
      {state.error && (
        <p role="alert" className="rounded-md bg-error/15 px-3 py-2 text-sm text-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
