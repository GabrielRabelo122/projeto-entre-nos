import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js?v=20260623b";

const isConfigured =
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("SEU-PROJETO") &&
  !SUPABASE_ANON_KEY.includes("SUA_CHAVE_PUBLICA");

if (!window.supabase) {
  throw new Error("A biblioteca do Supabase não foi carregada.");
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export function assertSupabaseConfigured() {
  if (!isConfigured) {
    throw new Error("Preencha `js/config.js` com a URL e a chave pública do Supabase.");
  }
}

export function isSupabaseConfigured() {
  return isConfigured;
}

export async function getSession() {
  if (!isConfigured) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn(email, password) {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href
    }
  });
  if (error) throw error;
  return data;
}

export async function signUp({ email, password, fullName }) {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName
      }
    }
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!isConfigured) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  if (!isConfigured) {
    return {
      data: {
        subscription: {
          unsubscribe() {}
        }
      }
    };
  }
  return supabase.auth.onAuthStateChange(callback);
}
