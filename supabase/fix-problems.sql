-- ═══════════════════════════════════════════════════════════════
-- Correção Problema 1: setup_my_workspace não cria convite
-- Correção Problema 3: Triggers de notificação desatualizados
--
-- Execute este script no Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- PROBLEMA 1: setup_my_workspace deve gerar convite automaticamente
-- ═══════════════════════════════════════════════════════════════

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

  v_couple_id := gen_random_uuid();

  insert into public.couples (id, created_by, name, kind)
  values (v_couple_id, v_user_id, v_name, p_kind);

  insert into public.workspace_members (couple_id, user_id, role)
  values (v_couple_id, v_user_id, 'owner')
  on conflict (couple_id, user_id) do nothing;

  perform public.bootstrap_default_categories(v_couple_id, v_user_id);

  -- Gera automaticamente um código de convite fixo e único para o ambiente
  v_invite_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  insert into public.couple_invites (couple_id, invited_email, invited_by, invite_code, expires_at)
  values (v_couple_id, null, v_user_id, v_invite_code, timezone('utc', now()) + interval '36500 days');

  update public.profiles
  set couple_id = coalesce(couple_id, v_couple_id),
      active_couple_id = v_couple_id
  where user_id = v_user_id;

  return v_couple_id;
end;
$$;

-- Gera convites para workspaces existentes que estão sem convite válido
-- (inclui workspaces cujo convite anterior expirou)
insert into public.couple_invites (couple_id, invited_email, invited_by, invite_code, expires_at)
select
  c.id,
  null,
  c.created_by,
  upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8)),
  timezone('utc', now()) + interval '36500 days'
from public.couples c
where c.created_by is not null
  and not exists (
    select 1 from public.couple_invites ci
    where ci.couple_id = c.id
      and ci.status = 'pending'
      and (ci.expires_at is null or ci.expires_at > now())
  )
on conflict do nothing;

-- Renova convites pendentes antigos para validade permanente (~100 anos)
update public.couple_invites
set expires_at = timezone('utc', now()) + interval '36500 days'
where status = 'pending';


-- ═══════════════════════════════════════════════════════════════
-- PROBLEMA 4: list_my_workspaces deve retornar invite_code sem filtro de expiração
-- ═══════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════
-- PROBLEMA 2: create_couple_invite deve reutilizar convite existente
-- Cada ambiente deve ter apenas um convite único e fixo.
-- ═══════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════
-- PROBLEMA 3: Funções e triggers de notificação
-- ═══════════════════════════════════════════════════════════════

-- ─── Função auxiliar: notificar membros do workspace ───
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

-- ─── Notificar mudança em transações ───
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
    perform public.notify_workspace_members(old.couple_id, old.user_id, v_kind, v_title, v_message);
  end if;

  return coalesce(new, old);
end;
$$;

-- ─── Notificar mudança em contas ───
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
    perform public.notify_workspace_members(old.couple_id, v_actor_user_id, v_kind, v_title, v_message);
  end if;

  return coalesce(new, old);
end;
$$;

-- ─── Notificar mudança em metas ───
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

-- ─── Notificar mudança em eventos ───
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

-- ─── Notificar gasto alto (> R$ 500) ───
create or replace function public.notify_high_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner record;
  v_owner_name text;
  v_threshold numeric(12,2) := 500;
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
      couple_id, user_id, actor_user_id, kind, title, message, transaction_id
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

-- ═══════════════════════════════════════════════════════════════
-- Recriar todos os triggers de notificação
-- ═══════════════════════════════════════════════════════════════

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

drop trigger if exists transactions_notify_high_expense on public.transactions;
create trigger transactions_notify_high_expense
after insert on public.transactions
for each row execute function public.notify_high_expense();
