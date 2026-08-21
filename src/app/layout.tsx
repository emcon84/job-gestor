import type { Metadata } from "next";
import Script from "next/script";
import { Montserrat } from "next/font/google";
import ThemeToggle from "@/components/ThemeToggle";
import PwaRegister from "@/components/PwaRegister";
import PushSubscribeButton from "@/components/PushSubscribeButton";
import "./globals.css";

const themeInitScript = `
  (function () {
    try {
      var stored = localStorage.getItem("theme");
      var theme = stored === "light" || stored === "dark"
        ? stored
        : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      document.documentElement.setAttribute("data-theme", theme);
    } catch (e) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  })();
`;

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Gestor — Tareas de mantenimiento",
  description:
    "Panel de tareas de mantenimiento por cliente: envío y seguimiento de estado, con tablero para el propietario.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className={`${montserrat.variable} font-sans antialiased`}>
        {children}
        <PwaRegister />
        <PushSubscribeButton />
        <ThemeToggle />
      </body>
    </html>
  );
}
