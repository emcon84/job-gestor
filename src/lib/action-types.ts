/**
 * Shared result types used by server actions and the client components that
 * invoke them. Kept OUTSIDE the "use server" module because Next.js forbids
 * `"use server"` files from exporting anything other than async server actions.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export interface UploadUrlResult extends ActionResult {
  uploadUrl?: string;
  objectKey?: string;
  publicUrl?: string;
  maxSizeBytes?: number;
}

/** State shape used by React `useActionState` for the owner unlock form. */
export interface UnlockState {
  error?: string;
}
