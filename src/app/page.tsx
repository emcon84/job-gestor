import Link from "next/link";
import RefreshOnMount from "@/components/RefreshOnMount";
import ClientLoginForm from "@/components/ClientLoginForm";

export const dynamic = "force-dynamic";

/**
 * Public landing. Deliberately shows NO client data: each client uses their
 * own private portal link (/c/[slug]). The client index lives behind the
 * passphrase-protected /owner. Clients with credentials sign in here; clients
 * without credentials keep using their shared portal link directly.
 */
export default async function HomePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-28">
      <RefreshOnMount />
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-primary">
          Tareas de Mantenimiento y Desarrollo
        </h1>
        <p className="text-sm text-secondary">
          Plataforma de seguimiento de tareas de mantenimiento.
        </p>
      </header>

      <div className="rounded-2xl border border-card-border bg-card p-6 space-y-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-primary">Ingresar</h2>
          <p className="text-sm text-secondary">
            Accedé con tu usuario y contraseña para ver el estado de tus tareas.
          </p>
        </div>
        <ClientLoginForm />
      </div>

      <footer className="mt-10 border-t border-card-border pt-4 text-center">
        <Link
          href="/owner"
          className="text-xs text-muted transition-colors hover:text-primary"
        >
          Acceso del propietario
        </Link>
      </footer>
    </main>
  );
}