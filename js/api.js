import { APP_CONFIG } from "./config.js?v=20260623b";
import { supabase } from "./supabase.js?v=20260623b";

async function requireSingle(queryPromise, fallback = null) {
  const { data, error } = await queryPromise;
  if (error && error.code !== "PGRST116") throw error;
  return data ?? fallback;
}

function emptyBootstrap() {
  return {
    profile: null,
    couple: null,
    partner: null,
    members: [],
    workspaces: [],
    invites: [],
    categories: [],
    transactions: [],
    goals: [],
    bills: [],
    events: [],
    notifications: []
  };
}

export async function fetchBootstrapAppData(daysAhead = APP_CONFIG.billWarningDays) {
  const { data, error } = await supabase.rpc("get_app_bootstrap", {
    p_days_ahead: daysAhead
  });
  if (error) throw error;
  return {
    ...emptyBootstrap(),
    ...(data || {})
  };
}

export async function listWorkspaces() {
  const { data, error } = await supabase.rpc("list_my_workspaces");
  if (error) throw error;
  return data ?? [];
}

export async function setActiveWorkspace(coupleId) {
  const { data, error } = await supabase.rpc("set_active_workspace", {
    p_couple_id: coupleId
  });
  if (error) throw error;
  return data;
}

export async function bootstrapApp(session) {
  if (!session?.user) {
    return emptyBootstrap();
  }

  await upsertProfileFromAuth(session.user);
  const bootstrap = await fetchBootstrapAppData(APP_CONFIG.billWarningDays);

  let workspaces = [];
  try {
    workspaces = await listWorkspaces();
  } catch (error) {
    console.warn("list_my_workspaces falhou, usando fallback do bootstrap:", error);
    // Se o bootstrap trouxe um couple ativo, monta um workspace mínimo para a UI não ficar inconsistente
    if (bootstrap.couple?.id) {
      workspaces = [{
        id: bootstrap.couple.id,
        name: bootstrap.couple.name || "Sem nome",
        kind: bootstrap.couple.kind || "couple",
        role: "owner",
        is_active: true,
        invite_code: null
      }];
    }
  }

  return { ...bootstrap, workspaces };
}

export async function upsertProfileFromAuth(user) {
  const payload = {
    user_id: user.id,
    full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário",
    financial_goal: user.user_metadata?.financial_goal || null
  };

  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

export async function fetchMyProfile() {
  return requireSingle(
    supabase.from("profiles").select("*").eq("user_id", (await supabase.auth.getUser()).data.user.id).single()
  );
}

export async function fetchPartnerProfile(coupleId) {
  const user = (await supabase.auth.getUser()).data.user;
  // Busca membros do workspace para encontrar parceiros,
  // pois couple_id pode não ser confiável em cenários multi-workspace
  const { data: members, error: membersError } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("couple_id", coupleId);
  if (membersError) throw membersError;
  const memberIds = (members || []).map((m) => m.user_id).filter((id) => id !== user.id);
  if (!memberIds.length) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("user_id", memberIds)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function fetchCouple() {
  return requireSingle(supabase.from("couples").select("*").single());
}

export async function fetchCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("is_default", { ascending: false })
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchTransactions() {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      `
      *,
      category:categories(id, name, icon, kind),
      goal:goals(id, name),
      owner:profiles!transactions_owner_profile_id_fkey(user_id, full_name)
    `
    )
    .order("occurred_on", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchGoals() {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchBills() {
  const { data, error } = await supabase
    .from("bills")
    .select(
      `
      *,
      owner:profiles!bills_owner_profile_id_fkey(user_id, full_name)
    `
    )
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchNotifications() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return data ?? [];
}

export async function updateProfile(formData) {
  const user = (await supabase.auth.getUser()).data.user;
  const payload = {
    user_id: user.id,
    full_name: formData.fullName,
    avatar_url: formData.avatarUrl || null,
    monthly_income: Number(formData.monthlyIncome || 0)
  };

  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

export async function setupWorkspace(formData) {
  const { data, error } = await supabase.rpc("setup_my_workspace", {
    p_kind: formData.workspaceKind,
    p_name: formData.workspaceName || null
  });
  if (error) throw error;
  return data;
}

export async function createInvite(invitedEmail) {
  const { data, error } = await supabase.rpc("create_couple_invite", {
    p_invited_email: invitedEmail || null
  });
  if (error) throw error;
  return data;
}

export async function acceptInvite(inviteCode) {
  const { data, error } = await supabase.rpc("accept_couple_invite", {
    p_invite_code: inviteCode.trim().toUpperCase()
  });
  if (error) throw error;
  return data;
}

export async function leaveWorkspace(coupleId = null) {
  const { data, error } = await supabase.rpc("leave_workspace", {
    p_couple_id: coupleId
  });
  if (error) throw error;
  return data;
}

export async function createCategory(formData) {
  const { error } = await supabase.from("categories").insert({
    name: formData.name,
    icon: "",
    kind: formData.kind
  });
  if (error) throw error;
}

export async function updateCategory(categoryId, formData) {
  const { error } = await supabase.from("categories").update({
    name: formData.name,
    kind: formData.kind
  }).eq("id", categoryId);
  if (error) throw error;
}

export async function deleteCategory(categoryId) {
  const { error } = await supabase.from("categories").delete().eq("id", categoryId);
  if (error) throw error;
}

export async function createGoal(formData) {
  const { error } = await supabase.from("goals").insert({
    name: formData.name,
    target_amount: Number(formData.targetAmount),
    target_date: formData.targetDate || null,
    auto_allocate: formData.autoAllocate === "true",
    scope: formData.scope || "individual"
  });
  if (error) throw error;
}

export async function updateGoal(goalId, formData) {
  const { error } = await supabase.from("goals").update({
    name: formData.name,
    target_amount: Number(formData.targetAmount),
    target_date: formData.targetDate || null,
    auto_allocate: formData.autoAllocate === "true" || formData.autoAllocate === true,
    scope: formData.scope || "individual"
  }).eq("id", goalId);
  if (error) throw error;
}

export async function deleteGoal(goalId) {
  const { error } = await supabase.from("goals").delete().eq("id", goalId);
  if (error) throw error;
}

export async function createEvent(formData) {
  const { error } = await supabase.from("events").insert({
    title: formData.title,
    kind: formData.kind,
    scope: formData.scope || "individual",
    due_date: formData.dueDate || null,
    owner_profile_id: formData.ownerProfileId || null,
    note: formData.note || null
  });
  if (error) throw error;
}

export async function updateEvent(eventId, formData) {
  const { error } = await supabase.from("events").update({
    title: formData.title,
    kind: formData.kind,
    scope: formData.scope || "individual",
    due_date: formData.dueDate || null,
    owner_profile_id: formData.ownerProfileId || null,
    note: formData.note || null
  }).eq("id", eventId);
  if (error) throw error;
}

export async function toggleEventDone(eventId, isDone) {
  const { error } = await supabase.from("events").update({ is_done: isDone }).eq("id", eventId);
  if (error) throw error;
}

export async function deleteEvent(eventId) {
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw error;
}


export async function createTransaction(formData) {
  const payload = {
    description: formData.description,
    amount: Number(formData.amount),
    type: formData.type,
    owner_profile_id: formData.ownerProfileId,
    category_id: formData.categoryId,
    occurred_on: formData.occurredOn,
    split_scope: formData.splitScope,
    goal_id: formData.goalId || null,
    note: formData.note || null
  };

  const { error } = await supabase.from("transactions").insert(payload);
  if (error) throw error;
}

export async function updateTransaction(transactionId, formData) {
  const payload = {
    description: formData.description,
    amount: Number(formData.amount),
    type: formData.type,
    owner_profile_id: formData.ownerProfileId,
    category_id: formData.categoryId,
    occurred_on: formData.occurredOn,
    split_scope: formData.splitScope,
    goal_id: formData.goalId || null,
    note: formData.note || null
  };
  const { error } = await supabase.from("transactions").update(payload).eq("id", transactionId);
  if (error) throw error;
}

export async function deleteTransaction(transactionId) {
  const { error } = await supabase.from("transactions").delete().eq("id", transactionId);
  if (error) throw error;
}

export async function createBill(formData) {
  const isRecurring = formData.isRecurring === "true" || formData.isRecurring === true;
  const { error } = await supabase.from("bills").insert({
    title: formData.title,
    amount: Number(formData.amount),
    due_date: formData.dueDate,
    owner_profile_id: formData.ownerProfileId || null,
    split_scope: formData.splitScope || "both",
    is_recurring: isRecurring,
    recurrence_day: isRecurring ? Number(formData.recurrenceDay) || null : null
  });
  if (error) throw error;
}

export async function updateBill(billId, formData) {
  const isRecurring = formData.isRecurring === "true" || formData.isRecurring === true;
  const payload = {
    title: formData.title,
    amount: Number(formData.amount),
    due_date: formData.dueDate,
    owner_profile_id: formData.ownerProfileId || null,
    split_scope: formData.splitScope || "both",
    is_recurring: isRecurring,
    recurrence_day: isRecurring ? Number(formData.recurrenceDay) || null : null
  };
  const { error } = await supabase.from("bills").update(payload).eq("id", billId);
  if (error) throw error;
}

export async function createBillInstance(formData) {
  const { error } = await supabase.from("bills").insert({
    title: formData.title,
    amount: Number(formData.amount),
    due_date: formData.dueDate,
    owner_profile_id: formData.ownerProfileId || null,
    split_scope: formData.splitScope || "both",
    is_paid: formData.isPaid || false,
    is_recurring: false,
    recurrence_day: null
  });
  if (error) throw error;
}

export async function toggleBillPaid(billId, isPaid) {
  console.log("[toggleBillPaid] Iniciando — billId:", billId, "isPaid:", isPaid);
  const payload = {
    is_paid: isPaid,
    paid_at: isPaid ? new Date().toISOString() : null
  };
  console.log("[toggleBillPaid] payload:", payload);
  const { data, error } = await supabase
    .from("bills")
    .update(payload)
    .eq("id", billId);
  console.log("[toggleBillPaid] resultado — data:", data, "error:", error);
  if (error) {
    console.error("[toggleBillPaid] ERRO Supabase:", error.message, error.code, error.details);
    throw error;
  }
}

export async function deleteBill(billId) {
  const { error } = await supabase.from("bills").delete().eq("id", billId);
  if (error) throw error;
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("is_read", false);
  if (error) throw error;
}

export async function syncDueBillNotifications(daysAhead = 3) {
  const { error } = await supabase.rpc("sync_due_bill_notifications", {
    p_days_ahead: daysAhead
  });
  if (error) throw error;
}

/**
 * Expande contas recorrentes em instâncias mensais virtuais.
 * Contas recorrentes (is_recurring=true) geram instâncias para o mês atual e próximo mês.
 * Contas normais são mantidas como estão.
 * Se já existe uma conta real para o mesmo mês/ano de uma instância recorrente,
 * a instância virtual não é gerada (evita duplicação).
 */
export function expandRecurringBills(bills) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const months = [];
  for (let offset = -1; offset <= 2; offset++) {
    const d = new Date(currentYear, currentMonth + offset, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  // Coleta as contas não-recorrentes (contas reais já existentes)
  const nonRecurringBills = bills.filter(b => !b.is_recurring || !b.recurrence_day);

  // Monta um set de chaves "YYYY-MM" das contas reais já existentes por título
  const existingBillMonths = new Set();
  for (const bill of nonRecurringBills) {
    if (bill.due_date) {
      const key = `${bill.title}|${bill.due_date.slice(0, 7)}`;
      existingBillMonths.add(key);
    }
  }

  const result = [...nonRecurringBills];

  for (const bill of bills) {
    if (!bill.is_recurring || !bill.recurrence_day) continue;

    for (const { year, month } of months) {
      const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
      const billMonthKey = `${bill.title}|${monthKey}`;

      // Se já existe uma conta real para este mês, não gera instância virtual
      if (existingBillMonths.has(billMonthKey)) continue;

      const maxDay = new Date(year, month + 1, 0).getDate();
      const day = Math.min(bill.recurrence_day, maxDay);
      const dueDate = `${monthKey}-${String(day).padStart(2, "0")}`;

      result.push({
        ...bill,
        id: `recur_${bill.id}_${monthKey}`,
        _template_id: bill.id,
        due_date: dueDate,
        is_paid: false,
        paid_at: null,
        is_recurring_instance: true
      });
    }
  }

  return result;
}
