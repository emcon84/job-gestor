import { computePacks } from "@/lib/packs";
import { buildReportDefinition } from "@/lib/report";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Downloads a per-client PDF report of its tasks and pack (abono) summary.
 *
 * Like the client portal (`/c/{slug}`) this route is intentionally public: the
 * portal is a shared-link page, so anyone with the client id can already read
 * the exact same data in the browser. The report just exports it as a PDF.
 */
export async function GET(request: Request): Promise<Response> {
  const clientId = new URL(request.url).searchParams.get("clientId");
  if (!clientId) {
    return Response.json({ error: "Falta clientId." }, { status: 400 });
  }

  const repo = await getRepository();
  const client = await repo.getClient(clientId);
  if (!client) {
    return Response.json({ error: "Cliente no encontrado." }, { status: 404 });
  }

  const tasks = await repo.listTasksByClient(client.id);
  const summary = computePacks(tasks, client.packThresholdCents);
  const doc = buildReportDefinition({ client, tasks, summary });

  // Server-only dynamic import: pdfmake is a webpack UMD bundle, so it must
  // never be statically imported (it would bloat the client bundle). The
  // Roboto virtual file system is registered via `addVirtualFileSystem`; the
  // browser-UMD `pdfMake.vfs` global does not exist in a Node context.
  const pdfMake = (await import("pdfmake/build/pdfmake")).default;
  const vfs = (await import("pdfmake/build/vfs_fonts")).default;
  pdfMake.addVirtualFileSystem(vfs);
  pdfMake.setUrlAccessPolicy(() => false);
  // The browser-UMD build types declare `setLocalAccessPolicy`, but the runtime
  // build lacks it; deny local file access via the property `createPdf` reads.
  (pdfMake as { localAccessPolicy?: (path: string) => boolean }).localAccessPolicy =
    () => false;

  const buffer = await pdfMake.createPdf(doc).getBuffer();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="reporte-${client.slug}.pdf"`,
    },
  });
}