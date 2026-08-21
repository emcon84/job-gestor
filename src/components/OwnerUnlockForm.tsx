"use client";

import { useActionState } from "react";
import { unlockOwner } from "@/app/actions";
import type { UnlockState } from "@/lib/action-types";

const initialState: UnlockState = {};

export default function OwnerUnlockForm() {
  const [state, action, pending] = useActionState<UnlockState, FormData>(
    unlockOwner,
    initialState,
  );

  return (
    <form action={action} className="space-y-3">
      <input
        name="passphrase"
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
        {pending ? "Verificando..." : "Ingresar"}
      </button>
      {state.error && (
        <p role="alert" className="rounded-md bg-error/15 px-3 py-2 text-sm text-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
