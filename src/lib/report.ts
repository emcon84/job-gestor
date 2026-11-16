/**
 * PDF report builder — pure, no pdfmake import.
 *
 * `buildReportDefinition` returns a plain pdfmake docDefinition object
 * (headers, abono summary, tasks table) that the route handler in
 * `src/app/api/report/route.ts` feeds to pdfmake. Keeping pdfmake out of this
 * module keeps it unit-testable without the heavy UMD bundle.
 */
import type { Content } from "pdfmake/interfaces";
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
  color: string;
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
  /** Static page header (author letterhead), repeated on every page. */
  header: Content;
  content: ReportContent[];
  defaultStyle: {
    font: string;
    fontSize: number;
    color: string;
  };
}

const FONT = "Roboto";
const ACCENT = "#4338ca";
const MUTED = "#6b7280";
const HEADER_FILL = "#eef2ff";
/** A4 width (595pt) minus the 40pt side margins. */
const CONTENT_WIDTH = 515;

/** Author letterhead, styled after the owner's e-mail signature. */
const LETTERHEAD: Content = {
  margin: [40, 28, 40, 0],
  stack: [
    {
      columns: [
        {
          width: "auto",
          stack: [
            { text: "Emiliano Conti", fontSize: 13, bold: true, color: "#111827" },
            {
              text: "Software Engineer",
              fontSize: 9.5,
              bold: true,
              color: ACCENT,
              margin: [0, 2, 0, 0],
            },
            {
              text: "& Solutions with AI",
              fontSize: 8.5,
              color: MUTED,
              margin: [0, 2, 0, 0],
            },
          ],
        },
        {
          width: "auto",
          margin: [14, 0, 14, 0],
          canvas: [
            { type: "line", x1: 0, y1: 0, x2: 0, y2: 44, lineWidth: 2.5, lineColor: ACCENT },
          ],
        },
        {
          width: "*",
          fontSize: 8.5,
          color: MUTED,
          stack: [
            {
              text: [
                "Web: ",
                {
                  text: "emilianoconti.com",
                  link: "https://emilianoconti.com",
                  bold: true,
                  color: ACCENT,
                },
              ],
            },
            {
              margin: [0, 4, 0, 0],
              text: [
                "LinkedIn: ",
                {
                  text: "linkedin.com/in/emilianoconti",
                  link: "https://linkedin.com/in/emilianoconti",
                  color: "#1d8fd6",
                },
              ],
            },
            {
              margin: [0, 4, 0, 0],
              text: [
                "GitHub: ",
                {
                  text: "github.com/emcon84",
                  link: "https://github.com/emcon84",
                  color: "#111827",
                  decoration: "underline",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      margin: [0, 12, 0, 0],
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: CONTENT_WIDTH,
          y2: 0,
          lineWidth: 0.75,
          lineColor: "#e5e7eb",
        },
      ],
    },
  ],
};

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
  return { text, bold: true, fillColor: HEADER_FILL, color: ACCENT };
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
    {
      text: "Detalle de horas",
      fontSize: 12,
      bold: true,
      color: ACCENT,
      margin: [0, 18, 0, 0],
    },
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
      color: MUTED,
      margin: [0, 0, 0, hourlyRateCents !== null ? 18 : 4],
    },
  ];
  // Hourly clients: the rate is deliberately not shown on the report.
  if (hourlyRateCents === null) {
    content.push({
      text: `Abono mensual: ${formatArs(client.packThresholdCents)}`,
      fontSize: 10,
      margin: [0, 0, 0, 18],
    });
  }
  content.push(
    {
      text: hourlyRateCents !== null ? "Resumen" : "Resumen del abono",
      fontSize: 12,
      bold: true,
      color: ACCENT,
      margin: [0, 0, 0, 6],
    },
    {
      text: `Total pendiente de pago: ${formatArs(summary.pendingPackCents)}`,
      fontSize: 10,
      bold: true,
      margin: [0, 0, 2, 0],
    },
  );
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
    color: ACCENT,
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
    // Top margin leaves room for the letterhead header.
    pageMargins: [40, 110, 40, 40],
    header: LETTERHEAD,
    content,
    defaultStyle: {
      font: FONT,
      fontSize: 9.5,
      color: "#111111",
    },
  };
}