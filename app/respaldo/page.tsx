"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {getSupabase} from "@/lib/supabase";
import {getGuatemalaDate} from "@/lib/date";

const TABLES=[
  "categories","products","product_batches","suppliers","customers",
  "purchases","purchase_items","sales","sale_items","sale_payments",
  "sale_returns","sale_return_items","sale_return_payments",
  "cash_sessions","cash_movements","inventory_adjustments","audit_logs","profiles",
];

export default function BackupPage(){
  const router=useRouter();
  const [role,setRole]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [progress,setProgress]=useState("");
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      const sb=getSupabase();
      const {data:{session}}=await sb.auth.getSession();
      if(!session){router.replace("/login");return;}
      const {data:profile}=await sb.from("profiles").select("role,active").eq("id",session.user.id).maybeSingle();
      if(!profile?.active||!["admin","manager"].includes(profile.role)){router.replace("/");return;}
      if(mounted){setRole(profile.role);setLoading(false);}
    })();
    return()=>{mounted=false;};
  },[router]);

  async function exportBackup(){
    setBusy(true);setMessage("");setProgress("Preparando exportación…");
    try{
      const sb=getSupabase();
      const tables:Record<string,unknown[]>={};
      for(let i=0;i<TABLES.length;i++){
        const table=TABLES[i];
        setProgress(`Exportando ${table} (${i+1}/${TABLES.length})…`);
        const rows:unknown[]=[];
        let cursor:string|null=null;
        while(true){
          let query=sb.from(table).select("*").order("id",{ascending:true}).limit(1000);
          if(cursor)query=query.gt("id",cursor);
          const {data,error}=await query;
          if(error)throw new Error(`No se pudo exportar ${table}: ${error.message}`);
          const batch=data||[];
          rows.push(...batch);
          if(batch.length<1000)break;
          cursor=String((batch[batch.length-1] as {id:string}).id);
        }
        tables[table]=rows;
      }
      const payload={
        format:"salud-y-vida-pos-data-export",
        version:1,
        exportedAt:new Date().toISOString(),
        businessTimezone:"America/Guatemala",
        tables,
        counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),
        note:"Exportación lógica de tablas de negocio. No incluye usuarios/credenciales de Supabase, claves, estructura SQL, funciones, políticas RLS ni configuración del proyecto.",
      };
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;a.download=`salud-y-vida-respaldo-${getGuatemalaDate()}.json`;
      document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
      const total=Object.values(tables).reduce((sum,rows)=>sum+rows.length,0);
      setMessage(`Respaldo descargado correctamente: ${total} registros en ${TABLES.length} tablas.`);
    }catch(error){
      setMessage(error instanceof Error?error.message:"No se pudo completar el respaldo.");
    }finally{setBusy(false);setProgress("");}
  }

  if(loading)return <main style={shell}><p>Cargando…</p></main>;
  return <main style={shell}>
    <header style={{marginBottom:24}}>
      <p style={eyebrow}>SALUD Y VIDA · ADMINISTRACIÓN</p>
      <h1 style={title}>Respaldo de datos</h1>
      <p style={muted}>Exporta los datos operativos para guardarlos de forma segura fuera del sistema.</p>
    </header>
    <section style={card}>
      <div style={{fontSize:36,marginBottom:12}}>⇩</div>
      <h2 style={{fontSize:20,fontWeight:800,margin:"0 0 8px"}}>Exportación de la farmacia</h2>
      <p style={muted}>Descarga un archivo JSON con productos, lotes, clientes, proveedores, compras, ventas, pagos, devoluciones, caja, ajustes y auditoría.</p>
      <button onClick={exportBackup} disabled={busy||!role} style={{...button,opacity:busy ? 0.65 : 1}}>
        {busy?"Generando respaldo…":"Descargar respaldo"}
      </button>
      {progress&&<p style={{marginTop:14,color:"#0f766e",fontWeight:700}}>{progress}</p>}
      {message&&<p role="status" style={{marginTop:14,color:message.startsWith("No se pudo")?"#b91c1c":"#047857",fontWeight:700}}>{message}</p>}
    </section>
    <section style={{...card,marginTop:16,background:"#fffbeb",borderColor:"#fde68a"}}>
      <h2 style={{fontSize:16,fontWeight:800,margin:"0 0 8px",color:"#92400e"}}>Importante</h2>
      <ul style={{paddingLeft:20,margin:0,color:"#78350f",lineHeight:1.7}}>
        <li>Guarda el archivo en un lugar privado y seguro; puede contener datos de clientes y movimientos de la farmacia.</li>
        <li>Haz exportaciones periódicas y antes de cambios importantes.</li>
        <li>Este archivo es una exportación de datos, no una copia completa restaurable del proyecto: no incluye usuarios, contraseñas, claves, funciones SQL ni políticas de seguridad.</li>
        <li>Para una recuperación completa, conserva también la estructura y los respaldos del proyecto desde Supabase.</li>
      </ul>
    </section>
    <p style={{marginTop:20,fontSize:12,color:"#64748b"}}>Disponible para administrador y encargado.</p>
  </main>;
}

const shell:React.CSSProperties={maxWidth:960,margin:"0 auto",padding:"32px 18px",color:"#0f172a"};
const eyebrow:React.CSSProperties={fontSize:11,fontWeight:800,letterSpacing:2,color:"#0f766e",margin:0};
const title:React.CSSProperties={fontSize:32,fontWeight:900,margin:"8px 0"};
const muted:React.CSSProperties={color:"#64748b",lineHeight:1.6,margin:"0 0 18px"};
const card:React.CSSProperties={background:"#fff",border:"1px solid #e2e8f0",borderRadius:18,padding:24,boxShadow:"0 8px 30px rgba(15,23,42,.05)"};
const button:React.CSSProperties={background:"#047857",color:"#fff",border:0,borderRadius:12,padding:"13px 18px",fontWeight:800,cursor:"pointer"};
