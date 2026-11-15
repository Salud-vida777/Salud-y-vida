import type { Metadata } from "next";
import AuthGuard from "@/components/auth-guard";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salud y Vida | Punto de venta",
  description: "Sistema de punto de venta y control de inventario para farmacia Salud y Vida.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><AuthGuard>{children}</AuthGuard></body></html>;
}