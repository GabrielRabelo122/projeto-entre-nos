-- ═══════════════════════════════════════════════════════════════
-- DIAGNÓSTICO: Verificar estado dos convites
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Ver todos os workspaces e seus membros
select
  c.id as workspace_id,
  c.name as workspace_name,
  c.kind,
  wm.user_id,
  wm.role
from public.couples c
join public.workspace_members wm on wm.couple_id = c.id
order by c.created_at;

-- 2. Ver TODOS os convites (incluindo expirados)
select
  ci.id,
  ci.couple_id,
  ci.invite_code,
  ci.status,
  ci.expires_at,
  ci.created_at,
  case
    when ci.expires_at < timezone('utc', now()) then 'EXPIRADO'
    else 'VALIDO'
  end as situacao
from public.couple_invites ci
order by ci.couple_id, ci.created_at;

-- 3. Simular o que list_my_workspaces retorna (VERSÃO ANTIGA com filtro de expiração)
select
  c.id,
  c.name,
  (
    select ci.invite_code
    from public.couple_invites ci
    where ci.couple_id = c.id
      and ci.status = 'pending'
      and (ci.expires_at is null or ci.expires_at > now())
    order by ci.created_at desc
    limit 1
  ) as invite_code_antigo
from public.couples c;

-- 4. Simular o que list_my_workspaces retorna (VERSÃO NOVA sem filtro de expiração)
select
  c.id,
  c.name,
  (
    select ci.invite_code
    from public.couple_invites ci
    where ci.couple_id = c.id
      and ci.status = 'pending'
    order by ci.expires_at desc nulls last, ci.created_at desc
    limit 1
  ) as invite_code_novo
from public.couples c;

-- 5. Verificar se a função list_my_workspaces foi atualizada
-- (deve retornar invite_code mesmo para convites expirados)
select * from public.list_my_workspaces();
