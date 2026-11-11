"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const {error}=await getSupabase().auth.signInWithPassword({email,password});
      if(error) throw error;
      router.replace("/");
    } catch(err) { setError(err instanceof Error ? err.message : "No fue posible iniciar sesión."); }
    finally { setLoading(false); }
  }
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:20,background:"#f2f7f4"}}>
    <section style={{width:"100%",maxWidth:420,background:"white",border:"1px solid #e3ece7",borderRadius:20,padding:32,boxShadow:"0 18px 55px #173d2b12"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}><div style={{width:46,height:46,borderRadius:15,background:"#087e61",color:"white",display:"grid",placeItems:"center",fontSize:27}}>+</div><div><b style={{fontSize:19}}>Salud y Vida</b><div style={{fontSize:11,color:"#71817a"}}>SISTEMA DE FARMACIA</div></div></div>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:1.2,color:"#087e61"}}>BIENVENIDO</div><h1 style={{fontSize:25,margin:"8px 0"}}>Iniciar sesión</h1><p style={{fontSize:13,color:"#71817a",marginBottom:24}}>Ingresa con tu cuenta autorizada para continuar.</p>
      <form onSubmit={submit} style={{display:"grid",gap:14}}>
        <label style={{fontSize:12,fontWeight:600}}>Correo electrónico<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@farmacia.com" style={input}/></label>
        <label style={{fontSize:12,fontWeight:600}}>Contraseña<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Tu contraseña" style={input}/></label>
        {error&&<p role="alert" style={{color:"#b42318",fontSize:12,margin:0}}>{error}</p>}
        <button disabled={loading} style={{background:"#087e61",color:"white",border:0,borderRadius:10,padding:13,fontWeight:700,cursor:"pointer",marginTop:6}}>{loading?"Ingresando…":"Entrar al sistema"}</button>
      </form>
      <p style={{fontSize:11,color:"#82918a",lineHeight:1.6,marginTop:22}}>El acceso es privado. Solicita al administrador que cree tu usuario; no hay registro público.</p>
    </section>
  </main>;
}
const input:React.CSSProperties={display:"block",width:"100%",marginTop:7,padding:12,border:"1px solid #dce7e1",borderRadius:9,outlineColor:"#087e61",fontSize:13};