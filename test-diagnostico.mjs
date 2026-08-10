/**
 * Diagnóstico — Investiga problemas encontrados no teste completo
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nxjwiqtobquflpnmbabj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54andpcXRvYnF1Zmxwbm1iYWJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MzkwMDEsImV4cCI6MjEwMTUxNTAwMX0.NRg1L0PGh4PC_bky2kHSEcHxm8aL0QWXLjlMiF6Ccls";

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
}

async function diagnose() {
  console.log("═══ DIAGNÓSTICO ═══\n");

  const ts = Date.now();
  const email1 = `diag1-${ts}@test.com`;
  const email2 = `diag2-${ts}@test.com`;
  const pw = "Diag@123456";

  const u1 = makeClient();
  const u2 = makeClient();

  // Criar 2 usuários
  const { data: s1, error: e1 } = await u1.auth.signUp({ email: email1, password: pw, options: { data: { full_name: "Diag User 1" } } });
  const { data: s2, error: e2 } = await u2.auth.signUp({ email: email2, password: pw, options: { data: { full_name: "Diag User 2" } } });
  console.log(`User 1 criado: ${s1.user?.id} (erro: ${e1?.message || "none"})`);
  console.log(`User 2 criado: ${s2.user?.id} (erro: ${e2?.message || "none"})`);

  // Verificar sessão
  const { data: sess1 } = await u1.auth.getSession();
  console.log(`\nSessão User 1: ${sess1.session ? "ATIVA" : "INATIVA"}`);

  // Criar workspace
  const { data: wsId, error: wsErr } = await u1.rpc("setup_my_workspace", { p_kind: "couple", p_name: "Diag WS" });
  console.log(`\nWorkspace criado: ${wsId} (erro: ${wsErr?.message || "none"})`);

  // Verificar categorias
  const { data: cats, error: catsErr } = await u1.from("categories").select("*").eq("couple_id", wsId);
  console.log(`\nCategorias: ${cats?.length || 0} (erro: ${catsErr?.message || "none"})`);
  if (cats) cats.forEach(c => console.log(`  ${c.icon} ${c.name} (${c.kind}) — default: ${c.is_default}`));

  // Verificar convites
  const { data: invites, error: invErr } = await u1.from("couple_invites").select("*").eq("couple_id", wsId);
  console.log(`\nConvites: ${invites?.length || 0} (erro: ${invErr?.message || "none"})`);
  if (invites) invites.forEach(i => console.log(`  code: ${i.invite_code}, status: ${i.status}, invited_by: ${i.invited_by}`));

  // Verificar workspace_members
  const { data: members, error: memErr } = await u1.from("workspace_members").select("*").eq("couple_id", wsId);
  console.log(`\nWorkspace members: ${members?.length || 0} (erro: ${memErr?.message || "none"})`);
  if (members) members.forEach(m => console.log(`  user_id: ${m.user_id}, role: ${m.role}`));

  // Verificar perfil
  const { data: profile } = await u1.from("profiles").select("*").eq("user_id", s1.user.id).single();
  console.log(`\nPerfil User 1: couple_id=${profile?.couple_id}, active_couple_id=${profile?.active_couple_id}`);

  // Tentar aceitar convite com User 2
  if (invites?.length > 0) {
    const code = invites[0].invite_code;
    console.log(`\nTentando aceitar convite "${code}" com User 2...`);

    const { data: sess2 } = await u2.auth.getSession();
    console.log(`Sessão User 2: ${sess2.session ? "ATIVA" : "INATIVA"}`);

    const { data: acceptResult, error: acceptErr } = await u2.rpc("accept_couple_invite", { p_invite_code: code });
    console.log(`Aceite resultado: ${acceptResult} (erro: ${acceptErr?.message || "none"})`);

    // Verificar workspace_members após aceite
    const { data: members2, error: mem2Err } = await u2.from("workspace_members").select("*").eq("couple_id", wsId);
    console.log(`\nWorkspace members após aceite: ${members2?.length || 0} (erro: ${mem2Err?.message || "none"})`);
    if (members2) members2.forEach(m => console.log(`  user_id: ${m.user_id}, role: ${m.role}`));

    // Verificar perfil User 2
    const { data: profile2 } = await u2.from("profiles").select("*").eq("user_id", s2.user.id).single();
    console.log(`Perfil User 2: couple_id=${profile2?.couple_id}, active_couple_id=${profile2?.active_couple_id}`);

    // User 2 tenta ver transações
    // Primeiro, User 1 cria uma transação
    const { data: catsU1 } = await u1.from("categories").select("id").eq("couple_id", wsId).eq("kind", "expense").limit(1);
    if (catsU1?.[0]?.id) {
      const { error: txErr } = await u1.from("transactions").insert({
        couple_id: wsId,
        owner_profile_id: s1.user.id,
        description: "Teste diag",
        amount: 10,
        type: "expense",
        category_id: catsU1[0].id,
        occurred_on: new Date().toISOString().split("T")[0],
        split_scope: "both"
      });
      console.log(`\nUser 1 criou transação: ${txErr?.message || "OK"}`);
    }

    // User 2 tenta ver
    const { data: u2Tx, error: u2TxErr } = await u2.from("transactions").select("*").eq("couple_id", wsId);
    console.log(`User 2 vê transações: ${u2Tx?.length || 0} (erro: ${u2TxErr?.message || "none"})`);

    // User 2 tenta ver bootstrap
    const { data: u2Boot, error: u2BootErr } = await u2.rpc("get_app_bootstrap", { p_days_ahead: 3 });
    console.log(`User 2 bootstrap:`);
    console.log(`  couple: ${u2Boot?.couple?.name || "null"}`);
    console.log(`  partner: ${u2Boot?.partner?.full_name || "null"}`);
    console.log(`  members: ${u2Boot?.members?.length || 0}`);
    console.log(`  transactions: ${u2Boot?.transactions?.length || 0}`);
    console.log(`  categories: ${u2Boot?.categories?.length || 0}`);
    if (u2BootErr) console.log(`  erro: ${u2BootErr.message}`);

    // User 2 tenta criar transação
    const { data: catsU2 } = await u2.from("categories").select("id").eq("couple_id", wsId).eq("kind", "expense").limit(1);
    console.log(`\nUser 2 vê categorias: ${catsU2?.length || 0}`);
    if (catsU2?.[0]?.id) {
      const { error: u2CreateErr } = await u2.from("transactions").insert({
        couple_id: wsId,
        owner_profile_id: s2.user.id,
        description: "Teste do User 2",
        amount: 20,
        type: "expense",
        category_id: catsU2[0].id,
        occurred_on: new Date().toISOString().split("T")[0],
        split_scope: "both"
      });
      console.log(`User 2 criou transação: ${u2CreateErr?.message || "OK"}`);
    }
  } else {
    console.log("\n⚠️ Nenhum convite encontrado! Este é o problema raiz.");
    console.log("O setup_my_workspace deveria ter criado um convite automaticamente.");
  }

  console.log("\n═══ FIM DIAGNÓSTICO ═══");
}

diagnose().catch(console.error);
