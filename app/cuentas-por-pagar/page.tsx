"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {getSupabase} from "@/lib/supabase";
import {getGuatemalaDate} from "@/lib/date";

type Payment={id:string;method:string;amount:number;reference:string|null;paid_at:string};
type Purchase={id:string;invoice_number:string|null;total:number;payment_status:string;purchased_at:string;supplier:{name:string}|null;payments:Payment[]};
type Draft={amount:string;method:"cash"|"transfer";reference:string};
const money=(v:number)=>"Q "+Number(v||0).toFixed(2);
export default function PayablesPage(){
 const router=useRouter();
 const [rows,setRows]=useState<Purchase[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [message,setMessage]=useState("");
 const [filter,setFilter]=useState("pending");
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const load=useCallback(async()=>{
  const sb=getSupabase();
  const {data:{session}}=await sb.auth.getSession();
  if(!session){router.replace("/login");return;}
  const {data:profile}=await sb.from("profiles").select("role,active").eq("id",session.user.id).maybeSingle();
  if(!profile?.active||!["admin","manager"].includes(profile.role)){router.replace("/");return;}
  const {data,error}=await sb.from("purchases").select("id,invoice_number,total,payment_status,purchased_at,supplier:suppliers(name),payments:purchase_payments(id,method,amount,reference,paid_at)").eq("payment_method","credit").order("purchased_at",{ascending:false}).limit(500);
  if(error)setMessage(error.message);else setRows((data||[]) as unknown as Purchase[]);
  setLoading(false);
 },[router]);
 useEffect(()=>{load()},[load]);
 const records=useMemo(()=>rows.map(p=>({...p,paid:p.payments.reduce((s,x)=>s+Number(x.amount),0),balance:Math.max(0,Number(p.total)-p.payments.reduce((s,x)=>s+Number(x.amount),0))})),[rows]);
 const pending=records.filter(p=>p.balance>0.001);
 const visible=filter==="pending"?pending:records;
 const totalPending=pending.reduce((s,p)=>s+p.balance,0);
 const totalCredit=records.reduce((s,p)=>s+Number(p.total),0);
 function draft(id:string,field:keyof Draft,value:string){setDrafts(old=>({...old,[id]:{amount:old[id]?.amount??"",method:old[id]?.method??"cash",reference:old[id]?.reference??"",[field]:value}}));}
 async function pay(p:typeof records[number]){
  const d=drafts[p.id]||{amount:p.balance.toFixed(2),method:"cash" as const,reference:""};
  const amount=Number(d.amount);
  if(!Number.isFinite(amount)||amount<=0||amount>p.balance+0.001){setMessage("Ingresa un abono mayor que cero y que no supere el saldo pendiente.");return;}
  if(d.method==="cash"&&!confirm("Se descontará "+money(amount)+" de la caja general. ¿Confirmas que entregarás ese efectivo al proveedor?"))return;
  setBusy(p.id);setMessage("");
  const {data,error}=await getSupabase().rpc("record_purchase_payment",{p_purchase_id:p.id,p_amount:amount,p_method:d.method,p_reference:d.reference||null});
  setBusy("");
  if(error)setMessage(error.message);else{setMessage("Abono registrado. Saldo restante: "+money(Number(data?.remaining||0)));setDrafts(old=>({...old,[p.id]:{amount:"",method:"cash",reference:""}}));await load();}
 }
 function csv(){const data=[["Fecha","Proveedor","Factura","Total compra","Abonado","Saldo pendiente","Estado"],...records.map(p=>[new Date(p.purchased_at).toLocaleString("es-GT"),p.supplier?.name||"",p.invoice_number||"",p.total,p.paid,p.balance,p.balance<=0.001?"Pagada":p.paid>0?"Parcial":"Pendiente"])];const content="\ufeff"+data.map(r=>r.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(",")).join("\r\n");const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="cuentas-por-pagar-"+getGuatemalaDate()+".csv";a.click();URL.revokeObjectURL(url);}
 return <main style={{maxWidth:1150,margin:"0 auto",padding:"28px 18px",color:"#17352c"}}>
  <Link href="/" style={{color:"#087e61",textDecoration:"none",fontSize:12}}>← Panel general</Link>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginTop:12}}>
   <div><h1 style={{fontSize:28,fontWeight:850,margin:"8px 0"}}>Cuentas por pagar</h1><p style={{fontSize:13,color:"#71817a",margin:0}}>Controla compras a crédito, registra abonos y consulta saldos de proveedores.</p></div>
   <button onClick={csv} disabled={!records.length} style={button}>Exportar CSV</button>
  </div>
  {message&&<p role="status" style={{padding:12,background:"#edf8f2",color:"#087e61",borderRadius:9,fontSize:12}}>{message}</p>}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginTop:18}}>
   <div style={card}><small style={muted}>Saldo pendiente total</small><h2 style={{fontSize:25,color:"#b42318",margin:"8px 0"}}>{loading?"—":money(totalPending)}</h2></div>
   <div style={card}><small style={muted}>Compras a crédito</small><h2 style={{fontSize:25,margin:"8px 0"}}>{loading?"—":records.length}</h2></div>
   <div style={card}><small style={muted}>Total original a crédito</small><h2 style={{fontSize:25,color:"#087e61",margin:"8px 0"}}>{loading?"—":money(totalCredit)}</h2></div>
  </div>
  <div style={{display:"flex",gap:8,margin:"18px 0",flexWrap:"wrap"}}>
   <button onClick={()=>setFilter("pending")} style={filter==="pending"?button:secondary}>Pendientes ({pending.length})</button>
   <button onClick={()=>setFilter("all")} style={filter==="all"?button:secondary}>Todas las compras a crédito</button>
  </div>
  <section style={{background:"white",border:"1px solid #e3ece7",borderRadius:14,overflow:"hidden"}}>
   {loading?<p style={{padding:24}}>Cargando cuentas por pagar…</p>:visible.length===0?<div style={{padding:42,textAlign:"center",color:"#71817a"}}>{filter==="pending"?"No hay saldos pendientes con proveedores.":"Todavía no hay compras registradas a crédito."}</div>:visible.map(p=><article key={p.id} style={{padding:18,borderBottom:"1px solid #edf1ee"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
     <div><b style={{fontSize:14}}>{p.supplier?.name||"Proveedor no especificado"}</b><div style={{fontSize:11,color:"#71817a",marginTop:4}}>Factura: {p.invoice_number||"Sin número"} · {new Date(p.purchased_at).toLocaleDateString("es-GT")}</div></div>
     <div style={{textAlign:"right"}}><b style={{fontSize:16,color:p.balance>0.001?"#b42318":"#087e61"}}>{p.balance>0.001?money(p.balance)+" pendiente":"Pagada"}</b><div style={{fontSize:11,color:"#71817a"}}>Compra: {money(Number(p.total))} · Abonado: {money(p.paid)}</div></div>
    </div>
    {p.payments.length>0&&<div style={{marginTop:12,padding:10,background:"#f7faf8",borderRadius:8}}>{p.payments.map(x=><div key={x.id} style={{display:"flex",justifyContent:"space-between",gap:10,fontSize:11,padding:"4px 0"}}><span>{new Date(x.paid_at).toLocaleString("es-GT")} · {x.method==="cash"?"Efectivo":"Transferencia"}{x.reference?" · "+x.reference:""}</span><b>{money(Number(x.amount))}</b></div>)}</div>}
    {p.balance>0.001&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:8,marginTop:12,alignItems:"end"}}>
     <label style={label}>Abono (Q)<input type="number" min="0.01" max={p.balance} step="0.01" placeholder={p.balance.toFixed(2)} value={drafts[p.id]?.amount??""} onChange={e=>draft(p.id,"amount",e.target.value)} style={input}/></label>
     <label style={label}>Forma de pago<select value={drafts[p.id]?.method??"cash"} onChange={e=>draft(p.id,"method",e.target.value)} style={input}><option value="cash">Efectivo (descuenta caja)</option><option value="transfer">Transferencia</option></select></label>
     <label style={label}>Referencia<input value={drafts[p.id]?.reference??""} onChange={e=>draft(p.id,"reference",e.target.value)} placeholder="Opcional" style={input}/></label>
     <button disabled={busy===p.id} onClick={()=>pay(p)} style={{...button,opacity:busy===p.id?.6:1}}>{busy===p.id?"Registrando…":"Registrar abono"}</button>
    </div>}
   </article>)}
  </section>
  <p style={{fontSize:11,color:"#71817a",lineHeight:1.6,marginTop:14}}>Los abonos en efectivo se descuentan de la caja general. Las transferencias no modifican el efectivo. Cada pago queda registrado en el historial y en auditoría.</p>
 </main>;
}
const card:React.CSSProperties={background:"white",border:"1px solid #e3ece7",borderRadius:13,padding:17};
const muted:React.CSSProperties={color:"#71817a",fontSize:11};
const button:React.CSSProperties={padding:"10px 14px",background:"#087e61",color:"white",border:0,borderRadius:9,fontWeight:700,fontSize:12,cursor:"pointer"};
const secondary:React.CSSProperties={padding:"9px 13px",background:"white",color:"#087e61",border:"1px solid #cfe3d9",borderRadius:9,fontWeight:700,fontSize:12};
const label:React.CSSProperties={display:"block",fontSize:11,fontWeight:700,color:"#456257"};
const input:React.CSSProperties={display:"block",width:"100%",marginTop:5,padding:10,border:"1px solid #dce7e1",borderRadius:8,fontSize:12};
