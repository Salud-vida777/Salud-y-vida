"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {getSupabase} from "@/lib/supabase";
import {getGuatemalaDate,guatemalaDateToIso} from "@/lib/date";

type Sale={id:string;sale_number:number;status:string;total:number;sold_at:string;sale_items:{quantity:number;unit_cost:number}[];sale_payments:{amount:number;payment_method:string}[];sale_returns:{total:number;sale_return_items:{quantity:number;restocked:boolean;sale_item:{unit_cost:number}|null}[]}[]};
type Expense={id:string;amount:number;payment_method:string;expense_date:string};
const money=(v:number)=>"Q "+v.toLocaleString("es-GT",{minimumFractionDigits:2,maximumFractionDigits:2});
const styles={card:{background:"#fff",border:"1px solid #e3ece7",borderRadius:14,padding:17} as React.CSSProperties,grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:12,marginTop:16} as React.CSSProperties,label:{display:"block",fontSize:11,fontWeight:700} as React.CSSProperties,input:{display:"block",padding:10,border:"1px solid #dce7e1",borderRadius:8,marginTop:5} as React.CSSProperties,button:{padding:"10px 14px",background:"#087e61",color:"white",border:0,borderRadius:8,fontWeight:700,fontSize:12} as React.CSSProperties,table:{width:"100%",minWidth:760,borderCollapse:"collapse",fontSize:12} as React.CSSProperties,th:{padding:11,textAlign:"left",background:"#f7faf8",color:"#71817a"} as React.CSSProperties,td:{padding:11,borderTop:"1px solid #edf1ee"} as React.CSSProperties};
function Metric({label,value,detail}:{label:string;value:string;detail?:string}){return <div style={styles.card}><small style={{fontSize:11,color:"#71817a"}}>{label}</small><h2 style={{fontSize:22,margin:"8px 0 3px",color:"#173f32"}}>{value}</h2>{detail&&<small style={{fontSize:10,color:"#82918a"}}>{detail}</small>}</div>}
export default function FinancesPage(){
 const router=useRouter();const today=getGuatemalaDate();
 const [from,setFrom]=useState(today.slice(0,7)+"-01");const [to,setTo]=useState(today);
 const [sales,setSales]=useState<Sale[]>([]);const [expenses,setExpenses]=useState<Expense[]>([]);
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function load(){
  setBusy(true);setError("");const sb=getSupabase();const {data:{session}}=await sb.auth.getSession();
  if(!session){router.replace("/login");return;}
  const [s,e]=await Promise.all([
   sb.from("sales").select("id,sale_number,status,total,sold_at,sale_items(quantity,unit_cost),sale_payments(amount,payment_method),sale_returns(total,sale_return_items(quantity,restocked,sale_item:sale_items(unit_cost)))").gte("sold_at",guatemalaDateToIso(from)).lte("sold_at",guatemalaDateToIso(to,true)).order("sold_at",{ascending:false}).limit(3000),
   sb.from("expense_records").select("id,amount,payment_method,expense_date").gte("expense_date",from).lte("expense_date",to).limit(3000)
  ]);
  if(s.error||e.error){setError(s.error?.message||e.error?.message||"No se pudo consultar la información.");}
  else{setSales((s.data||[]) as unknown as Sale[]);setExpenses((e.data||[]) as Expense[]);}
  setBusy(false);setLoading(false);
 }
 useEffect(()=>{(async()=>{const sb=getSupabase();const {data:{session}}=await sb.auth.getSession();if(!session){router.replace("/login");return;}const {data:p}=await sb.from("profiles").select("role,active").eq("id",session.user.id).maybeSingle();if(!p?.active||!["admin","manager"].includes(p.role)){router.replace("/");return;}await load();})();},[]);
 const valid=sales.filter(s=>["completed","refunded"].includes(s.status));
 const gross=valid.reduce((a,s)=>a+Number(s.total),0);
 const refunds=valid.reduce((a,s)=>a+s.sale_returns.reduce((b,r)=>b+Number(r.total),0),0);
 const cash=valid.reduce((a,s)=>a+s.sale_payments.filter(p=>p.payment_method==="cash").reduce((b,p)=>b+Number(p.amount),0),0);
 const transfer=valid.reduce((a,s)=>a+s.sale_payments.filter(p=>p.payment_method==="transfer").reduce((b,p)=>b+Number(p.amount),0),0);
 const other=valid.reduce((a,s)=>a+s.sale_payments.filter(p=>!["cash","transfer"].includes(p.payment_method)).reduce((b,p)=>b+Number(p.amount),0),0);
 const netSales=gross-refunds;
 const cost=valid.reduce((a,s)=>a+s.sale_items.reduce((b,i)=>b+Number(i.quantity)*Number(i.unit_cost),0),0);
 const returnedCost=valid.reduce((a,s)=>a+s.sale_returns.reduce((b,r)=>b+r.sale_return_items.filter(i=>i.restocked).reduce((c,i)=>c+Number(i.quantity)*Number(i.sale_item?.unit_cost||0),0),0),0);
 const netCost=cost-returnedCost;const grossProfit=netSales-netCost;
 const expenseTotal=expenses.reduce((a,e)=>a+Number(e.amount),0);const netResult=grossProfit-expenseTotal;
 const cashExpenses=expenses.filter(e=>e.payment_method==="cash").reduce((a,e)=>a+Number(e.amount),0);
 const transferExpenses=expenses.filter(e=>e.payment_method==="transfer").reduce((a,e)=>a+Number(e.amount),0);
 function exportCsv(){
  const rows=[["No. venta","Fecha","Estado","Total venta","Efectivo","Transferencia","Otros pagos","Devoluciones","Ingreso neto","Costo neto","Utilidad estimada"],...valid.map(s=>{const returned=s.sale_returns.reduce((a,r)=>a+Number(r.total),0);const c=s.sale_items.reduce((a,i)=>a+Number(i.quantity)*Number(i.unit_cost),0);const rc=s.sale_returns.reduce((a,r)=>a+r.sale_return_items.filter(i=>i.restocked).reduce((b,i)=>b+Number(i.quantity)*Number(i.sale_item?.unit_cost||0),0),0);return [s.sale_number,new Date(s.sold_at).toLocaleString("es-GT"),s.status,s.total,s.sale_payments.filter(p=>p.payment_method==="cash").reduce((a,p)=>a+Number(p.amount),0),s.sale_payments.filter(p=>p.payment_method==="transfer").reduce((a,p)=>a+Number(p.amount),0),s.sale_payments.filter(p=>!["cash","transfer"].includes(p.payment_method)).reduce((a,p)=>a+Number(p.amount),0),returned,Number(s.total)-returned,c-rc,Number(s.total)-returned-c+rc];})];
  const csv=rows.map(r=>r.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(",")).join("\n");const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="finanzas-salud-y-vida.csv";a.click();URL.revokeObjectURL(url);
 }
 return <main style={{maxWidth:1200,margin:"0 auto",padding:"28px 20px"}}>
  <Link href="/" style={{fontSize:12,color:"#087e61",textDecoration:"none"}}>← Panel principal</Link>
  <h1 style={{fontSize:28,margin:"12px 0 5px",color:"#173f32"}}>Finanzas</h1>
  <p style={{fontSize:13,color:"#71817a",marginTop:0}}>Resumen de ingresos, medios de pago, costos y resultado de la farmacia.</p>
  <section style={{...styles.card,display:"flex",gap:12,alignItems:"end",flexWrap:"wrap",marginTop:18}}>
   <label style={styles.label}>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={styles.input}/></label>
   <label style={styles.label}>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)} style={styles.input}/></label>
   <button onClick={load} disabled={busy} style={styles.button}>{busy?"Consultando…":"Aplicar fechas"}</button>
   <button onClick={exportCsv} disabled={!sales.length} style={{...styles.button,background:"#234b68"}}>Exportar ventas CSV</button>
  </section>
  {error&&<p role="alert" style={{padding:12,background:"#fff1ef",color:"#b42318",borderRadius:9,fontSize:12}}>{error}</p>}
  {loading?<p style={{padding:20,color:"#71817a"}}>Cargando resumen financiero…</p>:<>
   <h2 style={{fontSize:16,margin:"22px 0 0",color:"#234b3d"}}>Ingresos por ventas</h2>
   <div style={styles.grid}>
    <Metric label="Ventas completadas" value={String(valid.length)} detail="Operaciones del período"/>
    <Metric label="Total vendido" value={money(gross)} detail="Antes de devoluciones"/>
    <Metric label="Recibido en efectivo" value={money(cash)} detail="No incluye transferencias"/>
    <Metric label="Recibido por transferencia" value={money(transfer)} detail="Registrado como transferencia"/>
    <Metric label="Otros medios de pago" value={money(other)} detail="Tarjeta, crédito u otros"/>
    <Metric label="Devoluciones" value={money(refunds)} detail="Importe devuelto en el período"/>
    <Metric label="Ingreso neto de ventas" value={money(netSales)} detail="Ventas menos devoluciones"/>
   </div>
   <h2 style={{fontSize:16,margin:"24px 0 0",color:"#234b3d"}}>Costos y ganancia estimada</h2>
   <div style={styles.grid}>
    <Metric label="Costo neto de productos" value={money(netCost)} detail="Costo de lotes vendidos menos costo restituido"/>
    <Metric label="Ganancia bruta estimada" value={money(grossProfit)} detail="Ingreso neto menos costo neto"/>
    <Metric label="Gastos operativos" value={money(expenseTotal)} detail={"Efectivo "+money(cashExpenses)+" · Transferencia "+money(transferExpenses)}/>
    <Metric label="Resultado después de gastos" value={money(netResult)} detail="Ganancia bruta menos gastos registrados"/>
   </div>
   <p style={{fontSize:11,color:"#71817a",lineHeight:1.6,marginTop:12}}>La transferencia se muestra separada del efectivo y no se agrega a la caja física. Esta pantalla refleja los pagos registrados en cada venta; no consulta el saldo bancario. La ganancia es una estimación basada en el costo guardado de los lotes y puede diferir de la utilidad contable definitiva.</p>
   <section style={{...styles.card,marginTop:18,overflowX:"auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}><div><h2 style={{fontSize:16,margin:"0 0 4px"}}>Detalle de ventas</h2><p style={{fontSize:11,color:"#71817a",margin:0}}>Cada operación y cómo fue pagada.</p></div><span style={{fontSize:11,color:"#71817a"}}>{valid.length} ventas</span></div>
    <table style={styles.table}><thead><tr>{["Venta","Fecha","Estado","Total","Efectivo","Transferencia","Devolución"].map(x=><th key={x} style={styles.th}>{x}</th>)}</tr></thead><tbody>
     {valid.map(s=>{const c=s.sale_payments.filter(p=>p.payment_method==="cash").reduce((a,p)=>a+Number(p.amount),0);const t=s.sale_payments.filter(p=>p.payment_method==="transfer").reduce((a,p)=>a+Number(p.amount),0);const r=s.sale_returns.reduce((a,x)=>a+Number(x.total),0);return <tr key={s.id}><td style={styles.td}>#{s.sale_number}</td><td style={styles.td}>{new Date(s.sold_at).toLocaleString("es-GT")}</td><td style={styles.td}>{s.status}</td><td style={styles.td}>{money(Number(s.total))}</td><td style={styles.td}>{money(c)}</td><td style={styles.td}>{money(t)}</td><td style={styles.td}>{money(r)}</td></tr>})}
    </tbody></table>{!valid.length&&<p style={{fontSize:12,color:"#71817a",padding:15,textAlign:"center"}}>No hay ventas completadas en este período.</p>}
   </section>
  </>}
 </main>;
}
