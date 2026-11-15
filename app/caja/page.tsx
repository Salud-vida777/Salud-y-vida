"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {getSupabase} from "@/lib/supabase";
import PosHeader from "@/components/pos-header";

type Session={id:string;opening_amount:number;status:string;opened_at:string;closing_amount:number|null;expected_amount:number|null};
type Movement={id:string;type:string;amount:number;reason:string;created_at?:string};
type GeneralMovement={movement_id:string|null;movement_type:string|null;amount:number|null;reason:string|null;source:string|null;created_at:string|null;balance:number};

export default function CashPage(){
 const router=useRouter();
 const [role,setRole]=useState("");
 const [roleChecked,setRoleChecked]=useState(false);
 const [session,setSession]=useState<Session|null>(null);
 const [opening,setOpening]=useState("0");
 const [closing,setClosing]=useState("");
 const [movements,setMovements]=useState<Movement[]>([]);
 const [general,setGeneral]=useState<GeneralMovement[]>([]);
 const [generalBalance,setGeneralBalance]=useState(0);
 const [kind,setKind]=useState("in");
 const [amount,setAmount]=useState("");
 const [reason,setReason]=useState("");
 const [msg,setMsg]=useState("");
 const [busy,setBusy]=useState(false);
 const isAdmin=role==="admin"||role==="manager";

 async function load(){
  const sb=getSupabase();
  const {data:{session:auth}}=await sb.auth.getSession();
  if(!auth){router.replace("/login");return;}
  const {data:profile}=await sb.from("profiles").select("role,active").eq("id",auth.user.id).maybeSingle();
  if(!profile?.active){await sb.auth.signOut();router.replace("/login");return;}
  setRole(profile.role);setRoleChecked(true);
  const {data:s}=await sb.from("cash_sessions").select("id,opening_amount,status,opened_at,closing_amount,expected_amount").eq("opened_by",auth.user.id).eq("status","open").order("opened_at",{ascending:false}).limit(1).maybeSingle();
  setSession(s as Session|null);
  if(s){
   const {data:m}=await sb.from("cash_movements").select("id,type,amount,reason,created_at").eq("session_id",s.id).order("created_at",{ascending:false});
   setMovements((m||[]) as Movement[]);
  } else setMovements([]);
  if(profile.role==="admin"||profile.role==="manager"){
   const {data:g,error}=await sb.rpc("get_general_cash_summary");
   if(error)setMsg(error.message);
   else {
    const rows=(g||[]) as GeneralMovement[];
    setGeneral(rows.filter(x=>x.movement_id) );
    setGeneralBalance(Number(rows[0]?.balance||0));
   }
  }
 }
 useEffect(()=>{load()},[]);
 const balance=Number(session?.opening_amount||0)+movements.reduce((s,m)=>s+(m.type==="in"?1:-1)*Number(m.amount),0);

 async function open(){
  setBusy(true);setMsg("");
  const {error}=await getSupabase().rpc("open_cash_session",{p_opening_amount:Number(opening)});
  setBusy(false);if(error)setMsg(error.message);else{setMsg("Caja de ventas habilitada.");await load();}
 }
 async function workerMovement(e:React.FormEvent){
  e.preventDefault();if(!session)return;
  const {error}=await getSupabase().rpc("add_cash_movement",{p_session_id:session.id,p_type:kind,p_amount:Number(amount),p_reason:reason});
  if(error)setMsg(error.message);else{setAmount("");setReason("");setMsg("Movimiento registrado.");await load();}
 }
 async function generalMovement(e:React.FormEvent){
  e.preventDefault();setBusy(true);
  const {error}=await getSupabase().rpc("record_general_cash_movement",{p_type:kind,p_amount:Number(amount),p_reason:reason});
  setBusy(false);
  if(error)setMsg(error.message);else{setAmount("");setReason("");setMsg("Movimiento registrado en caja general.");await load();}
 }
 async function close(){
  if(!session)return;setBusy(true);
  const {data,error}=await getSupabase().rpc("close_cash_session",{p_session_id:session.id,p_closing_amount:Number(closing)});
  setBusy(false);if(error)setMsg(error.message);else{setMsg("Turno cerrado. Diferencia: Q "+Number((data as {difference:number}).difference).toFixed(2));await load();}
 }

 return <main style={{maxWidth:1000,margin:"0 auto",padding:"30px 22px"}}>
  {!roleChecked?<section style={{...box,marginTop:40,textAlign:"center"}}>Verificando permisos de caja…</section>:isAdmin?<header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",padding:"12px 15px",marginBottom:20,background:"white",border:"1px solid #e3ece7",borderRadius:13}}><div><b style={{color:"#087e61",fontSize:15}}>SALUD Y VIDA</b><div style={{fontSize:10,color:"#71817a",marginTop:3}}>Administración · Caja general</div></div><nav style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><a href="/" style={navLink}>Panel general</a><a href="/compras" style={navLink}>Compras</a><a href="/ventas" style={navLink}>Punto de venta</a></nav></header>:<PosHeader/>}
  {roleChecked&&isAdmin?<>
   <h1 style={{fontSize:26,margin:"12px 0 5px"}}>Caja general</h1>
   <p style={{fontSize:13,color:"#71817a"}}>Saldo permanente de efectivo de la farmacia. No se cierra al terminar el turno de un trabajador.</p>
   {msg&&<p style={{fontSize:12,padding:11,background:"#edf8f2",color:"#087e61",borderRadius:8}}>{msg}</p>}
   <section style={{...box,marginTop:18,background:"#f2faf5"}}>
    <small>EFECTIVO DISPONIBLE EN CAJA GENERAL</small>
    <h2 style={{fontSize:32,color:"#087e61",margin:"8px 0"}}>Q {generalBalance.toFixed(2)}</h2>
    <p style={{fontSize:11,color:"#71817a",margin:0}}>Incluye ventas en efectivo del administrador, entregas de trabajadores y otros ingresos, menos compras en efectivo y egresos registrados.</p>
   </section>
   <section style={{...box,marginTop:16}}>
    <h2 style={{fontSize:15}}>Registrar entrada o salida de efectivo</h2>
    <form onSubmit={generalMovement} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
     <select value={kind} onChange={e=>setKind(e.target.value)} style={inp}><option value="in">Entrada de efectivo</option><option value="out">Salida de efectivo</option></select>
     <input required type="number" min=".01" step=".01" placeholder="Monto Q" value={amount} onChange={e=>setAmount(e.target.value)} style={inp}/>
     <input required placeholder="Motivo (ej. entrega trabajador)" value={reason} onChange={e=>setReason(e.target.value)} style={inp}/>
     <button disabled={busy} style={btn}>Guardar movimiento</button>
    </form>
   </section>
   <section style={{...box,marginTop:16}}>
    <h2 style={{fontSize:15}}>Movimientos de caja general</h2>
    {general.length===0?<p style={{fontSize:12,color:"#71817a"}}>Todavía no hay movimientos en la caja general.</p>:general.map(m=><div key={m.movement_id} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"10px 0",borderBottom:"1px solid #edf1ee",fontSize:12}}><span>{m.reason}<small style={{display:"block",color:"#71817a"}}>{m.created_at?new Date(m.created_at).toLocaleString("es-GT"):""} · {m.source==="purchase"?"Compra":m.source==="admin_cash_session"?"Movimiento/venta administrativa":m.source==="manual"?"Manual":m.source}</small></span><b style={{color:m.movement_type==="in"?"#087e61":"#b42318",whiteSpace:"nowrap"}}>{m.movement_type==="in"?"+":"−"} Q {Number(m.amount||0).toFixed(2)}</b></div>)}
   </section>
   <section style={{...box,marginTop:16}}>
    <h2 style={{fontSize:15}}>Caja para registrar ventas</h2>
    <p style={{fontSize:12,color:"#71817a"}}>Esta sesión técnica permite registrar las ventas del administrador. No controla el saldo general y no tiene cierre de turno.</p>
    {session?<p style={{fontSize:12,color:"#087e61"}}>✓ Caja de ventas habilitada desde {new Date(session.opened_at).toLocaleString("es-GT")}. La caja general permanece abierta.</p>:<><label style={lab}>Fondo operativo inicial (Q)<input type="number" min="0" step=".01" value={opening} onChange={e=>setOpening(e.target.value)} style={inp}/></label><button disabled={busy} onClick={open} style={btn}>Habilitar registro de ventas</button></>}
   </section>
  </>:<>
   <h1 style={{fontSize:26,margin:"12px 0 5px"}}>Mi caja · Turno de trabajador</h1>
   <p style={{fontSize:13,color:"#71817a"}}>Esta caja pertenece únicamente a tu usuario. Al terminar tu jornada, registra el efectivo contado y cierra tu turno.</p>
   {msg&&<p style={{fontSize:12,padding:11,background:"#edf8f2",color:"#087e61",borderRadius:8}}>{msg}</p>}
   {!session?<section style={box}><h2 style={{fontSize:15}}>Abrir mi caja</h2><label style={lab}>Fondo inicial (Q)<input type="number" min="0" step=".01" value={opening} onChange={e=>setOpening(e.target.value)} style={inp}/></label><button disabled={busy} onClick={open} style={btn}>Abrir turno</button></section>:<>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginTop:20}}><div style={box}><small>Fondo inicial</small><h2>Q {Number(session.opening_amount).toFixed(2)}</h2></div><div style={box}><small>Saldo esperado</small><h2>Q {balance.toFixed(2)}</h2></div><div style={box}><small>Movimientos manuales</small><h2>{movements.length}</h2></div></div>
    <section style={{...box,marginTop:16}}><h2 style={{fontSize:15}}>Registrar movimiento</h2><form onSubmit={workerMovement} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}><select value={kind} onChange={e=>setKind(e.target.value)} style={inp}><option value="in">Ingreso</option><option value="out">Egreso</option></select><input required type="number" min=".01" step=".01" placeholder="Monto Q" value={amount} onChange={e=>setAmount(e.target.value)} style={inp}/><input required placeholder="Motivo" value={reason} onChange={e=>setReason(e.target.value)} style={inp}/><button style={btn}>Guardar movimiento</button></form></section>
    <section style={{...box,marginTop:16}}><h2 style={{fontSize:15}}>Cerrar mi turno</h2><label style={lab}>Efectivo contado (Q)<input type="number" min="0" step=".01" value={closing} onChange={e=>setClosing(e.target.value)} style={inp}/></label><p style={{fontSize:11,color:"#71817a"}}>El cierre registra el efectivo contado y la diferencia frente al saldo esperado.</p><button disabled={busy||closing===""} onClick={close} style={{...btn,background:"#9b3c32"}}>Cerrar turno</button></section>
    <section style={{...box,marginTop:16}}><h2 style={{fontSize:15}}>Movimientos recientes</h2>{movements.map(m=><div key={m.id} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #edf1ee",fontSize:12}}><span>{m.reason}</span><b style={{color:m.type==="in"?"#087e61":"#b42318"}}>{m.type==="in"?"+":"−"} Q {Number(m.amount).toFixed(2)}</b></div>)}</section>
   </>}
  </>}
 </main>;
}
const box:React.CSSProperties={background:"white",border:"1px solid #e3ece7",borderRadius:14,padding:18};
const lab:React.CSSProperties={display:"block",fontSize:12,fontWeight:600,margin:"12px 0"};
const inp:React.CSSProperties={display:"block",width:"100%",padding:11,border:"1px solid #dce7e1",borderRadius:8,marginTop:6,fontSize:12,background:"white"};
const navLink:React.CSSProperties={padding:"9px 13px",borderRadius:9,textDecoration:"none",fontSize:12,fontWeight:700,background:"#edf6f1",color:"#087e61"};
const btn:React.CSSProperties={padding:11,background:"#087e61",color:"white",border:0,borderRadius:8,fontWeight:700,cursor:"pointer"};
