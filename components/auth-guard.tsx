"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
const CASHIER_PATHS=["/ventas","/caja","/ventas/historial"];
export default function AuthGuard({children}:{children:React.ReactNode}){
 const pathname=usePathname();const router=useRouter();const [authorized,setAuthorized]=useState(false);const [checked,setChecked]=useState(false);
 useEffect(()=>{let active=true;const sb=getSupabase();
 async function verify(){const {data:{session},error}=await sb.auth.getSession();if(!active)return;if(error||!session){setAuthorized(false);setChecked(true);if(pathname!=="/login")router.replace("/login");return;}
 const {data:profile,error:profileError}=await sb.from("profiles").select("role,active").eq("id",session.user.id).maybeSingle();if(!active)return;
 if(profileError||!profile?.active){setAuthorized(false);setChecked(true);await sb.auth.signOut();router.replace("/login");return;}
 if(profile.role==="cashier"&&!CASHIER_PATHS.includes(pathname)){setAuthorized(false);setChecked(true);router.replace("/ventas");return;}
 if(pathname==="/login"){setAuthorized(false);setChecked(true);router.replace(profile.role==="cashier"?"/ventas":"/");return;}
 setAuthorized(true);setChecked(true);
 }
 setChecked(false);setAuthorized(false);verify().catch(()=>{if(!active)return;setAuthorized(false);setChecked(true);router.replace("/login");});
 const {data:{subscription}}=sb.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT"){setAuthorized(false);setChecked(true);router.replace("/login");}});
 return()=>{active=false;subscription.unsubscribe();};
 },[pathname,router]);
 if(pathname==="/login"&&checked&&!authorized)return <>{children}</>;
 if(!checked||!authorized){if(pathname==="/login"&&!checked)return <>{children}</>;return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f2f7f4",color:"#087e61",fontFamily:"Arial,sans-serif"}}><div style={{textAlign:"center"}}><div style={{width:42,height:42,margin:"0 auto 14px",border:"4px solid #dcebe3",borderTopColor:"#087e61",borderRadius:"50%",animation:"auth-spin .8s linear infinite"}}/><strong style={{fontSize:15}}>Salud y Vida</strong><p style={{color:"#71817a",fontSize:12,marginTop:7}}>Verificando acceso…</p><style>{`@keyframes auth-spin{to{transform:rotate(360deg)}}`}</style></div></main>;}
 return <>{children}</>;
}
