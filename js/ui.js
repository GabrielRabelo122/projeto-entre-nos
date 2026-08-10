import { APP_CONFIG } from "./config.js?v=20260623b";

const fmtCurrency = new Intl.NumberFormat(APP_CONFIG.locale, {
  style: "currency",
  currency: APP_CONFIG.currency
});

/**
 * Formata um valor numérico para o formato monetário brasileiro com vírgula.
 * Ex.: 12 → "12,00" | 1234.5 → "1.234,50" | 0.5 → "0,50"
 */
export function formatMoneyValue(value) {
  const num = Number(value);
  if (isNaN(num)) return "";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const fmtDate = new Intl.DateTimeFormat(APP_CONFIG.locale, {
  day: "2-digit",
  month: "short"
});

const fmtMonthYear = new Intl.DateTimeFormat(APP_CONFIG.locale, {
  month: "short",
  year: "2-digit"
});

let expenseChart = null;
let trendChart = null;
let reportCharts = [];
let calendarDate = new Date();
let agendaFilter = "all";
let selectedDay = null;

// Cache para evitar re-criação desnecessária de gráficos
let _lastChartSignature = null;

function computeChartSignature(scopedTransactions, dashboardFilters) {
  // Gera uma assinatura simples dos dados para saber se os gráficos precisam ser re-criados
  const txCount = scopedTransactions.length;
  const period = dashboardFilters?.period || "30";
  const owner = dashboardFilters?.ownerProfileId || "";
  // Usa a soma dos valores como heurística de mudança
  const totalAmount = scopedTransactions.reduce((s, t) => s + Number(t.amount || 0), 0);
  return `${txCount}|${period}|${owner}|${totalAmount}`;
}

const dom = {
  authView: document.querySelector("#authView"),
  appView: document.querySelector("#appView"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loadingTitle: document.querySelector("#loadingTitle"),
  loadingMessage: document.querySelector("#loadingMessage"),
  loadingActions: document.querySelector("#loadingActions"),
  toastContainer: document.querySelector("#toastContainer"),
  summaryGrid: document.querySelector("#summaryGrid"),
  billsList: document.querySelector("#billsList"),
  transactionList: document.querySelector("#transactionList"),
  goalList: document.querySelector("#goalList"),
  categoryList: document.querySelector("#categoryList"),
  notificationList: document.querySelector("#notificationList"),
  notificationPanel: document.querySelector("#notificationPanel"),
  notificationDot: document.querySelector("#notificationDot"),
  healthGaugeFill: document.querySelector("#healthGaugeFill"),
  healthGaugeValue: document.querySelector("#healthGaugeValue"),
  healthPill: document.querySelector("#healthPill"),
  healthEnvName: document.querySelector("#healthEnvName"),
  healthClassification: document.querySelector("#healthClassification"),
  healthExplanation: document.querySelector("#healthExplanation"),
  healthFactors: document.querySelector("#healthFactors"),
  healthInstantDelta: document.querySelector("#healthInstantDelta"),
  welcomeTitle: document.querySelector("#welcomeTitle"),
  coupleName: document.querySelector("#coupleName"),
  workspaceSelect: document.querySelector("#workspaceSelect"),
  partnerStatus: document.querySelector("#partnerStatus"),
  workspaceList: document.querySelector("#workspaceList"),
  envSelectorTrigger: document.querySelector("#envSelectorTrigger"),
  envSelectorDropdown: document.querySelector("#envSelectorDropdown"),
  envSelectorList: document.querySelector("#envSelectorList"),
  transactionOwnerSelect: document.querySelector("#transactionOwnerSelect"),
  filterOwnerSelect: document.querySelector("#filterOwnerSelect"),
  dashboardOwnerSelect: document.querySelector("#dashboardOwnerSelect"),
  billOwnerSelect: document.querySelector("#billOwnerSelect"),
  eventOwnerSelect: document.querySelector("#eventOwnerSelect"),
  eventScopeSelect: document.querySelector("#eventScopeSelect"),
  transactionScopeSelect: document.querySelector("#transactionScopeSelect"),
  billScopeSelect: document.querySelector("#billScopeSelect"),
  goalScopeSelect: document.querySelector("#goalScopeSelect"),
  reportScopeSelect: document.querySelector("#reportScopeSelect"),
  transactionCategorySelect: document.querySelector("#transactionCategorySelect"),
  filterCategorySelect: document.querySelector("#filterCategorySelect"),
  transactionGoalSelect: document.querySelector("#transactionGoalSelect"),
  transactionForm: document.querySelector("#transactionForm"),
  profileForm: document.querySelector("#profileForm"),
  workspaceSetupPanel: document.querySelector("#workspaceSetupPanel"),
  memberList: document.querySelector("#memberList"),
  inviteList: document.querySelector("#inviteList"),
  eventList: document.querySelector("#eventList"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarMonthTitle: document.querySelector("#calendarMonthTitle"),
  calendarDayDetail: document.querySelector("#calendarDayDetail"),
  agendaListTitle: document.querySelector("#agendaListTitle"),
  navLinks: document.querySelectorAll("[data-tab-target]"),
  tabs: document.querySelectorAll(".tab-panel")
};

function getPeople(state) {
  return state.members?.length ? state.members : [state.profile, state.partner].filter(Boolean);
}

function formatDateLabel(dateValue, fallback = "Sem data definida") {
  if (!dateValue) return fallback;
  return fmtDate.format(new Date(`${dateValue}T12:00:00`));
}

function getWorkspaceKindLabel(kind) {
  return {
    couple: "Casal",
    family: "Família",
    group: "Grupo",
    company: "Empresa"
  }[kind] || "Ambiente";
}

function getScopeLabel(scopeValue, appState) {
  if (!scopeValue || scopeValue === "self") return "Individual";
  if (scopeValue === "both") {
    const activeWs = appState?.workspaces?.find(w => w.is_active);
    return activeWs?.name || "Ambiente";
  }
  const ws = appState?.workspaces?.find(w => w.id === scopeValue);
  return ws?.name || getWorkspaceKindLabel(ws?.kind) || "Ambiente";
}

function getInviteStatusLabel(invite) {
  if (!invite) return "Desconhecido";
  if (invite.status === "accepted") return "Aceito";
  if (invite.status === "cancelled") return "Cancelado";
  if (invite.status === "pending" && invite.expires_at && new Date(invite.expires_at) < new Date()) return "Expirado";
  return "Pendente";
}

function emptyStateMessage(title, message) {
  return `<article class="list-card"><div class="list-card-main"><strong>${title}</strong><span class="muted">${message}</span></div></article>`;
}

export function showEnvStep(stepId) {
  // Legacy function kept for backward compatibility; no longer used.
}

export function showEnvInviteCode(code) {
  // Legacy function kept for backward compatibility; no longer used.
}

export function getDOM() {
  return dom;
}

export function setLoading(visible, options = {}) {
  if (dom.loadingOverlay) dom.loadingOverlay.classList.toggle("hidden", !visible);
  if (dom.loadingTitle) dom.loadingTitle.textContent = options.title || "Carregando seu espaço";
  if (dom.loadingMessage) dom.loadingMessage.textContent = options.message || "Aguarde enquanto sincronizamos seus dados.";
  if (dom.loadingActions) dom.loadingActions.classList.add("hidden");
}

export function showLoadingFallback({
  title = "A conexão demorou mais do que o esperado",
  message = "Você pode tentar novamente agora ou sair e entrar de novo."
} = {}) {
  if (dom.loadingOverlay) dom.loadingOverlay.classList.remove("hidden");
  if (dom.loadingTitle) dom.loadingTitle.textContent = title;
  if (dom.loadingMessage) dom.loadingMessage.textContent = message;
  if (dom.loadingActions) dom.loadingActions.classList.remove("hidden");
}

export function showToast(message, tone = "info") {
  if (!dom.toastContainer) return;
  const toast = document.createElement("article");
  toast.className = `toast ${tone}`;
  toast.innerHTML = `<strong>${message}</strong>`;
  dom.toastContainer.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

export function setAuthMode(isAuthenticated) {
  if (dom.authView) dom.authView.classList.toggle("hidden", isAuthenticated);
  if (dom.appView) dom.appView.classList.toggle("hidden", !isAuthenticated);
}

export function switchTab(tabId) {
  if (dom.navLinks) dom.navLinks.forEach((button) => {
    button.classList.toggle("active", button.dataset.tabTarget === tabId);
  });
  if (dom.tabs) dom.tabs.forEach((tab) => {
    tab.classList.toggle("hidden", tab.id !== tabId);
  });
}

function getDashboardPeriodLabel(period) {
  return {
    "7": "últimos 7 dias",
    "30": "últimos 30 dias",
    "90": "últimos 90 dias",
    "365": "últimos 12 meses",
    all: "todo o período"
  }[period] || "período selecionado";
}

function getDashboardScopedTransactions(state, dashboardFilters = {}) {
  const ownerProfileId = dashboardFilters.ownerProfileId || "";
  const period = dashboardFilters.period || "30";
  let startDate = null;

  if (period !== "all") {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (Number(period) - 1));
  }

  return state.transactions.filter((transaction) => {
    if (ownerProfileId && transaction.owner_profile_id !== ownerProfileId) return false;
    if (!startDate) return true;
    return new Date(`${transaction.occurred_on}T12:00:00`) >= startDate;
  });
}

function getDashboardOwnerLabel(state, dashboardFilters = {}) {
  if (!dashboardFilters.ownerProfileId) return "todo o ambiente";
  const profile = getPeople(state).find((item) => item.user_id === dashboardFilters.ownerProfileId);
  return profile?.full_name || "pessoa selecionada";
}

export function populateDynamicOptions(state, dashboardFilters = {}) {
  const people = getPeople(state);
  const ownerOptions = people
    .map((profile) => `<option value="${profile.user_id}">${profile.full_name}</option>`)
    .join("");
  const goalOptions = state.goals
    .map((goal) => `<option value="${goal.id}">${goal.name}</option>`)
    .join("");

  const currentType = dom.transactionForm?.type?.value || "expense";
  updateCategoryOptionsForType(state, currentType);

  const allCategories = state.categories || [];
  const allCategoryOptions = allCategories
    .map((category) => `<option value="${category.id}">${category.name}</option>`)
    .join("");
  if (dom.filterCategorySelect) dom.filterCategorySelect.innerHTML = `<option value="">Todas</option>${allCategoryOptions}`;

  if (dom.transactionOwnerSelect) dom.transactionOwnerSelect.innerHTML = ownerOptions;
  if (dom.filterOwnerSelect) dom.filterOwnerSelect.innerHTML = `<option value="">Todos</option>${ownerOptions}`;
  if (dom.dashboardOwnerSelect) dom.dashboardOwnerSelect.innerHTML = `<option value="">Todos do ambiente</option>${ownerOptions}`;
  if (dom.billOwnerSelect) dom.billOwnerSelect.innerHTML = `<option value="">Sem responsável fixo</option>${ownerOptions}`;
  if (dom.eventOwnerSelect) dom.eventOwnerSelect.innerHTML = `<option value="">Sem responsável fixo</option>${ownerOptions}`;
  if (dom.transactionGoalSelect) dom.transactionGoalSelect.innerHTML = `<option value="">Nenhuma</option>${goalOptions}`;

  // Populate transaction scope select with workspaces
  if (dom.transactionScopeSelect) {
    const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
    const wsOptions = workspaces
      .map((ws) => `<option value="${ws.id}">${ws.name || getWorkspaceKindLabel(ws.kind)}</option>`)
      .join("");
    dom.transactionScopeSelect.innerHTML = `<option value="self">Individual</option>${wsOptions}`;
  }

  // Populate bill scope select with workspaces
  if (dom.billScopeSelect) {
    const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
    const wsOptions = workspaces
      .map((ws) => `<option value="${ws.id}">${ws.name || getWorkspaceKindLabel(ws.kind)}</option>`)
      .join("");
    dom.billScopeSelect.innerHTML = `<option value="self">Individual</option>${wsOptions}`;
  }

  // Populate event scope select with workspaces
  if (dom.eventScopeSelect) {
    const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
    const workspaceOptions = workspaces
      .map((ws) => `<option value="${ws.id}">${ws.name || getWorkspaceKindLabel(ws.kind)}</option>`)
      .join("");
    dom.eventScopeSelect.innerHTML = `<option value="individual">Individual</option>${workspaceOptions}`;
  }

  // Populate goal scope select with workspaces
  if (dom.goalScopeSelect) {
    const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
    const wsOptions = workspaces
      .map((ws) => `<option value="${ws.id}">${ws.name || getWorkspaceKindLabel(ws.kind)}</option>`)
      .join("");
    dom.goalScopeSelect.innerHTML = `<option value="individual">Individual</option>${wsOptions}`;
  }

  // Populate report scope select with workspaces
  if (dom.reportScopeSelect) {
    const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
    const wsOptions = workspaces
      .map((ws) => `<option value="${ws.id}">${ws.name || getWorkspaceKindLabel(ws.kind)}</option>`)
      .join("");
    dom.reportScopeSelect.innerHTML = `<option value="individual">Individual</option>${wsOptions}`;
  }

  // Populate bill, goal, and transaction filter selects
  const billWorkspaceFilter = document.querySelector("#billWorkspaceFilter");
  const goalWorkspaceFilter = document.querySelector("#goalWorkspaceFilter");
  const transactionWorkspaceFilter = document.querySelector("#transactionWorkspaceFilter");
  const billOwnerFilter = document.querySelector("#billOwnerFilter");
  const goalOwnerFilter = document.querySelector("#goalOwnerFilter");

  const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
  const workspaceFilterOptions = workspaces
    .map((ws) => `<option value="${ws.id}">${ws.name || getWorkspaceKindLabel(ws.kind)}</option>`)
    .join("");

  if (billWorkspaceFilter) billWorkspaceFilter.innerHTML = `<option value="">Todos os ambientes</option>${workspaceFilterOptions}`;
  if (goalWorkspaceFilter) goalWorkspaceFilter.innerHTML = `<option value="">Todos os ambientes</option>${workspaceFilterOptions}`;
  if (transactionWorkspaceFilter) transactionWorkspaceFilter.innerHTML = `<option value="">Todos os ambientes</option>${workspaceFilterOptions}`;
  if (billOwnerFilter) billOwnerFilter.innerHTML = `<option value="">Todos</option>${ownerOptions}`;
  if (goalOwnerFilter) goalOwnerFilter.innerHTML = `<option value="">Todos</option>${ownerOptions}`;

  if (state.profile && dom.profileForm) {
    if (dom.transactionOwnerSelect) dom.transactionOwnerSelect.value = state.profile.user_id;
    if (dom.billOwnerSelect) dom.billOwnerSelect.value = "";
    if (dom.eventOwnerSelect) dom.eventOwnerSelect.value = "";
    if (dom.dashboardOwnerSelect) dom.dashboardOwnerSelect.value = dashboardFilters.ownerProfileId || "";
    if (dom.profileForm.fullName) dom.profileForm.fullName.value = state.profile.full_name || "";
    if (dom.profileForm.avatarUrl) dom.profileForm.avatarUrl.value = state.profile.avatar_url || "";
    if (dom.profileForm.monthlyIncome) dom.profileForm.monthlyIncome.value = state.profile.monthly_income || "";
  }
}

export function updateCategoryOptionsForType(state, type) {
  if (!dom.transactionCategorySelect) return;
  
  const categories = state.categories || [];
  const filtered = categories.filter((category) => {
    if (type === "income") return category.kind === "income";
    if (type === "expense") return category.kind === "expense" || category.kind === "reserve";
    return true;
  });
  
  if (!filtered.length) {
    dom.transactionCategorySelect.innerHTML = `<option value="">Nenhuma categoria disponível — crie uma nas configurações</option>`;
    return;
  }
  
  const options = filtered
    .map((category) => `<option value="${category.id}">${category.name}</option>`)
    .join("");
  dom.transactionCategorySelect.innerHTML = options;
}

let _prevHealthScore = null;

// Minimalist outline SVG icons (Feather/Lucide style, stroke-only)
const _svgAttrs = `width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;
const healthIcons = {
  wallet: `<svg ${_svgAttrs}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a1 1 0 1 0 0 2h4v-2Z"/></svg>`,
  calendar: `<svg ${_svgAttrs}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  file: `<svg ${_svgAttrs}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  alert: `<svg ${_svgAttrs}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  chart: `<svg ${_svgAttrs}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  target: `<svg ${_svgAttrs}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  clipboard: `<svg ${_svgAttrs}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
  scale: `<svg ${_svgAttrs}><line x1="12" y1="3" x2="12" y2="21"/><polyline points="4 9 12 3 20 9"/><path d="M4 9a4 4 0 0 0 4 4h0"/><path d="M16 9a4 4 0 0 1 4 4h0"/></svg>`,
  copy: `<svg ${_svgAttrs}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
};

function getHealthModel(state) {
  const transactions = state.transactions || [];
  const bills = state.bills || [];
  const goals = state.goals || [];
  const events = state.events || [];

  const incomes = transactions.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenses = transactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const balance = incomes - expenses;
  const hasData = incomes > 0 || expenses > 0;

  const today = new Date().toISOString().slice(0, 10);
  const dueSoon = bills.filter((bill) => {
    const due = new Date(`${bill.due_date}T12:00:00`);
    const diff = Math.ceil((due - new Date()) / 86400000);
    return !bill.is_paid && diff >= 0 && diff <= APP_CONFIG.billWarningDays;
  });
  const overdueBills = bills.filter(b => !b.is_paid && b.due_date < today);

  const highExpenseCount = state.notifications.filter((item) => item.kind === "high_expense").length;
  const pendingEvents = events.filter((item) => !item.is_done).length;

  // Current month analysis
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthTx = transactions.filter(t => new Date(`${t.occurred_on}T12:00:00`) >= thisMonth);
  const monthIncomes = thisMonthTx.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
  const monthExpenses = thisMonthTx.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);

  // ─── Multi-factor score calculation (continuous) ───
  let score = 50; // Start at neutral
  const factors = [];
  const criteria = []; // Structured criteria for the score breakdown

  // Helper: clamp a value between min and max
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  if (hasData) {
    // Factor 1: Income vs Expense ratio — continuous ±20 points
    const ratio = incomes > 0 ? ((incomes - expenses) / incomes) : (expenses > 0 ? -0.8 : 0);
    const ratioScore = clamp(ratio / 0.5, -1, 1) * 20;
    score += ratioScore;
    if (ratio > 0.3) {
      factors.push({ type: "positive", text: "Entradas superam saídas com boa margem." });
      criteria.push({ name: "Entradas vs Saídas", points: Math.round(ratioScore), icon: healthIcons.wallet, detail: `Margem de ${Math.round(ratio * 100)}%` });
    } else if (ratio > 0.1) {
      factors.push({ type: "positive", text: "Saldo positivo no período." });
      criteria.push({ name: "Entradas vs Saídas", points: Math.round(ratioScore), icon: healthIcons.wallet, detail: `Margem de ${Math.round(ratio * 100)}%` });
    } else if (ratio > 0) {
      factors.push({ type: "neutral", text: "Saldo positivo mas apertado." });
      criteria.push({ name: "Entradas vs Saídas", points: Math.round(ratioScore), icon: healthIcons.wallet, detail: `Margem de ${Math.round(ratio * 100)}%` });
    } else if (ratio > -0.1) {
      factors.push({ type: "warning", text: "Entradas e saídas estão equilibradas, sem margem." });
      criteria.push({ name: "Entradas vs Saídas", points: Math.round(ratioScore), icon: healthIcons.wallet, detail: "Sem margem líquida" });
    } else {
      factors.push({ type: "warning", text: "Saídas estão acima das entradas neste período." });
      criteria.push({ name: "Entradas vs Saídas", points: Math.round(ratioScore), icon: healthIcons.wallet, detail: `Déficit de ${Math.round(Math.abs(ratio) * 100)}%` });
    }

    // Factor 2: Current month spending vs income — continuous ±10 points
    if (monthIncomes > 0) {
      const monthRatio = (monthIncomes - monthExpenses) / monthIncomes;
      const monthScore = clamp(monthRatio / 0.4, -1, 1) * 10;
      score += monthScore;
      if (monthRatio < -0.1) {
        factors.push({ type: "warning", text: "Este mês as saídas ultrapassaram as entradas." });
        criteria.push({ name: "Mês corrente", points: Math.round(monthScore), icon: healthIcons.calendar, detail: `Déficit de ${Math.round(Math.abs(monthRatio) * 100)}% este mês` });
      } else if (monthRatio > 0.2) {
        factors.push({ type: "positive", text: "Bom controle de gastos neste mês." });
        criteria.push({ name: "Mês corrente", points: Math.round(monthScore), icon: healthIcons.calendar, detail: `Superávit de ${Math.round(monthRatio * 100)}% este mês` });
      } else {
        criteria.push({ name: "Mês corrente", points: Math.round(monthScore), icon: healthIcons.calendar, detail: `Margem de ${Math.round(monthRatio * 100)}% este mês` });
      }
    } else if (monthExpenses > 0) {
      score -= 10;
      factors.push({ type: "warning", text: "Este mês teve apenas saídas, sem entradas." });
      criteria.push({ name: "Mês corrente", points: -10, icon: healthIcons.calendar, detail: "Apenas saídas neste mês" });
    }

    // Factor 3: Bills near due date — proportional penalty up to -10 points
    if (dueSoon.length > 0) {
      const penalty = Math.min(dueSoon.length * 3, 10);
      score -= penalty;
      factors.push({ type: "warning", text: `${dueSoon.length} conta(s) vencendo em breve.` });
      criteria.push({ name: "Contas a vencer", points: -penalty, icon: healthIcons.file, detail: `${dueSoon.length} conta(s) próxima(s) do vencimento` });
    } else {
      score += 5;
      factors.push({ type: "positive", text: "Nenhuma conta próxima do vencimento." });
      criteria.push({ name: "Contas a vencer", points: +5, icon: healthIcons.file, detail: "Nenhuma conta próxima" });
    }

    // Factor 4: Overdue bills — proportional penalty up to -10 points
    if (overdueBills.length > 0) {
      const penalty = Math.min(overdueBills.length * 5, 10);
      score -= penalty;
      factors.push({ type: "warning", text: `${overdueBills.length} conta(s) em atraso.` });
      criteria.push({ name: "Contas em atraso", points: -penalty, icon: healthIcons.alert, detail: `${overdueBills.length} conta(s) vencida(s)` });
    }

    // Factor 5: High expense alerts — proportional penalty up to -5 points
    if (highExpenseCount > 0) {
      const penalty = Math.min(highExpenseCount * 3, 5);
      score -= penalty;
      factors.push({ type: "warning", text: "Gastos elevados fora do padrão detectados." });
      criteria.push({ name: "Gastos elevados", points: -penalty, icon: healthIcons.chart, detail: `${highExpenseCount} alerta(s) de gasto fora do padrão` });
    }

    // Factor 6: Goal progress — continuous ±10 points
    const goalsWithProgress = goals.filter(g => g.target_amount && Number(g.current_amount || 0) > 0);
    if (goals.length > 0) {
      const avgProgress = goals.reduce((s, g) => {
        if (!g.target_amount) return s;
        return s + (Number(g.current_amount || 0) / Number(g.target_amount)) * 100;
      }, 0) / goals.length;
      const goalScore = clamp(avgProgress / 75, 0, 1) * 10;
      score += goalScore;
      if (avgProgress > 50) {
        factors.push({ type: "positive", text: "Metas financeiras com bom progresso." });
      } else if (avgProgress > 20) {
        factors.push({ type: "neutral", text: "Metas em andamento, progresso moderado." });
      } else if (goals.length > 0) {
        factors.push({ type: "neutral", text: "Metas criadas mas com pouco aporte até agora." });
      }
      criteria.push({ name: "Progresso de metas", points: Math.round(goalScore), icon: healthIcons.target, detail: `Progresso médio de ${Math.round(avgProgress)}%` });
    }

    // Factor 7: Pending events — continuous ±5 points
    if (pendingEvents > 5) {
      score -= 5;
      factors.push({ type: "neutral", text: "Agenda com muitos itens pendentes." });
      criteria.push({ name: "Agenda", points: -5, icon: healthIcons.clipboard, detail: `${pendingEvents} itens pendentes` });
    } else {
      const eventsScore = (1 - clamp(pendingEvents / 5, 0, 1)) * 5;
      score += eventsScore;
      if (pendingEvents <= 2) {
        factors.push({ type: "positive", text: "Agenda organizada e em dia." });
      }
      criteria.push({ name: "Agenda", points: Math.round(eventsScore), icon: healthIcons.clipboard, detail: pendingEvents === 0 ? "Tudo em dia" : `${pendingEvents} pendência(s)` });
    }
  } else {
    factors.push({ type: "neutral", text: "Sem movimentações registradas ainda." });
  }

  // Garante mínimo de 5% quando há dados (evita score 0% com atividade financeira)
  score = Math.round(Math.max(Math.min(score, 100), 5));

  // Classification
  let classification, emoji;
  if (!hasData) {
    classification = "Sem dados";
    emoji = "⚪";
  } else if (score >= 70) {
    classification = "Saudável";
    emoji = "🟢";
  } else if (score >= 40) {
    classification = "Atenção";
    emoji = "🟡";
  } else {
    classification = "Crítico";
    emoji = "🔴";
  }

  // Generate explanation text
  let explanation = "";
  if (hasData) {
    const positiveFactors = factors.filter(f => f.type === "positive");
    const warningFactors = factors.filter(f => f.type === "warning");
    if (score >= 70) {
      explanation = `Boa saúde financeira devido ao ${positiveFactors.length > 0 ? positiveFactors[0].text.toLowerCase() : "controle das despesas"}`;
    } else if (score >= 40) {
      explanation = `Saúde reduzida porque ${warningFactors.length > 0 ? warningFactors[0].text.toLowerCase() : "alguns pontos precisam de atenção"}`;
    } else {
      explanation = `Atenção: ${warningFactors.length > 0 ? warningFactors[0].text.toLowerCase() : "as saídas estão acima das entradas"}`;
    }
  }

  return { incomes, expenses, balance, dueSoon, overdueBills, highExpenseCount, pendingEvents, score, hasData, classification, emoji, explanation, factors, criteria, scoreHistory: computeScoreHistory(transactions, bills, goals, events, state), scoreDelta: 0 };
}

function computeScoreForPeriod(transactions, bills, goals, events, startDate, endDate, state) {
  const periodTx = transactions.filter(t => {
    const d = new Date(`${t.occurred_on}T12:00:00`);
    return d >= startDate && d <= endDate;
  });
  const periodBills = bills.filter(b => {
    const d = new Date(`${b.due_date}T12:00:00`);
    return d >= startDate && d <= endDate;
  });

  const incomes = periodTx.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
  const expenses = periodTx.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
  const hasData = incomes > 0 || expenses > 0;
  if (!hasData) return null;

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  let score = 50;

  // Factor 1: continuous ratio score ±20
  const ratio = incomes > 0 ? ((incomes - expenses) / incomes) : (expenses > 0 ? -0.8 : 0);
  score += clamp(ratio / 0.5, -1, 1) * 20;

  // Factor 3: bills due soon
  const dueSoon = periodBills.filter(b => {
    const due = new Date(`${b.due_date}T12:00:00`);
    const diff = Math.ceil((due - new Date()) / 86400000);
    return !b.is_paid && diff >= 0 && diff <= APP_CONFIG.billWarningDays;
  });
  if (dueSoon.length > 0) score -= Math.min(dueSoon.length * 3, 10);
  else score += 5;

  // Factor 4: overdue bills
  const overdue = periodBills.filter(b => !b.is_paid && b.due_date < endDate.toISOString().slice(0, 10));
  if (overdue.length > 0) score -= Math.min(overdue.length * 5, 10);

  return Math.round(Math.max(Math.min(score, 100), 5));
}

function computeScoreHistory(transactions, bills, goals, events, state) {
  const now = new Date();
  const history = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const label = fmtMonthYear.format(monthStart);
    const score = computeScoreForPeriod(transactions, bills, goals, events, monthStart, monthEnd, state);
    history.push({ label, score });
  }
  return history;
}

export function renderSummary(state, dashboardFilters = {}) {
  const scopedTransactions = getDashboardScopedTransactions(state, dashboardFilters);
  const incomes = scopedTransactions.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenses = scopedTransactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const balance = incomes - expenses;
  const totalGoals = state.goals.reduce((sum, goal) => sum + Number(goal.current_amount || 0), 0);
  const periodLabel = getDashboardPeriodLabel(dashboardFilters.period);
  const ownerLabel = getDashboardOwnerLabel(state, dashboardFilters);

  // Personal balance (logged-in user's transactions across ALL workspaces)
  const profileId = state.profile?.user_id;
  const allPersonalTx = Array.isArray(state.personalTransactions) && state.personalTransactions.length
    ? state.personalTransactions
    : (profileId ? scopedTransactions.filter((item) => item.owner_profile_id === profileId) : scopedTransactions);

  // Aplica filtro de período nas transações pessoais globais
  const period = dashboardFilters.period || "30";
  let personalFiltered = allPersonalTx;
  if (period !== "all") {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (Number(period) - 1));
    personalFiltered = allPersonalTx.filter(t => new Date(`${t.occurred_on}T12:00:00`) >= startDate);
  }

  const personalIncomes = personalFiltered.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const personalExpenses = personalFiltered.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const personalBalance = personalIncomes - personalExpenses;
  const personalName = state.profile?.full_name?.split(" ")[0] || "Você";

  // Group/couple balance (all scoped transactions)
  const groupBalance = balance;
  const groupIncomes = incomes;
  const groupExpenses = expenses;
  const groupLabel = state.couple?.name
    ? `${getWorkspaceKindLabel(state.couple?.kind)} • ${state.couple.name}`
    : "Ambiente";

  const balanceCards = [
    {
      title: `Saldo de ${personalName}`,
      balance: personalBalance,
      incomes: personalIncomes,
      expenses: personalExpenses,
      detail: `Todos os ambientes em ${periodLabel}`,
      tone: personalBalance >= 0 ? "positive" : "negative"
    },
    {
      title: groupLabel,
      balance: groupBalance,
      incomes: groupIncomes,
      expenses: groupExpenses,
      detail: `Saldo do ${getWorkspaceKindLabel(state.couple?.kind || "couple").toLowerCase()} em ${periodLabel}`,
      tone: groupBalance >= 0 ? "positive" : "negative"
    }
  ];

  const extraCards = [
    { label: "Metas em andamento", value: `${state.goals.length}`, detail: `${fmtCurrency.format(totalGoals)} acumulados` }
  ];

  // Se não há movimentações no período, adiciona card de orientação
  if (!scopedTransactions.length) {
    extraCards.push({
      label: "Movimentações",
      value: "0",
      detail: `Nenhuma transação em ${periodLabel}. Registre sua primeira!`
    });
  }

  const balanceHTML = balanceCards.map((card) => `
    <article class="summary-card balance-card">
      <p class="eyebrow">${card.title}</p>
      <strong class="balance-value ${card.tone}">${fmtCurrency.format(card.balance)}</strong>
      <div class="balance-breakdown">
        <span class="balance-line expense-line">Saídas: ${fmtCurrency.format(card.expenses)}</span>
        <span class="balance-line income-line">Entradas: ${fmtCurrency.format(card.incomes)}</span>
      </div>
      <p class="muted summary-foot">${card.detail}</p>
    </article>
  `).join("");

  const extraHTML = extraCards.map((card) => `
    <article class="summary-card summary-card-compact">
      <p class="eyebrow">${card.label}</p>
      <strong>${card.value}</strong>
      <p class="muted">${card.detail}</p>
    </article>
  `).join("");

  if (dom.summaryGrid) dom.summaryGrid.innerHTML = balanceHTML + extraHTML;
}

function renderOnboardingCreatedList(state) {
  const createdListEl = document.querySelector("#onboardingCreatedList");
  const createdItemsEl = document.querySelector("#onboardingCreatedItems");
  if (!createdListEl || !createdItemsEl) return;

  const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
  if (!workspaces.length) {
    createdListEl.classList.add("hidden");
    return;
  }

  createdListEl.classList.remove("hidden");
  createdItemsEl.innerHTML = workspaces.map((workspace) => `
    <article class="onboarding-created-item">
      <div class="onboarding-created-info">
        <strong>${workspace.name || "Sem nome"}</strong>
        <span class="muted">${getWorkspaceKindLabel(workspace.kind)}${workspace.is_active ? " • Ativo" : ""}</span>
      </div>
      <div>
        ${workspace.is_active
          ? `<button class="ghost-button" data-set-active-workspace="${workspace.id}" type="button">Ativar</button>`
          : `<button class="secondary-button" data-set-active-workspace="${workspace.id}" type="button">Usar este</button>`}
      </div>
    </article>
  `).join("");
}

function renderAvatarElement(element, avatarUrl, fallbackText) {
  if (!element) return;
  const placeholder = element.querySelector(".avatar-placeholder");
  if (avatarUrl) {
    let img = element.querySelector("img");
    if (!img) {
      if (placeholder) placeholder.remove();
      img = document.createElement("img");
      element.prepend(img);
    }
    img.src = avatarUrl;
    img.alt = fallbackText || "Avatar";
  } else {
    const img = element.querySelector("img");
    if (img) img.remove();
    if (!placeholder) {
      const span = document.createElement("span");
      span.className = "avatar-placeholder";
      span.textContent = (fallbackText || "?").charAt(0).toUpperCase();
      element.appendChild(span);
    } else {
      placeholder.textContent = (fallbackText || "?").charAt(0).toUpperCase();
    }
  }
}

export function renderAvatar(state) {
  const avatarUrl = state.profile?.avatar_url || "";
  const userName = state.profile?.full_name || "?";
  const userEmail = state.session?.user?.email || "—";

  const sidebarAvatar = document.querySelector("#sidebarAvatar");
  const profilePreview = document.querySelector("#profileAvatarPreview");
  const sidebarName = document.querySelector("#sidebarUserName");
  const sidebarEmail = document.querySelector("#sidebarUserEmail");
  const removeBtn = document.querySelector("#avatarRemoveBtn");

  renderAvatarElement(sidebarAvatar, avatarUrl, userName);
  renderAvatarElement(profilePreview, avatarUrl, userName);

  if (sidebarName) sidebarName.textContent = userName;
  if (sidebarEmail) sidebarEmail.textContent = userEmail;
  if (removeBtn) removeBtn.classList.toggle("hidden", !avatarUrl);
}

export function renderHeader(state) {
  const members = getPeople(state);
  const workspaceCount = Array.isArray(state.workspaces) ? state.workspaces.length : 0;
  if (dom.welcomeTitle) {
    dom.welcomeTitle.textContent = state.profile ? `Olá, ${state.profile.full_name.split(" ")[0]}` : "Olá";
  }
  if (dom.coupleName) dom.coupleName.textContent = state.couple?.name || "Seu espaço";
  const mobileHeaderName = document.querySelector("#mobileHeaderName");
  if (mobileHeaderName) mobileHeaderName.textContent = state.couple?.name || "Entre Nós";
  if (dom.partnerStatus) dom.partnerStatus.textContent = state.couple
    ? `${members.length} pessoa(s) participando do ambiente ${getWorkspaceKindLabel(state.couple?.kind || "couple").toLowerCase()}.`
    : "Escolha como quer usar o Entre Nós e crie seu primeiro ambiente.";
  const unreadCount = state.notifications.filter((item) => !item.is_read).length;
  if (dom.notificationDot) dom.notificationDot.classList.toggle("hidden", unreadCount === 0);
  const mobileNotifDot = document.querySelector("#mobileNotifDot");
  if (mobileNotifDot) mobileNotifDot.classList.toggle("hidden", unreadCount === 0);
  if (dom.workspaceSetupPanel) dom.workspaceSetupPanel.classList.toggle("hidden", Boolean(state.couple?.id));

  // Show/hide leave workspace icon based on active workspace
  const unlinkButton = document.querySelector("#unlinkButton");
  if (unlinkButton) {
    unlinkButton.classList.toggle("hidden", !state.couple?.id);
  }

  renderOnboardingCreatedList(state);
  renderAvatar(state);

  if (dom.workspaceSelect) {
    const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
    const shouldShow = workspaces.length > 1;
    dom.workspaceSelect.classList.toggle("hidden", !shouldShow);

    if (!workspaces.length) {
      dom.workspaceSelect.innerHTML = `<option value="">Nenhum ambiente</option>`;
      dom.workspaceSelect.disabled = true;
    } else {
      dom.workspaceSelect.disabled = false;
      dom.workspaceSelect.innerHTML = workspaces
        .map((workspace) => `
          <option value="${workspace.id}" ${workspace.is_active ? "selected" : ""}>
            ${workspace.name || "Sem nome"}
          </option>
        `)
        .join("");
    }
  }

  // Populate environment selector dropdown
  if (dom.envSelectorList) {
    const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
    const activeWorkspaceId = state.couple?.id;

    if (!workspaces.length) {
      dom.envSelectorList.innerHTML = `<div class="env-selector-empty">Nenhum ambiente disponível</div>`;
    } else {
      dom.envSelectorList.innerHTML = workspaces
        .map((workspace) => {
          const isActive = workspace.id === activeWorkspaceId;
          const kindLabel = getWorkspaceKindLabel(workspace.kind);
          const roleLabel = workspace.role === "owner"
            ? "Proprietário"
            : workspace.role === "admin"
              ? "Administrador"
              : "Membro";
          return `
            <button class="env-selector-item${isActive ? " active" : ""}" data-workspace-id="${workspace.id}" type="button" role="option" aria-selected="${isActive}">
              <div class="env-selector-item-info">
                <span class="env-selector-item-name">${workspace.name || "Sem nome"}</span>
                <span class="env-selector-item-meta">${kindLabel} • ${roleLabel}</span>
              </div>
              <svg class="env-selector-item-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
          `;
        })
        .join("");
    }
  }
}

export function renderHealth(state) {
  const model = getHealthModel(state);
  if (dom.healthGaugeFill) dom.healthGaugeFill.style.width = `${model.score}%`;
  if (dom.healthGaugeValue) dom.healthGaugeValue.textContent = model.hasData ? `${model.score}%` : "—";

  // ─── Instant delta (current vs previous render) ───
  if (dom.healthInstantDelta && model.hasData) {
    if (_prevHealthScore !== null && _prevHealthScore !== model.score) {
      const instantDelta = model.score - _prevHealthScore;
      if (instantDelta > 0) {
        dom.healthInstantDelta.innerHTML = `&#9650; +${instantDelta}`;
        dom.healthInstantDelta.className = "health-instant-delta delta-up";
      } else {
        dom.healthInstantDelta.innerHTML = `&#9660; ${instantDelta}`;
        dom.healthInstantDelta.className = "health-instant-delta delta-down";
      }
    } else {
      dom.healthInstantDelta.innerHTML = "";
      dom.healthInstantDelta.className = "health-instant-delta";
    }
    _prevHealthScore = model.score;
  }

  // Update bar color based on classification
  if (dom.healthGaugeFill) {
    if (!model.hasData) {
      dom.healthGaugeFill.style.width = "0%";
      dom.healthGaugeFill.style.background = "transparent";
    } else if (model.score >= 70) {
      dom.healthGaugeFill.style.background = "linear-gradient(90deg, #22c55e, #3b82f6)";
    } else if (model.score >= 40) {
      dom.healthGaugeFill.style.background = "linear-gradient(90deg, #f59e0b, #fbbf24)";
    } else {
      dom.healthGaugeFill.style.background = "linear-gradient(90deg, #dc2626, #ef4444)";
    }
  }

  // Environment name
  const envName = state.couple?.name || getWorkspaceKindLabel(state.couple?.kind) || "Ambiente";
  if (dom.healthEnvName) dom.healthEnvName.textContent = model.hasData ? `Analisando: ${envName}` : "";

  // Classification with emoji
  if (dom.healthClassification) {
    dom.healthClassification.textContent = model.hasData ? `${model.emoji} ${model.classification}` : "sem dados";
  }

  // Badge pill
  if (dom.healthPill) {
    dom.healthPill.textContent = !model.hasData
      ? "Sem dados"
      : model.score >= 70
        ? "🟢 Saudável"
        : model.score >= 40
          ? "🟡 Atenção"
          : "🔴 Crítico";
    dom.healthPill.className = `badge ${model.hasData ? (model.score >= 70 ? 'badge-success' : model.score >= 40 ? 'badge-warning' : 'badge-danger') : ''}`;
  }

  // Explanation text
  if (dom.healthExplanation) {
    dom.healthExplanation.textContent = model.explanation;
    dom.healthExplanation.classList.toggle("hidden", !model.explanation);
  }

  // ─── Score Trend Chart ───
  const trendArea = document.querySelector("#healthTrendArea");
  const trendChartEl = document.querySelector("#healthTrendChart");
  const scoreDelta = document.querySelector("#healthScoreDelta");

  if (trendArea && trendChartEl && model.hasData && model.scoreHistory) {
    const history = model.scoreHistory.filter(h => h.score !== null);
    if (history.length >= 2) {
      trendArea.classList.remove("hidden");

      // Calculate delta (current vs previous month)
      const currentScore = model.score;
      const prevScores = history.slice(0, -1);
      const prevScore = prevScores.length ? prevScores[prevScores.length - 1].score : null;
      const delta = prevScore !== null ? currentScore - prevScore : 0;

      if (scoreDelta) {
        if (delta > 0) {
          scoreDelta.innerHTML = `<span class="delta-arrow-up">&#9650;</span> +${delta} pts`;
          scoreDelta.className = "health-score-delta delta-positive";
        } else if (delta < 0) {
          scoreDelta.innerHTML = `<span class="delta-arrow-down">&#9660;</span> ${delta} pts`;
          scoreDelta.className = "health-score-delta delta-negative";
        } else {
          scoreDelta.innerHTML = `<span class="delta-stable">&#9654;</span> Estável`;
          scoreDelta.className = "health-score-delta delta-stable";
        }
      }

      // Render mini bar chart
      const maxScore = 100;
      trendChartEl.innerHTML = history.map((h, idx) => {
        const heightPct = Math.max((h.score / maxScore) * 100, 4);
        const isLast = idx === history.length - 1;
        let barColor;
        if (h.score >= 70) barColor = "var(--success, #22c55e)";
        else if (h.score >= 40) barColor = "var(--warning, #f59e0b)";
        else barColor = "var(--danger, #ef4444)";
        return `
          <div class="health-trend-bar-wrapper" title="${h.label}: ${h.score}%">
            <div class="health-trend-bar ${isLast ? 'health-trend-bar-current' : ''}" style="height:${heightPct}%;background:${barColor}"></div>
            <span class="health-trend-bar-label">${h.label.replace(/\d{2}$/, "").trim()}</span>
          </div>
        `;
      }).join("");

      // Animate bars growing
      requestAnimationFrame(() => {
        const bars = trendChartEl.querySelectorAll(".health-trend-bar");
        bars.forEach((bar, i) => {
          const targetHeight = bar.style.height;
          bar.style.height = "0%";
          setTimeout(() => {
            bar.style.height = targetHeight;
          }, i * 80);
        });
      });
    } else {
      trendArea.classList.add("hidden");
    }
  } else if (trendArea) {
    trendArea.classList.add("hidden");
  }

  // ─── Counting Animation for Score ───
  if (dom.healthGaugeValue && model.hasData) {
    const targetScore = model.score;
    const duration = 800;
    const startTime = performance.now();
    const startVal = 0;
    function animateCount(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const currentVal = Math.round(startVal + (targetScore - startVal) * eased);
      dom.healthGaugeValue.textContent = `${currentVal}%`;
      if (progress < 1) requestAnimationFrame(animateCount);
    }
    requestAnimationFrame(animateCount);
  }

  // ─── Health details: compact criteria card ───
  if (dom.healthFactors) {
    let factorsHTML = "";

    if (model.criteria && model.criteria.length > 0) {
      const sorted = [...model.criteria].sort((a, b) => b.points - a.points);

      factorsHTML += `<div class="hc-card">`;
      factorsHTML += `<div class="hc-header"><span class="hc-title">Composição do score</span></div>`;
      factorsHTML += `<div class="hc-rows">`;

      // Base row (always first)
      factorsHTML += `<div class="hc-row hc-base">`;
      factorsHTML += `<span class="hc-ico">${healthIcons.scale}</span>`;
      factorsHTML += `<span class="hc-name">Base</span>`;
      factorsHTML += `<span class="hc-pts hc-pts-neutral">+50</span>`;
      factorsHTML += `</div>`;

      for (const c of sorted) {
        const cls = c.points > 0 ? "hc-pts-pos" : c.points < 0 ? "hc-pts-neg" : "hc-pts-neutral";
        const arrow = c.points > 0 ? "&#9650;" : c.points < 0 ? "&#9660;" : "";
        const ptsLabel = c.points > 0 ? `+${c.points}` : String(c.points);
        factorsHTML += `<div class="hc-row">`;
        factorsHTML += `<span class="hc-ico">${c.icon}</span>`;
        factorsHTML += `<span class="hc-name">${c.name}<em class="hc-detail">${c.detail}</em></span>`;
        factorsHTML += `<span class="hc-pts ${cls}">${arrow} ${ptsLabel}</span>`;
        factorsHTML += `</div>`;
      }

      factorsHTML += `</div>`;
      factorsHTML += `<div class="hc-total"><span>Total</span><strong>${model.score}%</strong></div>`;
      factorsHTML += `</div>`;
    }

    // Alert factors
    const positiveFactors = model.factors.filter(f => f.type === "positive");
    const warningFactors = model.factors.filter(f => f.type === "warning");

    if (positiveFactors.length) {
      factorsHTML += `<div class="health-factors-group"><p class="health-factors-label">Pontos positivos</p>`;
      factorsHTML += positiveFactors.map(f => `<div class="health-factor-item health-factor-positive">${f.text}</div>`).join("");
      factorsHTML += `</div>`;
    }

    if (warningFactors.length) {
      factorsHTML += `<div class="health-factors-group"><p class="health-factors-label">Pontos de atenção</p>`;
      factorsHTML += warningFactors.map(f => `<div class="health-factor-item health-factor-warning">${f.text}</div>`).join("");
      factorsHTML += `</div>`;
    }

    const neutralFactors = model.factors.filter(f => f.type === "neutral");
    if (!positiveFactors.length && !warningFactors.length && neutralFactors.length) {
      factorsHTML += `<div class="health-factors-group">`;
      factorsHTML += neutralFactors.map(f => `<div class="health-factor-item health-factor-neutral">${f.text}</div>`).join("");
      factorsHTML += `</div>`;
    }

    dom.healthFactors.innerHTML = factorsHTML;
  }
}

function getExpenseDistribution(state) {
  const expenses = (state.transactions || []).filter((t) => t.type === "expense");
  const byPerson = {};
  for (const t of expenses) {
    const name = t.owner?.full_name || "Desconhecido";
    byPerson[name] = (byPerson[name] || 0) + Number(t.amount || 0);
  }
  return Object.entries(byPerson)
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

function getTrendSeries(transactions, period) {
  const days = period === "all" ? 365 : Number(period) || 30;
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);

  const buckets = new Map();
  for (const t of transactions) {
    const d = new Date(`${t.occurred_on}T12:00:00`);
    if (d < start || d > now) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!buckets.has(key)) buckets.set(key, { income: 0, expense: 0 });
    const bucket = buckets.get(key);
    if (t.type === "income") bucket.income += Number(t.amount || 0);
    else bucket.expense += Number(t.amount || 0);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => {
      const [year, month] = key.split("-").map(Number);
      const labelDate = new Date(year, month - 1, 1);
      return { label: fmtMonthYear.format(labelDate), income: data.income, expense: data.expense };
    });
}

export function renderCharts(state, dashboardFilters = {}) {
  const scopedTransactions = getDashboardScopedTransactions(state, dashboardFilters);

  // Otimização: só re-cria gráficos se os dados mudaram
  const currentSignature = computeChartSignature(scopedTransactions, dashboardFilters);
  if (currentSignature === _lastChartSignature) return;
  _lastChartSignature = currentSignature;

  const distribution = getExpenseDistribution({ ...state, transactions: scopedTransactions });
  const trend = getTrendSeries(scopedTransactions, dashboardFilters.period || "30");
  const computedStyles = getComputedStyle(document.documentElement);
  const incomeColor = computedStyles.getPropertyValue("--success").trim() || "#22c55e";
  const expenseColor = computedStyles.getPropertyValue("--danger").trim() || "#ef4444";
  const accentColor = computedStyles.getPropertyValue("--accent").trim() || "#3b82f6";
  const borderColor = computedStyles.getPropertyValue("--border").trim() || "#e2e8f0";
  const textColor = computedStyles.getPropertyValue("--text").trim() || "#0f172a";
  const mutedColor = computedStyles.getPropertyValue("--muted").trim() || "#64748b";

  if (expenseChart) { expenseChart.destroy(); expenseChart = null; }
  if (trendChart) { trendChart.destroy(); trendChart = null; }
  reportCharts.forEach(c => { try { c.destroy(); } catch(e) {} });
  reportCharts = [];

  const expenseCanvas = document.querySelector("#expensesByPersonChart");
  const trendCanvas = document.querySelector("#monthlyTrendChart");
  if (!window.Chart || !expenseCanvas || !trendCanvas) return;

  const distributionLabels = distribution.length ? distribution.map((item) => item.label) : ["Sem dados"];
  const distributionData = distribution.length ? distribution.map((item) => item.total) : [1];

  expenseChart = new window.Chart(expenseCanvas, {
    type: "doughnut",
    data: {
      labels: distributionLabels,
      datasets: [{
        data: distributionData,
        backgroundColor: [accentColor, incomeColor, expenseColor, "#94a3b8", "#f59e0b"],
        borderColor: "#fff",
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      cutout: "68%",
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: textColor, usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 11 } } },
        tooltip: { callbacks: { label(context) { return `${context.label}: ${fmtCurrency.format(context.raw || 0)}`; } } }
      }
    }
  });

  trendChart = new window.Chart(trendCanvas, {
    type: "line",
    data: {
      labels: trend.length ? trend.map((item) => item.label) : ["Sem dados"],
      datasets: [
        {
          label: "Receitas",
          data: trend.length ? trend.map((item) => item.income) : [0],
          borderColor: incomeColor,
          backgroundColor: "rgba(16, 185, 129, 0.08)",
          pointBackgroundColor: incomeColor,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
          fill: true,
          tension: 0.35
        },
        {
          label: "Despesas",
          data: trend.length ? trend.map((item) => item.expense) : [0],
          borderColor: expenseColor,
          backgroundColor: "rgba(239, 68, 68, 0.06)",
          pointBackgroundColor: expenseColor,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
          fill: true,
          tension: 0.35
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: mutedColor, font: { size: 10 } }, grid: { color: "rgba(226,232,240,0.5)" } },
        y: {
          ticks: {
            color: mutedColor,
            font: { size: 10 },
            callback(value) {
              return fmtCurrency.format(Number(value || 0));
            }
          },
          grid: { color: "rgba(226,232,240,0.5)" }
        }
      },
      plugins: {
        legend: { position: "bottom", labels: { color: textColor, usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 11 } } },
        tooltip: { callbacks: { label(context) { return `${context.dataset.label}: ${fmtCurrency.format(context.raw || 0)}`; } } }
      }
    }
  });
}


export function renderTransactions(state, filters) {
  if (!dom.transactionList) return;
  const query = (filters.search || "").trim().toLowerCase();
  const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : null;
  const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59`) : null;

  const visible = state.transactions.filter((item) => {
    if (filters.workspaceId && item.couple_id !== filters.workspaceId) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (filters.ownerProfileId && item.owner_profile_id !== filters.ownerProfileId) return false;
    if (filters.categoryId && item.category_id !== filters.categoryId) return false;
    if (query) {
      const content = `${item.description} ${item.note || ""}`.toLowerCase();
      if (!content.includes(query)) return false;
    }
    if (start && new Date(`${item.occurred_on}T12:00:00`) < start) return false;
    if (end && new Date(`${item.occurred_on}T12:00:00`) > end) return false;
    return true;
  });

  dom.transactionList.innerHTML = visible.length ? visible.map((item) => {
    const typeClass = item.type === "income" ? "cat-income" : "cat-expense";
    return `
    <article class="list-card">
      <div class="list-card-main">
        <strong>${item.description}</strong>
        <div class="meta-row">
          <span>${fmtDate.format(new Date(`${item.occurred_on}T12:00:00`))}</span>
          <span>${item.owner?.full_name || "Sem responsável"}</span>
          <span class="category-type-badge ${typeClass}">${item.category?.name || "Sem categoria"}</span>
          <span>${getScopeLabel(item.split_scope, state)}</span>
          ${item.goal?.name ? `<span>Meta: ${item.goal.name}</span>` : ""}
        </div>
        ${item.note ? `<span class="muted">${item.note}</span>` : ""}
      </div>
      <div class="list-card-actions">
        <strong class="amount ${item.type === "income" ? "positive" : "negative"}">
          ${item.type === "income" ? "+" : "-"} ${fmtCurrency.format(item.amount)}
        </strong>
        <button class="secondary-button action-button" data-edit-transaction="${item.id}" type="button">Editar</button>
        <button class="danger-button action-button" data-delete-transaction="${item.id}" type="button">Excluir</button>
      </div>
    </article>
  `;
  }).join("") : emptyStateMessage("Nenhuma transação encontrada", "Ajuste os filtros ou crie um novo lançamento.");
}

export function renderGoals(state, goalFilters = {}) {
  if (!dom.goalList) return;
  let filtered = state.goals || [];

  // Filter by owner (created_by)
  if (goalFilters.ownerProfileId) {
    filtered = filtered.filter(g => g.created_by === goalFilters.ownerProfileId);
  }

  // Filter by workspace (couple_id) — only when viewing across workspaces
  if (goalFilters.workspaceId) {
    filtered = filtered.filter(g => g.couple_id === goalFilters.workspaceId);
  }

  dom.goalList.innerHTML = filtered.length ? filtered.map((goal) => {
    const progress = goal.target_amount ? Math.min((Number(goal.current_amount || 0) / Number(goal.target_amount)) * 100, 100) : 0;
    const scopeLabel = goal.scope === "individual" ? "Individual" : (state.workspaces?.find(ws => ws.id === goal.scope)?.name || getWorkspaceKindLabel(state.workspaces?.find(ws => ws.id === goal.scope)?.kind) || "Ambiente");
    return `
      <article class="list-card">
        <div class="list-card-main">
          <strong>${goal.name}</strong>
          <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
          <div class="meta-row">
            <span>${fmtCurrency.format(goal.current_amount || 0)} guardados</span>
            <span>Meta ${fmtCurrency.format(goal.target_amount || 0)}</span>
            <span>${scopeLabel}</span>
            <span>${goal.auto_allocate ? "Aporte automático" : "Aporte manual"}</span>
            ${goal.target_date ? `<span>Prazo ${goal.target_date}</span>` : ""}
          </div>
        </div>
        <div class="list-card-actions">
          <button class="secondary-button action-button" data-edit-goal="${goal.id}" type="button">Editar</button>
          <button class="danger-button action-button" data-delete-goal="${goal.id}" type="button">Excluir</button>
        </div>
      </article>
    `;
  }).join("") : emptyStateMessage("Nenhuma meta encontrada", "Ajuste os filtros ou crie a primeira meta do ambiente.");
}

export function renderBills(state, billFilters = {}) {
  if (!dom.billsList) return;
  let filtered = state.bills || [];

  // Filter by owner
  if (billFilters.ownerProfileId) {
    filtered = filtered.filter(b => b.owner_profile_id === billFilters.ownerProfileId);
  }

  // Filter by workspace (couple_id)
  if (billFilters.workspaceId) {
    filtered = filtered.filter(b => b.couple_id === billFilters.workspaceId);
  }

  // Filter by status
  if (billFilters.status === "paid") {
    filtered = filtered.filter(b => b.is_paid);
  } else if (billFilters.status === "pending") {
    filtered = filtered.filter(b => !b.is_paid);
  }

  const sortedBills = [...filtered].sort((a, b) => {
    if (a.is_paid !== b.is_paid) return Number(a.is_paid) - Number(b.is_paid);
    return (a.due_date || "").localeCompare(b.due_date || "");
  });
  dom.billsList.innerHTML = sortedBills.length ? sortedBills.map((bill) => {
    const paidClass = bill.is_paid ? "bill-paid" : "bill-pending";
    const paidLabel = bill.is_paid ? "Paga" : "Pendente";
    const paidBtnLabel = bill.is_paid ? "Desmarcar" : "Marcar como paga";
    const isRecurringInstance = bill.is_recurring_instance || false;
    const isRecurringTemplate = bill.is_recurring && !isRecurringInstance;
    const recurringBadge = (isRecurringInstance || isRecurringTemplate) ? `<span class="bill-recurring-badge" title="Conta recorrente">\u{1F501} Recorrente</span>` : "";
    return `
    <article class="list-card ${paidClass}">
      <div class="list-card-main">
        <strong>${bill.title}</strong>
        <div class="meta-row">
          <span>Vence ${formatDateLabel(bill.due_date)}</span>
          <span>${bill.owner?.full_name || "Sem responsável fixo"}</span>
          ${recurringBadge}
          <span class="bill-status-badge ${paidClass}">${paidLabel}</span>
        </div>
      </div>
      <div class="list-card-actions">
        <strong class="amount negative">${fmtCurrency.format(bill.amount)}</strong>
        <button class="ghost-button action-button" data-toggle-bill-paid="${bill.id}" data-current-paid="${bill.is_paid}" type="button">${paidBtnLabel}</button>
        <button class="secondary-button action-button" data-edit-bill="${bill.id}" type="button">Editar</button>
        <button class="danger-button action-button" data-delete-bill="${bill.id}" type="button">Excluir</button>
      </div>
    </article>
  `}).join("") : emptyStateMessage("Nenhuma conta encontrada", "Ajuste os filtros ou adicione contas para monitorar vencimentos.");
}

export function renderCategories(state) {
  if (!dom.categoryList) return;
  const customCategories = state.categories.filter((category) => !category.is_default);
  dom.categoryList.innerHTML = customCategories.length ? customCategories.map((category) => {
    const typeLabel = category.kind === "income" ? "Receita" : category.kind === "reserve" ? "Reserva" : "Despesa";
    const typeClass = category.kind === "income" ? "cat-income" : category.kind === "reserve" ? "cat-reserve" : "cat-expense";
    return `
    <article class="list-card category-card-compact">
      <div class="list-card-main">
        <strong>${category.name}</strong>
        <span class="category-type-badge ${typeClass}">${typeLabel}</span>
      </div>
      <div class="list-card-actions">
        <button class="secondary-button action-button" data-edit-category="${category.id}" type="button">Editar</button>
        <button class="danger-button action-button" data-delete-category="${category.id}" type="button">Excluir</button>
      </div>
    </article>
  `;
  }).join("") : emptyStateMessage("Nenhuma categoria personalizada", "Adicione categorias para organizar suas transações.");
}

export function renderNotifications(state) {
  if (!dom.notificationList) return;
  dom.notificationList.innerHTML = state.notifications.length ? state.notifications.map((item) => `
    <article class="list-card">
      <div class="list-card-main">
        <strong>${item.title}</strong>
        <span class="muted">${item.message}</span>
        <div class="meta-row">
          <span>${fmtDate.format(new Date(item.created_at))}</span>
          <span>${item.kind}</span>
          <span>${item.is_read ? "Lida" : "Nova"}</span>
        </div>
      </div>
      <div class="list-card-actions">
        ${item.is_read ? `<span class="badge">Ok</span>` : `<button class="secondary-button action-button" data-read-notification="${item.id}" type="button">Marcar lida</button>`}
      </div>
    </article>
  `).join("") : emptyStateMessage("Nenhuma notificação", "Seu feed interno está limpo.");
}

export function renderLinkStatus(state) {
  const unlinkButton = document.querySelector("#unlinkButton");
  if (!state.couple?.id) {
    if (unlinkButton) unlinkButton.disabled = true;
    return;
  }

  if (unlinkButton) unlinkButton.disabled = false;
}

export function renderWorkspaces(state) {
  let workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];

  // Fallback: se workspaces está vazio mas state.couple existe (o usuário está em um ambiente
  // carregado pelo bootstrap), constrói um workspace sintético para não mostrar "nenhum ambiente".
  if (workspaces.length === 0 && state.couple?.id) {
    // Busca o código de convite pendente a partir dos invites carregados pelo bootstrap
    const fallbackInviteCode = Array.isArray(state.invites)
      ? (state.invites.find(i => i.status === 'pending' && i.couple_id === state.couple.id)?.invite_code || null)
      : null;
    workspaces = [{
      id: state.couple.id,
      name: state.couple.name || "Sem nome",
      kind: state.couple.kind || "couple",
      role: "owner",
      is_active: true,
      invite_code: fallbackInviteCode
    }];
  }

  const activeWorkspace = workspaces.find((ws) => ws.is_active) || null;
  const otherWorkspaces = workspaces.filter((ws) => !ws.is_active);

  // Active workspace info section
  const envActiveInfo = document.getElementById("envActiveInfo");
  const envNoWorkspace = document.getElementById("envNoWorkspace");
  const envOtherWorkspaces = document.getElementById("envOtherWorkspaces");

  if (activeWorkspace) {
    if (envActiveInfo) {
      envActiveInfo.classList.remove("hidden");
      const nameEl = document.getElementById("envActiveName");
      const kindEl = document.getElementById("envActiveKind");
      const roleEl = document.getElementById("envActiveRole");
      const codeEl = document.getElementById("envInviteCodeValue");

      if (nameEl) nameEl.textContent = activeWorkspace.name || "Sem nome";
      if (kindEl) kindEl.textContent = getWorkspaceKindLabel(activeWorkspace.kind);
      if (roleEl) {
        roleEl.textContent = activeWorkspace.role === "owner"
          ? "Proprietário"
          : activeWorkspace.role === "admin"
            ? "Administrador"
            : "Membro";
      }
      if (codeEl) {
        // Sempre usa o invite_code do workspace ativo (fonte confiável do backend)
        // Evita usar state.generatedInviteCode que é global e pode pertencer a outro workspace
        const displayCode = activeWorkspace.invite_code || "—";
        codeEl.textContent = displayCode;
      }
      const generateBtn = document.getElementById("envGenerateCodeBtn");
      if (generateBtn) {
        const hasCode = !!activeWorkspace.invite_code;
        generateBtn.classList.toggle("hidden", hasCode);
      }
      const copyBtn = document.getElementById("envCopyCodeBtn");
      if (copyBtn) {
        const hasCode = !!activeWorkspace.invite_code;
        copyBtn.classList.toggle("hidden", !hasCode);
      }

      // Render workspace participants
      const participantsEl = document.getElementById("envParticipants");
      const participantsListEl = document.getElementById("envParticipantsList");
      if (participantsEl && participantsListEl) {
        const members = getPeople(state);
        if (members.length > 0) {
          participantsEl.classList.remove("hidden");
          participantsListEl.innerHTML = members.map((member) => {
            const isMe = member.user_id === state.profile?.user_id;
            const initials = member.full_name ? member.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "?";
            return `
              <div class="env-participant-item">
                <span class="env-participant-avatar${isMe ? ' env-participant-avatar-me' : ''}">${member.avatar_url ? `<img src="${member.avatar_url}" alt="" />` : initials}</span>
                <span class="env-participant-name">${member.full_name || "Usuário"}${isMe ? ' <em>(você)</em>' : ''}</span>
              </div>
            `;
          }).join("");
        } else {
          participantsEl.classList.add("hidden");
        }
      }
    }
    if (envNoWorkspace) envNoWorkspace.classList.add("hidden");

    // Other workspaces list
    if (envOtherWorkspaces) {
      if (otherWorkspaces.length > 0) {
        envOtherWorkspaces.classList.remove("hidden");
      } else {
        envOtherWorkspaces.classList.add("hidden");
      }
    }
  } else {
    if (envActiveInfo) envActiveInfo.classList.add("hidden");
    if (envNoWorkspace) envNoWorkspace.classList.remove("hidden");
    if (envOtherWorkspaces) envOtherWorkspaces.classList.add("hidden");
  }

  // Render other workspaces list
  if (dom.workspaceList) {
    dom.workspaceList.innerHTML = otherWorkspaces.length ? otherWorkspaces.map((workspace) => `
      <article class="list-card">
        <div class="list-card-main">
          <strong>${workspace.name || "Sem nome"}</strong>
          <div class="meta-row">
            <span>${getWorkspaceKindLabel(workspace.kind)}</span>
            <span>${workspace.role === "owner" ? "Proprietário" : workspace.role === "admin" ? "Administrador" : "Membro"}</span>
          </div>
        </div>
        <div class="list-card-actions">
          <button class="secondary-button action-button" data-set-active-workspace="${workspace.id}" type="button">Ativar</button>
          <button class="ghost-button action-button" data-leave-workspace="${workspace.id}" type="button">Sair</button>
        </div>
      </article>
    `).join("") : "";
  }
}

export function renderMembers(state) {
  if (!dom.memberList) return;
  const members = getPeople(state);
  const content = members.length ? members.map((member) => `
    <article class="list-card">
      <div class="list-card-main">
        <strong>${member.full_name}</strong>
        <span class="muted">${member.user_id === state.profile?.user_id ? "Você" : "Membro"}</span>
      </div>
    </article>
  `).join("") : emptyStateMessage("Nenhum membro ainda", "Convide pessoas para começar a colaborar.");

  dom.memberList.innerHTML = content;
}

export function renderInvites(state) {
  if (!dom.inviteList) return;
  dom.inviteList.innerHTML = state.invites.length ? state.invites.map((invite) => {
    const acceptedInfo = invite.status === 'accepted' && invite.accepted_by_name
      ? `Aceito por ${invite.accepted_by_name}`
      : getInviteStatusLabel(invite);
    return `
    <article class="list-card">
      <div class="list-card-main">
        <strong>${invite.invited_email || "Convite por código"}</strong>
        <div class="meta-row">
          <span>Código ${invite.invite_code}</span>
          <span>${acceptedInfo}</span>
        </div>
      </div>
    </article>
  `;
  }).join("") : emptyStateMessage("Nenhum convite criado", "Gere um link ou código para trazer outras pessoas.");
}

export function renderEvents(state) {
  if (!dom.eventList) return;
  const events = Array.isArray(state.events) ? state.events : [];
  const sortedEvents = [...events].sort((a, b) => {
    if (a.is_done !== b.is_done) return Number(a.is_done) - Number(b.is_done);
    return (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31");
  });

  const filteredEvents = sortedEvents.filter((item) => {
    if (agendaFilter === "all") return true;
    const scope = item.scope || (item.owner_profile_id ? "individual" : "group");
    // Check if scope is a workspace ID
    const isWorkspaceScope = scope !== "individual" && scope !== "group" && state.workspaces?.find(ws => ws.id === scope);
    if (agendaFilter === "group") {
      // "Em conjunto" includes legacy group events and workspace-linked events
      return scope === "group" || isWorkspaceScope;
    }
    return scope === agendaFilter;
  });

  const content = filteredEvents.length ? filteredEvents.map((item) => {
    const scope = item.scope || (item.owner_profile_id ? "individual" : "group");
    const workspace = scope !== "individual" && scope !== "group" 
      ? state.workspaces?.find(ws => ws.id === scope) 
      : null;
    const scopeClass = workspace ? "event-workspace" : scope === "group" ? "event-group" : "event-individual";
    const scopeLabel = workspace ? workspace.name || getWorkspaceKindLabel(workspace.kind) : scope === "group" ? (state.couple?.name || getWorkspaceKindLabel(state.couple?.kind) || "Em conjunto") : "Individual";
    const kindLabel = item.kind === "task" ? "Tarefa" : item.kind === "reminder" ? "Lembrete" : "Evento";
    const doneClass = item.is_done ? "event-done" : "";
    const toggleLabel = item.is_done ? "Feito" : "Marcar como feito";
    const dateLabel = formatDateLabel(item.due_date);
    const titleClass = item.is_done ? "event-title-done" : "";
    return `
    <article class="list-card event-card ${scopeClass} ${doneClass}">
      <div class="event-card-row-main">
        <button class="event-toggle-check ${item.is_done ? 'is-checked' : ''}" type="button" data-toggle-event="${item.id}" data-current-done="${!!item.is_done}" title="${toggleLabel}">
          ${item.is_done ? '✓' : ''}
        </button>
        <div class="event-card-info">
          <div class="event-card-top">
            <strong class="event-card-name ${titleClass}">${item.title}</strong>
            <span class="event-card-date">${dateLabel}</span>
          </div>
          <div class="event-card-tags">
            <span class="event-tag event-tag-scope ${scopeClass}">${scopeLabel}</span>
            <span class="event-tag event-tag-kind">${kindLabel}</span>
            ${item.owner?.full_name ? `<span class="event-tag event-tag-owner">${item.owner.full_name}</span>` : ""}
          </div>
        </div>
      </div>
      ${item.note ? `<p class="event-card-note ${item.is_done ? 'event-note-done' : ''}">${item.note}</p>` : ""}
      <div class="event-card-actions-compact">
        <button class="event-action-link" data-edit-event="${item.id}" type="button">Editar</button>
        <button class="event-action-link event-action-delete" data-delete-event="${item.id}" type="button" title="Excluir">Excluir</button>
      </div>
    </article>
  `;}).join("") : emptyStateMessage("Nada na agenda ainda", "Crie seu primeiro compromisso, tarefa ou lembrete.");

  dom.eventList.innerHTML = content;
}

export function renderCalendar(events) {
  if (!dom.calendarGrid) return;
  const safeEvents = Array.isArray(events) ? events : [];
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  if (dom.calendarMonthTitle) dom.calendarMonthTitle.textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const eventsByDate = {};
  for (const event of safeEvents) {
    if (!event.due_date) continue;
    const dateKey = event.due_date;
    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
    eventsByDate[dateKey].push(event);
  }

  let calendarHTML = '<div class="calendar-header">';
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  for (const dayName of dayNames) {
    calendarHTML += `<div class="calendar-day-name">${dayName}</div>`;
  }
  calendarHTML += '</div><div class="calendar-body">';

  for (let i = 0; i < startDayOfWeek; i++) {
    calendarHTML += '<div class="calendar-day calendar-day-empty"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayEvents = eventsByDate[dateStr] || [];
    const isToday = new Date(year, month, day).getTime() === today.getTime();
    const isSelected = selectedDay === dateStr;

    let classes = 'calendar-day';
    if (isToday) classes += ' calendar-day-today';
    if (dayEvents.length) classes += ' calendar-day-has-events';
    if (isSelected) classes += ' calendar-day-selected';

    let eventsPreviewHTML = '';
    if (dayEvents.length > 0) {
      const maxPreview = 2;
      const previewEvents = dayEvents.slice(0, maxPreview);
      const remaining = dayEvents.length - maxPreview;
      const barsHTML = previewEvents.map((e) => {
        const eScope = e.scope || (e.owner_profile_id ? "individual" : "group");
        const eWorkspace = eScope !== "individual" && eScope !== "group" 
          ? state.workspaces?.find(ws => ws.id === eScope) 
          : null;
        const barClass = eWorkspace ? "bar-workspace" : eScope === "group" ? "bar-group" : "bar-individual";
        const doneClass = e.is_done ? "bar-done" : "";
        return `<div class="calendar-day-event-bar ${barClass} ${doneClass}">${e.title}</div>`;
      }).join('');
      const moreHTML = remaining > 0 ? `<div class="calendar-day-more">+${remaining} mais</div>` : '';
      eventsPreviewHTML = `<div class="calendar-day-events">${barsHTML}${moreHTML}</div>`;
    }

    calendarHTML += `<div class="${classes}" data-date="${dateStr}">
      <span class="calendar-day-number">${day}</span>
      ${eventsPreviewHTML}
    </div>`;
  }

  calendarHTML += '</div>';
  if (dom.calendarGrid) dom.calendarGrid.innerHTML = calendarHTML;

  if (selectedDay) {
    renderDayDetail(selectedDay, eventsByDate[selectedDay] || []);
  } else {
    if (dom.calendarDayDetail) dom.calendarDayDetail.classList.add('hidden');
  }
}

function renderDayDetail(dateStr, dayEvents) {
  if (!dom.calendarDayDetail) return;
  if (!dayEvents || !dayEvents.length) {
    const dateObj = new Date(`${dateStr}T12:00:00`);
    const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(dateObj);
    dom.calendarDayDetail.innerHTML = `
      <div class="calendar-day-detail-header">
        <strong>${dateLabel}</strong>
        <button class="ghost-button calendar-day-detail-close" type="button">&times;</button>
      </div>
      <p class="muted">Nenhum compromisso neste dia.</p>
    `;
    dom.calendarDayDetail.classList.remove('hidden');
    return;
  }

  const dateObj = new Date(`${dateStr}T12:00:00`);
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(dateObj);

  const eventsHTML = dayEvents.map((item) => {
    const scope = item.scope || (item.owner_profile_id ? "individual" : "group");
    const workspace = scope !== "individual" && scope !== "group" 
      ? state.workspaces?.find(ws => ws.id === scope) 
      : null;
    const scopeClass = workspace ? "event-workspace" : scope === "group" ? "event-group" : "event-individual";
    const scopeLabel = workspace ? workspace.name || getWorkspaceKindLabel(workspace.kind) : scope === "group" ? (state.couple?.name || getWorkspaceKindLabel(state.couple?.kind) || "Em conjunto") : "Individual";
    const kindLabel = item.kind === "task" ? "Tarefa" : item.kind === "reminder" ? "Lembrete" : "Evento";
    const doneClass = item.is_done ? "event-done" : "";
    const titleClass = item.is_done ? "event-title-done" : "";
    return `
      <article class="calendar-day-event event-card ${scopeClass} ${doneClass}">
        <div class="event-card-row-main">
          <span class="event-card-scope-dot ${scopeClass}"></span>
          <div class="event-card-info">
            <div class="event-card-top">
              <strong class="event-card-name ${titleClass}">${item.title}</strong>
              <span class="event-tag event-tag-kind">${kindLabel}</span>
            </div>
            <div class="event-card-tags">
              <span class="event-tag event-tag-scope ${scopeClass}">${scopeLabel}</span>
              ${item.owner?.full_name ? `<span class="event-tag event-tag-owner">${item.owner.full_name}</span>` : ""}
            </div>
          </div>
        </div>
        ${item.note ? `<p class="event-card-note ${item.is_done ? 'event-note-done' : ''}">${item.note}</p>` : ""}
      </article>
    `;
  }).join('');

  dom.calendarDayDetail.innerHTML = `
    <div class="calendar-day-detail-header">
      <strong>${dateLabel}</strong>
      <button class="ghost-button calendar-day-detail-close" type="button">&times;</button>
    </div>
    <div class="calendar-day-event-list">
      ${eventsHTML}
    </div>
  `;
  dom.calendarDayDetail.classList.remove('hidden');
}

export function setCalendarDate(date) {
  calendarDate = date;
}

export function getCalendarDate() {
  return calendarDate;
}

export function setAgendaFilter(filter) {
  agendaFilter = filter;
}

export function setSelectedDay(day) {
  selectedDay = day;
}

// ═══════════════════════════════════════════════════
// ─── Reports Module ───
// ═══════════════════════════════════════════════════

function getReportDateRange(period, customStart, customEnd) {
  const now = new Date();
  let start = null;
  let end = null;

  switch (period) {
    case "week": {
      start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case "month": {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    }
    case "year": {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    }
    case "last_month": {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    }
    case "last_year": {
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      break;
    }
    case "custom": {
      if (customStart) start = new Date(`${customStart}T00:00:00`);
      if (customEnd) end = new Date(`${customEnd}T23:59:59`);
      break;
    }
    default:
      break;
  }
  return { start, end };
}

function getFilteredTransactions(transactions, start, end) {
  return transactions.filter((t) => {
    const d = new Date(`${t.occurred_on}T12:00:00`);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

function getReportPeriodLabel(period, start, end) {
  const fmtFull = new Intl.DateTimeFormat(APP_CONFIG.locale, { day: "2-digit", month: "short", year: "numeric" });
  if (period === "all") return "Todo o período";
  if (period === "custom" && start && end) return `${fmtFull.format(start)} — ${fmtFull.format(end)}`;
  if (start && end) return `${fmtFull.format(start)} — ${fmtFull.format(end)}`;
  return { week: "Esta semana", month: "Este mês", year: "Este ano", last_month: "Mês passado", last_year: "Ano passado" }[period] || "Período";
}

function getReportPeriodShortLabel(period) {
  const now = new Date();
  if (period === "week") return "esta semana";
  if (period === "month") return "este mês";
  if (period === "year") return "este ano";
  if (period === "last_month") return "mês passado";
  if (period === "last_year") return "ano passado";
  if (period === "all") return "todo o período";
  return "período selecionado";
}

function emptyReportState(title, message) {
  return `<div class="report-empty-state">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
    <strong>${title}</strong>
    <span>${message}</span>
  </div>`;
}

function generateGeneralReport(state, transactions, detailLevel) {
  const incomes = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
  const expenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
  const balance = incomes - expenses;
  const count = transactions.length;

  let html = `<div class="report-summary-grid">
    <div class="report-summary-card report-card-${incomes >= 0 ? "positive" : "negative"}">
      <span class="report-card-label">Receitas</span>
      <span class="report-card-value">${fmtCurrency.format(incomes)}</span>
    </div>
    <div class="report-summary-card report-card-negative">
      <span class="report-card-label">Despesas</span>
      <span class="report-card-value">${fmtCurrency.format(expenses)}</span>
    </div>
    <div class="report-summary-card report-card-${balance >= 0 ? "positive" : "negative"}">
      <span class="report-card-label">Saldo</span>
      <span class="report-card-value">${fmtCurrency.format(balance)}</span>
    </div>
    <div class="report-summary-card report-card-neutral">
      <span class="report-card-label">Movimentações</span>
      <span class="report-card-value">${count}</span>
    </div>
  </div>
  <div class="report-charts-grid">
    <div class="report-chart-box">
      <h4 class="report-chart-title">Despesas por categoria</h4>
      <div class="report-chart-canvas"><canvas id="reportChart1"></canvas></div>
    </div>
    <div class="report-chart-box">
      <h4 class="report-chart-title">Evolução mensal</h4>
      <div class="report-chart-canvas"><canvas id="reportChart2"></canvas></div>
    </div>
  </div>`;

  if (detailLevel === "detailed" && transactions.length) {
    const sorted = [...transactions].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
    html += `<div class="report-table-wrapper"><table class="report-table"><thead><tr>
      <th>Data</th><th>Descrição</th><th>Categoria</th><th>Responsável</th><th>Tipo</th><th style="text-align:right">Valor</th>
    </tr></thead><tbody>${sorted.map(t => `<tr>
      <td>${fmtDate.format(new Date(`${t.occurred_on}T12:00:00`))}</td>
      <td>${t.description}${t.note ? ` <span class="muted">· ${t.note}</span>` : ""}</td>
      <td>${t.category?.name || "—"}</td>
      <td>${t.owner?.full_name || "—"}</td>
      <td><span class="category-type-badge ${t.type === "income" ? "cat-income" : "cat-expense"}">${t.type === "income" ? "Receita" : "Despesa"}</span></td>
      <td style="text-align:right" class="${t.type === "income" ? "amount-positive" : "amount-negative"}">${t.type === "income" ? "+" : "-"} ${fmtCurrency.format(t.amount)}</td>
    </tr>`).join("")}</tbody></table></div>`;
  }

  if (!transactions.length) html += emptyReportState("Sem movimentações", "Não há transações neste período para analisar.");
  return html;
}

function generatePeriodReport(state, transactions, startDate, endDate, detailLevel) {
  const incomes = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
  const expenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
  const balance = incomes - expenses;
  const avgDaily = startDate && endDate ? (() => { const days = Math.max(1, Math.ceil((endDate - startDate) / 86400000) + 1); return expenses / days; })() : 0;

  let html = `<div class="report-summary-grid">
    <div class="report-summary-card report-card-positive">
      <span class="report-card-label">Receitas</span>
      <span class="report-card-value">${fmtCurrency.format(incomes)}</span>
    </div>
    <div class="report-summary-card report-card-negative">
      <span class="report-card-label">Despesas</span>
      <span class="report-card-value">${fmtCurrency.format(expenses)}</span>
    </div>
    <div class="report-summary-card report-card-${balance >= 0 ? "positive" : "negative"}">
      <span class="report-card-label">Saldo</span>
      <span class="report-card-value">${fmtCurrency.format(balance)}</span>
    </div>
    <div class="report-summary-card report-card-accent">
      <span class="report-card-label">Média diária</span>
      <span class="report-card-value">${fmtCurrency.format(avgDaily)}</span>
      <span class="report-card-detail">de despesas</span>
    </div>
  </div>
  <div class="report-charts-grid">
    <div class="report-chart-box full-width">
      <h4 class="report-chart-title">Receitas vs Despesas no período</h4>
      <div class="report-chart-canvas"><canvas id="reportChart1"></canvas></div>
    </div>
  </div>`;

  if (detailLevel === "detailed" && transactions.length) {
    const sorted = [...transactions].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
    html += `<div class="report-table-wrapper"><table class="report-table"><thead><tr>
      <th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th style="text-align:right">Valor</th>
    </tr></thead><tbody>${sorted.map(t => `<tr>
      <td>${fmtDate.format(new Date(`${t.occurred_on}T12:00:00`))}</td>
      <td>${t.description}${t.note ? ` <span class="muted">· ${t.note}</span>` : ""}</td>
      <td>${t.category?.name || "—"}</td>
      <td><span class="category-type-badge ${t.type === "income" ? "cat-income" : "cat-expense"}">${t.type === "income" ? "Receita" : "Despesa"}</span></td>
      <td style="text-align:right" class="${t.type === "income" ? "amount-positive" : "amount-negative"}">${t.type === "income" ? "+" : "-"} ${fmtCurrency.format(t.amount)}</td>
    </tr>`).join("")}</tbody></table></div>`;
  }

  if (!transactions.length) html += emptyReportState("Sem movimentações no período", "Ajuste as datas ou registre transações.");
  return html;
}

function generateTopExpensesReport(transactions, detailLevel) {
  const expenses = transactions.filter(t => t.type === "expense").sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 10);
  const total = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);

  let html = `<div class="report-summary-grid" style="grid-template-columns:repeat(2,1fr)">
    <div class="report-summary-card report-card-negative">
      <span class="report-card-label">Total em despesas</span>
      <span class="report-card-value">${fmtCurrency.format(total)}</span>
    </div>
    <div class="report-summary-card report-card-neutral">
      <span class="report-card-label">Top 1 representa</span>
      <span class="report-card-value">${expenses.length ? Math.round((Number(expenses[0].amount) / total) * 100) : 0}%</span>
      <span class="report-card-detail">do total de despesas</span>
    </div>
  </div>`;

  if (expenses.length) {
    html += `<div class="report-chart-box"><h4 class="report-chart-title">Top 10 maiores gastos</h4><div class="report-ranking-list">`;
    expenses.forEach((t, i) => {
      const pct = total > 0 ? ((Number(t.amount) / total) * 100).toFixed(1) : 0;
      html += `<div class="report-ranking-item">
        <span class="report-ranking-pos ${i < 3 ? "top-3" : ""}">${i + 1}</span>
        <div class="report-ranking-info">
          <strong>${t.description}</strong>
          <span>${fmtDate.format(new Date(`${t.occurred_on}T12:00:00`))} · ${t.owner?.full_name || "—"} · ${t.category?.name || "—"} · ${pct}%</span>
        </div>
        <span class="report-ranking-amount">${fmtCurrency.format(t.amount)}</span>
      </div>`;
    });
    html += `</div></div>`;
  } else {
    html += emptyReportState("Sem despesas", "Nenhuma despesa registrada neste período.");
  }
  return html;
}

function generateTopIncomesReport(transactions, detailLevel) {
  const incomes = transactions.filter(t => t.type === "income").sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 10);
  const total = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);

  let html = `<div class="report-summary-grid" style="grid-template-columns:repeat(2,1fr)">
    <div class="report-summary-card report-card-positive">
      <span class="report-card-label">Total em receitas</span>
      <span class="report-card-value">${fmtCurrency.format(total)}</span>
    </div>
    <div class="report-summary-card report-card-neutral">
      <span class="report-card-label">Top 1 representa</span>
      <span class="report-card-value">${incomes.length ? Math.round((Number(incomes[0].amount) / total) * 100) : 0}%</span>
      <span class="report-card-detail">do total de receitas</span>
    </div>
  </div>`;

  if (incomes.length) {
    html += `<div class="report-chart-box"><h4 class="report-chart-title">Top 10 maiores receitas</h4><div class="report-ranking-list">`;
    incomes.forEach((t, i) => {
      const pct = total > 0 ? ((Number(t.amount) / total) * 100).toFixed(1) : 0;
      html += `<div class="report-ranking-item">
        <span class="report-ranking-pos ${i < 3 ? "top-3" : ""}">${i + 1}</span>
        <div class="report-ranking-info">
          <strong>${t.description}</strong>
          <span>${fmtDate.format(new Date(`${t.occurred_on}T12:00:00`))} · ${t.owner?.full_name || "—"} · ${t.category?.name || "—"} · ${pct}%</span>
        </div>
        <span class="report-ranking-amount income">${fmtCurrency.format(t.amount)}</span>
      </div>`;
    });
    html += `</div></div>`;
  } else {
    html += emptyReportState("Sem receitas", "Nenhuma receita registrada neste período.");
  }
  return html;
}

function generateByCategoryReport(state, transactions) {
  const expenses = transactions.filter(t => t.type === "expense");
  const total = expenses.reduce((s, t) => s + Number(t.amount || 0), 0);
  const byCategory = {};
  for (const t of expenses) {
    const name = t.category?.name || "Sem categoria";
    byCategory[name] = (byCategory[name] || 0) + Number(t.amount || 0);
  }
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const maxVal = sorted.length ? sorted[0][1] : 0;

  let html = `<div class="report-summary-grid" style="grid-template-columns:repeat(2,1fr)">
    <div class="report-summary-card report-card-negative">
      <span class="report-card-label">Total de despesas</span>
      <span class="report-card-value">${fmtCurrency.format(total)}</span>
    </div>
    <div class="report-summary-card report-card-neutral">
      <span class="report-card-label">Categorias</span>
      <span class="report-card-value">${sorted.length}</span>
    </div>
  </div>
  <div class="report-charts-grid">
    <div class="report-chart-box"><h4 class="report-chart-title">Distribuição por categoria</h4><div class="report-chart-canvas"><canvas id="reportChart1"></canvas></div></div>
    <div class="report-chart-box"><h4 class="report-chart-title">Proporção por categoria</h4><div class="report-bar-list">`;

  sorted.forEach(([name, value]) => {
    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
    const barPct = maxVal > 0 ? (value / maxVal) * 100 : 0;
    html += `<div class="report-bar-item">
      <div class="report-bar-header"><span class="report-bar-label">${name}</span><span class="report-bar-value">${fmtCurrency.format(value)} <span class="report-bar-pct">(${pct}%)</span></span></div>
      <div class="report-bar-track"><div class="report-bar-fill expense" style="width:${barPct}%"></div></div>
    </div>`;
  });

  html += `</div></div></div>`;
  if (!sorted.length) html += emptyReportState("Sem despesas por categoria", "Nenhuma despesa registrada neste período.");
  return html;
}

function generateByGroupReport(state, transactions) {
  const expenses = transactions.filter(t => t.type === "expense");
  const total = expenses.reduce((s, t) => s + Number(t.amount || 0), 0);
  const byPerson = {};
  for (const t of expenses) {
    const name = t.owner?.full_name || "Desconhecido";
    byPerson[name] = (byPerson[name] || 0) + Number(t.amount || 0);
  }
  const sorted = Object.entries(byPerson).sort((a, b) => b[1] - a[1]);
  const maxVal = sorted.length ? sorted[0][1] : 0;

  let html = `<div class="report-summary-grid" style="grid-template-columns:repeat(2,1fr)">
    <div class="report-summary-card report-card-negative">
      <span class="report-card-label">Total de despesas</span>
      <span class="report-card-value">${fmtCurrency.format(total)}</span>
    </div>
    <div class="report-summary-card report-card-neutral">
      <span class="report-card-label">Pessoas</span>
      <span class="report-card-value">${sorted.length}</span>
    </div>
  </div>
  <div class="report-charts-grid">
    <div class="report-chart-box"><h4 class="report-chart-title">Distribuição por pessoa</h4><div class="report-chart-canvas"><canvas id="reportChart1"></canvas></div></div>
    <div class="report-chart-box"><h4 class="report-chart-title">Proporção por pessoa</h4><div class="report-bar-list">`;

  sorted.forEach(([name, value]) => {
    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
    const barPct = maxVal > 0 ? (value / maxVal) * 100 : 0;
    html += `<div class="report-bar-item">
      <div class="report-bar-header"><span class="report-bar-label">${name}</span><span class="report-bar-value">${fmtCurrency.format(value)} <span class="report-bar-pct">(${pct}%)</span></span></div>
      <div class="report-bar-track"><div class="report-bar-fill accent" style="width:${barPct}%"></div></div>
    </div>`;
  });

  html += `</div></div></div>`;
  if (!sorted.length) html += emptyReportState("Sem despesas por pessoa", "Nenhuma despesa registrada neste período.");
  return html;
}

function generateComparisonReport(state, transactions, startDate, endDate) {
  if (!startDate || !endDate) return emptyReportState("Selecione um período", "Escolha as datas para comparar os períodos.");

  const totalMs = endDate.getTime() - startDate.getTime();
  const midTime = startDate.getTime() + totalMs / 2;
  const midDate = new Date(midTime);

  const firstHalf = transactions.filter(t => new Date(`${t.occurred_on}T12:00:00`) < midDate);
  const secondHalf = transactions.filter(t => new Date(`${t.occurred_on}T12:00:00`) >= midDate);

  const calc = (txs) => {
    const inc = txs.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
    const exp = txs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
    return { income: inc, expense: exp, balance: inc - exp };
  };

  const p1 = calc(firstHalf);
  const p2 = calc(secondHalf);
  const delta = (a, b) => a === 0 ? (b > 0 ? 100 : 0) : ((b - a) / Math.abs(a)) * 100;
  const fmtDelta = (val) => { const sign = val > 0 ? "+" : val < 0 ? "" : "±"; const cls = val > 0 ? "positive" : val < 0 ? "negative" : "neutral"; return `<span class="report-delta ${cls}">${sign}${val.toFixed(1)}%</span>`; };

  const fmtD = new Intl.DateTimeFormat(APP_CONFIG.locale, { day: "2-digit", month: "short" });

  return `<div class="report-comparison-grid">
    <div class="report-comparison-card">
      <h4>${fmtD.format(startDate)} — ${fmtD.format(midDate)}</h4>
      <div class="report-comparison-row"><span class="report-comparison-label">Receitas</span><span class="report-comparison-value" style="color:var(--success)">${fmtCurrency.format(p1.income)}</span></div>
      <div class="report-comparison-row"><span class="report-comparison-label">Despesas</span><span class="report-comparison-value" style="color:var(--danger)">${fmtCurrency.format(p1.expense)}</span></div>
      <div class="report-comparison-row"><span class="report-comparison-label">Saldo</span><span class="report-comparison-value">${fmtCurrency.format(p1.balance)}</span></div>
    </div>
    <div class="report-comparison-card">
      <h4>${fmtD.format(midDate)} — ${fmtD.format(endDate)}</h4>
      <div class="report-comparison-row"><span class="report-comparison-label">Receitas</span><span class="report-comparison-value" style="color:var(--success)">${fmtCurrency.format(p2.income)}</span></div>
      <div class="report-comparison-row"><span class="report-comparison-label">Despesas</span><span class="report-comparison-value" style="color:var(--danger)">${fmtCurrency.format(p2.expense)}</span></div>
      <div class="report-comparison-row"><span class="report-comparison-label">Saldo</span><span class="report-comparison-value">${fmtCurrency.format(p2.balance)}</span></div>
    </div>
  </div>
  <div class="report-summary-grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="report-summary-card report-card-neutral"><span class="report-card-label">Variação receitas</span><span class="report-card-value">${fmtDelta(delta(p1.income, p2.income))}</span></div>
    <div class="report-summary-card report-card-neutral"><span class="report-card-label">Variação despesas</span><span class="report-card-value">${fmtDelta(delta(p1.expense, p2.expense))}</span></div>
    <div class="report-summary-card report-card-neutral"><span class="report-card-label">Variação saldo</span><span class="report-card-value">${fmtDelta(delta(p1.balance, p2.balance))}</span></div>
  </div>
  <div class="report-charts-grid"><div class="report-chart-box full-width"><h4 class="report-chart-title">Comparativo visual</h4><div class="report-chart-canvas"><canvas id="reportChart1"></canvas></div></div></div>`;
}

function generateEvolutionReport(state, transactions) {
  const months = new Map();
  for (const t of transactions) {
    const d = new Date(`${t.occurred_on}T12:00:00`);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) months.set(key, { income: 0, expense: 0 });
    const m = months.get(key);
    if (t.type === "income") m.income += Number(t.amount || 0);
    else m.expense += Number(t.amount || 0);
  }

  const series = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, data]) => {
    const [year, month] = key.split("-").map(Number);
    return { label: fmtMonthYear.format(new Date(year, month - 1, 1)), income: data.income, expense: data.expense, balance: data.income - data.expense };
  });

  const totalIncome = series.reduce((s, m) => s + m.income, 0);
  const totalExpense = series.reduce((s, m) => s + m.expense, 0);

  let html = `<div class="report-summary-grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="report-summary-card report-card-positive"><span class="report-card-label">Total receitas</span><span class="report-card-value">${fmtCurrency.format(totalIncome)}</span></div>
    <div class="report-summary-card report-card-negative"><span class="report-card-label">Total despesas</span><span class="report-card-value">${fmtCurrency.format(totalExpense)}</span></div>
    <div class="report-summary-card report-card-${totalIncome - totalExpense >= 0 ? "positive" : "negative"}"><span class="report-card-label">Saldo acumulado</span><span class="report-card-value">${fmtCurrency.format(totalIncome - totalExpense)}</span></div>
  </div>
  <div class="report-charts-grid">
    <div class="report-chart-box full-width"><h4 class="report-chart-title">Evolução mensal de receitas e despesas</h4><div class="report-chart-canvas" style="max-height:300px"><canvas id="reportChart1"></canvas></div></div>
    <div class="report-chart-box full-width"><h4 class="report-chart-title">Saldo mensal</h4><div class="report-chart-canvas" style="max-height:250px"><canvas id="reportChart2"></canvas></div></div>
  </div>`;

  if (!series.length) html += emptyReportState("Sem dados para evolução", "Registre transações para ver a evolução.");
  return html;
}

function generateRecentReport(state, transactions, detailLevel) {
  const sorted = [...transactions].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).slice(0, 20);
  const total = transactions.length;

  let html = `<div class="report-summary-grid" style="grid-template-columns:repeat(2,1fr)">
    <div class="report-summary-card report-card-neutral"><span class="report-card-label">Total de movimentações</span><span class="report-card-value">${total}</span></div>
    <div class="report-summary-card report-card-accent"><span class="report-card-label">Exibindo</span><span class="report-card-value">${Math.min(20, total)}</span><span class="report-card-detail">mais recentes</span></div>
  </div>`;

  if (sorted.length) {
    html += `<div class="report-table-wrapper"><table class="report-table"><thead><tr>
      <th>Data</th><th>Descrição</th><th>Categoria</th><th>Responsável</th><th>Tipo</th><th style="text-align:right">Valor</th>
    </tr></thead><tbody>${sorted.map(t => `<tr>
      <td>${fmtDate.format(new Date(`${t.occurred_on}T12:00:00`))}</td>
      <td>${t.description}${t.note ? ` <span class="muted">· ${t.note}</span>` : ""}</td>
      <td>${t.category?.name || "—"}</td>
      <td>${t.owner?.full_name || "—"}</td>
      <td><span class="category-type-badge ${t.type === "income" ? "cat-income" : "cat-expense"}">${t.type === "income" ? "Receita" : "Despesa"}</span></td>
      <td style="text-align:right" class="${t.type === "income" ? "amount-positive" : "amount-negative"}">${t.type === "income" ? "+" : "-"} ${fmtCurrency.format(t.amount)}</td>
    </tr>`).join("")}</tbody></table></div>`;
  } else {
    html += emptyReportState("Sem movimentações", "Não há transações registradas.");
  }
  return html;
}

export function renderReports(state, reportConfig = {}) {
  const type = reportConfig.type || "general";
  const detailLevel = reportConfig.detailLevel || "summary";
  const period = reportConfig.period || "month";
  const customStart = reportConfig.customStart || "";
  const customEnd = reportConfig.customEnd || "";
  const scope = reportConfig.scope || "individual";

  const { start, end } = getReportDateRange(period, customStart, customEnd);
  let filtered = getFilteredTransactions(state.transactions, start, end);

  // Filter by scope
  let scopeLabel = "Ambiente";
  if (scope === "individual") {
    const profileId = state.profile?.user_id;
    if (profileId) {
      filtered = filtered.filter(t => t.owner_profile_id === profileId);
    }
    scopeLabel = "Individual";
  } else if (scope && scope !== "workspace") {
    // scope is a specific workspace ID — filter by couple_id
    filtered = filtered.filter(t => t.couple_id === scope);
    const ws = state.workspaces?.find(w => w.id === scope);
    scopeLabel = ws ? (ws.name || getWorkspaceKindLabel(ws.kind)) : "Ambiente";
  }

  const periodLabel = getReportPeriodLabel(period, start, end);

  const titles = {
    general: "Resumo geral", period: "Relatório por período",
    top_expenses: "Maiores gastos", top_incomes: "Maiores receitas",
    by_category: "Gastos por categoria", by_group: "Gastos por grupo/pessoa",
    comparison: "Comparativo entre períodos", evolution: "Evolução das receitas e despesas",
    recent: "Movimentações recentes"
  };

  const customTitle = reportConfig.customTitle || "";

  const reportsContent = document.querySelector("#reportsContent");
  if (!reportsContent) return;

  let content = "";
  switch (type) {
    case "general": content = generateGeneralReport(state, filtered, detailLevel); break;
    case "period": content = generatePeriodReport(state, filtered, start, end, detailLevel); break;
    case "top_expenses": content = generateTopExpensesReport(filtered, detailLevel); break;
    case "top_incomes": content = generateTopIncomesReport(filtered, detailLevel); break;
    case "by_category": content = generateByCategoryReport(state, filtered); break;
    case "by_group": content = generateByGroupReport(state, filtered); break;
    case "comparison": content = generateComparisonReport(state, filtered, start, end); break;
    case "evolution": content = generateEvolutionReport(state, filtered); break;
    case "recent": content = generateRecentReport(state, filtered, detailLevel); break;
    default: content = generateGeneralReport(state, filtered, detailLevel);
  }

  const displayTitle = customTitle || titles[type] || "Relatório";

  reportsContent.innerHTML = `<div id="reportPrintArea"><div class="report-panel">
    <div class="report-header">
      <div class="report-header-info">
        <p class="eyebrow">${customTitle ? "Relatório personalizado" : "Relatório"}</p>
        <h3>${displayTitle}</h3>
      </div>
      <span class="report-period-badge">${scopeLabel}</span>
      <span class="report-period-badge">${periodLabel}</span>
    </div>
    ${content}
  </div></div>`;

  renderReportCharts(state, filtered, type, start, end);
}

function renderReportCharts(state, transactions, reportType, startDate, endDate) {
  reportCharts.forEach(c => c.destroy());
  reportCharts = [];

  if (!window.Chart) return;

  const cs = getComputedStyle(document.documentElement);
  const incomeColor = cs.getPropertyValue("--success").trim() || "#22c55e";
  const expenseColor = cs.getPropertyValue("--danger").trim() || "#ef4444";
  const accentColor = cs.getPropertyValue("--accent").trim() || "#3b82f6";
  const textColor = cs.getPropertyValue("--text").trim() || "#0f172a";
  const mutedColor = cs.getPropertyValue("--muted").trim() || "#64748b";
  const palette = [accentColor, incomeColor, expenseColor, "#94a3b8", "#f59e0b", "#8b5cf6", "#14b8a6", "#ec4899", "#f97316", "#06b6d4"];

  const legendOpts = { position: "bottom", labels: { color: textColor, usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 11 } } };
  const tooltipCurrency = { callbacks: { label(ctx) { return `${ctx.dataset?.label || ctx.label || ""}: ${fmtCurrency.format(ctx.raw || 0)}`; } } };

  // Category / Group doughnut
  const c1 = document.querySelector("#reportChart1");
  if (c1 && (reportType === "by_category" || reportType === "by_group")) {
    const expenses = transactions.filter(t => t.type === "expense");
    const key = reportType === "by_category" ? (t => t.category?.name || "Sem categoria") : (t => t.owner?.full_name || "Desconhecido");
    const grouped = {};
    for (const t of expenses) { const k = key(t); grouped[k] = (grouped[k] || 0) + Number(t.amount || 0); }
    const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
    if (sorted.length) {
      reportCharts.push(new window.Chart(c1, {
        type: "doughnut",
        data: { labels: sorted.map(([l]) => l), datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: palette.slice(0, sorted.length), borderColor: "#fff", borderWidth: 2, hoverOffset: 6 }] },
        options: { cutout: "65%", maintainAspectRatio: false, plugins: { legend: legendOpts, tooltip: tooltipCurrency } }
      }));
    }
  }

  // Comparison bar chart
  if (c1 && reportType === "comparison") {
    if (!startDate || !endDate) return;
    const totalMs = endDate.getTime() - startDate.getTime();
    const midTime = startDate.getTime() + totalMs / 2;
    const midDate = new Date(midTime);
    const f1 = transactions.filter(t => new Date(`${t.occurred_on}T12:00:00`) < midDate);
    const f2 = transactions.filter(t => new Date(`${t.occurred_on}T12:00:00`) >= midDate);
    const fmtD = new Intl.DateTimeFormat(APP_CONFIG.locale, { day: "2-digit", month: "short" });
    reportCharts.push(new window.Chart(c1, {
      type: "bar",
      data: {
        labels: [`${fmtD.format(startDate)} — ${fmtD.format(midDate)}`, `${fmtD.format(midDate)} — ${fmtD.format(endDate)}`],
        datasets: [
          { label: "Receitas", data: [f1.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0), f2.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0)], backgroundColor: incomeColor, borderRadius: 6 },
          { label: "Despesas", data: [f1.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0), f2.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0)], backgroundColor: expenseColor, borderRadius: 6 }
        ]
      },
      options: { maintainAspectRatio: false, plugins: { legend: legendOpts, tooltip: tooltipCurrency }, scales: { y: { ticks: { color: mutedColor, font: { size: 10 }, callback(v) { return fmtCurrency.format(v); } }, grid: { color: "rgba(226,232,240,0.5)" } }, x: { ticks: { color: mutedColor, font: { size: 10 } }, grid: { display: false } } } }
    }));
  }

  // Period bar chart
  if (c1 && reportType === "period") {
    const inc = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
    const exp = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
    reportCharts.push(new window.Chart(c1, {
      type: "bar",
      data: { labels: ["Receitas", "Despesas", "Saldo"], datasets: [{ data: [inc, exp, inc - exp], backgroundColor: [incomeColor, expenseColor, (inc - exp) >= 0 ? incomeColor : expenseColor], borderRadius: 8 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipCurrency }, scales: { y: { ticks: { color: mutedColor, font: { size: 10 }, callback(v) { return fmtCurrency.format(v); } }, grid: { color: "rgba(226,232,240,0.5)" } }, x: { ticks: { color: mutedColor, font: { size: 11 } }, grid: { display: false } } } }
    }));
  }

  // General report charts
  if (c1 && reportType === "general") {
    const expenses = transactions.filter(t => t.type === "expense");
    const byCat = {};
    for (const t of expenses) { const n = t.category?.name || "Sem categoria"; byCat[n] = (byCat[n] || 0) + Number(t.amount || 0); }
    const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (sorted.length) {
      reportCharts.push(new window.Chart(c1, {
        type: "doughnut",
        data: { labels: sorted.map(([l]) => l), datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: palette.slice(0, sorted.length), borderColor: "#fff", borderWidth: 2, hoverOffset: 6 }] },
        options: { cutout: "65%", maintainAspectRatio: false, plugins: { legend: legendOpts, tooltip: tooltipCurrency } }
      }));
    }

    const c2 = document.querySelector("#reportChart2");
    if (c2) {
      const months = new Map();
      for (const t of transactions) {
        const d = new Date(`${t.occurred_on}T12:00:00`);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!months.has(key)) months.set(key, { income: 0, expense: 0 });
        const m = months.get(key);
        if (t.type === "income") m.income += Number(t.amount || 0); else m.expense += Number(t.amount || 0);
      }
      const series = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, data]) => {
        const [year, month] = key.split("-").map(Number);
        return { label: fmtMonthYear.format(new Date(year, month - 1, 1)), income: data.income, expense: data.expense };
      });
      if (series.length) {
        reportCharts.push(new window.Chart(c2, {
          type: "line",
          data: {
            labels: series.map(s => s.label),
            datasets: [
              { label: "Receitas", data: series.map(s => s.income), borderColor: incomeColor, backgroundColor: "rgba(16,185,129,0.08)", pointBackgroundColor: incomeColor, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2, fill: true, tension: 0.35 },
              { label: "Despesas", data: series.map(s => s.expense), borderColor: expenseColor, backgroundColor: "rgba(239,68,68,0.06)", pointBackgroundColor: expenseColor, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2, fill: true, tension: 0.35 }
            ]
          },
          options: { maintainAspectRatio: false, scales: { x: { ticks: { color: mutedColor, font: { size: 10 } }, grid: { color: "rgba(226,232,240,0.5)" } }, y: { ticks: { color: mutedColor, font: { size: 10 }, callback(v) { return fmtCurrency.format(v); } }, grid: { color: "rgba(226,232,240,0.5)" } } }, plugins: { legend: legendOpts, tooltip: tooltipCurrency } }
        }));
      }
    }
  }

  // Evolution charts
  if (c1 && reportType === "evolution") {
    const months = new Map();
    for (const t of transactions) {
      const d = new Date(`${t.occurred_on}T12:00:00`);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!months.has(key)) months.set(key, { income: 0, expense: 0 });
      const m = months.get(key);
      if (t.type === "income") m.income += Number(t.amount || 0); else m.expense += Number(t.amount || 0);
    }
    const series = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, data]) => {
      const [year, month] = key.split("-").map(Number);
      return { label: fmtMonthYear.format(new Date(year, month - 1, 1)), income: data.income, expense: data.expense, balance: data.income - data.expense };
    });
    if (series.length) {
      reportCharts.push(new window.Chart(c1, {
        type: "line",
        data: {
          labels: series.map(s => s.label),
          datasets: [
            { label: "Receitas", data: series.map(s => s.income), borderColor: incomeColor, backgroundColor: "rgba(16,185,129,0.08)", pointBackgroundColor: incomeColor, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2, fill: true, tension: 0.35 },
            { label: "Despesas", data: series.map(s => s.expense), borderColor: expenseColor, backgroundColor: "rgba(239,68,68,0.06)", pointBackgroundColor: expenseColor, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2, fill: true, tension: 0.35 }
          ]
        },
        options: { maintainAspectRatio: false, scales: { x: { ticks: { color: mutedColor, font: { size: 10 } }, grid: { color: "rgba(226,232,240,0.5)" } }, y: { ticks: { color: mutedColor, font: { size: 10 }, callback(v) { return fmtCurrency.format(v); } }, grid: { color: "rgba(226,232,240,0.5)" } } }, plugins: { legend: legendOpts, tooltip: tooltipCurrency } }
      }));

      const c2 = document.querySelector("#reportChart2");
      if (c2) {
        reportCharts.push(new window.Chart(c2, {
          type: "bar",
          data: { labels: series.map(s => s.label), datasets: [{ label: "Saldo", data: series.map(s => s.balance), backgroundColor: series.map(s => s.balance >= 0 ? incomeColor : expenseColor), borderRadius: 6 }] },
          options: { maintainAspectRatio: false, indexAxis: series.length > 8 ? "y" : "x", plugins: { legend: { display: false }, tooltip: tooltipCurrency }, scales: { y: { ticks: { color: mutedColor, font: { size: 10 } }, grid: { display: false } }, x: { ticks: { color: mutedColor, font: { size: 10 }, callback(v) { return fmtCurrency.format(v); } }, grid: { color: "rgba(226,232,240,0.5)" } } } }
        }));
      }
    }
  }
}


export function renderEverything(state, filters, dashboardFilters = {}, reportConfig = {}, billFilters = {}, goalFilters = {}) {
  renderHeader(state);
  renderSummary(state, dashboardFilters);
  renderHealth(state);
  renderCharts(state, dashboardFilters);
  renderWorkspaces(state);
  populateDynamicOptions(state, dashboardFilters);
  renderTransactions(state, filters);
  renderDashboardPulse(state);
  renderSmartInsights(state);
  renderGoals(state, goalFilters);
  renderBills(state, billFilters);
  renderCategories(state);
  renderNotifications(state);
  renderLinkStatus(state);
  renderMembers(state);
  renderInvites(state);
  renderEvents(state);
  renderCalendar(state.events);
  renderReports(state, reportConfig);
}

// ═══════════════════════════════════════════════════
// ─── Pulso do Dia (Dashboard Pulse) ───
// ═══════════════════════════════════════════════════

export function renderDashboardPulse(state) {
  const pulseEl = document.querySelector("#dashboardPulse");
  const billsSectionEl = document.querySelector("#pulseUpcomingBills");
  const eventsSectionEl = document.querySelector("#pulseUpcomingEvents");
  if (!pulseEl) return;

  const transactions = state.transactions || [];
  const bills = state.bills || [];
  const events = state.events || [];

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // 1. Saldo do dia
  const todayTx = transactions.filter(t => t.occurred_on === today);
  const todayIncome = todayTx.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
  const todayExpense = todayTx.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
  const todayBalance = todayIncome - todayExpense;
  const todayTone = todayBalance >= 0 ? "pulse-positive" : "pulse-negative";

  // 2. Contas próximas do vencimento (próximos 3 dias)
  const upcomingBills = bills.filter(b => {
    if (b.is_paid || !b.due_date) return false;
    const due = new Date(`${b.due_date}T12:00:00`);
    const diff = Math.ceil((due - now) / 86400000);
    return diff >= 0 && diff <= APP_CONFIG.billWarningDays;
  }).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const upcomingTotal = upcomingBills.reduce((s, b) => s + Number(b.amount || 0), 0);

  // 3. Próximos compromissos (próximos 3 dias)
  const threeDaysAhead = new Date(now);
  threeDaysAhead.setDate(threeDaysAhead.getDate() + 3);
  const threeDaysAheadStr = threeDaysAhead.toISOString().slice(0, 10);
  const upcomingEvents = events.filter(e => {
    if (e.is_done || !e.due_date) return false;
    return e.due_date >= today && e.due_date <= threeDaysAheadStr;
  }).sort((a, b) => a.due_date.localeCompare(b.due_date));

  // 4. Última movimentação
  const lastTx = [...transactions].sort((a, b) => {
    const da = b.occurred_on || "";
    const db = a.occurred_on || "";
    return da.localeCompare(db);
  })[0];

  pulseEl.innerHTML = `
    <div class="pulse-card ${todayTone}">
      <span class="pulse-label">Saldo de hoje</span>
      <strong class="pulse-value">${fmtCurrency.format(todayBalance)}</strong>
      <span class="pulse-detail">${todayTx.length} lançamento(s)</span>
    </div>
    <div class="pulse-card pulse-bills">
      <span class="pulse-label">Contas próximas</span>
      <strong class="pulse-value">${upcomingBills.length}</strong>
      <span class="pulse-detail">${upcomingBills.length ? fmtCurrency.format(upcomingTotal) : "Tudo em dia"}</span>
    </div>
    <div class="pulse-card pulse-events">
      <span class="pulse-label">Próximos compromissos</span>
      <strong class="pulse-value">${upcomingEvents.length}</strong>
      <span class="pulse-detail">${upcomingEvents.length ? `Próximo: ${fmtDate.format(new Date(upcomingEvents[0].due_date + "T12:00:00"))}` : "Nada pendente"}</span>
    </div>
    <div class="pulse-card pulse-last">
      <span class="pulse-label">Última movimentação</span>
      <strong class="pulse-value pulse-value-sm">${lastTx ? `${lastTx.type === "income" ? "+" : "-"} ${fmtCurrency.format(lastTx.amount)}` : "—"}</strong>
      <span class="pulse-detail">${lastTx ? `${lastTx.description}${lastTx.occurred_on ? ` · ${fmtDate.format(new Date(lastTx.occurred_on + "T12:00:00"))}` : ""}` : "Nenhuma ainda"}</span>
    </div>
  `;

  // Render upcoming bills list
  if (billsSectionEl) {
    if (upcomingBills.length > 0) {
      billsSectionEl.innerHTML = `
        <div class="pulse-compact-list">
          <p class="pulse-compact-title">${upcomingBills.length} conta(s) próxima(s) do vencimento</p>
          ${upcomingBills.map(b => {
            const dueDate = new Date(`${b.due_date}T12:00:00`);
            const diffDays = Math.ceil((dueDate - now) / 86400000);
            const whenLabel = diffDays === 0 ? "vence hoje" : diffDays === 1 ? "vence amanhã" : `vence dia ${fmtDate.format(dueDate)}`;
            return `<div class="pulse-compact-item">• ${b.title} — ${whenLabel}</div>`;
          }).join("")}
        </div>
      `;
      billsSectionEl.classList.remove("hidden");
    } else {
      billsSectionEl.innerHTML = "";
      billsSectionEl.classList.add("hidden");
    }
  }

  // Render upcoming events list
  if (eventsSectionEl) {
    if (upcomingEvents.length > 0) {
      eventsSectionEl.innerHTML = `
        <div class="pulse-compact-list">
          <p class="pulse-compact-title">${upcomingEvents.length} próximo(s) compromisso(s)</p>
          ${upcomingEvents.map(e => {
            const dueDate = new Date(`${e.due_date}T12:00:00`);
            const diffDays = Math.ceil((dueDate - now) / 86400000);
            let whenLabel;
            if (diffDays === 0) whenLabel = "hoje";
            else if (diffDays === 1) whenLabel = "amanhã";
            else {
              const dayName = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"][dueDate.getDay()];
              whenLabel = dayName;
            }
            return `<div class="pulse-compact-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.6"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${e.title} — ${whenLabel}</div>`;
          }).join("")}
        </div>
      `;
      eventsSectionEl.classList.remove("hidden");
    } else {
      eventsSectionEl.innerHTML = "";
      eventsSectionEl.classList.add("hidden");
    }
  }
}

// ═══════════════════════════════════════════════════
// ─── Smart Features (Rule-based, no AI) ───
// ═══════════════════════════════════════════════════

export function renderSmartInsights(state) {
  const insights = computeSmartInsights(state);
  const healthFactorsEl = document.querySelector("#healthFactors");
  if (!healthFactorsEl) return;

  if (!insights.length) return;

  const smartHTML = `<div class="health-factors-group"><p class="health-factors-label">${healthIcons.chart} Análises inteligentes</p>` +
    insights.map((insight) => {
      const toneClass = insight.tone === "warning" ? "health-factor-warning" : insight.tone === "success" ? "health-factor-positive" : "health-factor-neutral";
      return `<div class="health-factor-item ${toneClass}">${insight.icon} <strong>${insight.title}</strong> — ${insight.message}</div>`;
    }).join("") +
    `</div>`;

  healthFactorsEl.innerHTML += smartHTML;
}

function computeSmartInsights(state) {
  const insights = [];
  const transactions = state.transactions || [];
  const bills = state.bills || [];
  const goals = state.goals || [];
  const events = state.events || [];

  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const thisMonthTx = transactions.filter(t => new Date(`${t.occurred_on}T12:00:00`) >= thisMonth);
  const lastMonthTx = transactions.filter(t => {
    const d = new Date(`${t.occurred_on}T12:00:00`);
    return d >= lastMonth && d < thisMonth;
  });

  const thisExpenses = thisMonthTx.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
  const lastExpenses = lastMonthTx.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
  const thisIncomes = thisMonthTx.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);

  // 1. Month-over-month expense comparison
  if (lastExpenses > 0) {
    const change = ((thisExpenses - lastExpenses) / lastExpenses) * 100;
    if (change > 15) {
      insights.push({
        tone: "warning", icon: "⚠️",
        title: "Despesas em alta",
        message: `Suas despesas este mês estão ${change.toFixed(0)}% acima do mês passado (${fmtCurrency.format(thisExpenses)} vs ${fmtCurrency.format(lastExpenses)}).`
      });
    } else if (change < -10) {
      insights.push({
        tone: "success", icon: "✅",
        title: "Despesas em queda",
        message: `Boa! Suas despesas caíram ${Math.abs(change).toFixed(0)}% em relação ao mês passado.`
      });
    }
  }

  // 2. Savings rate alert
  if (thisIncomes > 0) {
    const savingsRate = ((thisIncomes - thisExpenses) / thisIncomes) * 100;
    if (savingsRate < 10) {
      insights.push({
        tone: "warning", icon: healthIcons.alert,
        title: "Taxa de economia baixa",
        message: `Você está economizando apenas ${savingsRate.toFixed(0)}% da renda este mês. O ideal é pelo menos 10%.`
      });
    } else if (savingsRate >= 30) {
      insights.push({
        tone: "success", icon: healthIcons.wallet,
        title: "Excelente taxa de economia",
        message: `Você está economizando ${savingsRate.toFixed(0)}% da renda. Continue assim!`
      });
    }
  }

  // 3. Top spending category detection
  const expensesByCat = {};
  for (const t of thisMonthTx.filter(t => t.type === "expense")) {
    const cat = t.category?.name || "Sem categoria";
    expensesByCat[cat] = (expensesByCat[cat] || 0) + Number(t.amount || 0);
  }
  const topCat = Object.entries(expensesByCat).sort((a, b) => b[1] - a[1])[0];
  if (topCat && thisExpenses > 0) {
    const pct = (topCat[1] / thisExpenses) * 100;
    if (pct > 40) {
      insights.push({
        tone: "info", icon: healthIcons.chart,
        title: "Categoria dominante",
        message: `"${topCat[0]}" representa ${pct.toFixed(0)}% das suas despesas este mês (${fmtCurrency.format(topCat[1])}).`
      });
    }
  }

  // 4. Overdue bills alert
  const overdueBills = bills.filter(b => !b.is_paid && new Date(`${b.due_date}T12:00:00`) < now);
  if (overdueBills.length) {
    insights.push({
      tone: "warning", icon: "❗",
      title: `${overdueBills.length} conta(s) vencida(s)`,
      message: `Você tem ${overdueBills.length} conta(s) em atraso totalizando ${fmtCurrency.format(overdueBills.reduce((s, b) => s + Number(b.amount || 0), 0))}.`
    });
  }

  // 5. Pending events reminder
  const pendingEvents = events.filter(e => !e.is_done);
  if (pendingEvents.length > 5) {
    insights.push({
      tone: "info", icon: healthIcons.clipboard,
      title: `${pendingEvents.length} tarefas pendentes`,
      message: `Você tem ${pendingEvents.length} compromissos pendentes na agenda.`
    });
  }

  // 6. Goal progress check
  for (const g of goals) {
    if (g.target_date) {
      const deadline = new Date(`${g.target_date}T12:00:00`);
      const daysLeft = Math.ceil((deadline - now) / 86400000);
      const progress = g.target_amount ? (Number(g.current_amount || 0) / Number(g.target_amount)) * 100 : 0;
      if (daysLeft > 0 && daysLeft <= 30 && progress < 70) {
        insights.push({
          tone: "warning", icon: healthIcons.target,
          title: `Meta "${g.name}" perto do prazo`,
          message: `Faltam ${daysLeft} dias e você está em ${progress.toFixed(0)}% do alvo.`
        });
      }
    }
  }

  // 7. Duplicate detection (same description, same amount, close dates)
  const descMap = {};
  for (const t of transactions) {
    const key = `${t.description.toLowerCase().trim()}|${t.amount}`;
    if (!descMap[key]) descMap[key] = [];
    descMap[key].push(t);
  }
  for (const [, group] of Object.entries(descMap)) {
    if (group.length >= 2) {
      const dates = group.map(t => t.occurred_on).sort();
      for (let i = 1; i < dates.length; i++) {
        const diff = Math.abs(new Date(`${dates[i]}T12:00:00`) - new Date(`${dates[i-1]}T12:00:00`)) / 86400000;
        if (diff <= 3) {
          insights.push({
            tone: "info", icon: healthIcons.copy,
            title: "Possível duplicata",
            message: `"${group[0].description}" de ${fmtCurrency.format(group[0].amount)} aparece ${group.length}x em datas próximas.`
          });
          break;
        }
      }
    }
  }

  return insights;
}

// ═══════════════════════════════════════════════════
// ─── Edit Modal ───
// ═══════════════════════════════════════════════════

export function openEditModal(type, record, state) {
  const modal = document.querySelector("#editModal");
  const eyebrow = document.querySelector("#editModalEyebrow");
  const title = document.querySelector("#editModalTitle");
  const body = document.querySelector("#editModalBody");
  if (!modal || !body) return;

  const people = getPeople(state);
  const ownerOptions = people.map(p => `<option value="${p.user_id}" ${record.owner_profile_id === p.user_id ? "selected" : ""}>${p.full_name}</option>`).join("");
  const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];

  let formHTML = "";

  if (type === "transaction") {
    eyebrow.textContent = "Transação";
    title.textContent = "Editar movimentação";
    const catOptions = state.categories.map(c => {
      const sel = record.category_id === c.id ? "selected" : "";
      return `<option value="${c.id}" ${sel}>${c.name}</option>`;
    }).join("");
    const goalOptions = state.goals.map(g => {
      const sel = record.goal_id === g.id ? "selected" : "";
      return `<option value="${g.id}" ${sel}>${g.name}</option>`;
    }).join("");
    // Fix: use record.couple_id to match workspace instead of ws.is_active
    const wsOptions = workspaces.map(ws => {
      const isSelected = record.split_scope === "self"
        ? false
        : (record.split_scope === ws.id || (record.split_scope === "both" && record.couple_id === ws.id));
      return `<option value="${ws.id}" ${isSelected ? "selected" : ""}>${ws.name || getWorkspaceKindLabel(ws.kind)}</option>`;
    }).join("");
    formHTML = `
      <form id="editForm" class="form-grid">
        <label>Descrição<input type="text" name="description" value="${record.description}" required /></label>
        <label>Valor<input type="text" name="amount" inputmode="decimal" data-money value="${formatMoneyValue(record.amount)}" placeholder="0,00" required /></label>
        <label>Tipo<select name="type" required><option value="expense" ${record.type==="expense"?"selected":""}>Despesa</option><option value="income" ${record.type==="income"?"selected":""}>Receita</option></select></label>
        <label>Responsável<select name="ownerProfileId" required>${ownerOptions}</select></label>
        <label>Categoria<select name="categoryId" required>${catOptions}</select></label>
        <label>Data<input type="date" name="occurredOn" value="${record.occurred_on}" required /></label>
        <label>Ambiente<select name="splitScope"><option value="self" ${record.split_scope==="self"?"selected":""}>Individual</option>${wsOptions}</select></label>
        <label>Meta vinculada<select name="goalId"><option value="">Nenhuma</option>${goalOptions}</select></label>
        <label class="full-width">Observação<textarea name="note" rows="2">${record.note || ""}</textarea></label>
        <button class="primary-button full-width" type="submit">Salvar alterações</button>
      </form>`;
  } else if (type === "bill") {
    eyebrow.textContent = "Conta";
    title.textContent = "Editar conta";
    const isRecurring = record.is_recurring || false;
    const recurrenceDay = record.recurrence_day || "";
    // Fix: use record.couple_id to match workspace instead of ws.is_active
    const wsOptions = workspaces.map(ws => {
      const isSelected = record.split_scope === "self"
        ? false
        : (record.split_scope === ws.id || (record.split_scope === "both" && record.couple_id === ws.id));
      return `<option value="${ws.id}" ${isSelected ? "selected" : ""}>${ws.name || getWorkspaceKindLabel(ws.kind)}</option>`;
    }).join("");
    formHTML = `
      <form id="editForm" class="form-grid single-column">
        <label>Conta<input type="text" name="title" value="${record.title}" required /></label>
        <label>Valor<input type="text" name="amount" inputmode="decimal" data-money value="${formatMoneyValue(record.amount)}" placeholder="0,00" required /></label>
        <label>Vencimento<input type="date" name="dueDate" value="${record.due_date}" required /></label>
        <label>Responsável<select name="ownerProfileId"><option value="">Sem responsável</option>${ownerOptions}</select></label>
        <label>Ambiente<select name="splitScope"><option value="self" ${record.split_scope==="self"?"selected":""}>Individual</option>${wsOptions}</select></label>
        <label class="bill-recurring-label"><input type="checkbox" name="isRecurring" value="true" ${isRecurring?"checked":""} id="editBillIsRecurring" /> Conta recorrente (repete todo mês)</label>
        <label id="editBillRecurrenceDayLabel" class="${isRecurring ? "" : "hidden"}">Dia do vencimento<input type="number" name="recurrenceDay" min="1" max="31" value="${recurrenceDay}" placeholder="Ex.: 15" /></label>
        <button class="primary-button full-width" type="submit">Salvar alterações</button>
      </form>`;
  } else if (type === "event") {
    eyebrow.textContent = "Compromisso";
    title.textContent = "Editar compromisso";
    // Fix: match workspace by scope ID or by couple_id when scope is "group"
    const wsOptions = workspaces
      .map((ws) => {
        const isSelected = record.scope === ws.id || (record.scope === "group" && record.couple_id === ws.id);
        return `<option value="${ws.id}" ${isSelected ? "selected" : ""}>${ws.name || getWorkspaceKindLabel(ws.kind)}</option>`;
      })
      .join("");
    formHTML = `
      <form id="editForm" class="form-grid single-column">
        <label>Título<input type="text" name="title" value="${record.title}" required /></label>
        <div class="form-row-2col">
          <label>Tipo<select name="kind"><option value="event" ${record.kind==="event"?"selected":""}>Evento</option><option value="task" ${record.kind==="task"?"selected":""}>Tarefa</option><option value="reminder" ${record.kind==="reminder"?"selected":""}>Lembrete</option></select></label>
          <label>Ambiente<select name="scope"><option value="individual" ${record.scope==="individual"?"selected":""}>Individual</option>${wsOptions}</select></label>
        </div>
        <label>Data<input type="date" name="dueDate" value="${record.due_date || ""}" /></label>
        <label>Responsável<select name="ownerProfileId"><option value="">Sem responsável</option>${ownerOptions}</select></label>
        <label>Observação<textarea name="note" rows="2">${record.note || ""}</textarea></label>
        <button class="primary-button full-width" type="submit">Salvar alterações</button>
      </form>`;
  } else if (type === "goal") {
    eyebrow.textContent = "Meta";
    title.textContent = "Editar meta";
    // Fix: match workspace by scope ID or by couple_id when scope is "group"
    const wsOptions = workspaces
      .map((ws) => {
        const isSelected = record.scope === ws.id || (record.scope === "group" && record.couple_id === ws.id);
        return `<option value="${ws.id}" ${isSelected ? "selected" : ""}>${ws.name || getWorkspaceKindLabel(ws.kind)}</option>`;
      })
      .join("");
    formHTML = `
      <form id="editForm" class="form-grid single-column">
        <label>Nome da meta<input type="text" name="name" value="${record.name}" required /></label>
        <label>Ambiente<select name="scope"><option value="individual" ${record.scope==="individual"?"selected":""}>Individual</option>${wsOptions}</select></label>
        <label>Valor alvo<input type="text" name="targetAmount" inputmode="decimal" data-money value="${formatMoneyValue(record.target_amount)}" placeholder="0,00" required /></label>
        <label>Prazo<input type="date" name="targetDate" value="${record.target_date || ""}" /></label>
        <label>Aporte automático<select name="autoAllocate"><option value="true" ${record.auto_allocate?"selected":""}>Ativado</option><option value="false" ${!record.auto_allocate?"selected":""}>Desativado</option></select></label>
        <button class="primary-button full-width" type="submit">Salvar alterações</button>
      </form>`;
  } else if (type === "category") {
    eyebrow.textContent = "Categoria";
    title.textContent = "Editar categoria";
    formHTML = `
      <form id="editForm" class="form-grid single-column">
        <label>Nome<input type="text" name="name" value="${record.name}" required /></label>
        <label>Tipo<select name="kind"><option value="expense" ${record.kind==="expense"?"selected":""}>Despesa</option><option value="income" ${record.kind==="income"?"selected":""}>Receita</option><option value="reserve" ${record.kind==="reserve"?"selected":""}>Reserva</option></select></label>
        <button class="primary-button full-width" type="submit">Salvar alterações</button>
      </form>`;
  }

  body.innerHTML = formHTML;
  modal.classList.remove("hidden");
  modal.dataset.editType = type;
  modal.dataset.editId = record.id;
}

export function closeEditModal() {
  const modal = document.querySelector("#editModal");
  if (modal) modal.classList.add("hidden");
}

// ═══════════════════════════════════════════════════
// ─── CSV Export ───
// ═══════════════════════════════════════════════════

export function exportToCSV(state, reportConfig = {}) {
  const period = reportConfig.period || "month";
  const customStart = reportConfig.customStart || "";
  const customEnd = reportConfig.customEnd || "";
  const { start, end } = getReportDateRange(period, customStart, customEnd);
  const transactions = getFilteredTransactions(state.transactions, start, end);

  if (!transactions.length) return;

  const headers = ["Data", "Descrição", "Tipo", "Valor", "Categoria", "Responsável", "Ambiente", "Meta", "Observação"];
  const rows = transactions.map(t => [
    t.occurred_on,
    `"${(t.description || "").replace(/"/g, '""')}"`,
    t.type === "income" ? "Receita" : "Despesa",
    Number(t.amount || 0).toFixed(2),
    `"${(t.category?.name || "").replace(/"/g, '""')}"`,
    `"${(t.owner?.full_name || "").replace(/"/g, '""')}"`,
    getScopeLabel(t.split_scope, state),
    `"${(t.goal?.name || "").replace(/"/g, '""')}"`,
    `"${(t.note || "").replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  link.href = url;
  link.download = `entre_nos_relatorio_${dateStr}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
