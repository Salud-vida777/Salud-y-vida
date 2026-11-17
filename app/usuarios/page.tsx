"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {createClient, type SupabaseClient} from "@supabase/supabase-js";
import {getSupabase} from "@/lib/supabase";

type Profile={id:string;full_name:string|null;role:string;active:boolean};
const box:React.CSSProperties={background:"white",border:"1px solid #e3ece7",borderRadius:14,padding:18};
const btn:React.CSSProperties={padding:11,background:"#087e61",color:"white",border:0,borderRadius:9,fontWeight:700,cursor:"pointer"};
const input:React.CSSProperties={display:"block",width:"100%",marginTop:6,padding:11,border:"1px solid #dce7e1",borderRadius:9,fontSize:13};
const INTERNAL_LOGIN_DOMAIN="@staff.saludyvida.invalid";

export default function UsersPage(){
 const router=useRouter();
 const [rows,setRows]=useState<Profile[]>([]);
 const [role,setRole]=useState("cashier");
 const [active,setActive]=useState(true);
 const [msg,setMsg]=useState("");
 const [err,setErr]=useState("");
 const [isAdmin,setIsAdmin]=useState(false);
 const [loading,setLoading]=useState(true);
 const [myId,setMyId]=useState("");
 const [myEmail,setMyEmail]=useState("");
 const [targetId,setTargetId]=useState("");
 const [currentPassword,setCurrentPassword]=useState("");
 const [newPassword,setNewPassword]=useState("");
 const [confirmPassword,setConfirmPassword]=useState("");
 const [otp,setOtp]=useState("");
 const [step,setStep]=useState<"password"|"code">("password");
 const [busy,setBusy]=useState(false);
 const reauthClientRef=useRef<SupabaseClient|null>(null);

 async function load(){
  const sb=getSupabase();
  const {data:{session}}=await sb.auth.getSession();
  if(!session){router.replace("/login");return;}
  setMyId(session.user.id);setMyEmail(session.user.email||"");
  const {data:p}=await sb.from("profiles").select("id,full_name,role,active").eq("id",session.user.id).maybeSingle();
  setIsAdmin(p?.role==="admin");
  if(p?.role==="admin"){
   const {data,error}=await sb.from("profiles").select("id,full_name,role,active").order("created_at");
   if(error)setErr(error.message);else{
    const list=(data||[]) as Profile[];setRows(list);
    setTargetId(current=>current||session.user.id);
   }
  }
  setLoading(false);
 }
 useEffect(()=>{void load()},[]);
 const targets=useMemo(()=>rows.filter(p=>p.active&&(p.id===myId||p.role==="cashier")),[rows,myId]);

 async function bootstrap(){
  setMsg("");setErr("");
  const {data,error}=await getSupabase().rpc("bootstrap_first_admin");
  if(error)setErr(error.message);else{setMsg("Tu cuenta ahora es el primer administrador. Cierra y vuelve a iniciar sesión si el menú no se actualiza.");await getSupabase().auth.refreshSession();void load();}
 }
 async function change(id:string,selectedRole:string,selectedActive:boolean){
  setMsg("");setErr("");
  const {error}=await getSupabase().rpc("set_staff_role",{p_user_id:id,p_role:selectedRole,p_active:selectedActive});
  if(error)setErr(error.message);else{setMsg("Permisos actualizados.");void load();}
 }
 function resetPasswordFlow(){reauthClientRef.current=null;setStep("password");setCurrentPassword("");setNewPassword("");setConfirmPassword("");setOtp("");setErr("");setMsg("");}

 async function sendCode(){
  setErr("");setMsg("");
  if(!targetId||!currentPassword){setErr("Selecciona una cuenta e ingresa su contraseña actual.");return;}
  if(newPassword.length<8){setErr("La nueva contraseña debe tener al menos 8 caracteres.");return;}
  if(newPassword!==confirmPassword){setErr("Las nuevas contraseñas no coinciden.");return;}
  if(!myEmail){setErr("La cuenta administradora no tiene correo electrónico asociado.");return;}
  setBusy(true);
  try{
   const sb=getSupabase();
   let verifyEmail=myEmail;
   if(targetId!==myId){
    const {data,error}=await sb.functions.invoke("admin-password-management",{body:{action:"lookup",targetId}});
    if(error||!data?.email)throw new Error(data?.error||error?.message||"No se pudo identificar el usuario vendedor.");
    verifyEmail=data.email;
   }
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
   const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
   const passwordChecker=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const {error:checkError}=await passwordChecker.auth.signInWithPassword({email:verifyEmail,password:currentPassword});
   await passwordChecker.auth.signOut();
   if(checkError)throw new Error("La contraseña actual no es correcta. No se ha cambiado ninguna contraseña.");
   // Reauthenticate using an isolated client explicitly initialized with the administrator's active session.
   const {data:{session:adminSession},error:sessionError}=await sb.auth.getSession();
   if(sessionError||!adminSession?.access_token||!adminSession.refresh_token)throw new Error("La sesión del administrador venció. Cierra sesión, vuelve a entrar y solicita el código otra vez.");
   const reauthClient=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
   const {error:setSessionError}=await reauthClient.auth.setSession({access_token:adminSession.access_token,refresh_token:adminSession.refresh_token});
   if(setSessionError)throw new Error("No se pudo recuperar la sesión del administrador: "+setSessionError.message);
   const {error:mailError}=await reauthClient.auth.reauthenticate();
   if(mailError)throw new Error("No se pudo enviar el código al correo del administrador: "+mailError.message);
   reauthClientRef.current=reauthClient;
   setStep("code");
   setMsg("Código solicitado. Revisa la bandeja de entrada y la carpeta de spam del correo Gmail del administrador.");
  }catch(e){setErr(e instanceof Error?e.message:"No se pudo solicitar el código.");}
  finally{setBusy(false);}
 }

 async function confirmChange(){
  setErr("");setMsg("");
  if(!/^\d{6}$/.test(otp.trim())){setErr("Escribe el código de 6 dígitos recibido por correo.");return;}
  setBusy(true);
  try{
   const sb=getSupabase();
   if(targetId===myId){
    const reauthClient=reauthClientRef.current;
    if(!reauthClient)throw new Error("La verificación expiró. Solicita un código nuevo.");
    const {error}=await reauthClient.auth.updateUser({password:newPassword,current_password:currentPassword,nonce:otp.trim()});
    if(error)throw new Error("El código no es correcto o ya venció, o la contraseña actual no coincide: "+error.message);
   }else{
    const reauthClient=reauthClientRef.current;
    if(!reauthClient)throw new Error("La verificación expiró. Solicita un código nuevo.");
    const {error:verifyError}=await reauthClient.auth.verifyOtp({email:myEmail,token:otp.trim(),type:"reauthentication"});
    if(verifyError)throw new Error("El código no es correcto o ya venció. Solicita uno nuevo.");
    const {data,error}=await sb.functions.invoke("admin-password-management",{body:{action:"change",targetId,newPassword}});
    if(error||data?.error)throw new Error(data?.error||error?.message||"No se pudo cambiar la contraseña del vendedor.");
   }
   reauthClientRef.current=null;
   setStep("password");setCurrentPassword("");setNewPassword("");setConfirmPassword("");setOtp("");
   setMsg("Contraseña cambiada correctamente. La contraseña anterior ya no permitirá iniciar sesión.");
  }catch(e){setErr(e instanceof Error?e.message:"No se pudo cambiar la contraseña.");}
  finally{setBusy(false);}
 }

 return <main style={{maxWidth:1100,margin:"0 auto",padding:"30px 22px"}}>
  <Link href="/" style={{fontSize:12,color:"#087e61",textDecoration:"none"}}>← Volver al panel</Link>
  <h1 style={{fontSize:26,margin:"12px 0 5px"}}>Usuarios y permisos</h1>
  <p style={{fontSize:13,color:"#71817a"}}>Administra las cuentas del personal, sus permisos y sus contraseñas.</p>
  {err&&<p role="alert" style={{padding:12,background:"#fff1ef",color:"#b42318",borderRadius:9,fontSize:12}}>{err}</p>}
  {msg&&<p role="status" style={{padding:12,background:"#edf8f2",color:"#087e61",borderRadius:9,fontSize:12}}>{msg}</p>}
  {loading?<p>Cargando…</p>:!isAdmin?<section style={box}><h2 style={{fontSize:16}}>Configuración inicial</h2><p style={{fontSize:13,lineHeight:1.7,color:"#52635a"}}>Si esta farmacia todavía no tiene un administrador, la primera cuenta autenticada puede reclamar ese rol una sola vez. Hazlo únicamente desde la cuenta del propietario.</p><button onClick={bootstrap} style={btn}>Configurar mi cuenta como primer administrador</button><p style={{fontSize:11,color:"#82918a",marginTop:12}}>Si ya existe un administrador, esta acción será rechazada.</p></section>:<>
   <section style={{...box,marginTop:18}}>
    <h2 style={{fontSize:15}}>Cambiar contraseña del administrador o vendedor</h2>
    <p style={{fontSize:12,color:"#52635a",lineHeight:1.7}}>Selecciona tu cuenta de administrador o un vendedor activo. Primero se verifica la contraseña actual de esa cuenta; después se envía un código de 6 dígitos al correo del administrador. Solo al validar el código se guarda la nueva contraseña.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginTop:12}}>
     <label style={{fontSize:12,fontWeight:700}}>Cuenta
      <select value={targetId} onChange={e=>{setTargetId(e.target.value);resetPasswordFlow();}} style={input}>
       {targets.map(p=><option key={p.id} value={p.id}>{p.id===myId?"Administrador (mi cuenta)":(p.full_name||"Vendedor")+" · Vendedor"}</option>)}
      </select>
     </label>
     <label style={{fontSize:12,fontWeight:700}}>Contraseña actual
      <input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} style={input} placeholder="Contraseña actual"/>
     </label>
     <label style={{fontSize:12,fontWeight:700}}>Nueva contraseña
      <input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} style={input} placeholder="Mínimo 8 caracteres"/>
     </label>
     <label style={{fontSize:12,fontWeight:700}}>Confirmar nueva contraseña
      <input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} style={input} placeholder="Repite la nueva contraseña"/>
     </label>
    </div>
    {step==="password"?<button disabled={busy} onClick={sendCode} style={{...btn,marginTop:14,opacity:busy?.6:1}}>{busy?"Verificando…":"Verificar contraseña y enviar código al Gmail administrador"}</button>:<div style={{marginTop:14,padding:13,background:"#f2f8f4",borderRadius:10}}>
      <label style={{display:"block",fontSize:12,fontWeight:700}}>Código de 6 dígitos enviado al correo del administrador
       <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,6))} style={{...input,maxWidth:220,letterSpacing:4,fontSize:18}} placeholder="000000"/>
      </label>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
       <button disabled={busy} onClick={confirmChange} style={{...btn,opacity:busy?.6:1}}>{busy?"Guardando…":"Confirmar código y cambiar contraseña"}</button>
       <button disabled={busy} onClick={resetPasswordFlow} style={{padding:11,border:"1px solid #dce7e1",borderRadius:9,background:"white",cursor:"pointer"}}>Cancelar</button>
      </div>
    </div>}
    <p style={{fontSize:10,color:"#82918a",lineHeight:1.6,marginTop:12}}>El código se envía al correo asociado a la cuenta del administrador, no al vendedor. No compartas el código con nadie. Las contraseñas nunca se muestran en el listado de usuarios.</p>
   </section>
   <section style={{...box,marginTop:16}}>
    <h2 style={{fontSize:15}}>Crear una cuenta de acceso</h2>
    <p style={{fontSize:12,color:"#52635a",lineHeight:1.7}}>Para crear un cajero: 1) en Supabase Authentication → Users → Add user, escribe como correo interno el usuario seguido de @staff.saludyvida.invalid. Ejemplo: Farmacia2026@staff.saludyvida.invalid. 2) Asígnale una contraseña y confirma/activa la cuenta al crearla. 3) Aparecerá aquí con rol cashier. El trabajador iniciará sesión escribiendo solamente Farmacia2026 y su contraseña; no necesita usar ni recordar ese correo interno. Mantén el rol cashier para limitarlo al Punto de venta y su propia Caja.</p>
   </section>
   <section style={{...box,marginTop:16}}>
    <h2 style={{fontSize:15}}>Personal registrado ({rows.length})</h2>
    {rows.map(p=><div key={p.id} style={{display:"grid",gridTemplateColumns:"minmax(140px,1fr) 150px 100px 140px",gap:10,alignItems:"center",padding:"13px 0",borderBottom:"1px solid #edf1ee"}}>
     <div><b style={{fontSize:12}}>{p.full_name||"Usuario"}</b><div style={{fontSize:10,color:"#82918a"}}>{p.id.slice(0,8)}…</div></div>
     <span style={{fontSize:12}}>{p.role}</span>
     <span style={{fontSize:11,color:p.active?"#087e61":"#b42318"}}>{p.active?"Activo":"Inactivo"}</span>
     <button onClick={()=>{const r=prompt("Escribe el nuevo rol: admin, manager, cashier o inventory",p.role);if(r&&["admin","manager","cashier","inventory"].includes(r)){const a=confirm("¿Mantener esta cuenta activa?");void change(p.id,r,a);}}} style={{padding:8,border:"1px solid #dce7e1",borderRadius:7,background:"white",fontSize:11}}>Editar permisos</button>
    </div>)}
   </section>
  </>}
 </main>;
}
