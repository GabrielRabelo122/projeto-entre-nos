-- ═══════════════════════════════════════════════════════════════
-- Saldo individual: transações pessoais de TODOS os ambientes
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

drop function if exists public.get_app_bootstrap(integer);

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
      'profile', null, 'couple', null, 'partner', null,
      'members', '[]'::jsonb, 'invites', '[]'::jsonb,
      'categories', '[]'::jsonb, 'transactions', '[]'::jsonb,
      'personal_transactions', '[]'::jsonb,
      'goals', '[]'::jsonb, 'bills', '[]'::jsonb,
      'events', '[]'::jsonb, 'plans', '[]'::jsonb,
      'notifications', '[]'::jsonb
    );
  end if;

  select * into v_profile from public.profiles where user_id = v_user_id limit 1;

  if v_profile.user_id is null then
    return jsonb_build_object(
      'profile', null, 'couple', null, 'partner', null,
      'members', '[]'::jsonb, 'invites', '[]'::jsonb,
      'categories', '[]'::jsonb, 'transactions', '[]'::jsonb,
      'personal_transactions', '[]'::jsonb,
      'goals', '[]'::jsonb, 'bills', '[]'::jsonb,
      'events', '[]'::jsonb, 'plans', '[]'::jsonb,
      'notifications', '[]'::jsonb
    );
  end if;

  v_active_couple_id := coalesce(v_profile.active_couple_id, v_profile.couple_id);

  if v_active_couple_id is not null then
    perform public.sync_due_bill_notifications(p_days_ahead);
    select * into v_couple from public.couples where id = v_active_couple_id limit 1;
    select * into v_partner
    from public.profiles p
    join public.workspace_members wm on wm.user_id = p.user_id
    where wm.couple_id = v_active_couple_id and p.user_id <> v_user_id
    order by p.created_at asc limit 1;
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
          'id', i.id, 'couple_id', i.couple_id, 'invited_email', i.invited_email,
          'invite_code', i.invite_code, 'invited_by', i.invited_by,
          'accepted_by', i.accepted_by, 'status', i.status,
          'accepted_at', i.accepted_at, 'expires_at', i.expires_at,
          'created_at', i.created_at,
          'accepted_by_name', case when i.accepted_by is null then null
            else (select p.full_name from public.profiles p where p.user_id = i.accepted_by) end
        ) order by i.created_at desc
      ) from public.couple_invites i where i.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.is_default desc, c.name asc)
      from public.categories c where c.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'couple_id', t.couple_id, 'user_id', t.user_id,
          'owner_profile_id', t.owner_profile_id, 'description', t.description,
          'amount', t.amount, 'type', t.type, 'category_id', t.category_id,
          'occurred_on', t.occurred_on, 'split_scope', t.split_scope,
          'goal_id', t.goal_id, 'note', t.note,
          'created_at', t.created_at, 'updated_at', t.updated_at,
          'category', case when c.id is null then null
            else jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon, 'kind', c.kind) end,
          'goal', case when g.id is null then null
            else jsonb_build_object('id', g.id, 'name', g.name) end,
          'owner', case when o.user_id is null then null
            else jsonb_build_object('user_id', o.user_id, 'full_name', o.full_name) end
        ) order by t.occurred_on desc, t.created_at desc
      ) from public.transactions t
      left join public.categories c on c.id = t.category_id
      left join public.goals g on g.id = t.goal_id
      left join public.profiles o on o.user_id = t.owner_profile_id
      where t.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.created_at desc)
      from public.goals g where g.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'bills', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id, 'couple_id', b.couple_id, 'title', b.title,
          'amount', b.amount, 'due_date', b.due_date,
          'owner_profile_id', b.owner_profile_id, 'split_scope', b.split_scope,
          'is_paid', b.is_paid, 'paid_at', b.paid_at,
          'is_recurring', b.is_recurring, 'recurrence_day', b.recurrence_day,
          'created_by', b.created_by, 'created_at', b.created_at, 'updated_at', b.updated_at,
          'owner', case when o.user_id is null then null
            else jsonb_build_object('user_id', o.user_id, 'full_name', o.full_name) end
        ) order by b.due_date asc
      ) from public.bills b
      left join public.profiles o on o.user_id = b.owner_profile_id
      where b.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'couple_id', e.couple_id, 'title', e.title,
          'kind', e.kind, 'scope', e.scope, 'due_date', e.due_date,
          'owner_profile_id', e.owner_profile_id, 'note', e.note,
          'is_done', e.is_done, 'created_by', e.created_by,
          'created_at', e.created_at, 'updated_at', e.updated_at,
          'owner', case when o.user_id is null then null
            else jsonb_build_object('user_id', o.user_id, 'full_name', o.full_name) end
        ) order by e.is_done asc, e.due_date asc nulls last, e.created_at desc
      ) from public.events e
      left join public.profiles o on o.user_id = e.owner_profile_id
      where e.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at desc)
      from public.plans p where p.couple_id = v_active_couple_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at desc)
      from (select * from public.notifications where user_id = v_user_id order by created_at desc limit 25) n
    ), '[]'::jsonb),
    'personal_transactions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'couple_id', t.couple_id,
          'owner_profile_id', t.owner_profile_id, 'description', t.description,
          'amount', t.amount, 'type', t.type, 'occurred_on', t.occurred_on,
          'category_id', t.category_id,
          'category', case when c.id is null then null
            else jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon, 'kind', c.kind) end
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
