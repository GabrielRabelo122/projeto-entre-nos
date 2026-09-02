-- Adiciona coluna scope à tabela category_limits para distinguir limites pessoais e de ambiente
-- scope: 'workspace' (padrão, vale para todos do ambiente) ou 'personal' (apenas o criador)

-- Adiciona a coluna se não existir
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'category_limits'
      and column_name = 'scope'
  ) then
    alter table public.category_limits
    add column scope text not null default 'workspace'
    check (scope in ('personal', 'workspace'));
    
    raise notice 'Coluna scope adicionada à tabela category_limits';
  else
    raise notice 'Coluna scope já existe na tabela category_limits';
  end if;
end $$;

-- Recria a função get_category_limits_with_status para incluir o scope
create or replace function public.get_category_limits_with_status()
returns table (
  id uuid,
  couple_id uuid,
  category_id uuid,
  limit_amount numeric,
  period_type text,
  custom_start_day integer,
  alert_threshold numeric,
  scope text,
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
    cl.id, cl.couple_id, cl.category_id, cl.limit_amount, cl.period_type,
    cl.custom_start_day, cl.alert_threshold, cl.scope, cl.is_active, cl.created_at, cl.updated_at,
    c.name as category_name, c.icon as category_icon,
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
