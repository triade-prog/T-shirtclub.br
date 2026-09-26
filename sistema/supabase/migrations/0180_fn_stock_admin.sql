-- 0180 · Ajuste administrativo de estoque (seção 05)
-- Passa pelo mesmo lock da reserva (o produto travado) e nunca deixa o total abaixo do que
-- já está reservado ou vendido. Sempre com motivo, em stock_movements e na auditoria.

create function adjust_stock(
  p_product_id uuid,
  p_delta      integer,
  p_reason     text,
  p_admin_id   uuid,
  p_kind       stock_movement_kind default 'AJUSTE'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  p products;
  v_motivo text := btrim(coalesce(p_reason, ''));
begin
  if p_kind not in ('ENTRADA', 'AJUSTE') then
    raise exception 'Ajuste manual só como ENTRADA ou AJUSTE' using errcode = 'TS120';
  end if;
  if p_delta is null or p_delta = 0 or (p_kind = 'ENTRADA' and p_delta < 0) then
    raise exception 'Quantidade do ajuste inválida' using errcode = 'TS120';
  end if;
  if length(v_motivo) not between 3 and 200 then
    raise exception 'O ajuste precisa de um motivo (3 a 200 caracteres)' using errcode = 'TS121';
  end if;
  if not admin_is_active(p_admin_id) then
    raise exception 'Administrador inativo' using errcode = 'TS122';
  end if;

  select * into p from products where id = p_product_id for update;
  if not found then
    raise exception 'Produto não encontrado' using errcode = 'TS123';
  end if;
  if p.qty_total + p_delta < p.qty_reserved + p.qty_sold then
    raise exception 'O estoque não pode ficar abaixo do reservado + vendido (%)', p.qty_reserved + p.qty_sold
      using errcode = 'TS124';
  end if;

  update products set qty_total = qty_total + p_delta where id = p_product_id;
  insert into stock_movements (product_id, kind, qty, actor_type, actor_id, reason)
  values (p_product_id, p_kind, p_delta, 'ADMIN', p_admin_id, v_motivo);
  perform log_audit('ADMIN', p_admin_id, 'estoque.ajustado', 'product', p_product_id::text, null,
                    jsonb_build_object('tipo', p_kind, 'delta', p_delta,
                                       'antes', p.qty_total, 'depois', p.qty_total + p_delta, 'motivo', v_motivo));
  return p.qty_total + p_delta;
end $$;
