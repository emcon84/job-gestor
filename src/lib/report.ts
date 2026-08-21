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

function tableHeaderCell(text: string): ReportHeaderCell {
  return { text, bold: true, fillColor: HEADER_FILL };
}

export function buildReportDefinition({
  client,
  tasks,
  summary,
}: {
  client: Pick<Client, "name" | "slug" | "packThresholdCents">;
  tasks: Task[];
  summary: PackSummary;
}): ReportDefinition {
  const content: ReportContent[] = [
    {
      text: `Reporte de tareas — ${client.name}`,
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
      text: `Abono mensual: ${formatArs(client.packThresholdCents)}`,
      fontSize: 10,
      margin: [0, 0, 0, 18],
    },
    {
      text: "Resumen del abono",
      fontSize: 12,
      bold: true,
      margin: [0, 0, 0, 6],
    },
    {
      text: `Pendiente del abono actual: ${formatArs(summary.pendingPackCents)}`,
      fontSize: 10,
      margin: [0, 0, 2, 0],
    },
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
  ];

  if (summary.overflowCents > 0) {
    content.push({
      text: `Excedente acumulado: ${formatArs(summary.overflowCents)}`,
      fontSize: 10,
      margin: [0, 2, 0, 0],
    });
  }

  content.push({
    text: "Tareas",
    fontSize: 12,
    bold: true,
    margin: [0, 18, 0, 6],
  });

  if (tasks.length === 0) {
    content.push({
      text: "Sin tareas.",
      fontSize: 10,
      italics: true,
      color: "#666666",
    });
  } else {
    const headerRow = [
      tableHeaderCell("Título"),
      tableHeaderCell("Área"),
      tableHeaderCell("Estado"),
      tableHeaderCell("Monto"),
      tableHeaderCell("Pago"),
      tableHeaderCell("Vencimiento"),
    ];
    const rows: (string | ReportHeaderCell)[][] = tasks.map((task) => [
      task.title,
      task.area,
      STATUS_LABELS[task.status],
      formatArs(task.amountArs ?? 0),
      paymentLabel(task.paymentState),
      task.paymentDueDate ? formatDateEs(task.paymentDueDate) : "—",
    ]);
    content.push({
      layout: "lightHorizontalLines",
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto", "auto", "auto", "auto"],
        body: [headerRow, ...rows],
      },
    });
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