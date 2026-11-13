"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {getSupabase} from "@/lib/supabase";

type ReturnLine={quantity:number;restocked:boolean;line_total:number};
type SaleLine={id:string;product_id:string;batch_id:string|null;quantity:number;unit_price:number;unit_cost:number;line_total:number;product:{name:string}|null;batch:{lot_number:string|null;expiration_date:string|null}|null;returns:ReturnLine[]};
type Payment={method:string;amount:number};
type Sale={id:string;sale_number:number;status:string;subtotal:number;discount:number;total:number;amount_paid:number;change_due:number;sold_at:string;customer:{full_name:string}|null;sale_items:SaleLine[];sale_payments:Payment[];sale_returns:{id:string;return_number:number;reason:string;total:number;refunded_at:string;sale_return_payments:Payment[]}[]};
const money=(v:number)=>"Q "+Number(v||0).toFixed(2);
const paymentName=(v:string)=>v==="cash"?"Efectivo":v==="card"?"Tarjeta":"Transferencia";
export default function HistoryPage(){
 const router=useRouter();
 const [rows,setRows]=useState<Sale[]>([]);
 const [selected,setSelected]=useState<Sale|null>(null);
 const [role,setRole]=useState("");
 const [search,setSearch]=useState("");
 const [from,setFrom]=useState(new Date().toISOString().slice(0,10));
 const [to,setTo]=useState(new Date().toISOString().slice(0,10));
 const [qty,setQty]=useState<Record<string,string>>({});
 const [restock,setRestock]=useState<Record<string,boolean>>({});
 const [reason,setReason]=useState("");
 const [refundMethod,setRefundMethod]=useState("cash");
 const [busy,setBusy]=useState(false);
 const [msg,setMsg]=useState("");
 const load=useCallback(async()=>{
  const sb=getSupabase();const {data:{session}}=await sb.auth.getSession();
  if(!session){router.replace("/login");return;}
  const {data:profile}=await sb.from("profiles").select("role,active").eq("id",session.user.id).maybeSingle();
  if(!profile?.active){await sb.auth.signOut();router.replace("/login");return;}setRole(profile.role);
  const start=new Date(from+"T00:00:00").toISOString();const end=new Date(to+"T23:59:59.999").toISOString();
  const {data,error}=await sb.from("sales").select("id,sale_number,status,subtotal,discount,total,amount_paid,change_due,sold_at,customer:customers(full_name),sale_items(id,product_id,batch_id,quantity,unit_price,unit_cost,line_total,product:products(name),batch:product_batches(lot_number,expiration_date),returns:sale_return_items(quantity,restocked,line_total)),sale_payments(method,amount),sale_returns(id,return_number,reason,total,refunded_at,sale_return_payments(method,amount))").gte("sold_at",start).lte("sold_at",end).order("sold_at",{ascending:false}).limit(500);
  if(error){setMsg(error.message);return;}setRows((data||[]) as unknown as Sale[]);setMsg("");
 },[from,to,router]);
 useEffect(()=>{load()},[load]);
 const filtered=useMemo(()=>rows.filter(s=>String(s.sale_number).includes(search.trim())||(s.customer?.full_name||"").toLowerCase().includes(search.toLowerCase())),[rows,search]);
 const returnedTotal=(s:Sale)=>s.sale_returns.reduce((n,r)=>n+Number(r.total),0);
 const available=(line:SaleLine)=>Number(line.quantity)-line.returns.reduce((n,r)=>n+Number(r.quantity),0);
 const refundTotal=selected?selected.sale_items.reduce((sum,line)=>{const q=Number(qty[line.id]||0);return sum+(available(line)>0?q*Number(line.line_total)/Number(line.quantity):0)},0):0;
 function print(s:Sale){setSelected(s);setTimeout(()=>window.print(),100);}
 async function submitReturn(){
  if(!selected)return;
  const items=selected.sale_items.filter(x=>Number(qty[x.id]||0)>0).map(x=>({sale_item_id:x.id,quantity:Number(qty[x.id]),restock:Boolean(restock[x.id])}));
  if(!items.length){setMsg("Indica al menos una cantidad para devolver.");return;}
  if(!reason.trim()){setMsg("Escribe el motivo de la devolución.");return;}
  if(refundMethod==="cash"&&!confirm("El reembolso en efectivo saldrá de la caja abierta. ¿Confirmas la devolución?"))return;
  setBusy(true);setMsg("");
  const {data,error}=await getSupabase().rpc("create_sale_return",{p_sale_id:selected.id,p_items:items,p_payments:[{method:refundMethod,amount:Number(refundTotal.toFixed(2))}],p_reason:reason.trim()});
  setBusy(false);
  if(error){setMsg(error.message);return;}
  setMsg("Devolución #"+(data as {return_number:number}).return_number+" registrada por "+money(refundTotal)+".");
  setReason("");setQty({});setRestock({});await load();
  const {data:fresh}=await getSupabase().from("sales").select("id,sale_number,status,subtotal,discount,total,amount_paid,change_due,sold_at,customer:customers(full_name),sale_items(id,product_id,batch_id,quantity,unit_price,unit_cost,line_total,product:products(name),batch:product_batches(lot_number,expiration_date),returns:sale_return_items(quantity,restocked,line_total)),sale_payments(method,amount),sale_returns(id,return_number,reason,total,refunded_at,sale_return_payments(method,amount))").eq("id",selected.id).maybeSingle();
  if(fresh)setSelected(fresh as unknown as Sale);
 }
 return <main style={{maxWidth:1200,margin:"0 auto",padding:"28px 20px"}}>
  <Link href="/" style={{fontSize:12,color:"#087e61",textDecoration:"none"}}>← Panel principal</Link>
  <h1 style={{fontSize:26,margin:"12px 0 5px"}}>Historial de ventas y devoluciones</h1>
  <p style={{fontSize:13,color:"#71817a"}}>Consulta ventas, imprime nuevamente tickets y registra devoluciones autorizadas.</p>
  {msg&&<p role="status" style={{padding:11,background:"#edf8f2",color:"#087e61",borderRadius:8,fontSize:12}}>{msg}</p>}
  <section style={box}><div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end"}}>
   <label style={lab}>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={inp}/></label>
   <label style={lab}>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)} style={inp}/></label>
   <label style={{...lab,minWidth:200}}>Buscar venta o cliente<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Número o nombre" style={inp}/></label>
   <button onClick={load} style={btn}>Actualizar</button>
  </div></section>
  <section style={{...box,marginTop:14,overflowX:"auto"}}>
   <b style={{fontSize:14}}>Operaciones ({filtered.length})</b>
   {!filtered.length?<p style={{padding:28,textAlign:"center",fontSize:13,color:"#71817a"}}>No hay ventas en el período seleccionado.</p>:
   <table style={{width:"100%",minWidth:760,borderCollapse:"collapse",fontSize:12,marginTop:12}}><thead><tr style={{textAlign:"left",background:"#f7faf8"}}>{["Venta","Fecha","Cliente","Estado","Total","Devuelto","Acciones"].map(x=><th key={x} style={{padding:10}}>{x}</th>)}</tr></thead><tbody>
   {filtered.map(s=><tr key={s.id} style={{borderTop:"1px solid #edf1ee"}}><td style={{padding:10,fontWeight:700}}>#{s.sale_number}</td><td style={{padding:10}}>{new Date(s.sold_at).toLocaleString("es-GT")}</td><td style={{padding:10}}>{s.customer?.full_name||"Consumidor final"}</td><td style={{padding:10}}>{s.status==="refunded"?"Devuelta":s.status==="cancelled"?"Anulada":"Completada"}</td><td style={{padding:10}}>{money(s.total)}</td><td style={{padding:10}}>{money(returnedTotal(s))}</td><td style={{padding:10,whiteSpace:"nowrap"}}><button onClick={()=>{setSelected(s);setQty({});setRestock({});}} style={smallBtn}>Ver detalle</button> <button onClick={()=>print(s)} style={smallBtn}>Imprimir</button></td></tr>)}
   </tbody></table>}
  </section>
  {selected&&<div style={overlay} onClick={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section style={modal}>
   <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}><div><h2 style={{fontSize:19,margin:0}}>Venta #{selected.sale_number}</h2><p style={{fontSize:11,color:"#71817a",margin:"5px 0"}}>{new Date(selected.sold_at).toLocaleString("es-GT")} · {selected.customer?.full_name||"Consumidor final"}</p></div><button onClick={()=>setSelected(null)} style={smallBtn}>Cerrar</button></div>
   <div style={{overflowX:"auto",marginTop:12}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:520}}><thead><tr style={{textAlign:"left",background:"#f7faf8"}}>{["Producto","Lote","Vendida","Devuelta","Disponible","Precio"].map(x=><th key={x} style={{padding:9}}>{x}</th>)}</tr></thead><tbody>{selected.sale_items.map(line=>{const done=Number(line.quantity)-available(line);return <tr key={line.id} style={{borderTop:"1px solid #edf1ee"}}><td style={{padding:9}}>{line.product?.name||"Producto"}</td><td style={{padding:9}}>{line.batch?.lot_number||"—"}</td><td style={{padding:9}}>{line.quantity}</td><td style={{padding:9}}>{done}</td><td style={{padding:9}}>{available(line)}</td><td style={{padding:9}}>{money(line.unit_price)}</td></tr>})}</tbody></table></div>
   <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0",borderTop:"1px solid #edf1ee",marginTop:12,fontSize:13}}><span>Total venta</span><b>{money(selected.total)}</b></div>
   <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#71817a"}}><span>Reembolsado</span><b>{money(returnedTotal(selected))}</b></div>
   <div style={{fontSize:11,color:"#71817a",marginTop:8}}>Pagos originales: {selected.sale_payments.map(p=>paymentName(p.method)+" "+money(p.amount)).join(" · ")}</div>
   {selected.sale_returns.length>0&&<div style={{marginTop:12,background:"#f7faf8",padding:10,borderRadius:8}}><b style={{fontSize:12}}>Devoluciones anteriores</b>{selected.sale_returns.map(r=><div key={r.id} style={{fontSize:11,paddingTop:6}}>#{r.return_number} · {new Date(r.refunded_at).toLocaleString("es-GT")} · {money(r.total)} · {r.reason}</div>)}</div>}
   {selected.status==="completed"&&role!=="cashier"&&role!=="inventory"&&<div style={{marginTop:16,borderTop:"1px solid #edf1ee",paddingTop:14}}>
    <h3 style={{fontSize:14,margin:"0 0 8px"}}>Registrar devolución</h3>
    <p style={{fontSize:11,color:"#71817a"}}>Solo administrador o encargado. Las cantidades no pueden superar lo que queda disponible. Reingresa al inventario únicamente productos en buen estado y lotes vigentes.</p>
    {selected.sale_items.filter(x=>available(x)>0).map(line=><div key={line.id} style={{display:"grid",gridTemplateColumns:"minmax(120px,1fr) 90px 130px",gap:8,alignItems:"center",padding:"8px 0",borderBottom:"1px solid #edf1ee"}}>
     <div style={{fontSize:11}}><b>{line.product?.name||"Producto"}</b><div style={{color:"#71817a"}}>Disponibles: {available(line)}</div></div>
     <input aria-label="Cantidad a devolver" type="number" min="0" max={available(line)} step=".001" value={qty[line.id]||""} onChange={e=>setQty(v=>({...v,[line.id]:e.target.value}))} placeholder="Cantidad" style={inp}/>
     <label style={{fontSize:10,display:"flex",gap:5,alignItems:"center"}}><input type="checkbox" checked={Boolean(restock[line.id])} onChange={e=>setRestock(v=>({...v,[line.id]:e.target.checked}))}/> Reingresar stock</label>
    </div>)}
    <label style={lab}>Motivo<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ej. producto equivocado" style={inp}/></label>
    <label style={lab}>Método de reembolso<select value={refundMethod} onChange={e=>setRefundMethod(e.target.value)} style={inp}><option value="cash">Efectivo (sale de caja)</option><option value="card">Tarjeta (procesar fuera del sistema)</option><option value="transfer">Transferencia (procesar fuera del sistema)</option></select></label>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}><b style={{fontSize:14}}>Reembolso: {money(refundTotal)}</b><button disabled={busy||refundTotal<=0} onClick={submitReturn} style={btn}>{busy?"Registrando…":"Confirmar devolución"}</button></div>
   </div>}
   {selected.status==="refunded"&&<p style={{padding:10,background:"#fff6e8",color:"#915d10",borderRadius:8,fontSize:12,marginTop:14}}>Esta venta ya fue devuelta completamente.</p>}
  </section></div>}
  {selected&&<section id="history-ticket" className="print-ticket"><div style={{textAlign:"center"}}><h2 style={{margin:0}}>SALUD Y VIDA</h2><div>Farmacia · Ticket de venta</div><div>Venta #{selected.sale_number}</div><div>{new Date(selected.sold_at).toLocaleString("es-GT")}</div></div><hr/ ><div>Cliente: {selected.customer?.full_name||"Consumidor final"}</div>{selected.sale_items.map(x=><div key={x.id} className="ticket-line"><span>{x.product?.name||"Producto"}<br/>{x.quantity} × {money(x.unit_price)}</span><b>{money(x.line_total)}</b></div>)}<hr/><div className="ticket-line"><span>Subtotal</span><b>{money(selected.subtotal)}</b></div><div className="ticket-line"><span>Descuento</span><b>{money(selected.discount)}</b></div><div className="ticket-line"><strong>TOTAL</strong><strong>{money(selected.total)}</strong></div><p>Pagos: {selected.sale_payments.map(p=>paymentName(p.method)+" "+money(p.amount)).join(", ")}</p><p>Cambio: {money(selected.change_due)}</p><div style={{textAlign:"center"}}>¡Gracias por su compra!</div></section>}
  <style>{`@media(max-width:600px){.history-modal{width:96vw!important;padding:14px!important}} @media print{body *{visibility:hidden!important}#history-ticket,#history-ticket *{visibility:visible!important}#history-ticket{display:block!important;position:absolute;left:0;top:0;width:80mm;padding:3mm;font:11px Arial;color:#111}@page{size:80mm auto;margin:3mm}} .print-ticket{display:none}.ticket-line{display:flex;justify-content:space-between;gap:8px;margin:7px 0;font-size:11px}`}</style>
 </main>;
}
const box:React.CSSProperties={background:"white",border:"1px solid #e3ece7",borderRadius:14,padding:16};
const lab:React.CSSProperties={display:"block",fontSize:11,fontWeight:700};
const inp:React.CSSProperties={display:"block",width:"100%",padding:9,border:"1px solid #dce7e1",borderRadius:8,marginTop:5,fontSize:12,background:"white"};
const btn:React.CSSProperties={padding:"10px 14px",background:"#087e61",color:"white",border:0,borderRadius:8,fontWeight:700,cursor:"pointer"};
const smallBtn:React.CSSProperties={padding:"7px 9px",border:"1px solid #dce7e1",borderRadius:7,background:"white",fontSize:11,cursor:"pointer"};
const overlay:React.CSSProperties={position:"fixed",inset:0,zIndex:50,background:"rgba(10,25,20,.5)",display:"grid",placeItems:"center",padding:12};
const modal:React.CSSProperties={background:"white",borderRadius:14,padding:20,width:"min(760px,96vw)",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 70px #0003"};
