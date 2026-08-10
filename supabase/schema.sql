create extension if not exists pgcrypto;

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '');
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  split_rule text not null default 'equal' check (split_rule in ('equal', 'proportional')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.couples add column if not exists name text;
alter table public.couples add column if not exists kind text;

update public.couples
set kind = coalesce(kind, 'couple'),
    name = coalesce(name, 'Meu ambiente');

alter table public.couples alter column kind set default 'couple';
alter table public.couples alter column kind set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'couples_kind_check'
  ) then
    alter table public.couples
      add constraint couples_kind_check
      check (kind in ('couple', 'family', 'group', 'company'));
  end if;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete set null,
  active_couple_id uuid references public.couples(id) on delete set null,
  full_name text not null,
  avatar_url text,
  financial_goal text,
  monthly_income numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles add column if not exists active_couple_id uuid references public.couples(id) on delete set null;
alter table public.profiles add column if not exists email text;

update public.profiles
set active_couple_id = coalesce(active_couple_id, couple_id)
where couple_id is not null;

create table if not exists public.workspace_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (couple_id, user_id)
);

insert into public.workspace_members (couple_id, user_id, role)
select
  p.couple_id,
  p.user_id,
  case when c.created_by = p.user_id then 'owner' else 'member' end as role
from public.profiles p
join public.couples c on c.id = p.couple_id
where p.couple_id is not null
on conflict (couple_id, user_id) do nothing;

create or replace function public.list_my_workspaces()
returns table (
  id uuid,
  name text,
  kind text,
  role text,
  is_active boolean,
  invite_code text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.kind,
    wm.role,
    c.id = coalesce(p.active_couple_id, p.couple_id) as is_active,
    (
      select ci.invite_code
      from public.couple_invites ci
      where ci.couple_id = c.id
        and ci.status = 'pending'
      order by ci.expires_at desc nulls last, ci.created_at desc
      limit 1
    ) as invite_code
  from public.workspace_members wm
  join public.couples c on c.id = wm.couple_id
  join public.profiles p on p.user_id = auth.uid()
  where wm.user_id = auth.uid()
  order by is_active desc, c.created_at asc;
$$;

create or replace function public.set_active_workspace(p_couple_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_couple_id is null then
    raise exception 'Ambiente inválido.';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = v_user_id
      and wm.couple_id = p_couple_id
  ) then
    raise exception 'Você não participa deste ambiente.';
  end if;

  update public.profiles
  set active_couple_id = p_couple_id
  where user_id = v_user_id;

  return p_couple_id;
end;
$$;

create or replace function public.leave_workspace(p_couple_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_couple_id uuid;
  v_fallback_couple_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_target_couple_id := coalesce(p_couple_id, public.get_my_couple_id());

  if v_target_couple_id is null then
    raise exception 'Nenhum ambiente selecionado.';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = v_user_id
      and wm.couple_id = v_target_couple_id
  ) then
    raise exception 'Você não participa deste ambiente.';
  end if;

  delete from public.workspace_members
  where couple_id = v_target_couple_id
    and user_id = v_user_id;

  select wm.couple_id
  into v_fallback_couple_id
  from public.workspace_members wm
  where wm.user_id = v_user_id
  order by wm.created_at asc
  limit 1;

  update public.profiles
  set couple_id = case when couple_id = v_target_couple_id then v_fallback_couple_id else couple_id end,
      active_couple_id = case when active_couple_id = v_target_couple_id then v_fallback_couple_id else active_couple_id end
  where user_id = v_user_id;

  return v_target_couple_id;
end;
$$;

create or replace function public.get_my_couple_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
begin
  select coalesce(p.active_couple_id, p.couple_id)
  into v_couple_id
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1;

  return v_couple_id;
end;
$$;

create or replace function public.is_in_my_couple(p_couple_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return p_couple_id is not null and (
    p_couple_id = public.get_my_couple_id()
    or exists (
      select 1
      from public.workspace_members wm
      where wm.couple_id = p_couple_id
        and wm.user_id = auth.uid()
    )
  );
end;
$$;

create table if not exists public.couple_invites (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  invited_email text,
  invite_code text not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  accepted_at timestamptz,
  expires_at timestamptz not null default timezone('utc', now()) + interval '7 days',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null default public.get_my_couple_id() references public.couples(id) on delete cascade,
  name text not null,
  icon text not null default '💸',
  kind text not null check (kind in ('expense', 'income', 'reserve')),
  is_default boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (couple_id, name)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null default public.get_my_couple_id() references public.couples(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  current_amount numeric(12,2) not null default 0,
  auto_allocate boolean not null default true,
  target_date date,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.goals add column if not exists scope text not null default 'individual';

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null default public.get_my_couple_id() references public.couples(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(user_id) on delete restrict,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (type in ('income', 'expense')),
  category_id uuid references public.categories(id) on delete set null,
  occurred_on date not null default current_date,
  split_scope text not null default 'both' check (split_scope in ('self', 'both')),
  goal_id uuid references public.goals(id) on delete set null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null default public.get_my_couple_id() references public.couples(id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  owner_profile_id uuid references public.profiles(user_id) on delete set null,
  split_scope text not null default 'both' check (split_scope in ('self', 'both')),
  is_paid boolean not null default false,
  paid_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.bills add column if not exists is_paid boolean not null default false;
alter table public.bills add column if not exists paid_at timestamptz;
alter table public.bills add column if not exists split_scope text not null default 'both' check (split_scope in ('self', 'both'));
alter table public.bills add column if not exists is_recurring boolean not null default false;
alter table public.bills add column if not exists recurrence_day integer check (recurrence_day >= 1 and recurrence_day <= 31);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null default public.get_my_couple_id() references public.couples(id) on delete cascade,
  title text not null,
  kind text not null default 'event' check (kind in ('event', 'task', 'reminder')),
  scope text not null default 'individual' check (scope in ('individual', 'group')),
  due_date date,
  owner_profile_id uuid references public.profiles(user_id) on delete set null,
  note text,
  is_done boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null default public.get_my_couple_id() references public.couples(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active' check (status in ('idea', 'active', 'done')),
  target_date date,
  budget_target numeric(12,2),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null default public.get_my_couple_id() references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  kind text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  transaction_id uuid references public.transactions(id) on delete cascade,
  bill_id uuid references public.bills(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists notifications_unique_due_bill
  on public.notifications (user_id, bill_id, kind)
  where kind = 'bill_due_soon';

create or replace function public.bootstrap_default_categories(p_couple_id uuid, p_created_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (couple_id, name, icon, kind, is_default, created_by)
  values
    (p_couple_id, 'Moradia', '🏠', 'expense', true, p_created_by),
    (p_couple_id, 'Alimentação', '🍔', 'expense', true, p_created_by),
    (p_couple_id, 'Transporte', '🚗', 'expense', true, p_created_by),
    (p_couple_id, 'Saúde', '💊', 'expense', true, p_created_by),
    (p_couple_id, 'Educação', '🎓', 'expense', true, p_created_by),
    (p_couple_id, 'Lazer', '🎬', 'expense', true, p_created_by),
    (p_couple_id, 'Vestuário', '👕', 'expense', true, p_created_by),
    (p_couple_id, 'Pets', '🐶', 'expense', true, p_created_by),
    (p_couple_id, 'Filhos', '👶', 'expense', true, p_created_by),
    (p_couple_id, 'Assinaturas', '📱', 'expense', true, p_created_by),
    (p_couple_id, 'Presentes', '🎁', 'expense', true, p_created_by),
    (p_couple_id, 'Viagem', '✈️', 'expense', true, p_created_by),
    (p_couple_id, 'Manutenção', '🔧', 'expense', true, p_created_by),
    (p_couple_id, 'Outras', '📦', 'expense', true, p_created_by),
    (p_couple_id, 'Reserva', '🛡️', 'reserve', true, p_created_by),
    (p_couple_id, 'Salário', '💼', 'income', true, p_created_by),
    (p_couple_id, 'Freelance', '💻', 'income', true, p_created_by),
    (p_couple_id, 'Investimentos', '📈', 'income', true, p_created_by),
    (p_couple_id, 'Extra', '✨', 'income', true, p_created_by)
  on conflict (couple_id, name) do nothing;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, email, financial_goal)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'Usuário'),
    new.email,
    new.raw_user_meta_data ->> 'financial_goal'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.setup_my_workspace(
  p_kind text default 'couple',
  p_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_couple_id uuid;
  v_name text;
  v_invite_code text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if coalesce(trim(p_kind), '') not in ('couple', 'family', 'group', 'company') then
    raise exception 'Tipo de ambiente inválido.';
  end if;

  v_name := nullif(trim(p_name), '');
  v_name := coalesce(
    v_name,
    case p_kind
      when 'couple' then 'Nosso espaço'
      when 'family' then 'Nossa família'
      when 'group' then 'Nosso grupo'
      else 'Nossa empresa'
    end
  );

  -- Sempre cria um novo couple (novo ambiente), independente de o usuário já ter um
  v_couple_id := gen_random_uuid();

  insert into public.couples (id, created_by, name, kind)
  values (v_couple_id, v_user_id, v_name, p_kind);

  -- Garante que workspace_members tenha entrada para o novo ambiente
  insert into public.workspace_members (couple_id, user_id, role)
  values (v_couple_id, v_user_id, 'owner')
  on conflict (couple_id, user_id) do nothing;

  -- Categorias padrão do novo ambiente
  perform public.bootstrap_default_categories(v_couple_id, v_user_id);

  -- Gera automaticamente um código de convite fixo e único para o ambiente
  v_invite_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  insert into public.couple_invites (couple_id, invited_email, invited_by, invite_code, expires_at)
  values (v_couple_id, null, v_user_id, v_invite_code, timezone('utc', now()) + interval '36500 days');

  -- couple_id mantém o primeiro vínculo (fallback), active_couple_id aponta para o novo
  update public.profiles
  set couple_id = coalesce(couple_id, v_couple_id),
      active_couple_id = v_couple_id
  where user_id = v_user_id;

  return v_couple_id;
end;
$$;

create or replace function public.create_couple_invite(p_invited_email text default null)
returns table (couple_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_couple_id uuid;
  v_invite_code text;
  v_existing_code text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select public.get_my_couple_id() into v_couple_id;

  if v_couple_id is null then
    insert into public.couples (created_by, name, kind)
    values (v_user_id, 'Nosso espaço', 'couple')
    returning id into v_couple_id;

    insert into public.workspace_members (couple_id, user_id, role)
    values (v_couple_id, v_user_id, 'owner')
    on conflict (couple_id, user_id) do nothing;

    update public.profiles
    set couple_id = v_couple_id,
        active_couple_id = v_couple_id
    where user_id = v_user_id;

    perform public.bootstrap_default_categories(v_couple_id, v_user_id);
  end if;

  -- Verifica se já existe um convite pendente para este ambiente.
  -- Cada ambiente deve ter apenas um convite único e fixo.
  select ci.invite_code into v_existing_code
  from public.couple_invites ci
  where ci.couple_id = v_couple_id
    and ci.status = 'pending'
  order by ci.expires_at desc nulls last, ci.created_at asc
  limit 1;

  if v_existing_code is not null then
    -- Reutiliza o convite existente em vez de criar um novo
    v_invite_code := v_existing_code;
  else
    -- Só gera novo código se não houver nenhum convite pendente/válido
    v_invite_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

    insert into public.couple_invites (couple_id, invited_email, invited_by, invite_code, expires_at)
    values (v_couple_id, nullif(trim(p_invited_email), ''), v_user_id, v_invite_code, timezone('utc', now()) + interval '36500 days');
  end if;

  return query
  select v_couple_id, v_invite_code;
end;
$$;

create or replace function public.accept_couple_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_couple_id uuid;
  v_invite public.couple_invites%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select couple_id into v_profile_couple_id
  from public.profiles
  where user_id = v_user_id;

  select *
  into v_invite
  from public.couple_invites
  where upper(invite_code) = upper(trim(p_invite_code))
    and status = 'pending'
    and expires_at >= timezone('utc', now())
  order by created_at desc
  limit 1;

  if v_invite.id is null then
    raise exception 'Convite inválido ou expirado.';
  end if;

  -- Se o usuário já tem couple_id mas está entrando em um novo ambiente,
  -- atualizamos couple_id apenas se ele não tiver um (primeiro vínculo).
  -- active_couple_id sempre aponta para o ambiente recém-aceito.
  update public.profiles
  set couple_id = coalesce(couple_id, v_invite.couple_id),
      active_couple_id = v_invite.couple_id
  where user_id = v_user_id;

  -- Garante que o usuário entre no workspace_members mesmo que já tenha couple_id de outro ambiente
  insert into public.workspace_members (couple_id, user_id, role)
  values (v_invite.couple_id, v_user_id, 'member')
  on conflict (couple_id, user_id) do nothing;

  update public.couple_invites
  set status = 'accepted',
      accepted_by = v_user_id,
      accepted_at = timezone('utc', now())
  where id = v_invite.id;

  insert into public.notifications (couple_id, user_id, actor_user_id, kind, title, message)
  values (
    v_invite.couple_id,
    v_invite.invited_by,
    v_user_id,
    'partner_joined',
    'Parceiro conectado',
    'O convite para o ambiente foi aceito com sucesso.'
  );

  return v_invite.couple_id;
end;
$$;

create or replace function public.unlink_from_couple()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
begin
  v_couple_id := public.leave_workspace(public.get_my_couple_id());
  return v_couple_id;
end;
$$;

create or replace function public.validate_transaction_integrity()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = new.owner_profile_id
      and wm.couple_id = new.couple_id
  ) then
    raise exception 'O responsável da transação não pertence ao mesmo casal.';
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.categories
    where id = new.category_id and couple_id = new.couple_id
  ) then
    raise exception 'Categoria inválida para este casal.';
  end if;

  if new.goal_id is not null and not exists (
    select 1 from public.goals
    where id = new.goal_id and couple_id = new.couple_id
  ) then
    raise exception 'Meta inválida para este casal.';
  end if;

  return new;
end;
$$;

create or replace function public.validate_bill_integrity()
returns trigger
language plpgsql
as $$
begin
  if new.owner_profile_id is not null and not exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = new.owner_profile_id
      and wm.couple_id = new.couple_id
  ) then
    raise exception 'O responsável da conta não pertence ao mesmo casal.';
  end if;

  return new;
end;
$$;

create or replace function public.recalculate_goal_current_amount(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.goals g
  set current_amount = coalesce((
    select sum(t.amount)
    from public.transactions t
    join public.categories c on c.id = t.category_id
    where t.goal_id = g.id
      and t.type = 'expense'
      and c.kind = 'reserve'
  ), 0),
  updated_at = timezone('utc', now())
  where g.id = p_goal_id;
end;
$$;

create or replace function public.sync_goal_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.goal_id is not null then
    perform public.recalculate_goal_current_amount(old.goal_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.goal_id is not null then
    perform public.recalculate_goal_current_amount(new.goal_id);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.notify_high_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner record;
  v_owner_name text;
  v_threshold numeric(12,2) := 500; -- Valor padrão; ajuste manualmente se necessário (sincronizar com APP_CONFIG.highExpenseThreshold no frontend)
begin
  if new.type <> 'expense' or new.amount < v_threshold then
    return new;
  end if;

  select full_name into v_owner_name
  from public.profiles
  where user_id = new.owner_profile_id;

  for v_partner in
    select user_id
    from public.workspace_members wm
    where wm.couple_id = new.couple_id
      and wm.user_id <> new.owner_profile_id
  loop
    insert into public.notifications (
      couple_id,
      user_id,
      actor_user_id,
      kind,
      title,
      message,
      transaction_id
    )
    values (
      new.couple_id,
      v_partner.user_id,
      new.owner_profile_id,
      'high_expense',
      'Gasto alto registrado',
      coalesce(v_owner_name, 'Seu parceiro') || ' cadastrou "' || new.description || '" no valor de R$ ' || trim(to_char(new.amount, 'FM999999990.00')) || '.',
      new.id
    );
  end loop;

  return new;
end;
$$;

create or replace function public.sync_due_bill_notifications(p_days_ahead integer default 3)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid := public.get_my_couple_id();
begin
  if v_couple_id is null then
    return;
  end if;

  insert into public.notifications (couple_id, user_id, kind, title, message, bill_id)
  select
    b.couple_id,
    p.user_id,
    'bill_due_soon',
    'Conta próxima do vencimento',
    'A conta "' || b.title || '" vence em até ' || p_days_ahead || ' dia(s).',
    b.id
  from public.bills b
  join public.workspace_members wm on wm.couple_id = b.couple_id
  join public.profiles p on p.user_id = wm.user_id
  where b.couple_id = v_couple_id
    and b.due_date between current_date and current_date + p_days_ahead
  on conflict (user_id, bill_id, kind) where kind = 'bill_due_soon' do nothing;
end;
$$;

create or replace function public.get_app_bootstrap(p_days_ahead integer default 3)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_partner public.profiles%rowtype;
  v_couple public.couples%rowtype;
  v_active_couple_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'profile', null,
      'couple', null,
      'partner', null,
      'members', '[]'::jsonb,
      'invites', '[]'::jsonb,
      'categories', '[]'::jsonb,
      'transactions', '[]'::jsonb,
      'goals', '[]'::jsonb,
      'bills', '[]'::jsonb,
      'events', '[]'::jsonb,
      'plans', '[]'::jsonb,
      'notifications', '[]'::jsonb
    );
  end if;

  select *
  into v_profile
  from public.profiles
  where user_id = v_user_id
  limit 1;

  if v_profile.user_id is null then
    return jsonb_build_object(
      'profile', null,
      'couple', null,
      'partner', null,
      'members', '[]'::jsonb,
      'invites', '[]'::jsonb,
      'categories', '[]'::jsonb,
      'transactions', '[]'::jsonb,
      'goals', '[]'::jsonb,
      'bills', '[]'::jsonb,
      'events', '[]'::jsonb,
      'plans', '[]'::jsonb,
      'notifications', '[]'::jsonb
    );
  end if;

  v_active_couple_id := coalesce(v_profile.active_couple_id, v_profile.couple_id);

  if v_active_couple_id is not null then
    perform public.sync_due_bill_notifications(p_days_ahead);

    select *
    into v_couple
    from public.couples
    where id = v_active_couple_id
    limit 1;

    select *
    into v_partner
    from public.profiles p
    join public.workspace_members wm on wm.user_id = p.user_id
    where wm.couple_id = v_active_couple_id
      and p.user_id <> v_user_id
    order by p.created_at asc
    limit 1;
  end if;

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'couple', case when v_couple.id is null then null else to_jsonb(v_couple) end,
    'partner', case when v_partner.user_id is null then null else to_jsonb(v_partner) end,
    'members', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at asc)
      from public.workspace_members wm
      join public.profiles p on p.user_id = wm.user_id
      where wm.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'couple_id', i.couple_id,
          'invited_email', i.invited_email,
          'invite_code', i.invite_code,
          'invited_by', i.invited_by,
          'accepted_by', i.accepted_by,
          'status', i.status,
          'accepted_at', i.accepted_at,
          'expires_at', i.expires_at,
          'created_at', i.created_at,
          'accepted_by_name', case
            when i.accepted_by is null then null
            else (select p.full_name from public.profiles p where p.user_id = i.accepted_by)
          end
        )
        order by i.created_at desc
      )
      from public.couple_invites i
      where i.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.is_default desc, c.name asc)
      from public.categories c
      where c.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'couple_id', t.couple_id,
          'user_id', t.user_id,
          'owner_profile_id', t.owner_profile_id,
          'description', t.description,
          'amount', t.amount,
          'type', t.type,
          'category_id', t.category_id,
          'occurred_on', t.occurred_on,
          'split_scope', t.split_scope,
          'goal_id', t.goal_id,
          'note', t.note,
          'created_at', t.created_at,
          'updated_at', t.updated_at,
          'category', case
            when c.id is null then null
            else jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon, 'kind', c.kind)
          end,
          'goal', case
            when g.id is null then null
            else jsonb_build_object('id', g.id, 'name', g.name)
          end,
          'owner', case
            when o.user_id is null then null
            else jsonb_build_object('user_id', o.user_id, 'full_name', o.full_name)
          end
        )
        order by t.occurred_on desc, t.created_at desc
      )
      from public.transactions t
      left join public.categories c on c.id = t.category_id
      left join public.goals g on g.id = t.goal_id
      left join public.profiles o on o.user_id = t.owner_profile_id
      where t.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.created_at desc)
      from public.goals g
      where g.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'bills', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'couple_id', b.couple_id,
          'title', b.title,
          'amount', b.amount,
          'due_date', b.due_date,
          'owner_profile_id', b.owner_profile_id,
          'split_scope', b.split_scope,
          'is_paid', b.is_paid,
          'paid_at', b.paid_at,
          'is_recurring', b.is_recurring,
          'recurrence_day', b.recurrence_day,
          'created_by', b.created_by,
          'created_at', b.created_at,
          'updated_at', b.updated_at,
          'owner', case
            when o.user_id is null then null
            else jsonb_build_object('user_id', o.user_id, 'full_name', o.full_name)
          end
        )
        order by b.due_date asc
      )
      from public.bills b
      left join public.profiles o on o.user_id = b.owner_profile_id
      where b.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'couple_id', e.couple_id,
          'title', e.title,
          'kind', e.kind,
          'scope', e.scope,
          'due_date', e.due_date,
          'owner_profile_id', e.owner_profile_id,
          'note', e.note,
          'is_done', e.is_done,
          'created_by', e.created_by,
          'created_at', e.created_at,
          'updated_at', e.updated_at,
          'owner', case
            when o.user_id is null then null
            else jsonb_build_object('user_id', o.user_id, 'full_name', o.full_name)
          end
        )
        order by e.is_done asc, e.due_date asc nulls last, e.created_at desc
      )
      from public.events e
      left join public.profiles o on o.user_id = e.owner_profile_id
      where e.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at desc)
      from public.plans p
      where p.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at desc)
      from (
        select *
        from public.notifications
        where user_id = v_user_id
        order by created_at desc
        limit 25
      ) n
    ), '[]'::jsonb),
    'personal_transactions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'couple_id', t.couple_id,
          'owner_profile_id', t.owner_profile_id,
          'description', t.description,
          'amount', t.amount,
          'type', t.type,
          'occurred_on', t.occurred_on,
          'category_id', t.category_id,
          'category', case
            when c.id is null then null
            else jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon, 'kind', c.kind)
          end
        )
      )
      from public.transactions t
      left join public.categories c on c.id = t.category_id
      where t.owner_profile_id = v_user_id
        and t.couple_id in (
          select wm.couple_id from public.workspace_members wm where wm.user_id = v_user_id
        )
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_app_bootstrap(integer) to authenticated;
grant execute on function public.setup_my_workspace(text, text) to authenticated;
grant execute on function public.list_my_workspaces() to authenticated;
grant execute on function public.set_active_workspace(uuid) to authenticated;
grant execute on function public.leave_workspace(uuid) to authenticated;
grant execute on function public.create_couple_invite(text) to authenticated;
grant execute on function public.accept_couple_invite(text) to authenticated;
grant execute on function public.unlink_from_couple() to authenticated;
grant execute on function public.sync_due_bill_notifications(integer) to authenticated;

drop trigger if exists couples_touch_updated_at on public.couples;
create trigger couples_touch_updated_at
before update on public.couples
for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists goals_touch_updated_at on public.goals;
create trigger goals_touch_updated_at
before update on public.goals
for each row execute function public.touch_updated_at();

drop trigger if exists transactions_touch_updated_at on public.transactions;
create trigger transactions_touch_updated_at
before update on public.transactions
for each row execute function public.touch_updated_at();

drop trigger if exists bills_touch_updated_at on public.bills;
create trigger bills_touch_updated_at
before update on public.bills
for each row execute function public.touch_updated_at();

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
before update on public.events
for each row execute function public.touch_updated_at();

drop trigger if exists plans_touch_updated_at on public.plans;
create trigger plans_touch_updated_at
before update on public.plans
for each row execute function public.touch_updated_at();

drop trigger if exists transactions_validate_integrity on public.transactions;
create trigger transactions_validate_integrity
before insert or update on public.transactions
for each row execute function public.validate_transaction_integrity();

drop trigger if exists bills_validate_integrity on public.bills;
create trigger bills_validate_integrity
before insert or update on public.bills
for each row execute function public.validate_bill_integrity();

drop trigger if exists transactions_sync_goal on public.transactions;
create trigger transactions_sync_goal
after insert or update or delete on public.transactions
for each row execute function public.sync_goal_progress();

drop trigger if exists transactions_notify_high_expense on public.transactions;
create trigger transactions_notify_high_expense
after insert on public.transactions
for each row execute function public.notify_high_expense();

alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.couple_invites enable row level security;
alter table public.categories enable row level security;
alter table public.goals enable row level security;
alter table public.transactions enable row level security;
alter table public.bills enable row level security;
alter table public.events enable row level security;
alter table public.plans enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "couples_select_own" on public.couples;
create policy "couples_select_own"
on public.couples
for select
using (public.is_in_my_couple(id));

drop policy if exists "couples_update_own" on public.couples;
create policy "couples_update_own"
on public.couples
for update
using (public.is_in_my_couple(id))
with check (public.is_in_my_couple(id));

drop policy if exists "profiles_select_self_or_partner" on public.profiles;
create policy "profiles_select_self_or_partner"
on public.profiles
for select
using (
  user_id = auth.uid()
  or user_id in (
    select wm2.user_id
    from public.workspace_members wm2
    join public.workspace_members wm3 on wm3.couple_id = wm2.couple_id
    where wm3.user_id = auth.uid()
  )
);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
with check (user_id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "workspace_members_select_self" on public.workspace_members;
create policy "workspace_members_select_self"
on public.workspace_members
for select
using (user_id = auth.uid());

drop policy if exists "workspace_members_insert_self" on public.workspace_members;
create policy "workspace_members_insert_self"
on public.workspace_members
for insert
with check (user_id = auth.uid());

drop policy if exists "workspace_members_delete_self" on public.workspace_members;
create policy "workspace_members_delete_self"
on public.workspace_members
for delete
using (user_id = auth.uid());

drop policy if exists "invites_select_related" on public.couple_invites;
create policy "invites_select_related"
on public.couple_invites
for select
using (
  invited_by = auth.uid()
  or lower(coalesce(invited_email, '')) = lower(public.current_user_email())
  or public.is_in_my_couple(couple_id)
);

drop policy if exists "invites_insert_my_couple" on public.couple_invites;
create policy "invites_insert_my_couple"
on public.couple_invites
for insert
with check (
  invited_by = auth.uid()
  and public.is_in_my_couple(couple_id)
);

drop policy if exists "categories_all_my_couple" on public.categories;
create policy "categories_all_my_couple"
on public.categories
for all
using (public.is_in_my_couple(couple_id))
with check (public.is_in_my_couple(couple_id));

drop policy if exists "goals_all_my_couple" on public.goals;
create policy "goals_all_my_couple"
on public.goals
for all
using (public.is_in_my_couple(couple_id))
with check (public.is_in_my_couple(couple_id));

drop policy if exists "transactions_all_my_couple" on public.transactions;
create policy "transactions_all_my_couple"
on public.transactions
for all
using (public.is_in_my_couple(couple_id))
with check (public.is_in_my_couple(couple_id));

drop policy if exists "bills_all_my_couple" on public.bills;
create policy "bills_all_my_couple"
on public.bills
for all
using (public.is_in_my_couple(couple_id))
with check (public.is_in_my_couple(couple_id));

drop policy if exists "events_all_my_couple" on public.events;
create policy "events_all_my_couple"
on public.events
for all
using (public.is_in_my_couple(couple_id))
with check (public.is_in_my_couple(couple_id));

drop policy if exists "plans_all_my_couple" on public.plans;
create policy "plans_all_my_couple"
on public.plans
for all
using (public.is_in_my_couple(couple_id))
with check (public.is_in_my_couple(couple_id));

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications
for select
using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
on public.notifications
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════
-- ─── Notificações automáticas para mudanças no ambiente ───
-- ═══════════════════════════════════════════════════════════════

create or replace function public.notify_workspace_members(
  p_couple_id uuid,
  p_actor_user_id uuid,
  p_kind text,
  p_title text,
  p_message text,
  p_transaction_id uuid default null,
  p_bill_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
begin
  for v_member in
    select wm.user_id
    from public.workspace_members wm
    where wm.couple_id = p_couple_id
      and wm.user_id <> p_actor_user_id
  loop
    insert into public.notifications (
      couple_id, user_id, actor_user_id, kind, title, message, transaction_id, bill_id
    )
    values (
      p_couple_id, v_member.user_id, p_actor_user_id, p_kind, p_title, p_message,
      p_transaction_id, p_bill_id
    )
    on conflict (user_id, bill_id, kind) where kind = 'bill_due_soon' do nothing;
  end loop;
end;
$$;

create or replace function public.notify_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
  v_workspace_name text;
  v_kind text;
  v_title text;
  v_message text;
  v_amount_text text;
begin
  select full_name into v_actor_name from public.profiles where user_id = coalesce(new.user_id, old.user_id);
  select name into v_workspace_name from public.couples where id = coalesce(new.couple_id, old.couple_id);
  v_amount_text := 'R$ ' || trim(to_char(coalesce(new.amount, old.amount), 'FM999999990.00'));

  if tg_op = 'INSERT' then
    v_kind := 'transaction_created';
    v_title := 'Nova transação registrada';
    v_message := v_actor_name || ' registrou uma transação em ' || coalesce(v_workspace_name, 'um ambiente') || ': ' || new.description || ' — ' || v_amount_text;
    perform public.notify_workspace_members(new.couple_id, new.user_id, v_kind, v_title, v_message, p_transaction_id => new.id);
  elsif tg_op = 'UPDATE' then
    v_kind := 'transaction_updated';
    v_title := 'Transação atualizada';
    v_message := v_actor_name || ' atualizou a transação em ' || coalesce(v_workspace_name, 'um ambiente') || ': ' || coalesce(new.description, old.description) || ' — ' || v_amount_text;
    perform public.notify_workspace_members(coalesce(new.couple_id, old.couple_id), coalesce(new.user_id, old.user_id), v_kind, v_title, v_message, p_transaction_id => coalesce(new.id, old.id));
  elsif tg_op = 'DELETE' then
    v_kind := 'transaction_deleted';
    v_title := 'Transação removida';
    v_message := v_actor_name || ' removeu uma transação em ' || coalesce(v_workspace_name, 'um ambiente') || ': ' || old.description || ' — ' || v_amount_text;
    perform public.notify_workspace_members(old.couple_id, old.user_id, v_kind, v_title, v_message, p_transaction_id => old.id);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.notify_bill_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid;
  v_actor_name text;
  v_workspace_name text;
  v_kind text;
  v_title text;
  v_message text;
  v_amount_text text;
begin
  v_actor_user_id := coalesce(new.created_by, old.created_by, auth.uid());
  select full_name into v_actor_name from public.profiles where user_id = v_actor_user_id;
  select name into v_workspace_name from public.couples where id = coalesce(new.couple_id, old.couple_id);
  v_amount_text := 'R$ ' || trim(to_char(coalesce(new.amount, old.amount), 'FM999999990.00'));

  if tg_op = 'INSERT' then
    v_kind := 'bill_created';
    v_title := 'Nova conta cadastrada';
    v_message := v_actor_name || ' cadastrou a conta em ' || coalesce(v_workspace_name, 'um ambiente') || ': ' || new.title || ' — ' || v_amount_text;
    perform public.notify_workspace_members(new.couple_id, v_actor_user_id, v_kind, v_title, v_message, p_bill_id => new.id);
  elsif tg_op = 'UPDATE' then
    v_kind := 'bill_updated';
    v_title := 'Conta atualizada';
    v_message := v_actor_name || ' atualizou a conta em ' || coalesce(v_workspace_name, 'um ambiente') || ': ' || coalesce(new.title, old.title);
    perform public.notify_workspace_members(coalesce(new.couple_id, old.couple_id), v_actor_user_id, v_kind, v_title, v_message, p_bill_id => coalesce(new.id, old.id));
  elsif tg_op = 'DELETE' then
    v_kind := 'bill_deleted';
    v_title := 'Conta removida';
    v_message := v_actor_name || ' removeu a conta em ' || coalesce(v_workspace_name, 'um ambiente') || ': ' || old.title;
    perform public.notify_workspace_members(old.couple_id, v_actor_user_id, v_kind, v_title, v_message, p_bill_id => old.id);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.notify_goal_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid;
  v_actor_name text;
  v_workspace_name text;
  v_kind text;
  v_title text;
  v_message text;
begin
  v_actor_user_id := coalesce(new.created_by, old.created_by, auth.uid());
  select full_name into v_actor_name from public.profiles where user_id = v_actor_user_id;
  select name into v_workspace_name from public.couples where id = coalesce(new.couple_id, old.couple_id);

  if tg_op = 'INSERT' then
    v_kind := 'goal_created';
    v_title := 'Nova meta criada';
    v_message := v_actor_name || ' criou a meta em ' || coalesce(v_workspace_name, 'um ambiente') || ': ' || new.name || ' — alvo de R$ ' || trim(to_char(new.target_amount, 'FM999999990.00'));
    perform public.notify_workspace_members(new.couple_id, v_actor_user_id, v_kind, v_title, v_message);
  elsif tg_op = 'UPDATE' then
    v_kind := 'goal_updated';
    v_title := 'Meta atualizada';
    v_message := v_actor_name || ' atualizou a meta em ' || coalesce(v_workspace_name, 'um ambiente') || ': ' || coalesce(new.name, old.name);
    perform public.notify_workspace_members(coalesce(new.couple_id, old.couple_id), v_actor_user_id, v_kind, v_title, v_message);
  elsif tg_op = 'DELETE' then
    v_kind := 'goal_deleted';
    v_title := 'Meta removida';
    v_message := v_actor_name || ' removeu a meta em ' || coalesce(v_workspace_name, 'um ambiente') || ': ' || old.name;
    perform public.notify_workspace_members(old.couple_id, v_actor_user_id, v_kind, v_title, v_message);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.notify_event_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid;
  v_actor_name text;
  v_workspace_name text;
  v_kind text;
  v_title text;
  v_message text;
begin
  v_actor_user_id := coalesce(new.created_by, old.created_by, auth.uid());
  select full_name into v_actor_name from public.profiles where user_id = v_actor_user_id;
  select name into v_workspace_name from public.couples where id = coalesce(new.couple_id, old.couple_id);

  if tg_op = 'INSERT' then
    v_kind := 'event_created';
    v_title := 'Novo compromisso na agenda';
    v_message := v_actor_name || ' adicionou em ' || coalesce(v_workspace_name, 'um ambiente') || ': ' || new.title || (case when new.due_date is not null then ' para ' || new.due_date::text else '' end);
    perform public.notify_workspace_members(new.couple_id, v_actor_user_id, v_kind, v_title, v_message);
  elsif tg_op = 'UPDATE' then
    v_kind := 'event_updated';
    v_title := 'Compromisso atualizado';
    v_message := v_actor_name || ' atualizou o compromisso em ' || coalesce(v_workspace_name, 'um ambiente') || ': ' || coalesce(new.title, old.title);
    perform public.notify_workspace_members(coalesce(new.couple_id, old.couple_id), v_actor_user_id, v_kind, v_title, v_message);
  elsif tg_op = 'DELETE' then
    v_kind := 'event_deleted';
    v_title := 'Compromisso removido';
    v_message := v_actor_name || ' removeu o compromisso em ' || coalesce(v_workspace_name, 'um ambiente') || ': ' || old.title;
    perform public.notify_workspace_members(old.couple_id, v_actor_user_id, v_kind, v_title, v_message);
  end if;

  return coalesce(new, old);
end;
$$;

-- Triggers de notificação
drop trigger if exists transactions_notify_change on public.transactions;
create trigger transactions_notify_change
after insert or update or delete on public.transactions
for each row execute function public.notify_transaction_change();

drop trigger if exists bills_notify_change on public.bills;
create trigger bills_notify_change
after insert or update or delete on public.bills
for each row execute function public.notify_bill_change();

drop trigger if exists goals_notify_change on public.goals;
create trigger goals_notify_change
after insert or update or delete on public.goals
for each row execute function public.notify_goal_change();

drop trigger if exists events_notify_change on public.events;
create trigger events_notify_change
after insert or update or delete on public.events
for each row execute function public.notify_event_change();
