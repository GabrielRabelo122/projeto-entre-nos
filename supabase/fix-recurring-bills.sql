-- ═══════════════════════════════════════════════════════════════
-- Correção: Persistência de pagamentos de contas recorrentes
-- ═══════════════════════════════════════════════════════════════
-- Problema: Instâncias de contas recorrentes são geradas apenas
-- no frontend. Ao marcar como paga, uma nova conta real é criada,
-- o que pode causar duplicação e perda de histórico.
-- 
-- Solução: Criar tabela separada para registrar pagamentos de
-- instâncias recorrentes, mantendo as instâncias virtuais mas
-- persistindo o status de pagamento.
-- ═══════════════════════════════════════════════════════════════

-- ─── Tabela para registrar pagamentos de contas recorrentes ───
create table if not exists public.bill_recurring_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  due_month text not null, -- formato: YYYY-MM
  is_paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (bill_id, due_month)
);

-- Trigger para atualizar updated_at
drop trigger if exists bill_recurring_payments_touch_updated_at on public.bill_recurring_payments;
create trigger bill_recurring_payments_touch_updated_at
before update on public.bill_recurring_payments
for each row execute function public.touch_updated_at();

-- RLS
alter table public.bill_recurring_payments enable row level security;

-- Políticas de RLS
drop policy if exists "bill_recurring_payments_select" on public.bill_recurring_payments;
create policy "bill_recurring_payments_select"
on public.bill_recurring_payments
for select
using (
  exists (
    select 1 from public.bills b
    where b.id = bill_id
    and public.is_in_my_couple(b.couple_id)
  )
);

drop policy if exists "bill_recurring_payments_insert" on public.bill_recurring_payments;
create policy "bill_recurring_payments_insert"
on public.bill_recurring_payments
for insert
with check (
  exists (
    select 1 from public.bills b
    where b.id = bill_id
    and public.is_in_my_couple(b.couple_id)
  )
);

drop policy if exists "bill_recurring_payments_update" on public.bill_recurring_payments;
create policy "bill_recurring_payments_update"
on public.bill_recurring_payments
for update
using (
  exists (
    select 1 from public.bills b
    where b.id = bill_id
    and public.is_in_my_couple(b.couple_id)
  )
)
with check (
  exists (
    select 1 from public.bills b
    where b.id = bill_id
    and public.is_in_my_couple(b.couple_id)
  )
);

drop policy if exists "bill_recurring_payments_delete" on public.bill_recurring_payments;
create policy "bill_recurring_payments_delete"
on public.bill_recurring_payments
for delete
using (
  exists (
    select 1 from public.bills b
    where b.id = bill_id
    and public.is_in_my_couple(b.couple_id)
  )
);

-- ─── Function para buscar pagamentos de contas recorrentes ───
create or replace function public.get_recurring_bill_payments(p_bill_ids uuid[])
returns table (
  bill_id uuid,
  due_month text,
  is_paid boolean,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_bill_ids is null or array_length(p_bill_ids, 1) is null then
    return;
  end if;
  
  return query
  select brp.bill_id, brp.due_month, brp.is_paid, brp.paid_at
  from public.bill_recurring_payments brp
  where brp.bill_id = any(p_bill_ids);
end;
$$;

grant execute on function public.get_recurring_bill_payments(uuid[]) to authenticated;

-- ─── Function para registrar/atualizar pagamento de instância recorrente ───
create or replace function public.upsert_recurring_bill_payment(
  p_bill_id uuid,
  p_due_month text,
  p_is_paid boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bill_recurring_payments (bill_id, due_month, is_paid, paid_at)
  values (
    p_bill_id,
    p_due_month,
    p_is_paid,
    case when p_is_paid then timezone('utc', now()) else null end
  )
  on conflict (bill_id, due_month) do update
  set is_paid = p_is_paid,
      paid_at = case when p_is_paid then timezone('utc', now()) else null end,
      updated_at = timezone('utc', now());
end;
$$;

grant execute on function public.upsert_recurring_bill_payment(uuid, text, boolean) to authenticated;
