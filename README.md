# Salud y Vida POS

Sistema web de punto de venta e inventario para farmacia en Guatemala. Moneda: GTQ (Q).

## Módulos
- Panel de operación con ventas, productos, stock bajo y vencimientos.
- Catálogo con categorías, edición de productos y activación/desactivación.
- Punto de venta con búsqueda por nombre/código, carrito, descuentos autorizados, efectivo, tarjeta, transferencia y pago combinado.
- Descuento automático de lotes FEFO (primero vence, primero sale) y bloqueo de lotes vencidos.
- Ajustes de inventario por lote con motivo y bitácora de auditoría.
- Compras y recepción por lote con fecha de vencimiento.
- Clientes y proveedores.
- Caja: apertura, ingresos/egresos, ventas en efectivo y arqueo/cierre.
- Historial de ventas, reimpresión de tickets y devoluciones parciales o totales con autorización.
- Historial de compras y reportes de ventas/utilidad neta de devoluciones, exportables a CSV.
- Perfiles: administrador, encargado, cajero e inventario.

## Stack
Next.js 15, React 19, TypeScript, Supabase Auth/Postgres/RLS, Vercel.

## Variables de entorno
Configurar en Vercel y localmente:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Nunca colocar claves service_role/secret en el navegador ni en GitHub.

## Primer acceso
1. En Supabase > Authentication > Users, crear el usuario del propietario con correo y contraseña.
2. Abrir la aplicación e iniciar sesión con esa cuenta.
3. Entrar a Usuarios y permisos y pulsar “Configurar mi cuenta como primer administrador”. Solo funciona si todavía no existe un administrador activo.
4. Crear las cuentas del personal desde Supabase Authentication > Users > Add user. El trigger crea sus perfiles automáticamente como cajero. El administrador asigna el rol correcto desde Usuarios y permisos.
5. Abrir Caja antes de registrar ventas.
6. Registrar productos, categorías y compras con lote y vencimiento; verificar existencias antes de comenzar a vender.

## Consideraciones antes de operar
- El proyecto está en etapa de puesta en marcha. Antes de cargar inventario real, ejecutar pruebas controladas de compras, lotes, vencimientos, venta y caja.
- FEL/SAT Guatemala no está integrada todavía; debe completarse y validarse con un proveedor autorizado antes de emitir documentos tributarios desde el sistema.
- Respaldar los datos periódicamente. Los planes gratuitos tienen límites de uso y no garantizan operación ilimitada.

## Guía de operación

Consulta [la guía operativa en español](docs/GUIA_OPERATIVA.md) para abrir/cerrar caja, registrar ventas y compras, reimprimir tickets, procesar devoluciones y conocer las limitaciones actuales de FEL.
