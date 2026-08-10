/**
 * Script de Teste Completo — Projeto Entre Nós
 * 
 * Testa: criação de 6 usuários, vínculos/ambientes, transações (entradas/saídas),
 * contas, metas, eventos, notificações, relatórios e deleção.
 * 
 * Uso: node test-completo.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nxjwiqtobquflpnmbabj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54andpcXRvYnF1Zmxwbm1iYWJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MzkwMDEsImV4cCI6MjEwMTUxNTAwMX0.NRg1L0PGh4PC_bky2kHSEcHxm8aL0QWXLjlMiF6Ccls";

const timestamp = Date.now();
const TEST_PASSWORD = "Teste@123456";
const TEST_NAMES = ["Ana Teste", "Bruno Teste", "Carla Teste", "Diego Teste", "Eva Teste", "Fabio Teste"];

let passed = 0;
let failed = 0;
const errors = [];

function log(msg, type = "info") {
  const prefix = type === "pass" ? "✅" : type === "fail" ? "❌" : type === "warn" ? "⚠️" : "ℹ️";
  console.log(`${prefix} ${msg}`);
}

function assert(condition, message) {
  if (condition) { passed++; log(message, "pass"); }
  else { failed++; errors.push(message); log(message, "fail"); }
}

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
}

async function signUp(sb, email, password, fullName) {
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: fullName } }
  });
  if (error) throw error;
  return data;
}

async function signIn(sb, email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function runTests() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  TESTE COMPLETO — Projeto Entre Nós");
  console.log("══════════════════════════════════════════════════════\n");

  const TEST_EMAILS = Array.from({ length: 6 }, (_, i) => `teste${i + 1}-${timestamp}@test.com`);

  // ═══════════════════════════════════════════════════════════
  // FASE 1: CRIAR 6 USUÁRIOS (cada um com seu próprio client)
  // ═══════════════════════════════════════════════════════════
  console.log("── FASE 1: Criação de 6 usuários teste ──");

  // Cada usuário tem seu próprio client Supabase (sessão isolada)
  const clients = [];
  const userIds = [];

  for (let i = 0; i < 6; i++) {
    const sb = makeClient();
    try {
      const { user } = await signUp(sb, TEST_EMAILS[i], TEST_PASSWORD, TEST_NAMES[i]);
      if (user) {
        userIds.push(user.id);
        clients.push({ sb, email: TEST_EMAILS[i], name: TEST_NAMES[i], id: user.id });
        log(`Usuário ${i + 1} criado: ${TEST_NAMES[i]} (${TEST_EMAILS[i]})`);
      }
    } catch (err) {
      if (err.message?.includes("already") || err.message?.includes("registered")) {
        try {
          const { session } = await signIn(sb, TEST_EMAILS[i], TEST_PASSWORD);
          if (session) {
            userIds.push(session.user.id);
            clients.push({ sb, email: TEST_EMAILS[i], name: TEST_NAMES[i], id: session.user.id });
            log(`Usuário ${i + 1} já existia, login OK: ${TEST_NAMES[i]}`, "warn");
          }
        } catch (e2) {
          log(`Falha ao recuperar usuário ${i + 1}: ${e2.message}`, "fail");
        }
      } else {
        log(`Falha ao criar usuário ${i + 1}: ${err.message}`, "fail");
      }
    }
  }

  assert(clients.length === 6, `6 usuários criados (resultado: ${clients.length}/6)`);
  if (clients.length < 2) {
    console.log("\n❌ Usuários insuficientes. Abortando.");
    printSummary();
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 2: WORKSPACE + VÍNCULOS (usando client do usuário 1)
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 2: Workspaces, vínculos e ambientes ──");

  const u1 = clients[0]; // Ana
  const u2 = clients[1]; // Bruno

  // Verificar sessão do usuário 1
  const { data: sessionCheck } = await u1.sb.auth.getSession();
  assert(!!sessionCheck.session, `Sessão do usuário 1 ativa: ${sessionCheck.session ? "SIM" : "NÃO"}`);
  log(`User 1 auth uid: ${sessionCheck.session?.user?.id}`);

  // Criar workspace
  let workspaceId = null;
  {
    const { data, error } = await u1.sb.rpc("setup_my_workspace", {
      p_kind: "couple",
      p_name: "Lar Doce Lar"
    });
    if (error) {
      log(`Falha ao criar workspace: ${error.message}`, "fail");
    } else {
      workspaceId = data;
      log(`Workspace criado: ${workspaceId}`);
      assert(true, "Workspace 'Lar Doce Lar' criado com sucesso");
    }
  }

  // Verificar workspace_members (RLS deve permitir ver o próprio registro)
  if (workspaceId) {
    const { data: members, error: membersErr } = await u1.sb
      .from("workspace_members")
      .select("user_id, role")
      .eq("couple_id", workspaceId);

    if (membersErr) log(`Erro ao consultar membros: ${membersErr.message}`, "fail");
    else {
      log(`Membros do workspace: ${members?.length || 0} — ${JSON.stringify(members)}`);
      assert((members?.length || 0) >= 1, `Workspace tem ${members?.length} membro(s)`);
    }

    // list_my_workspaces
    const { data: workspaces, error: wsErr } = await u1.sb.rpc("list_my_workspaces");
    if (wsErr) log(`Erro list_my_workspaces: ${wsErr.message}`, "fail");
    else {
      log(`Workspaces do user 1: ${workspaces?.length || 0}`);
      assert((workspaces?.length || 0) >= 1, "Usuário 1 tem pelo menos 1 workspace");
    }

    // Verificar perfil
    const { data: profile } = await u1.sb.from("profiles").select("*").eq("user_id", u1.id).single();
    log(`Perfil user 1: couple_id=${profile?.couple_id}, active_couple_id=${profile?.active_couple_id}`);
    assert(profile?.active_couple_id === workspaceId, "active_couple_id aponta para o workspace criado");
  }

  // Buscar código de convite
  let inviteCode = null;
  if (workspaceId) {
    const { data: invites } = await u1.sb
      .from("couple_invites")
      .select("invite_code")
      .eq("couple_id", workspaceId)
      .eq("status", "pending")
      .limit(1);
    if (invites?.length > 0) {
      inviteCode = invites[0].invite_code;
      log(`Código de convite: ${inviteCode}`);
      assert(true, "Código de convite gerado automaticamente");
    }
  }

  // Usuário 2 aceita convite
  if (inviteCode) {
    const { data: u2Session } = await u2.sb.auth.getSession();
    log(`Sessão user 2 antes do invite: ${u2Session.session ? "ATIVA" : "INATIVA"}`);

    const { data: acceptedId, error: acceptErr } = await u2.sb.rpc("accept_couple_invite", {
      p_invite_code: inviteCode
    });
    if (acceptErr) {
      log(`Falha ao aceitar convite: ${acceptErr.message}`, "fail");
    } else {
      log(`User 2 aceitou convite, couple_id: ${acceptedId}`);
      assert(true, "Convite aceito com sucesso");

      // Verificar que user 2 agora está no workspace
      const { data: members2 } = await u2.sb
        .from("workspace_members")
        .select("user_id, role")
        .eq("couple_id", workspaceId);
      log(`Membros após convite: ${members2?.length || 0}`);
      assert((members2?.length || 0) >= 2, `Agora há ${members2?.length} membros no workspace`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 3: CATEGORIAS
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 3: Categorias ──");

  let expenseCatId = null, incomeCatId = null;

  if (workspaceId) {
    const { data: categories, error: catErr } = await u1.sb
      .from("categories")
      .select("*")
      .eq("couple_id", workspaceId)
      .order("name");

    if (catErr) log(`Erro ao consultar categorias: ${catErr.message}`, "fail");
    else {
      log(`Categorias: ${categories?.length || 0}`);
      if (categories?.length > 0) {
        log(`  Exemplos: ${categories.slice(0, 5).map(c => `${c.icon} ${c.name} (${c.kind})`).join(", ")}`);
      }
      assert((categories?.length || 0) >= 10, `${categories?.length} categorias padrão`);
      expenseCatId = categories?.find(c => c.kind === "expense")?.id;
      incomeCatId = categories?.find(c => c.kind === "income")?.id;
    }

    // Criar categoria customizada
    const { error: insertCatErr } = await u1.sb.from("categories").insert({
      couple_id: workspaceId,
      name: "Categoria Teste",
      icon: "🧪",
      kind: "expense"
    });
    if (insertCatErr) log(`Falha ao criar categoria: ${insertCatErr.message}`, "fail");
    else {
      log("Categoria customizada 'Categoria Teste' criada");
      assert(true, "Categoria customizada inserida");
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 4: TRANSAÇÕES (ENTRADAS E SAÍDAS)
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 4: Transações (entradas e saídas) ──");

  const transactionIds = [];

  if (workspaceId && expenseCatId) {
    // Despesa normal
    const { data: tx1, error: tx1Err } = await u1.sb.from("transactions").insert({
      couple_id: workspaceId,
      owner_profile_id: u1.id,
      description: "Almoço de teste",
      amount: 45.50,
      type: "expense",
      category_id: expenseCatId,
      occurred_on: new Date().toISOString().split("T")[0],
      split_scope: "both"
    }).select("id");

    if (tx1Err) log(`Falha ao criar despesa: ${tx1Err.message}`, "fail");
    else {
      if (tx1?.[0]?.id) transactionIds.push(tx1[0].id);
      log("Despesa R$ 45,50 criada (Almoço)");
      assert(true, "Transação de despesa criada");
    }

    // Despesa alta (dispara notificação > R$ 500)
    const { data: tx2, error: tx2Err } = await u1.sb.from("transactions").insert({
      couple_id: workspaceId,
      owner_profile_id: u1.id,
      description: "Compra cara de teste",
      amount: 750.00,
      type: "expense",
      category_id: expenseCatId,
      occurred_on: new Date().toISOString().split("T")[0],
      split_scope: "both"
    }).select("id");

    if (tx2Err) log(`Falha ao criar despesa alta: ${tx2Err.message}`, "fail");
    else {
      if (tx2?.[0]?.id) transactionIds.push(tx2[0].id);
      log("Despesa alta R$ 750,00 criada (deve gerar notificação)");
      assert(true, "Despesa alta registrada");
    }
  }

  if (workspaceId && incomeCatId) {
    // Receita
    const { data: tx3, error: tx3Err } = await u1.sb.from("transactions").insert({
      couple_id: workspaceId,
      owner_profile_id: u1.id,
      description: "Salário de teste",
      amount: 3500.00,
      type: "income",
      category_id: incomeCatId,
      occurred_on: new Date().toISOString().split("T")[0],
      split_scope: "both"
    }).select("id");

    if (tx3Err) log(`Falha ao criar receita: ${tx3Err.message}`, "fail");
    else {
      if (tx3?.[0]?.id) transactionIds.push(tx3[0].id);
      log("Receita R$ 3.500,00 criada (Salário)");
      assert(true, "Transação de receita criada");
    }
  }

  // Verificar transações
  if (workspaceId) {
    const { data: txList } = await u1.sb.from("transactions").select("*").eq("couple_id", workspaceId);
    log(`Total de transações: ${txList?.length || 0}`);
    assert((txList?.length || 0) >= 2, `${txList?.length} transações no workspace`);
    if (txList) txList.forEach(t => { if (!transactionIds.includes(t.id)) transactionIds.push(t.id); });
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 5: METAS
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 5: Metas ──");

  let goalId = null;

  if (workspaceId) {
    const { data: goalData, error: goalErr } = await u1.sb.from("goals").insert({
      couple_id: workspaceId,
      name: "Viagem de Teste",
      target_amount: 5000.00,
      target_date: "2026-12-31",
      auto_allocate: true,
      scope: "individual"
    }).select("id");

    if (goalErr) log(`Falha ao criar meta: ${goalErr.message}`, "fail");
    else if (goalData?.[0]?.id) {
      goalId = goalData[0].id;
      log(`Meta "Viagem de Teste" criada — alvo R$ 5.000,00`);
      assert(true, "Meta criada com sucesso");
    }

    const { data: goalsList } = await u1.sb.from("goals").select("*").eq("couple_id", workspaceId);
    assert((goalsList?.length || 0) >= 1, `${goalsList?.length} meta(s) no workspace`);
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 6: CONTAS (BOLETOS)
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 6: Contas ──");

  const billIds = [];

  if (workspaceId) {
    // Conta normal (vence em 2 dias — deve gerar notificação)
    const dueDate = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    const { data: bill1, error: bill1Err } = await u1.sb.from("bills").insert({
      couple_id: workspaceId,
      title: "Internet de teste",
      amount: 120.00,
      due_date: dueDate,
      owner_profile_id: u1.id,
      split_scope: "both"
    }).select("id");

    if (bill1Err) log(`Falha ao criar conta: ${bill1Err.message}`, "fail");
    else if (bill1?.[0]?.id) {
      billIds.push(bill1[0].id);
      log(`Conta "Internet" criada — R$ 120,00 (vence ${dueDate})`);
      assert(true, "Conta criada");
    }

    // Conta recorrente
    const { data: bill2, error: bill2Err } = await u1.sb.from("bills").insert({
      couple_id: workspaceId,
      title: "Aluguel de teste",
      amount: 1500.00,
      due_date: "2026-08-10",
      owner_profile_id: u1.id,
      split_scope: "both",
      is_recurring: true,
      recurrence_day: 10
    }).select("id");

    if (bill2Err) log(`Falha ao criar conta recorrente: ${bill2Err.message}`, "fail");
    else if (bill2?.[0]?.id) {
      billIds.push(bill2[0].id);
      log(`Conta recorrente "Aluguel" criada — R$ 1.500,00 (dia 10)`);
      assert(true, "Conta recorrente criada");
    }

    // Toggle paid
    if (billIds.length > 0) {
      const { error: paidErr } = await u1.sb.from("bills")
        .update({ is_paid: true, paid_at: new Date().toISOString() })
        .eq("id", billIds[0]);
      if (!paidErr) {
        log("Conta marcada como paga");
        assert(true, "Toggle pago funcionou");
      }
      await u1.sb.from("bills").update({ is_paid: false, paid_at: null }).eq("id", billIds[0]);
    }

    const { data: billsList } = await u1.sb.from("bills").select("*").eq("couple_id", workspaceId);
    assert((billsList?.length || 0) >= 2, `${billsList?.length} contas no workspace`);
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 7: EVENTOS / AGENDA
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 7: Eventos / Agenda ──");

  const eventIds = [];

  if (workspaceId) {
    const eventDate = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];
    const { data: ev1, error: ev1Err } = await u1.sb.from("events").insert({
      couple_id: workspaceId,
      title: "Consulta médica de teste",
      kind: "reminder",
      scope: "individual",
      due_date: eventDate,
      owner_profile_id: u1.id,
      note: "Teste de agenda"
    }).select("id");

    if (ev1Err) log(`Falha ao criar evento: ${ev1Err.message}`, "fail");
    else if (ev1?.[0]?.id) {
      eventIds.push(ev1[0].id);
      log(`Evento "Consulta médica" criado para ${eventDate}`);
      assert(true, "Evento criado");
    }

    const taskDate = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    const { data: ev2, error: ev2Err } = await u1.sb.from("events").insert({
      couple_id: workspaceId,
      title: "Comprar presentes de teste",
      kind: "task",
      scope: "group",
      due_date: taskDate,
      note: "Tarefa em grupo"
    }).select("id");

    if (ev2Err) log(`Falha ao criar tarefa: ${ev2Err.message}`, "fail");
    else if (ev2?.[0]?.id) {
      eventIds.push(ev2[0].id);
      log(`Tarefa "Comprar presentes" criada para ${taskDate}`);
      assert(true, "Tarefa criada");
    }

    // Toggle done
    if (eventIds.length > 0) {
      const { error: doneErr } = await u1.sb.from("events").update({ is_done: true }).eq("id", eventIds[0]);
      if (!doneErr) {
        log("Evento marcado como concluído");
        assert(true, "Toggle concluído funcionou");
      }
      await u1.sb.from("events").update({ is_done: false }).eq("id", eventIds[0]);
    }

    const { data: eventsList } = await u1.sb.from("events").select("*").eq("couple_id", workspaceId);
    assert((eventsList?.length || 0) >= 2, `${eventsList?.length} eventos no workspace`);
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 8: NOTIFICAÇÕES
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 8: Notificações ──");

  {
    const { data: notifications, error: notifErr } = await u1.sb
      .from("notifications")
      .select("*")
      .eq("user_id", u1.id)
      .order("created_at", { ascending: false });

    if (notifErr) log(`Erro notificações: ${notifErr.message}`, "fail");
    else {
      log(`Notificações do user 1: ${notifications?.length || 0}`);
      if (notifications?.length > 0) {
        const kinds = [...new Set(notifications.map(n => n.kind))];
        log(`  Tipos: ${kinds.join(", ")}`);
        notifications.slice(0, 3).forEach(n => log(`  • [${n.kind}] ${n.title}: ${n.message}`));
      }
      assert(true, "Consulta de notificações OK");
    }

    // Sync de notificações de contas
    const { error: syncErr } = await u1.sb.rpc("sync_due_bill_notifications", { p_days_ahead: 3 });
    if (syncErr) log(`Falha sync notificações: ${syncErr.message}`, "fail");
    else {
      log("Sync de notificações de contas executado");
      assert(true, "sync_due_bill_notifications OK");
    }

    // Verificar se novas notificações foram geradas
    const { data: notifications2 } = await u1.sb
      .from("notifications")
      .select("*")
      .eq("user_id", u1.id)
      .order("created_at", { ascending: false });
    log(`Notificações após sync: ${notifications2?.length || 0}`);

    // Marcar como lida
    if (notifications2?.length > 0) {
      const unread = notifications2.filter(n => !n.is_read);
      if (unread.length > 0) {
        const { error: readErr } = await u1.sb.from("notifications")
          .update({ is_read: true }).eq("id", unread[0].id);
        if (!readErr) {
          log("Notificação marcada como lida");
          assert(true, "Marcar como lida OK");
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 9: BOOTSTRAP DATA (visão completa)
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 9: Bootstrap data (visão completa) ──");

  {
    const { data: bootstrap, error: bootErr } = await u1.sb.rpc("get_app_bootstrap", { p_days_ahead: 3 });
    if (bootErr) log(`Falha bootstrap: ${bootErr.message}`, "fail");
    else if (bootstrap) {
      log(`Bootstrap → profile: ${bootstrap.profile ? "OK" : "null"}`);
      log(`Bootstrap → couple: ${bootstrap.couple?.name || "null"}`);
      log(`Bootstrap → members: ${bootstrap.members?.length || 0}`);
      log(`Bootstrap → categories: ${bootstrap.categories?.length || 0}`);
      log(`Bootstrap → transactions: ${bootstrap.transactions?.length || 0}`);
      log(`Bootstrap → goals: ${bootstrap.goals?.length || 0}`);
      log(`Bootstrap → bills: ${bootstrap.bills?.length || 0}`);
      log(`Bootstrap → events: ${bootstrap.events?.length || 0}`);
      log(`Bootstrap → notifications: ${bootstrap.notifications?.length || 0}`);
      assert(true, "Bootstrap data retornado");
      assert((bootstrap.categories?.length || 0) > 0, "Bootstrap tem categorias");
      assert((bootstrap.transactions?.length || 0) > 0, "Bootstrap tem transações");
      assert((bootstrap.bills?.length || 0) > 0, "Bootstrap tem contas");
      assert((bootstrap.members?.length || 0) > 0, "Bootstrap tem membros");
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 10: CRUD — UPDATES
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 10: Updates ──");

  if (transactionIds.length > 0) {
    const { error } = await u1.sb.from("transactions")
      .update({ description: "Almoço atualizado", amount: 55.00 })
      .eq("id", transactionIds[0]);
    assert(!error, `Update transação: ${error ? error.message : "OK"}`);
  }

  if (goalId) {
    const { error } = await u1.sb.from("goals")
      .update({ target_amount: 7500.00, name: "Viagem Atualizada" })
      .eq("id", goalId);
    assert(!error, `Update meta: ${error ? error.message : "OK"}`);
  }

  if (billIds.length > 0) {
    const { error } = await u1.sb.from("bills")
      .update({ amount: 150.00 })
      .eq("id", billIds[0]);
    assert(!error, `Update conta: ${error ? error.message : "OK"}`);
  }

  if (eventIds.length > 0) {
    const { error } = await u1.sb.from("events")
      .update({ title: "Consulta atualizada" })
      .eq("id", eventIds[0]);
    assert(!error, `Update evento: ${error ? error.message : "OK"}`);
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 11: TESTES DE INTEGRIDADE (EDGE CASES)
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 11: Testes de integridade ──");

  // Transação com valor negativo
  if (expenseCatId) {
    const { error } = await u1.sb.from("transactions").insert({
      couple_id: workspaceId,
      owner_profile_id: u1.id,
      description: "Inválida",
      amount: -10,
      type: "expense",
      category_id: expenseCatId,
      occurred_on: new Date().toISOString().split("T")[0],
      split_scope: "both"
    });
    assert(!!error, `Transação negativa rejeitada: ${error ? "SIM" : "NÃO"}`);
  }

  // Meta com valor negativo
  {
    const { error } = await u1.sb.from("goals").insert({
      couple_id: workspaceId, name: "Inválida", target_amount: -100, scope: "individual"
    });
    assert(!!error, `Meta negativa rejeitada: ${error ? "SIM" : "NÃO"}`);
  }

  // Workspace com tipo inválido
  {
    const { error } = await u1.sb.rpc("setup_my_workspace", {
      p_kind: "invalid_type", p_name: "Inválido"
    });
    assert(!!error, `Workspace tipo inválido rejeitado: ${error ? "SIM" : "NÃO"}`);
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 12: USER 2 TESTA VISUALIZAR DADOS DO WORKSPACE
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 12: User 2 visualiza dados compartilhados ──");

  {
    const { data: u2Session } = await u2.sb.auth.getSession();
    if (u2Session.session) {
      // User 2 deve ver as transações do workspace
      const { data: u2Tx } = await u2.sb.from("transactions").select("*").eq("couple_id", workspaceId);
      log(`User 2 vê ${u2Tx?.length || 0} transações`);
      assert((u2Tx?.length || 0) > 0, "User 2 consegue ver transações do workspace");

      // User 2 deve ver as contas
      const { data: u2Bills } = await u2.sb.from("bills").select("*").eq("couple_id", workspaceId);
      log(`User 2 vê ${u2Bills?.length || 0} contas`);
      assert((u2Bills?.length || 0) > 0, "User 2 consegue ver contas do workspace");

      // User 2 cria uma transação
      if (expenseCatId) {
        const { error: u2TxErr } = await u2.sb.from("transactions").insert({
          couple_id: workspaceId,
          owner_profile_id: u2.id,
          description: "Despesa do User 2",
          amount: 30.00,
          type: "expense",
          category_id: expenseCatId,
          occurred_on: new Date().toISOString().split("T")[0],
          split_scope: "both"
        });
        if (u2TxErr) log(`User 2 falha ao criar transação: ${u2TxErr.message}`, "fail");
        else {
          log("User 2 criou transação no workspace compartilhado");
          assert(true, "User 2 criou transação com sucesso");
        }
      }

      // User 2 deve ver o perfil do User 1 (partner)
      const { data: u2Bootstrap } = await u2.sb.rpc("get_app_bootstrap", { p_days_ahead: 3 });
      if (u2Bootstrap) {
        log(`User 2 bootstrap → partner: ${u2Bootstrap.partner?.full_name || "null"}`);
        assert(!!u2Bootstrap.partner, "User 2 vê o partner (User 1)");
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 13: DELEÇÃO DE DADOS
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 13: Deleção de dados ──");

  // Deletar todas as transações do workspace
  {
    const { data: txAll } = await u1.sb.from("transactions").select("id").eq("couple_id", workspaceId);
    for (const t of (txAll || [])) {
      await u1.sb.from("transactions").delete().eq("id", t.id);
    }
    const { data: txCheck } = await u1.sb.from("transactions").select("id").eq("couple_id", workspaceId);
    assert((txCheck?.length || 0) === 0, `Transações deletadas (restam ${txCheck?.length || 0})`);
  }

  // Deletar contas
  {
    const { data: billsAll } = await u1.sb.from("bills").select("id").eq("couple_id", workspaceId);
    for (const b of (billsAll || [])) {
      await u1.sb.from("bills").delete().eq("id", b.id);
    }
    const { data: billsCheck } = await u1.sb.from("bills").select("id").eq("couple_id", workspaceId);
    assert((billsCheck?.length || 0) === 0, `Contas deletadas (restam ${billsCheck?.length || 0})`);
  }

  // Deletar eventos
  {
    const { data: evAll } = await u1.sb.from("events").select("id").eq("couple_id", workspaceId);
    for (const e of (evAll || [])) {
      await u1.sb.from("events").delete().eq("id", e.id);
    }
    const { data: evCheck } = await u1.sb.from("events").select("id").eq("couple_id", workspaceId);
    assert((evCheck?.length || 0) === 0, `Eventos deletados (restam ${evCheck?.length || 0})`);
  }

  // Deletar meta
  if (goalId) {
    await u1.sb.from("goals").delete().eq("id", goalId);
  }
  {
    const { data: goalsCheck } = await u1.sb.from("goals").select("id").eq("couple_id", workspaceId);
    assert((goalsCheck?.length || 0) === 0, `Metas deletadas (restam ${goalsCheck?.length || 0})`);
  }

  // Deletar categoria customizada
  {
    const { data: customCats } = await u1.sb.from("categories").select("id")
      .eq("couple_id", workspaceId).eq("name", "Categoria Teste");
    for (const c of (customCats || [])) {
      await u1.sb.from("categories").delete().eq("id", c.id);
    }
    log("Categoria customizada deletada");
  }

  // ═══════════════════════════════════════════════════════════
  // FASE 14: LEAVE WORKSPACE
  // ═══════════════════════════════════════════════════════════
  console.log("\n── FASE 14: Leave workspace ──");

  {
    const { error: leaveErr } = await u1.sb.rpc("leave_workspace", { p_couple_id: workspaceId });
    if (leaveErr) log(`Falha ao sair do workspace: ${leaveErr.message}`, "fail");
    else {
      log("User 1 saiu do workspace");
      assert(true, "leave_workspace OK para User 1");
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RESUMO
  // ═══════════════════════════════════════════════════════════
  console.log("\n── LIMPEZA NECESSÁRIA ──");
  log("Os 6 usuários teste devem ser removidos manualmente no Supabase:", "warn");
  TEST_EMAILS.forEach(e => log(`  • ${e}`, "warn"));
  log(`Workspace ID: ${workspaceId}`, "warn");

  printSummary();
}

function printSummary() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  RESUMO DOS TESTES");
  console.log("══════════════════════════════════════════════════════");
  console.log(`  ✅ Passou: ${passed}`);
  console.log(`  ❌ Falhou: ${failed}`);
  console.log(`  📊 Total:  ${passed + failed}`);
  if (errors.length > 0) {
    console.log("\n  Falhas:");
    errors.forEach((e, i) => console.log(`    ${i + 1}. ${e}`));
  }
  console.log("══════════════════════════════════════════════════════\n");
}

runTests().catch(err => {
  console.error("Erro fatal:", err);
  printSummary();
});
