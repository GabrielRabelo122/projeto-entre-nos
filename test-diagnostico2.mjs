/**
 * Diagnóstico avançado — Usa RPC security definer para bypassar RLS
 * e verificar o estado real dos dados
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
  console.log("═══ DIAGNÓSTICO AVANÇADO ═══\n");

  const ts = Date.now();
  const email1 = `adv1-${ts}@test.com`;
  const email2 = `adv2-${ts}@test.com`;
  const pw = "Adv@123456";

  const u1 = makeClient();
  const u2 = makeClient();

  // Criar usuários
  const { data: s1 } = await u1.auth.signUp({ email: email1, password: pw, options: { data: { full_name: "Adv User 1" } } });
  const { data: s2 } = await u2.auth.signUp({ email: email2, password: pw, options: { data: { full_name: "Adv User 2" } } });
  console.log(`User 1: ${s1.user?.id}`);
  console.log(`User 2: ${s2.user?.id}`);

  // Verificar auth.uid() via função do banco
  const { data: uidCheck } = await u1.rpc("get_my_couple_id");
  console.log(`\nget_my_couple_id (User 1, antes do workspace): ${uidCheck}`);

  // Criar workspace
  const { data: wsId, error: wsErr } = await u1.rpc("setup_my_workspace", { p_kind: "couple", p_name: "Adv WS" });
  console.log(`\nWorkspace: ${wsId} (erro: ${wsErr?.message || "none"})`);

  // Verificar auth.uid() após workspace
  const { data: uidCheck2 } = await u1.rpc("get_my_couple_id");
  console.log(`get_my_couple_id (User 1, após workspace): ${uidCheck2}`);

  // Verificar is_in_my_couple
  const { data: isInCouple } = await u1.rpc("is_in_my_couple", { p_couple_id: wsId });
  console.log(`is_in_my_couple(wsId) para User 1: ${isInCouple}`);

  // ─── TESTE RLS: Categorias ───
  console.log("\n─── Teste RLS: Categorias ───");
  const { data: catsViaSelect, error: catsErr } = await u1.from("categories").select("id, name").eq("couple_id", wsId);
  console.log(`Categorias via SELECT direto: ${catsViaSelect?.length || 0} (erro: ${catsErr?.message || "none"})`);

  // Contar via bootstrap (security definer)
  const { data: boot } = await u1.rpc("get_app_bootstrap", { p_days_ahead: 3 });
  console.log(`Categorias via bootstrap (security definer): ${boot?.categories?.length || 0}`);
  if (boot?.categories) {
    boot.categories.forEach(c => console.log(`  ${c.icon} ${c.name} (${c.kind})`));
  }

  // ─── TESTE RLS: Convites ───
  console.log("\n─── Teste RLS: Convites ───");
  const { data: invViaSelect, error: invErr } = await u1.from("couple_invites").select("*").eq("couple_id", wsId);
  console.log(`Convites via SELECT direto: ${invViaSelect?.length || 0} (erro: ${invErr?.message || "none"})`);
  if (invErr) console.log(`  Detalhe erro: ${JSON.stringify(invErr)}`);

  // Verificar convite via bootstrap (que busca dentro de security definer)
  console.log(`Convites via bootstrap: ${boot?.invites?.length || 0}`);
  if (boot?.invites) {
    boot.invites.forEach(i => console.log(`  code: ${i.invite_code}, status: ${i.status}`));
  }

  // Verificar via list_my_workspaces (security definer)
  const { data: wsList } = await u1.rpc("list_my_workspaces");
  console.log(`\nlist_my_workspaces:`);
  if (wsList) wsList.forEach(w => console.log(`  ${w.name} — invite_code: ${w.invite_code || "null"}`));

  // ─── TESTE: Criar convite manualmente ───
  console.log("\n─── Teste: Criar convite via create_couple_invite ───");
  const { data: newInvite, error: newInvErr } = await u1.rpc("create_couple_invite", { p_invited_email: null });
  console.log(`create_couple_invite: couple_id=${newInvite?.[0]?.couple_id}, code=${newInvite?.[0]?.invite_code} (erro: ${newInvErr?.message || "none"})`);

  // Tentar ver o convite recém-criado
  const { data: invAfterCreate } = await u1.from("couple_invites").select("*").eq("couple_id", wsId);
  console.log(`Convites após create_couple_invite: ${invAfterCreate?.length || 0}`);
  if (invAfterCreate) invAfterCreate.forEach(i => console.log(`  code: ${i.invite_code}, status: ${i.status}, invited_by: ${i.invited_by}`));

  // ─── TESTE: Aceitar convite com User 2 ───
  console.log("\n─── Teste: Aceitar convite com User 2 ───");

  // Pegar o código do convite recém-criado
  const inviteCode = newInvite?.[0]?.invite_code;
  if (inviteCode) {
    console.log(`Código a usar: ${inviteCode}`);

    const { data: acceptResult, error: acceptErr } = await u2.rpc("accept_couple_invite", { p_invite_code: inviteCode });
    console.log(`Aceite: couple_id=${acceptResult} (erro: ${acceptErr?.message || "none"})`);

    if (!acceptErr) {
      // User 2 verifica workspace
      const { data: u2Members } = await u2.from("workspace_members").select("*").eq("couple_id", wsId);
      console.log(`User 2 vê workspace_members: ${u2Members?.length || 0}`);

      const { data: u2IsIn } = await u2.rpc("is_in_my_couple", { p_couple_id: wsId });
      console.log(`User 2 is_in_my_couple: ${u2IsIn}`);

      // User 1 cria transação
      const { data: cats } = await u1.from("categories").select("id").eq("couple_id", wsId).eq("kind", "expense").limit(1);
      if (cats?.[0]?.id) {
        const { error: txErr } = await u1.from("transactions").insert({
          couple_id: wsId, owner_profile_id: s1.user.id,
          description: "Teste RLS", amount: 10, type: "expense",
          category_id: cats[0].id, occurred_on: new Date().toISOString().split("T")[0], split_scope: "both"
        });
        console.log(`\nUser 1 criou transação: ${txErr?.message || "OK"}`);
      }

      // User 2 tenta ver
      const { data: u2Tx, error: u2TxErr } = await u2.from("transactions").select("*").eq("couple_id", wsId);
      console.log(`User 2 vê transações: ${u2Tx?.length || 0} (erro: ${u2TxErr?.message || "none"})`);

      // User 2 bootstrap
      const { data: u2Boot } = await u2.rpc("get_app_bootstrap", { p_days_ahead: 3 });
      console.log(`User 2 bootstrap: couple=${u2Boot?.couple?.name || "null"}, partner=${u2Boot?.partner?.full_name || "null"}, members=${u2Boot?.members?.length || 0}, tx=${u2Boot?.transactions?.length || 0}`);

      // User 2 tenta criar transação
      const { data: catsU2 } = await u2.from("categories").select("id").eq("couple_id", wsId).eq("kind", "expense").limit(1);
      console.log(`User 2 vê categorias: ${catsU2?.length || 0}`);
      if (catsU2?.[0]?.id) {
        const { error: u2TxCreateErr } = await u2.from("transactions").insert({
          couple_id: wsId, owner_profile_id: s2.user.id,
          description: "Teste User 2", amount: 20, type: "expense",
          category_id: catsU2[0].id, occurred_on: new Date().toISOString().split("T")[0], split_scope: "both"
        });
        console.log(`User 2 criou transação: ${u2TxCreateErr?.message || "OK"}`);
      }
    }
  } else {
    console.log("Nenhum código de convite disponível!");
  }

  console.log("\n═══ FIM DIAGNÓSTICO ═══");
}

diagnose().catch(console.error);
