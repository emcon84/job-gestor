/**
 * PDF report builder — pure, no pdfmake import.
 *
 * `buildReportDefinition` returns a plain pdfmake docDefinition object
 * (headers, abono summary, tasks table) that the route handler in
 * `src/app/api/report/route.ts` feeds to pdfmake. Keeping pdfmake out of this
 * module keeps it unit-testable without the heavy UMD bundle.
 */
import type { Client, Task } from "./domain";
import { STATUS_LABELS } from "./domain";
import { formatArs, formatDateEs } from "./format";
import {
  effectiveAmountCents,
  formatHours,
  formatLocalTime,
  totalWorkedMs,
  workedByDay,
} from "./hours";
import type { PackSummary } from "./packs";

export interface ReportHeaderCell {
  text: string;
  bold: boolean;
  fillColor: string;
}

export interface ReportTable {
  table: {
    headerRows: number;
    widths: (string | number)[];
    body: (string | ReportHeaderCell)[][];
  };
  layout: string;
}

export interface ReportText {
  text: string;
  [key: string]: unknown;
}

export type ReportContent = ReportText | ReportTable;

export interface ReportDefinition {
  pageSize: "A4";
  pageMargins: [number, number, number, number];
  content: ReportContent[];
  defaultStyle: {
    font: string;
    fontSize: number;
    color: string;
  };
}

const FONT = "Roboto";
const HEADER_FILL = "#f3f4f6";

/** Human label for a task's payment state, in Spanish. */
export function paymentLabel(
  state: Task["paymentState"],
): "Pagado" | "Pendiente" | "Sin pago" {
  if (state === "paid") {
    return "Pagado";
  }
  if (state === "pending") {
    return "Pendiente";
  }
  return "Sin pago";
}

export type ReportFilter = "all" | "unpaid";

/**
 * Same criterion as the abono debt in `computePacks`: has an amount and is not
 * paid. `amount` defaults to the stored amount; hourly clients pass the
 * effective (tracked-hours) amount.
 */
export function isUnpaid(task: Task, amount: number = task.amountArs): boolean {
  return (amount ?? 0) > 0 && task.paymentState !== "paid";
}

function tableHeaderCell(text: string): ReportHeaderCell {
  return { text, bold: true, fillColor: HEADER_FILL };
}

/** Formats a 'YYYY-MM-DD' day key as dd/mm/aaaa without any time-zone shift. */
function formatDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-");
  return `${d}/${m}/${y}`;
}

/** Per-task, per-day worked sessions (hourly clients only). */
function buildSessionSections(tasks: Task[], now: Date): ReportContent[] {
  const sections: ReportContent[] = [];
  for (const task of tasks) {
    const days = workedByDay(task, now);
    if (days.length === 0) {
      continue;
    }
    const rows: (string | ReportHeaderCell)[][] = [];
    for (const day of days) {
      for (const span of day.sessions) {
        const spanMs = (span.end ?? now).getTime() - span.start.getTime();
        const endLabel = span.end ? formatLocalTime(span.end) : "en curso";
        rows.push([
          formatDayKey(day.dayKey),
          `${formatLocalTime(span.start)} – ${endLabel}`,
          formatHours(spanMs),
        ]);
      }
    }
    sections.push(
      { text: task.title, fontSize: 10, bold: true, margin: [0, 10, 0, 4] },
      {
        layout: "lightHorizontalLines",
        table: {
          headerRows: 1,
          widths: ["auto", "*", "auto"],
          body: [
            [
              tableHeaderCell("Fecha"),
              tableHeaderCell("Horario"),
              tableHeaderCell("Horas"),
            ],
            ...rows,
          ],
        },
      },
    );
  }
  if (sections.length === 0) {
    return [];
  }
  return [
    { text: "Detalle de horas", fontSize: 12, bold: true, margin: [0, 18, 0, 0] },
    ...sections,
  ];
}

export function buildReportDefinition({
  client,
  tasks,
  summary,
  filter = "all",
  now = new Date(),
}: {
  client: Pick<Client, "name" | "slug" | "packThresholdCents"> & {
    hourlyRateCents?: number | null;
  };
  tasks: Task[];
  summary: PackSummary;
  filter?: ReportFilter;
  /** Clock used to count running sessions. Defaults to the current time. */
  now?: Date;
}): ReportDefinition {
  const hourlyRateCents = client.hourlyRateCents ?? null;
  const amountOf = (task: Task): number =>
    hourlyRateCents !== null
      ? effectiveAmountCents(task, { hourlyRateCents }, now)
      : (task.amountArs ?? 0);
  const unpaidOnly = filter === "unpaid";
  const listed = unpaidOnly
    ? tasks.filter((t) => isUnpaid(t, amountOf(t)))
    : tasks;
  const content: ReportContent[] = [
    {
      text: unpaidOnly
        ? `Reporte de tareas pendientes de pago — ${client.name}`
        : `Reporte de tareas — ${client.name}`,
      fontSize: 16,
      bold: true,
      margin: [0, 0, 0, 6],
    },
    {
      text: `Generado el ${formatDateEs(new Date())}`,
      fontSize: 9,
      color: "#555555",
      margin: [0, 0, 0, 4],
    },
    {
      text:
        hourlyRateCents !== null
          ? `Tarifa por hora: ${formatArs(hourlyRateCents)}`
          : `Abono mensual: ${formatArs(client.packThresholdCents)}`,
      fontSize: 10,
      margin: [0, 0, 0, 18],
    },
    {
      text: hourlyRateCents !== null ? "Resumen" : "Resumen del abono",
      fontSize: 12,
      bold: true,
      margin: [0, 0, 0, 6],
    },
    {
      text: `Total pendiente de pago: ${formatArs(summary.pendingPackCents)}`,
      fontSize: 10,
      margin: [0, 0, 2, 0],
    },
  ];
  if (hourlyRateCents === null) {
    content.push(
      {
        text: `Abono actual: ${summary.currentPack}`,
        fontSize: 10,
        margin: [0, 2, 0, 0],
      },
      {
        text: `Abonos cerrados: ${summary.closedPacks}`,
        fontSize: 10,
        margin: [0, 2, 0, 0],
      },
    );
  }

  content.push({
    text: "Tareas",
    fontSize: 12,
    bold: true,
    margin: [0, 18, 0, 6],
  });

  if (listed.length === 0) {
    content.push({
      text: unpaidOnly ? "Sin tareas pendientes de pago." : "Sin tareas.",
      fontSize: 10,
      italics: true,
      color: "#666666",
    });
  } else {
    const headerRow = [
      tableHeaderCell("Título"),
      tableHeaderCell("Área"),
      tableHeaderCell("Estado"),
      ...(hourlyRateCents !== null ? [tableHeaderCell("Horas")] : []),
      tableHeaderCell("Monto"),
      tableHeaderCell("Pago"),
      tableHeaderCell("Vencimiento"),
    ];
    const rows: (string | ReportHeaderCell)[][] = listed.map((task) => [
      task.title,
      task.area,
      STATUS_LABELS[task.status],
      ...(hourlyRateCents !== null ? [formatHours(totalWorkedMs(task, now))] : []),
      formatArs(amountOf(task)),
      paymentLabel(task.paymentState),
      task.paymentDueDate ? formatDateEs(task.paymentDueDate) : "—",
    ]);
    content.push({
      layout: "lightHorizontalLines",
      table: {
        headerRows: 1,
        widths:
          hourlyRateCents !== null
            ? ["*", "auto", "auto", "auto", "auto", "auto", "auto"]
            : ["*", "auto", "auto", "auto", "auto", "auto"],
        body: [headerRow, ...rows],
      },
    });

    if (hourlyRateCents !== null) {
      content.push(...buildSessionSections(listed, now));
    }
  }

  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 40],
    content,
    defaultStyle: {
      font: FONT,
      fontSize: 9.5,
      color: "#111111",
    },
  };
}