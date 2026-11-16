"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {getSupabase} from "@/lib/supabase";
import {getGuatemalaDate} from "@/lib/date";

type Expense={id:string;category:string;description:string;amount:number;expense_date:string;payment_method:string;receipt_reference:string|null;notes:string|null;created_at:string};
const CATEGORIES=["Servicios","Personal","Limpieza","Alquiler","Mantenimiento","Administración","Transporte","Otros"];
const money=(n:number)=>"Q "+Number(n||0).toFixed(2);
export default function ExpensesPage(){
 const router=useRouter();
 const [items,setItems]=useState<Expense[]>([]);
 const [category,setCategory]=useState("Servicios");
 const [description,setDescription]=useState("");
 const [amount,setAmount]=useState("");
 const [date,setDate]=useState(getGuatemalaDate());
 const [method,setMethod]=useState("cash");
 const [receipt,setReceipt]=useState("");
 const [notes,setNotes]=useState("");
 const [from,setFrom]=useState(getGuatemalaDate().slice(0,7)+"-01");
 const [to,setTo]=useState(getGuatemalaDate());
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState("");
 async function load(){
  setLoading(true);
  const {data,error}=await getSupabase().from("expense_records").select("id,category,description,amount,expense_date,payment_method,receipt_reference,notes,created_at").gte("expense_date",from).lte("expense_date",to).order("expense_date",{ascending:false}).order("created_at",{ascending:false}).limit(1000);
  if(error)setMessage(error.message);else setItems((data||[]) as Expense[]);
  setLoading(false);
 }
 useEffect(()=>{(async()=>{const sb=getSupabase();const {data:{session}}=await sb.auth.getSession();if(!session){router.replace("/login");return;}const {data:profile}=await sb.from("profiles").select("role,active").eq("id",session.user.id).maybeSingle();if(!profile?.active||!["admin","manager"].includes(profile.role)){router.replace("/");return;}await load();})();},[]);
 const total=useMemo(()=>items.reduce((s,x)=>s+Number(x.amount),0),[items]);
 const cashTotal=useMemo(()=>items.filter(x=>x.payment_method==="cash").reduce((s,x)=>s+Number(x.amount),0),[items]);
 const transferTotal=total-cashTotal;
 const byCategory=useMemo(()=>CATEGORIES.map(c=>({category:c,total:items.filter(x=>x.category===c).reduce((s,x)=>s+Number(x.amount),0)})).filter(x=>x.total>0).sort((a,b)=>b.total-a.total),[items]);
 async function save(e:React.FormEvent){
  e.preventDefault();setMessage("");
  if(!description.trim()||Number(amount)<=0){setMessage("Escribe una descripción y un importe válido.");return;}
  setBusy(true);
  const {error}=await getSupabase().rpc("record_expense",{p_category:category,p_description:description.trim(),p_amount:Number(amount),p_expense_date:date,p_payment_method:method,p_receipt_reference:receipt.trim()||null,p_notes:notes.trim()||null});
  setBusy(false);
  if(error){setMessage(error.message);return;}
  setDescription("");setAmount("");setReceipt("");setNotes("");setMessage(method==="cash"?"Gasto registrado y descontado de la caja general.":"Gasto registrado. La caja general no cambia porque fue pagado por transferencia.");
  await load();
 }
 function exportCsv(){
  const rows=[["Fecha","Categoría","Descripción","Importe Q","Forma de pago","Comprobante","Observaciones"],...items.map(x=>[x.expense_date,x.category,x.description,Number(x.amount).toFixed(2),x.payment_method==="cash"?"Efectivo":"Transferencia",x.receipt_reference||"",x.notes||""])];
  const csv=rows.map(r=>r.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(",")).join("\n");
  const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="gastos-salud-y-vida.csv";a.click();URL.revokeObjectURL(url);
 }
 return <main style={{maxWidth:1120,margin:"0 auto",padding:"28px 20px"}}>
  <Link href="/" style={{fontSize:12,color:"#087e61",textDecoration:"none"}}>← Panel principal</Link>
  <h1 style={{fontSize:27,margin:"12px 0 5px"}}>Gastos de la farmacia</h1>
  <p style={{fontSize:13,color:"#71817a"}}>Registra los gastos diarios y controla cuánto cuesta mantener funcionando Salud y Vida.</p>
  {message&&<p role="status" style={{padding:12,background:"#edf8f2",color:"#087e61",borderRadius:9,fontSize:12}}>{message}</p>}
  <section style={card}>
   <h2 style={title}>Registrar un gasto</h2>
   <form onSubmit={save}>
    <div style={grid}>
     <label style={lab}>Categoría<select value={category} onChange={e=>setCategory(e.target.value)} style={input}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
     <label style={lab}>Descripción<input required maxLength={240} placeholder="Ej. Pago de energía eléctrica" value={description} onChange={e=>setDescription(e.target.value)} style={input}/></label>
     <label style={lab}>Importe (Q)<input required type="number" min=".01" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" style={input}/></label>
     <label style={lab}>Fecha del gasto<input required type="date" value={date} onChange={e=>setDate(e.target.value)} style={input}/></label>
     <label style={lab}>Forma de pago<select value={method} onChange={e=>setMethod(e.target.value)} style={input}><option value="cash">Efectivo (descontar de caja general)</option><option value="transfer">Transferencia (no afecta efectivo)</option></select></label>
     <label style={lab}>No. de recibo o comprobante<input value={receipt} onChange={e=>setReceipt(e.target.value)} maxLength={100} placeholder="Opcional" style={input}/></label>
    </div>
    <label style={{...lab,marginTop:12}}>Observaciones<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000} rows={2} placeholder="Detalles adicionales (opcional)" style={{...input,resize:"vertical"}}/></label>
    <div style={{display:"flex",justifyContent:"flex-end",marginTop:14}}><button disabled={busy} style={button}>{busy?"Guardando…":"Guardar gasto"}</button></div>
   </form>
  </section>
  <div style={stats}>
   <Metric label="Total de gastos del período" value={money(total)}/>
   <Metric label="Pagados en efectivo" value={money(cashTotal)}/>
   <Metric label="Pagados por transferencia" value={money(transferTotal)}/>
   <Metric label="Registros" value={items.length}/>
  </div>
  <section style={{...card,marginTop:16}}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"end",gap:12,flexWrap:"wrap"}}>
    <div><h2 style={title}>Historial de gastos</h2><p style={muted}>Consulta y exporta los gastos registrados.</p></div>
    <button onClick={exportCsv} style={secondary}>Exportar CSV</button>
   </div>
   <div style={{display:"flex",gap:10,alignItems:"end",flexWrap:"wrap",margin:"14px 0"}}>
    <label style={lab}>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={input}/></label>
    <label style={lab}>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)} style={input}/></label>
    <button onClick={load} disabled={loading} style={button}>{loading?"Consultando…":"Aplicar fechas"}</button>
   </div>
   {byCategory.length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>{byCategory.map(x=><span key={x.category} style={chip}>{x.category}: <b>{money(x.total)}</b></span>)}</div>}
   <div style={{overflowX:"auto"}}>
    <table style={table}><thead><tr>{["Fecha","Categoría","Descripción","Importe","Pago","Comprobante"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead>
    <tbody>{items.map(x=><tr key={x.id}><td style={td}>{x.expense_date}</td><td style={td}>{x.category}</td><td style={td}>{x.description}{x.notes&&<small style={{display:"block",color:"#71817a",marginTop:3}}>{x.notes}</small>}</td><td style={{...td,fontWeight:700}}>{money(x.amount)}</td><td style={td}>{x.payment_method==="cash"?"Efectivo":"Transferencia"}</td><td style={td}>{x.receipt_reference||"—"}</td></tr>)}</tbody></table>
   </div>
   {!loading&&!items.length&&<p style={{textAlign:"center",fontSize:12,color:"#71817a",padding:20}}>No hay gastos registrados en este período.</p>}
  </section>
 </main>;
}
function Metric({label,value}:{label:string;value:string|number}){return <div style={card}><small style={{fontSize:11,color:"#71817a"}}>{label}</small><h2 style={{fontSize:21,margin:"8px 0 0"}}>{value}</h2></div>}
const card:React.CSSProperties={background:"white",border:"1px solid #e3ece7",borderRadius:14,padding:18};
const title:React.CSSProperties={fontSize:16,margin:"0 0 12px"};
const muted:React.CSSProperties={fontSize:12,color:"#71817a",margin:0};
const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12};
const stats:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginTop:14};
const lab:React.CSSProperties={display:"block",fontSize:11,fontWeight:700};
const input:React.CSSProperties={display:"block",width:"100%",padding:10,border:"1px solid #dce7e1",borderRadius:8,marginTop:6,fontSize:12,background:"white"};
const button:React.CSSProperties={padding:"11px 16px",background:"#087e61",color:"white",border:0,borderRadius:9,fontWeight:700,fontSize:12,cursor:"pointer"};
const secondary:React.CSSProperties={...button,background:"#234b68"};
const chip:React.CSSProperties={padding:"7px 10px",borderRadius:20,background:"#eff7f3",fontSize:11,color:"#36564a"};
const table:React.CSSProperties={width:"100%",minWidth:760,borderCollapse:"collapse",fontSize:12};
const th:React.CSSProperties={padding:11,textAlign:"left",background:"#f7faf8",color:"#71817a"};
const td:React.CSSProperties={padding:11,borderTop:"1px solid #edf1ee"};
