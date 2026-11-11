const stats = [
  { label: "Ventas de hoy", value: "Q 0.00", note: "Sin ventas registradas", icon: "↗" },
  { label: "Productos activos", value: "0", note: "Catálogo por configurar", icon: "▦" },
  { label: "Stock bajo", value: "0", note: "Productos por reabastecer", icon: "⚑" },
  { label: "Vencimientos próximos", value: "0", note: "Lotes por revisar", icon: "◷" },
];
const actions = [
  { icon: "＋", title: "Registrar una venta", desc: "Cobrar productos y emitir ticket" },
  { icon: "▦", title: "Agregar productos", desc: "Crear el catálogo de medicamentos" },
  { icon: "⇩", title: "Registrar una compra", desc: "Ingresar mercadería y lotes" },
];
export default function Home() {
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">+</div><div><strong>Salud y Vida</strong><small>GESTIÓN FARMACÉUTICA</small></div></div>
      <div className="nav-label">PRINCIPAL</div>
      <div className="nav-item active"><span className="nav-icon">▦</span><span>Panel general</span></div>
      <a className="nav-item" href="/ventas" style={{textDecoration:"none"}}><span className="nav-icon">▣</span><span>Punto de venta</span></a>
      <a className="nav-item" href="/productos" style={{textDecoration:"none"}}><span className="nav-icon">◫</span><span>Productos</span></a>
      <a className="nav-item" href="/inventario" style={{textDecoration:"none"}}><span className="nav-icon">▤</span><span>Inventario y lotes</span></a>
      <div className="nav-label">OPERACIONES</div>
      <a className="nav-item" href="/compras" style={{textDecoration:"none"}}><span className="nav-icon">⇩</span><span>Compras</span></a>
      <a className="nav-item" href="/proveedores" style={{textDecoration:"none"}}><span className="nav-icon">♧</span><span>Proveedores</span></a>
      <a className="nav-item" href="/clientes" style={{textDecoration:"none"}}><span className="nav-icon">♙</span><span>Clientes</span></a>
      <a className="nav-item" href="/caja" style={{textDecoration:"none"}}><span className="nav-icon">▤</span><span>Caja</span></a>
      <div className="nav-label">ADMINISTRACIÓN</div>
      <div className="nav-item"><span className="nav-icon">▥</span><span>Reportes</span></div>
      <div className="nav-item"><span className="nav-icon">⚙</span><span>Configuración</span></div>
      <div className="sidebar-bottom">Salud y Vida POS<br/>Versión inicial · Guatemala</div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Salud y Vida <span style={{margin:"0 8px",color:"#bdc9c2"}}>/</span> <b>Panel general</b></div><div className="user"><a href="/login" style={{color:"#087e61",textDecoration:"none",fontSize:12}}>Acceso al sistema ↗</a></div></header>
      <section className="content">
        <div className="heading"><div><div className="eyebrow">RESUMEN DEL NEGOCIO</div><h1>Panel general</h1><p className="sub">Bienvenido al centro de operaciones de tu farmacia.</p></div><div className="date-pill">◷ &nbsp; Operación en quetzales · GTQ</div></div>
        <div className="stats">{stats.map(s=><div className="card" key={s.label}><div className="stat-top"><span>{s.label}</span><span className="stat-icon">{s.icon}</span></div><div className="stat-value">{s.value}</div><div className="stat-note">{s.note}</div></div>)}</div>
        <div className="panel-grid">
          <div className="card"><h2 className="panel-title">Actividad de ventas</h2><p className="panel-sub">Resumen de ingresos recientes</p><div className="empty"><div className="empty-mark">⌁</div>Cuando registres ventas, aquí aparecerá tu actividad.<br/>Los datos se mostrarán en quetzales (Q).</div></div>
          <div className="card"><h2 className="panel-title">Accesos rápidos</h2><p className="panel-sub">Tareas frecuentes de tu farmacia</p><div className="action-list">{actions.map(a=><a className="action" key={a.title} href={a.title.includes("venta")?"/ventas":a.title.includes("compra")?"/compras":"/productos"} style={{textDecoration:"none",color:"inherit"}}><div className="action-icon">{a.icon}</div><div><b>{a.title}</b><small>{a.desc}</small></div></a>)}</div></div>
        </div>
        <div style={{marginTop:18,display:"flex",justifyContent:"flex-end"}}><span className="status">● &nbsp; Modo de configuración</span></div>
      </section>
    </main>
  </div>;
}