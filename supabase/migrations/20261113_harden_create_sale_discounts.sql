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
