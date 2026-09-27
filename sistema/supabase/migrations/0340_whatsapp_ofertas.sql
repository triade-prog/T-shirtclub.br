-- 0340 · Resposta a "ofertas" no WhatsApp (27/09)
-- Quem manda "oferta", "ofertas", "promoção" ou "promoções" recebe as promoções vigentes e
-- os cupons cadastrados no painel que ainda podem ser usados. Mesmo formato do motor de
-- preço (promotion_json); o texto diz que os descontos não se somam.

create function whatsapp_offers() returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(promotion_json(pr)
                            order by case pr.type when 'COMPRE_MAIS' then 1 when 'DESCONTO_PRODUTO' then 2 else 3 end, pr.starts_at, pr.id), '[]')
    from promotions pr
   where promotion_state(pr.starts_at, pr.ends_at, pr.ended_at) = 'ATIVA'
     and (pr.budget_cents is null or pr.budget_used_cents < pr.budget_cents)
     and (pr.type <> 'CUPOM' or exists (select 1 from coupons c where c.promotion_id = pr.id and c.used_quantity < c.total_quantity))
$$;

call lock_down_public();
