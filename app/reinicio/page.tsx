"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

const TABLES = [
  ["profiles","Cuentas y permisos"],
  ["categories","Categorías"],
  ["suppliers","Proveedores"],
  ["customers","Clientes"],
  ["products","Productos"],
  ["product_batches","Lotes e inventario"],
  ["purchases","Compras"],
  ["purchase_items","Detalle de compras"],
  ["purchase_payments","Pagos a proveedores"],
  ["sales","Ventas"],
  ["sale_items","Detalle de ventas"],
  ["sale_payments","Pagos de ventas"],
  ["sale_returns","Devoluciones"],
  ["sale_return_items","Detalle de devoluciones"],
  ["sale_return_payments","Pagos de devoluciones"],
  ["cash_sessions","Turnos de caja"],
  ["cash_movements","Movimientos de cajas de trabajadores"],
  ["general_cash_movements","Movimientos de caja general"],
  ["inventory_adjustments","Ajustes de inventario"],
  ["expense_records","Gastos de farmacia"],
  ["audit_logs","Registro de auditoría"],
] as const;

type Backup = Record<string, Record<string, unknown>[]>;
const styles = {
  card: { background:"#fff", border:"1px solid #e3ece7", borderRadius:14, padding:18 } as React.CSSProperties,
  button: { padding:"11px 15px", border:0, borderRadius:9, background:"#087e61", color:"#fff", fontWeight:700, cursor:"pointer" } as React.CSSProperties,
  input: { width:"100%", padding:12, border:"1px solid #d6e2db", borderRadius:9, marginTop:6, fontSize:14 } as React.CSSProperties,
};

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c] || c));
const pretty = (v: unknown) => v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

export default function ResetPage() {
  const router = useRouter();
  const [allowed,setAllowed] = useState(false);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [backup,setBackup] = useState<Backup|null>(null);
  const [pdfOpened,setPdfOpened] = useState(false);
  const [saved,setSaved] = useState(false);
  const [password,setPassword] = useState("");
  const [phrase,setPhrase] = useState("");
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");

  useEffect(() => {
    (async()=>{
      const sb=getSupabase();
      const {data:{session}}=await sb.auth.getSession();
      if(!session){router.replace("/login");return;}
      const {data:p}=await sb.from("profiles").select("role,active").eq("id",session.user.id).maybeSingle();
      if(!p?.active || p.role!=="admin"){router.replace("/");return;}
      setAllowed(true);setLoading(false);
    })().catch(()=>{setError("No se pudo verificar tu cuenta.");setLoading(false);});
  },[router]);

  const counts=useMemo(()=>backup?TABLES.map(([key,label])=>({key,label,count:backup[key]?.length||0})):[],[backup]);
  const total=counts.reduce((a,x)=>a+x.count,0);

  async function preparePdf(){
    setError("");setMessage("");
    const win=window.open("","_blank");
    if(!win){setError("El navegador bloqueó la ventana del PDF. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.");return;}
    win.document.write("<!doctype html><html><head><title>Respaldo Salud y Vida</title></head><body style='font-family:Arial;padding:24px'>Preparando respaldo…</body></html>");
    const sb=getSupabase();
    try{
      const result:Backup={};
      for(const [key] of TABLES){
        let rows:Record<string,unknown>[]=[];
        let start=0;
        while(true){
          const {data,error}=await sb.from(key).select("*").range(start,start+999);
          if(error) throw new Error("No se pudo respaldar "+key+": "+error.message);
          const batch=(data||[]) as Record<string,unknown>[];
          rows=rows.concat(batch);
          if(batch.length<1000) break;
          start+=1000;
        }
        result[key]=rows;
      }
      setBackup(result);
      const sections=TABLES.map(([key,label])=>{
        const rows=result[key]||[];
        if(!rows.length) return `<section><h2>${esc(label)} (0)</h2><p>Sin registros.</p></section>`;
        const cols=Array.from(new Set(rows.flatMap(r=>Object.keys(r))));
        return `<section><h2>${esc(label)} (${rows.length})</h2><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${cols.map(c=>`<td>${esc(pretty(row[c]))}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
      }).join("");
      const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Respaldo Salud y Vida</title><style>
      @page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#183b30;font-size:9px}h1{font-size:22px;margin-bottom:4px}h2{font-size:14px;margin:18px 0 7px;border-bottom:1px solid #9bb7a8;padding-bottom:5px}p,.meta{color:#52665c}table{border-collapse:collapse;width:100%;table-layout:auto;margin-bottom:14px}th,td{border:1px solid #dce5df;padding:4px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#edf4ef}tr{break-inside:avoid}section{break-inside:auto}header{border-bottom:2px solid #087e61;padding-bottom:10px;margin-bottom:12px}.warning{background:#fff6e5;padding:9px;border:1px solid #efd49a}
      </style></head><body><header><h1>Salud y Vida — Respaldo general</h1><div class="meta">Generado: ${esc(new Date().toLocaleString("es-GT"))} · Guatemala · Registros incluidos: ${total+Object.values(result).reduce((a,r)=>a+r.length,0)-total}</div><p class="warning">Copia de respaldo previa al reinicio de datos. Contiene información operativa y personal; guárdala en un lugar privado y seguro.</p><p>Este documento conserva una copia de las tablas y registros consultados. Las cuentas de acceso se mantienen activas en el sistema; no se exportan contraseñas.</p></header>${sections}<script>window.onload=()=>setTimeout(()=>window.print(),500)</script></body></html>`;
      win.document.open();win.document.write(html);win.document.close();
      setPdfOpened(true);
      setMessage("Respaldo preparado. En la ventana que se abrió, selecciona «Guardar como PDF» y guarda el archivo en tu dispositivo. Luego marca la casilla de confirmación.");
    }catch(e){
      win.close();
      setError(e instanceof Error?e.message:"No se pudo crear el respaldo. No se ha eliminado ningún dato.");
    }
  }

  async function resetAll(){
    setError("");setMessage("");
    if(!backup){setError("Primero debes generar el respaldo PDF.");return;}
    if(!saved){setError("Confirma que ya guardaste el PDF antes de continuar.");return;}
    if(phrase!=="REINICIAR FARMACIA"){setError("Escribe exactamente REINICIAR FARMACIA.");return;}
    if(!password){setError("Escribe tu contraseña de administrador.");return;}
    setBusy(true);
    try{
      const sb=getSupabase();
      const {data:{session}}=await sb.auth.getSession();
      if(!session?.user.email) throw new Error("No se pudo identificar el correo de la cuenta administradora.");
      const {error:authError}=await sb.auth.signInWithPassword({email:session.user.email,password});
      if(authError) throw new Error("La contraseña de administrador no es correcta. No se eliminó nada.");
      const {data:profile}=await sb.from("profiles").select("role,active").eq("id",session.user.id).maybeSingle();
      if(!profile?.active||profile.role!=="admin") throw new Error("La cuenta no tiene permisos de administrador.");
      const {data,error}=await sb.rpc("reset_operational_data");
      if(error) throw new Error(error.message);
      setPassword("");
      setMessage("Reinicio completado. Se eliminaron los datos operativos y se conservaron las cuentas de acceso. Ya puedes comenzar a registrar la información real.");
      setBackup(null);setSaved(false);setPdfOpened(false);setPhrase("");
      void data;
    }catch(e){setError(e instanceof Error?e.message:"No se pudo completar el reinicio.");}
    finally{setBusy(false);}
  }

  if(loading) return <main style={{padding:30,color:"#087e61"}}>Verificando permisos…</main>;
  if(!allowed) return null;

  return <main style={{maxWidth:980,margin:"0 auto",padding:"28px 18px 50px"}}>
    <Link href="/" style={{fontSize:12,color:"#087e61",textDecoration:"none"}}>← Volver al panel</Link>
    <div style={{marginTop:14}}>
      <span style={{fontSize:11,fontWeight:800,color:"#b54708",letterSpacing:1}}>HERRAMIENTA DEL ADMINISTRADOR</span>
      <h1 style={{fontSize:28,color:"#173f32",margin:"6px 0"}}>Reinicio de farmacia</h1>
      <p style={{fontSize:13,color:"#71817a",lineHeight:1.7}}>Archiva toda la información de prueba en un PDF y después limpia los datos operativos para comenzar desde cero.</p>
    </div>
    <section style={{...styles.card,marginTop:18,borderColor:"#f0d7a8",background:"#fffaf1"}}>
      <h2 style={{fontSize:16,color:"#9a3412",margin:"0 0 8px"}}>⚠️ Esta acción es irreversible</h2>
      <p style={{fontSize:12,color:"#70452f",lineHeight:1.7,margin:0}}>Se borrarán productos, lotes y existencias, categorías, proveedores, clientes, compras, ventas, devoluciones, pagos, movimientos y sesiones de caja, gastos, ajustes y auditoría. Se conservarán tu cuenta de administrador, las cuentas de acceso del personal y la configuración del sistema. No se borrará nada hasta que el PDF esté preparado, confirmes que lo guardaste y vuelvas a escribir tu contraseña.</p>
    </section>
    <section style={{...styles.card,marginTop:16}}>
      <h2 style={{fontSize:16,margin:"0 0 6px"}}>1. Crear el archivo PDF de respaldo</h2>
      <p style={{fontSize:12,color:"#71817a",lineHeight:1.6}}>Incluye las tablas de información del sistema, con sus registros y campos. El PDF se guarda en tu dispositivo; no se envía a terceros.</p>
      <button type="button" onClick={preparePdf} disabled={busy} style={styles.button}>{backup?"Volver a generar el PDF":"Generar respaldo PDF"}</button>
      {backup&&<div style={{marginTop:14,padding:12,background:"#eff8f2",borderRadius:9}}>
        <b style={{fontSize:13,color:"#176044"}}>Respaldo preparado · {total} registros</b>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:6,marginTop:9}}>
          {counts.map(x=><div key={x.key} style={{fontSize:11,color:"#52665c"}}>{x.label}: <b>{x.count}</b></div>)}
        </div>
        <label style={{display:"flex",gap:9,alignItems:"flex-start",fontSize:12,marginTop:14,color:"#176044"}}>
          <input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)} style={{marginTop:2}}/>
          Ya guardé el documento PDF en mi dispositivo y comprobé que se descargó.
        </label>
      </div>}
    </section>
    <section style={{...styles.card,marginTop:16,opacity:backup&&saved?1:.62}}>
      <h2 style={{fontSize:16,margin:"0 0 6px"}}>2. Confirmar el reinicio</h2>
      <p style={{fontSize:12,color:"#71817a",lineHeight:1.6}}>Para evitar errores, escribe la frase indicada y confirma con la contraseña de tu cuenta administradora.</p>
      <label style={{display:"block",fontSize:12,fontWeight:700,marginTop:12}}>Escribe: REINICIAR FARMACIA<input value={phrase} onChange={e=>setPhrase(e.target.value)} placeholder="REINICIAR FARMACIA" style={styles.input} autoComplete="off"/></label>
      <label style={{display:"block",fontSize:12,fontWeight:700,marginTop:12}}>Contraseña de administrador<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Tu contraseña actual" style={styles.input} autoComplete="current-password"/></label>
      <button type="button" onClick={resetAll} disabled={busy||!backup||!saved||phrase!=="REINICIAR FARMACIA"||!password} style={{...styles.button,background:"#b42318",marginTop:16,opacity:busy||!backup||!saved||phrase!=="REINICIAR FARMACIA"||!password?.length?.valueOf()?0.55:1}}>{busy?"Procesando reinicio…":"Eliminar los datos y comenzar de cero"}</button>
    </section>
    {error&&<p role="alert" style={{padding:12,background:"#fff1ef",color:"#b42318",borderRadius:9,fontSize:12,marginTop:14}}>{error}</p>}
    {message&&<p role="status" style={{padding:12,background:"#edf8f2",color:"#087e61",borderRadius:9,fontSize:12,marginTop:14}}>{message}</p>}
    <p style={{fontSize:10,color:"#82918a",marginTop:16,lineHeight:1.6}}>Consejo: revisa que el PDF se pueda abrir y que incluya las secciones que necesitas antes de confirmar el borrado. Si no puedes guardar el PDF, no continúes con el reinicio.</p>
  </main>;
}
