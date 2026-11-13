-- Hardens the sale RPC so cashier accounts cannot apply hidden per-line discounts.
-- This migration was also applied to the connected Supabase project.
CREATE OR REPLACE FUNCTION public.create_sale(
  p_items jsonb,
  p_payments jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_discount numeric DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_sale_id uuid;
  v_sale_number bigint;
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
  v_change numeric(12,2) := 0;
  v_cash numeric(12,2) := 0;
  v_item jsonb;
  v_payment jsonb;
  v_product record;
  v_batch record;
  v_qty numeric;
  v_remaining numeric;
  v_price numeric;
  v_line_discount numeric;
  v_sale_discount numeric(12,2) := coalesce(p_discount, 0);
  v_method text;
  v_session uuid;
  v_cash_net numeric(12,2);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_user AND active = true;

  IF coalesce(v_role, '') NOT IN ('admin', 'manager', 'cashier') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar ventas.';
  END IF;

  IF coalesce(jsonb_typeof(p_items), '') <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto.';
  END IF;
  IF coalesce(jsonb_typeof(p_payments), '') <> 'array' OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Registra al menos un pago.';
  END IF;
  IF v_sale_discount < 0 THEN RAISE EXCEPTION 'Descuento inválido.'; END IF;
  IF v_sale_discount > 0 AND v_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Solo un administrador o encargado puede autorizar descuentos.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_line_discount := coalesce((v_item->>'discount')::numeric, 0);

    IF v_qty IS NULL OR v_price IS NULL OR v_qty <= 0 OR v_price < 0
       OR v_line_discount < 0 OR v_line_discount > v_qty * v_price THEN
      RAISE EXCEPTION 'Cantidad, precio o descuento inválido.';
    END IF;
    IF v_line_discount > 0 AND v_role NOT IN ('admin', 'manager') THEN
      RAISE EXCEPTION 'Solo un administrador o encargado puede autorizar descuentos por producto.';
    END IF;

    SELECT id, name, cost_price, sale_price, active INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
    FOR SHARE;

    IF NOT FOUND OR NOT v_product.active THEN RAISE EXCEPTION 'Producto no disponible.'; END IF;
    IF v_price <> v_product.sale_price THEN
      RAISE EXCEPTION 'El precio del producto cambió. Actualiza el carrito.';
    END IF;
    v_subtotal := v_subtotal + (v_qty * v_price - v_line_discount);
  END LOOP;

  IF v_sale_discount > v_subtotal THEN RAISE EXCEPTION 'El descuento supera el subtotal.'; END IF;
  v_total := round(v_subtotal - v_sale_discount, 2);

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    v_method := v_payment->>'method';
    IF v_method NOT IN ('cash', 'card', 'transfer') THEN RAISE EXCEPTION 'Método de pago inválido.'; END IF;
    IF coalesce((v_payment->>'amount')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'Monto de pago inválido.'; END IF;
    v_paid := v_paid + (v_payment->>'amount')::numeric;
    IF v_method = 'cash' THEN v_cash := v_cash + (v_payment->>'amount')::numeric; END IF;
  END LOOP;

  IF v_paid < v_total THEN RAISE EXCEPTION 'El pago recibido es menor al total.'; END IF;
  v_change := v_paid - v_total;
  IF v_change > v_cash THEN RAISE EXCEPTION 'El cambio supera el efectivo recibido.'; END IF;

  SELECT id INTO v_session
  FROM public.cash_sessions
  WHERE opened_by = v_user AND status = 'open'
  FOR UPDATE;
  IF v_session IS NULL THEN RAISE EXCEPTION 'Abre tu caja antes de registrar ventas.'; END IF;

  INSERT INTO public.sales(customer_id,status,subtotal,discount,tax,total,amount_paid,change_due,notes,sold_by)
  VALUES(p_customer_id,'completed',v_subtotal,v_sale_discount,0,v_total,v_paid,v_change,p_notes,v_user)
  RETURNING id,sale_number INTO v_sale_id,v_sale_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_line_discount := coalesce((v_item->>'discount')::numeric, 0);
    v_remaining := v_qty;

    FOR v_batch IN
      SELECT id,quantity,cost_price
      FROM public.product_batches
      WHERE product_id=(v_item->>'product_id')::uuid
        AND quantity>0
        AND (expiration_date IS NULL OR expiration_date>=current_date)
      ORDER BY expiration_date NULLS LAST,created_at
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining<=0;
      v_qty := least(v_remaining,v_batch.quantity);
      UPDATE public.product_batches SET quantity=quantity-v_qty WHERE id=v_batch.id;
      INSERT INTO public.sale_items(sale_id,product_id,batch_id,quantity,unit_price,unit_cost,discount,line_total)
      VALUES(
        v_sale_id,(v_item->>'product_id')::uuid,v_batch.id,v_qty,v_price,v_batch.cost_price,
        round(v_line_discount*(v_qty/(v_item->>'quantity')::numeric),2),
        round(v_qty*v_price-v_line_discount*(v_qty/(v_item->>'quantity')::numeric),2)
      );
      v_remaining := v_remaining-v_qty;
    END LOOP;
    IF v_remaining>0 THEN
      RAISE EXCEPTION 'Existencias insuficientes o sin lotes vigentes para uno de los productos.';
    END IF;
  END LOOP;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.sale_payments(sale_id,method,amount,reference)
    VALUES(v_sale_id,v_payment->>'method',(v_payment->>'amount')::numeric,nullif(v_payment->>'reference',''));
  END LOOP;

  v_cash_net := v_cash-v_change;
  IF v_cash_net>0 THEN
    INSERT INTO public.cash_movements(session_id,type,amount,reason,created_by)
    VALUES(v_session,'in',v_cash_net,'Venta #'||v_sale_number,v_user);
  END IF;

  INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details)
  VALUES(v_user,'create','sale',v_sale_id::text,jsonb_build_object('sale_number',v_sale_number,'total',v_total));

  RETURN jsonb_build_object(
    'sale_id',v_sale_id,'sale_number',v_sale_number,'subtotal',v_subtotal,
    'discount',v_sale_discount,'total',v_total,'amount_paid',v_paid,'change_due',v_change
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_sale(jsonb,jsonb,uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(jsonb,jsonb,uuid,numeric,text) TO authenticated;

-- Keep all expiry validation aligned with the pharmacy's Guatemala business date.
ALTER FUNCTION public.create_sale(jsonb,jsonb,uuid,numeric,text) SET timezone TO 'America/Guatemala';
ALTER FUNCTION public.create_sale_return(uuid,jsonb,jsonb,text) SET timezone TO 'America/Guatemala';
ALTER FUNCTION public.receive_purchase(uuid,text,jsonb,numeric,text) SET timezone TO 'America/Guatemala';

-- Transactional tables are read-only through the Data API; writes go through guarded RPCs.
REVOKE ALL ON TABLE
  public.profiles,
  public.product_batches,
  public.sales,
  public.sale_items,
  public.sale_payments,
  public.purchases,
  public.purchase_items,
  public.cash_sessions,
  public.cash_movements,
  public.audit_logs,
  public.sale_returns,
  public.sale_return_items,
  public.sale_return_payments
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.profiles,
  public.product_batches,
  public.sales,
  public.sale_items,
  public.sale_payments,
  public.purchases,
  public.purchase_items,
  public.cash_sessions,
  public.cash_movements,
  public.audit_logs,
  public.sale_returns,
  public.sale_return_items,
  public.sale_return_payments
TO authenticated;

-- Allocate purchase discounts into inventory cost and maintain weighted lot costs.
CREATE OR REPLACE FUNCTION public.receive_purchase(
  p_supplier_id uuid,
  p_invoice_number text,
  p_items jsonb,
  p_discount numeric DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
SET timezone TO 'America/Guatemala'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_purchase uuid;
  v_item jsonb;
  v_product uuid;
  v_qty numeric;
  v_cost numeric;
  v_net_cost numeric(12,2);
  v_total numeric(12,2) := 0;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := coalesce(p_discount, 0);
  v_line numeric(12,2);
  v_line_discount numeric(12,2);
  v_allocated_discount numeric(12,2) := 0;
  v_item_count integer;
  v_item_index integer := 0;
  v_lot text;
  v_exp date;
  v_batch uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user AND active = true;
  IF coalesce(v_role, '') NOT IN ('admin', 'manager', 'inventory') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar compras.';
  END IF;

  IF coalesce(jsonb_typeof(p_items), '') <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto.';
  END IF;
  IF v_discount < 0 THEN RAISE EXCEPTION 'Descuento inválido.'; END IF;
  IF v_discount > 0 AND v_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Solo administrador o encargado puede autorizar descuentos.';
  END IF;

  v_item_count := jsonb_array_length(p_items);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    v_exp := nullif(v_item->>'expiration_date', '')::date;

    IF v_qty IS NULL OR v_cost IS NULL OR v_qty <= 0 OR v_cost < 0
       OR nullif(v_item->>'lot_number', '') IS NULL THEN
      RAISE EXCEPTION 'Cantidad, costo y lote son obligatorios.';
    END IF;
    IF v_exp IS NOT NULL AND v_exp < current_date THEN
      RAISE EXCEPTION 'No se puede recibir un lote vencido.';
    END IF;

    PERFORM 1 FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no válido o inactivo.'; END IF;

    v_subtotal := v_subtotal + round(v_qty * v_cost, 2);
  END LOOP;

  IF v_discount > v_subtotal THEN RAISE EXCEPTION 'El descuento supera el subtotal.'; END IF;
  v_total := round(v_subtotal - v_discount, 2);

  INSERT INTO public.purchases(
    supplier_id, invoice_number, status, subtotal, discount, total, notes, created_by
  )
  VALUES(
    p_supplier_id, nullif(p_invoice_number, ''), 'received',
    v_subtotal, v_discount, v_total, p_notes, v_user
  )
  RETURNING id INTO v_purchase;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_index := v_item_index + 1;
    v_product := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    v_lot := v_item->>'lot_number';
    v_exp := nullif(v_item->>'expiration_date', '')::date;
    v_line := round(v_qty * v_cost, 2);

    IF v_item_index = v_item_count THEN
      v_line_discount := greatest(v_discount - v_allocated_discount, 0);
    ELSIF v_subtotal > 0 THEN
      v_line_discount := least(greatest(v_discount - v_allocated_discount, 0), round(v_discount * v_line / v_subtotal, 2));
      v_allocated_discount := v_allocated_discount + v_line_discount;
    ELSE
      v_line_discount := 0;
    END IF;

    v_net_cost := CASE WHEN v_qty > 0
      THEN round((v_line - v_line_discount) / v_qty, 2)
      ELSE 0
    END;

    v_batch := NULL;
    INSERT INTO public.product_batches(
      product_id, lot_number, expiration_date, quantity, cost_price
    )
    VALUES(v_product, v_lot, v_exp, v_qty, v_net_cost)
    ON CONFLICT(product_id, lot_number) DO UPDATE
    SET
      quantity = public.product_batches.quantity + EXCLUDED.quantity,
      cost_price = CASE
        WHEN public.product_batches.quantity + EXCLUDED.quantity > 0
        THEN round(
          (public.product_batches.quantity * public.product_batches.cost_price
            + EXCLUDED.quantity * EXCLUDED.cost_price)
          / (public.product_batches.quantity + EXCLUDED.quantity), 2
        )
        ELSE EXCLUDED.cost_price
      END
    WHERE public.product_batches.expiration_date IS NOT DISTINCT FROM EXCLUDED.expiration_date
    RETURNING id INTO v_batch;

    IF v_batch IS NULL THEN
      RAISE EXCEPTION 'El lote % ya existe con una fecha de vencimiento diferente.', v_lot;
    END IF;

    INSERT INTO public.purchase_items(
      purchase_id, product_id, batch_id, quantity, unit_cost, line_total
    )
    VALUES(v_purchase, v_product, v_batch, v_qty, v_cost, v_line);

    UPDATE public.products
    SET cost_price = coalesce(
      (
        SELECT round(sum(quantity * cost_price) / nullif(sum(quantity), 0), 2)
        FROM public.product_batches
        WHERE product_id = v_product AND quantity > 0
      ),
      v_net_cost
    )
    WHERE id = v_product;
  END LOOP;

  INSERT INTO public.audit_logs(user_id, action, entity, entity_id, details)
  VALUES(
    v_user, 'receive', 'purchase', v_purchase::text,
    jsonb_build_object('total', v_total, 'items', v_item_count, 'discount', v_discount)
  );

  RETURN jsonb_build_object('purchase_id', v_purchase, 'total', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.receive_purchase(uuid,text,jsonb,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase(uuid,text,jsonb,numeric,text) TO authenticated;

-- Serialize cash movements against cash closing to prevent a movement racing a close.
CREATE OR REPLACE FUNCTION public.add_cash_movement(
  p_session_id uuid,
  p_type text,
  p_amount numeric,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_uid AND active = true;

  IF coalesce(v_role, '') NOT IN ('admin', 'manager', 'cashier') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar movimientos.';
  END IF;

  IF p_type NOT IN ('in', 'out') OR p_amount IS NULL OR p_amount <= 0
     OR length(trim(coalesce(p_reason, ''))) < 2 THEN
    RAISE EXCEPTION 'Datos de movimiento inválidos.';
  END IF;

  PERFORM 1
  FROM public.cash_sessions
  WHERE id = p_session_id
    AND status = 'open'
    AND (opened_by = v_uid OR v_role IN ('admin', 'manager'))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja cerrada o sin autorización.';
  END IF;

  INSERT INTO public.cash_movements(session_id, type, amount, reason, created_by)
  VALUES(p_session_id, p_type, p_amount, trim(p_reason), v_uid);

  INSERT INTO public.audit_logs(user_id, action, entity, entity_id, details)
  VALUES(
    v_uid, 'cash_movement', 'cash_session', p_session_id::text,
    jsonb_build_object('type', p_type, 'amount', p_amount, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_cash_movement(uuid,text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_cash_movement(uuid,text,numeric,text) TO authenticated;

-- Split management policies from read policies and keep all public tables inaccessible to anon.
-- Remove redundant ALL policies so SELECT is evaluated only by the read policy.
DROP POLICY IF EXISTS categories_manage ON public.categories;
CREATE POLICY categories_insert_manage ON public.categories FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('admin','manager','inventory'));
CREATE POLICY categories_update_manage ON public.categories FOR UPDATE TO authenticated
  USING (public.current_app_role() IN ('admin','manager','inventory'))
  WITH CHECK (public.current_app_role() IN ('admin','manager','inventory'));
CREATE POLICY categories_delete_manage ON public.categories FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('admin','manager','inventory'));

DROP POLICY IF EXISTS customers_manage ON public.customers;
CREATE POLICY customers_insert_manage ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('admin','manager','cashier'));
CREATE POLICY customers_update_manage ON public.customers FOR UPDATE TO authenticated
  USING (public.current_app_role() IN ('admin','manager','cashier'))
  WITH CHECK (public.current_app_role() IN ('admin','manager','cashier'));
CREATE POLICY customers_delete_manage ON public.customers FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('admin','manager','cashier'));

DROP POLICY IF EXISTS products_manage ON public.products;
CREATE POLICY products_insert_manage ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('admin','manager','inventory'));
CREATE POLICY products_update_manage ON public.products FOR UPDATE TO authenticated
  USING (public.current_app_role() IN ('admin','manager','inventory'))
  WITH CHECK (public.current_app_role() IN ('admin','manager','inventory'));
CREATE POLICY products_delete_manage ON public.products FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('admin','manager','inventory'));

DROP POLICY IF EXISTS suppliers_manage ON public.suppliers;
CREATE POLICY suppliers_insert_manage ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('admin','manager','inventory'));
CREATE POLICY suppliers_update_manage ON public.suppliers FOR UPDATE TO authenticated
  USING (public.current_app_role() IN ('admin','manager','inventory'))
  WITH CHECK (public.current_app_role() IN ('admin','manager','inventory'));
CREATE POLICY suppliers_delete_manage ON public.suppliers FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('admin','manager','inventory'));

DROP POLICY IF EXISTS batches_manage ON public.product_batches;
DROP POLICY IF EXISTS purchase_items_manage ON public.purchase_items;
DROP POLICY IF EXISTS purchases_manage ON public.purchases;

DROP POLICY IF EXISTS profiles_read_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_read_self ON public.profiles;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated
  USING (public.current_app_role() IN ('admin','manager') OR id = auth.uid());

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON TABLE public.inventory_adjustments FROM authenticated;
GRANT SELECT ON TABLE public.inventory_adjustments TO authenticated;
