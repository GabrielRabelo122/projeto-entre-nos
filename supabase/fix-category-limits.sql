-- ═══════════════════════════════════════════════════════════════
-- ─── Sistema de Limites de Gastos por Categoria ───
-- ═══════════════════════════════════════════════════════════════

-- Tabela de limites de gastos por categoria
create table if not exists public.category_limits (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null default public.get_my_couple_id() references public.couples(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  limit_amount numeric(12,2) not null check (limit_amount > 0),
  period_type text not null default 'monthly' check (period_type in ('weekly', 'monthly', 'yearly', 'custom')),
  custom_start_day integer check (custom_start_day >= 1 and custom_start_day <= 31),
  alert_threshold numeric(5,2) not null default 80 check (alert_threshold >= 1 and alert_threshold <= 100),
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (couple_id, category_id, period_type)
);

alter table public.category_limits enable row level security;

-- RLS policies
drop policy if exists "category_limits_all_my_couple" on public.category_limits;
create policy "category_limits_all_my_couple"
on public.category_limits
for all
using (public.is_in_my_couple(couple_id))
with check (public.is_in_my_couple(couple_id));

-- Trigger para updated_at
drop trigger if exists category_limits_touch_updated_at on public.category_limits;
create trigger category_limits_touch_updated_at
before update on public.category_limits
for each row execute function public.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- ─── Função para calcular gasto total por categoria no período ───
-- ═══════════════════════════════════════════════════════════════

create or replace function public.get_category_spending(
  p_category_id uuid,
  p_period_type text default 'monthly',
  p_custom_start_day integer default null
)
returns numeric(12,2)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start_date date;
  v_end_date date;
  v_total numeric(12,2);
  v_today date := current_date;
begin
  -- Calcula o início e fim do período baseado no tipo
  case p_period_type
    when 'weekly' then
      -- Semana começa na segunda-feira
      v_start_date := v_today - (extract(dow from v_today)::integer + 6) % 7;
      v_end_date := v_start_date + 6;
    when 'monthly' then
      v_start_date := date_trunc('month', v_today)::date;
      v_end_date := (v_start_date + interval '1 month - 1 day')::date;
    when 'yearly' then
      v_start_date := date_trunc('year', v_today)::date;
      v_end_date := (v_start_date + interval '1 year - 1 day')::date;
    when 'custom' then
      -- Período customizado: começa no dia X do mês atual
      v_start_date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, coalesce(p_custom_start_day, 1));
      if v_start_date > v_today then
        v_start_date := v_start_date - interval '1 month';
      end if;
      v_end_date := (v_start_date + interval '1 month - 1 day')::date;
    else
      v_start_date := date_trunc('month', v_today)::date;
      v_end_date := (v_start_date + interval '1 month - 1 day')::date;
  end case;

  select coalesce(sum(t.amount), 0)
  into v_total
  from public.transactions t
  where t.category_id = p_category_id
    and t.type = 'expense'
    and t.occurred_on between v_start_date and v_end_date;

  return v_total;
end;
$$;

grant execute on function public.get_category_spending(uuid, text, integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- ─── Função para verificar limites e gerar notificações ───
-- ═══════════════════════════════════════════════════════════════

create or replace function public.check_category_limit_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit record;
  v_spending numeric(12,2);
  v_category_name text;
  v_percentage numeric;
  v_partner record;
  v_owner_name text;
  v_threshold_amount numeric(12,2);
begin
  -- Só verifica despesas
  if new.type <> 'expense' or new.category_id is null then
    return new;
  end if;

  -- Busca o limite ativo para esta categoria
  select * into v_limit
  from public.category_limits
  where category_id = new.category_id
    and couple_id = new.couple_id
    and is_active = true
  limit 1;

  -- Se não tem limite configurado, não faz nada
  if v_limit.id is null then
    return new;
  end if;

  -- Calcula o gasto no período
  v_spending := public.get_category_spending(
    new.category_id,
    v_limit.period_type,
    v_limit.custom_start_day
  );

  -- Busca nome da categoria
  select name into v_category_name from public.categories where id = new.category_id;

  -- Calcula porcentagem
  v_percentage := (v_spending / v_limit.limit_amount) * 100;

  -- Busca nome do responsável
  select full_name into v_owner_name from public.profiles where user_id = new.owner_profile_id;

  -- Notifica se atingiu ou ultrapassou o limite
  if v_percentage >= 100 then
    -- Notifica todos os membros do workspace (exceto quem criou a transação)
    for v_partner in
      select user_id from public.workspace_members wm
      where wm.couple_id = new.couple_id
        and wm.user_id <> new.owner_profile_id
    loop
      insert into public.notifications (
        couple_id, user_id, actor_user_id, kind, title, message, transaction_id
      )
      values (
        new.couple_id,
        v_partner.user_id,
        new.owner_profile_id,
        'category_limit_exceeded',
        'Limite de categoria ultrapassado',
        coalesce(v_owner_name, 'Alguém') || ' registrou "' || new.description || '" na categoria ' || v_category_name || '. O gasto de R$ ' || trim(to_char(v_spending, 'FM999999990.00')) || ' ultrapassou o limite de R$ ' || trim(to_char(v_limit.limit_amount, 'FM999999990.00')) || '.',
        new.id
      )
      on conflict do nothing;
    end loop;

    -- Também notifica quem criou a transação (se não foi o único membro)
    insert into public.notifications (
      couple_id, user_id, actor_user_id, kind, title, message, transaction_id
    )
    values (
      new.couple_id,
      new.owner_profile_id,
      new.owner_profile_id,
      'category_limit_exceeded',
      'Você ultrapassou o limite da categoria',
      'Sua transação "' || new.description || '" na categoria ' || v_category_name || ' fez o gasto mensal ultrapassar o limite de R$ ' || trim(to_char(v_limit.limit_amount, 'FM999999990.00')) || '. Gasto atual: R$ ' || trim(to_char(v_spending, 'FM999999990.00')) || '.',
      new.id
    )
    on conflict do nothing;

  elsif v_percentage >= v_limit.alert_threshold then
    -- Alerta de aproximação do limite
    for v_partner in
      select user_id from public.workspace_members wm
      where wm.couple_id = new.couple_id
        and wm.user_id <> new.owner_profile_id
    loop
      insert into public.notifications (
        couple_id, user_id, actor_user_id, kind, title, message, transaction_id
      )
      values (
        new.couple_id,
        v_partner.user_id,
        new.owner_profile_id,
        'category_limit_warning',
        'Categoria perto do limite',
        'O gasto na categoria ' || v_category_name || ' atingiu ' || trim(to_char(v_percentage, 'FM990.0')) || '% do limite. Gasto atual: R$ ' || trim(to_char(v_spending, 'FM999999990.00')) || ' de R$ ' || trim(to_char(v_limit.limit_amount, 'FM999999990.00')) || '.',
        new.id
      )
      on conflict do nothing;
    end loop;
  end if;

  return new;
end;
$$;

-- Trigger para verificar limites ao inserir transação
drop trigger if exists transactions_check_category_limit on public.transactions;
create trigger transactions_check_category_limit
after insert on public.transactions
for each row execute function public.check_category_limit_notification();

-- ═══════════════════════════════════════════════════════════════
-- ─── Função para buscar limites com status de gasto ───
-- ═══════════════════════════════════════════════════════════════

create or replace function public.get_category_limits_with_status()
returns table (
  id uuid,
  couple_id uuid,
  category_id uuid,
  limit_amount numeric,
  period_type text,
  custom_start_day integer,
  alert_threshold numeric,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  category_name text,
  category_icon text,
  current_spending numeric,
  spending_percentage numeric,
  remaining_amount numeric,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_couple_id uuid := public.get_my_couple_id();
begin
  return query
  select
    cl.id,
    cl.couple_id,
    cl.category_id,
    cl.limit_amount,
    cl.period_type,
    cl.custom_start_day,
    cl.alert_threshold,
    cl.is_active,
    cl.created_at,
    cl.updated_at,
    c.name as category_name,
    c.icon as category_icon,
    public.get_category_spending(cl.category_id, cl.period_type, cl.custom_start_day) as current_spending,
    case
      when cl.limit_amount > 0 then
        (public.get_category_spending(cl.category_id, cl.period_type, cl.custom_start_day) / cl.limit_amount) * 100
      else 0
    end as spending_percentage,
    greatest(cl.limit_amount - public.get_category_spending(cl.category_id, cl.period_type, cl.custom_start_day), 0) as remaining_amount,
    case
      when public.get_category_spending(cl.category_id, cl.period_type, cl.custom_start_day) >= cl.limit_amount then 'exceeded'
      when public.get_category_spending(cl.category_id, cl.period_type, cl.custom_start_day) >= (cl.limit_amount * cl.alert_threshold / 100) then 'warning'
      else 'ok'
    end as status
  from public.category_limits cl
  join public.categories c on c.id = cl.category_id
  where cl.couple_id = v_couple_id
  order by
    case
      when public.get_category_spending(cl.category_id, cl.period_type, cl.custom_start_day) >= cl.limit_amount then 1
      when public.get_category_spending(cl.category_id, cl.period_type, cl.custom_start_day) >= (cl.limit_amount * cl.alert_threshold / 100) then 2
      else 3
    end,
    c.name asc;
end;
$$;

grant execute on function public.get_category_limits_with_status() to authenticated;
