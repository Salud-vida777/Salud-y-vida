"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (pathname === "/login") return;

    let active = true;
    const supabase = getSupabase();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session) {
        setAuthorized(true);
        setChecked(true);
      } else if (event === "SIGNED_OUT" || event === "INITIAL_SESSION") {
        setAuthorized(false);
        setChecked(true);
        router.replace("/login");
      }
    });

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!active) return;
      if (error || !session) {
        setAuthorized(false);
        setChecked(true);
        router.replace("/login");
        return;
      }
      setAuthorized(true);
      setChecked(true);
    }).catch(() => {
      if (!active) return;
      setAuthorized(false);
      setChecked(true);
      router.replace("/login");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (pathname === "/login") return <>{children}</>;

  if (!checked || !authorized) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f2f7f4", color: "#087e61", fontFamily: "Arial, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 42, height: 42, margin: "0 auto 14px", border: "4px solid #dcebe3", borderTopColor: "#087e61", borderRadius: "50%", animation: "auth-spin 0.8s linear infinite" }} />
          <strong style={{ fontSize: 15 }}>Salud y Vida</strong>
          <p style={{ color: "#71817a", fontSize: 12, marginTop: 7 }}>Verificando acceso…</p>
          <style>{`@keyframes auth-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
