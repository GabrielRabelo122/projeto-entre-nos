-- ═══════════════════════════════════════════════════════════════
-- Correção: Violação de foreign key ao excluir transações/contas
-- ═══════════════════════════════════════════════════════════════
-- Problema: Ao excluir uma transação ou conta, o trigger tentava
-- inserir uma notificação referenciando o ID já excluído, causando
-- violação da foreign key constraint.
-- 
-- Solução: Não passar transaction_id/bill_id nas notificações de
-- exclusão, já que o registro já não existe mais.
-- ═══════════════════════════════════════════════════════════════

-- ─── Corrigir função notify_transaction_change ───
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
    -- Não passa transaction_id porque a transação já foi excluída
    perform public.notify_workspace_members(old.couple_id, old.user_id, v_kind, v_title, v_message);
  end if;

  return coalesce(new, old);
end;
$$;

-- ─── Corrigir função notify_bill_change ───
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
    -- Não passa bill_id porque a conta já foi excluída
    perform public.notify_workspace_members(old.couple_id, v_actor_user_id, v_kind, v_title, v_message);
  end if;

  return coalesce(new, old);
end;
$$;
