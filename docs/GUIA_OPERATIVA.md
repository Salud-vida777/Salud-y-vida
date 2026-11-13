# Guía operativa — Salud y Vida POS

## Antes de operar

1. Ingresa con la cuenta administradora.
2. Crea las categorías y registra los productos con nombre, código de barras/SKU, costo y precio de venta.
3. Registra proveedores.
4. Ingresa las existencias mediante **Compras**, indicando cantidad, lote y fecha de vencimiento. Así se conserva la trazabilidad por lote.
5. Revisa el inventario y los precios antes de abrir la caja.

No cargues medicamentos reales hasta verificar que cada producto, lote, costo, precio y vencimiento estén correctos.

## Flujo diario

### 1. Abrir caja
- Entra en **Caja**.
- Registra el fondo inicial contado.
- Abre una sesión por cada usuario/cajero que atenderá ventas.

### 2. Registrar ventas
- En **Punto de venta**, busca el producto por nombre, SKU o código de barras.
- Agrega las cantidades y selecciona el cliente si corresponde.
- Elige efectivo, tarjeta, transferencia o pago combinado.
- El descuento general solo está disponible para administrador y encargado.
- Confirma la venta e imprime el ticket.

El sistema descuenta existencias de lotes vigentes, priorizando los que vencen primero (FEFO). No permite vender cantidades mayores al stock disponible.

### 3. Reimprimir un ticket
- Abre **Historial y devoluciones**.
- Busca la venta y selecciona la opción de imprimir ticket.

### 4. Devoluciones
- Solo administrador y encargado pueden autorizar devoluciones.
- Selecciona la venta, los artículos y las cantidades.
- Indica el motivo y el método de reembolso.
- Marca reingreso a inventario únicamente si el artículo está en condiciones de volver a venderse. El sistema bloquea el reingreso de lotes vencidos.
- Los reembolsos en efectivo requieren una caja abierta con saldo suficiente.

### 5. Cerrar caja
- Cuenta el efectivo físico.
- En **Caja**, registra el monto contado y cierra la sesión.
- Compara el monto esperado con el contado y revisa cualquier diferencia.

## Roles

- **Administrador:** control completo, usuarios, permisos y descuentos.
- **Encargado:** operaciones, descuentos, devoluciones, reportes y caja.
- **Cajero:** ventas y movimientos de su propia caja.
- **Inventario:** productos, existencias y recepción de compras; no autoriza descuentos ni devoluciones.

Los cambios críticos de ventas, compras, caja, devoluciones y permisos se ejecutan mediante funciones protegidas de la base de datos. Las tablas transaccionales están en modo de solo lectura desde el cliente y tienen RLS habilitado.

## Reportes y control

- Consulta ventas y utilidad estimada en **Reportes**.
- Revisa lotes próximos a vencer y existencias bajas en **Inventario**.
- Realiza ajustes de existencias con un motivo claro y conserva la documentación del ajuste.
- Mantén respaldos periódicos desde las herramientas de Supabase y guarda exportaciones CSV de reportes importantes.

## Límites importantes antes de usarlo comercialmente

- El ticket actual es un comprobante interno; **no es una factura electrónica FEL autorizada por SAT Guatemala**. Hasta integrar un certificador/proveedor FEL autorizado, utiliza el mecanismo fiscal que corresponda a tu negocio. No anuncies estos tickets como facturas fiscales.
- La conexión requiere internet. Si se pierde internet, no registres ventas fuera del sistema para luego asumir que se sincronizarán automáticamente.
- No se han cargado productos, lotes ni ventas ficticias en la base principal. El inventario debe cargarse y verificarse antes de la operación.
- La aplicación se ha desplegado y se han revisado rutas y controles técnicos, pero antes de atender clientes debes hacer una prueba supervisada de apertura/cierre de caja, venta con cada forma de pago, impresión, compra, devolución parcial y devolución total.
- Mantén las credenciales de administrador privadas y crea cuentas individuales para el personal. No compartas una misma cuenta entre cajeros.

## Sitios del proyecto

- Aplicación: https://salud-y-vida-salud-y-vida.vercel.app
- Repositorio: https://github.com/Salud-vida777/Salud-y-vida
- Proyecto Supabase: https://supabase.com/dashboard/project/xeghycdgjtawtfxomyat

La integración FEL, pruebas de aceptación completas y cualquier respaldo automatizado son fases separadas. No se han activado servicios de pago para este proyecto.
