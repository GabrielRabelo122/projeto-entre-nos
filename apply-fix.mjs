/**
 * Aplica as correções dos Problemas 1 e 2 diretamente no Supabase via API.
 * Uso: node apply-fix.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = "https://nxjwiqtobquflpnmbabj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54andpcXRvYnF1Zmxwbm1iYWJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MzkwMDEsImV4cCI6MjEwMTUxNTAwMX0.NRg1L0PGh4PC_bky2kHSEcHxm8aL0QWXLjlMiF6Ccls";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

async function applyFix() {
  console.log("═══ Aplicando correções via Supabase REST API ═══\n");

  // Tentar executar via endpoint SQL do Supabase (requer service_role)
  const sqlContent = readFileSync(resolve(__dirname, "supabase/fix-problems.sql"), "utf-8");

  // Método 1: Tentar via /rest/v1 (PostgREST) — provavelmente não funcionará para DDL
  console.log("Tentando Método 1: PostgREST /rest/v1...");
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sql: sqlContent })
    });
    const text = await response.text();
    console.log(`  Status: ${response.status}`);
    console.log(`  Resposta: ${text.substring(0, 200)}`);
    if (response.ok) {
      console.log("✅ Correção aplicada com sucesso via PostgREST!");
      return;
    }
  } catch (err) {
    console.log(`  Erro: ${err.message}`);
  }

  // Método 2: Tentar via pg REST query endpoint
  console.log("\nTentando Método 2: /pg/query...");
  try {
    const response = await fetch(`${SUPABASE_URL}/pg/query`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "text/plain"
      },
      body: sqlContent
    });
    const text = await response.text();
    console.log(`  Status: ${response.status}`);
    console.log(`  Resposta: ${text.substring(0, 200)}`);
    if (response.ok) {
      console.log("✅ Correção aplicada com sucesso via pg/query!");
      return;
    }
  } catch (err) {
    console.log(`  Erro: ${err.message}`);
  }

  // Método 3: Verificar se é possível criar uma função helper via REST
  console.log("\nTentando Método 3: Verificar funções disponíveis...");
  try {
    const { data: funcs, error } = await sb.rpc("get_my_couple_id");
    console.log(`  RPC get_my_couple_id funciona: ${funcs !== undefined ? "SIM" : "NÃO"}`);
  } catch (err) {
    console.log(`  Erro: ${err.message}`);
  }

  console.log("\n─── Resultado ───");
  console.log("Não foi possível executar DDL remotamente com a chave anon.");
  console.log("A chave anon não tem permissão para CREATE FUNCTION.\n");
  console.log("📋 APLICAÇÃO MANUAL NECESSÁRIA:");
  console.log("1. Acesse: https://supabase.com/dashboard/project/nxjwiqtobquflpnmbabj/sql-editor");
  console.log("2. Cole o conteúdo do arquivo: supabase/fix-problems.sql");
  console.log("3. Clique em 'Run' para executar");
  console.log("\nO script corrige:");
  console.log("  • Problema 1: setup_my_workspace → gera código de convite automaticamente");
  console.log("  • Problema 2: bootstrap_default_categories → 19 categorias (era 8)");
  console.log("  • Bônus: gera convites para workspaces existentes que estão sem");
}

applyFix().catch(console.error);
