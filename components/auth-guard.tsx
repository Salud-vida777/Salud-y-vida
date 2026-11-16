"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

const CASHIER_PATHS = ["/ventas", "/caja", "/ventas/historial"];
const INVENTORY_PATHS = ["/productos", "/inventario", "/vencimientos", "/stock-bajo", "/compras", "/proveedores"];

type Role = "admin" | "manager" | "cashier" | "inventory" | string;
type Status = "checking" | "authenticated" | "anonymous";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [role, setRole] = useState<Role | null>(null);
  const loadedUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const sb = getSupabase();

    async function applySession(session: Awaited<ReturnType<typeof sb.auth.getSession>>["data"]["session"]) {
      if (!active) return;
      if (!session) {
        loadedUserId.current = null;
        setRole(null);
        setStatus("anonymous");
        return;
      }

      // Keep the already-verified profile while navigating between pages.
      if (loadedUserId.current === session.user.id) return;

      loadedUserId.current = session.user.id;
      setStatus("checking");
      const { data: profile, error } = await sb
        .from("profiles")
        .select("role,active")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;
      if (error || !profile?.active) {
        loadedUserId.current = null;
        setRole(null);
        setStatus("anonymous");
        await sb.auth.signOut({ scope: "local" });
        router.replace("/login");
        return;
      }

      setRole(profile.role);
      setStatus("authenticated");
    }

    sb.auth.getSession().then(({ data, error }) => {
      if (error) {
        setStatus("anonymous");
        return;
      }
      void applySession(data.session);
    }).catch(() => {
      if (active) setStatus("anonymous");
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      // Defer Supabase queries until after the auth callback releases its internal lock.
      window.setTimeout(() => { void applySession(session); }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (status !== "authenticated" || !role) return;

    if (pathname === "/login") {
      router.replace(role === "cashier" ? "/ventas" : role === "inventory" ? "/inventario" : "/");
      return;
    }
    if (role === "cashier" && !CASHIER_PATHS.includes(pathname)) {
      router.replace("/ventas");
      return;
    }
    if (role === "inventory" && !INVENTORY_PATHS.includes(pathname)) {
      router.replace("/inventario");
      return;
    }
    if (role === "manager" && pathname === "/usuarios") {
      router.replace("/");
    }
  }, [pathname, role, router, status]);

  if (pathname === "/login" && status === "anonymous") return <>{children}</>;
  if (status !== "authenticated") {
    if (pathname === "/login" && status === "checking") return <>{children}</>;
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f2f7f4", color: "#087e61", fontFamily: "Arial,sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 42, height: 42, margin: "0 auto 14px", border: "4px solid #dcebe3", borderTopColor: "#087e61", borderRadius: "50%", animation: "auth-spin .8s linear infinite" }} />
          <strong style={{ fontSize: 15 }}>Salud y Vida</strong>
          <p style={{ color: "#71817a", fontSize: 12, marginTop: 7 }}>Verificando acceso…</p>
          <style>{`@keyframes auth-spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </main>
    );
  }

  if ((role === "cashier" && !CASHIER_PATHS.includes(pathname) && pathname !== "/login")
    || (role === "inventory" && !INVENTORY_PATHS.includes(pathname) && pathname !== "/login")
    || (role === "manager" && pathname === "/usuarios")
    || pathname === "/login") {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f2f7f4", color: "#087e61", fontFamily: "Arial,sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 42, height: 42, margin: "0 auto 14px", border: "4px solid #dcebe3", borderTopColor: "#087e61", borderRadius: "50%", animation: "auth-spin .8s linear infinite" }} />
          <strong style={{ fontSize: 15 }}>Salud y Vida</strong>
          <p style={{ color: "#71817a", fontSize: 12, marginTop: 7 }}>Abriendo sección…</p>
          <style>{`@keyframes auth-spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
