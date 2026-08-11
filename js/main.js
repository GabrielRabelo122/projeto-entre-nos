import {
  acceptInvite,
  bootstrapApp,
  createBill,
  createBillInstance,
  createCategory,
  createEvent,
  createGoal,
  createInvite,
  leaveWorkspace,
  setActiveWorkspace,
  setupWorkspace,
  createTransaction,
  deleteBill,
  deleteCategory,
  deleteEvent,
  deleteGoal,
  deleteTransaction,
  expandRecurringBills,
  markAllNotificationsRead,
  markNotificationRead,
  toggleBillPaid,
  toggleEventDone,
  updateBill,
  updateCategory,
  updateEvent,
  updateGoal,
  updateProfile,
  updateTransaction
} from "./api.js?v=20260806k";
import { clearState, patchState, state } from "./store.js?v=20260806a";
import {
  getSession,
  isSupabaseConfigured,
  onAuthStateChange,
  signIn,
  signInWithGoogle,
  signOut,
  signUp
} from "./supabase.js?v=20260805a";
import {
  getDOM,
  renderEverything,
  renderReports,
  setAuthMode,
  setLoading,
  showLoadingFallback,
  showToast,
  switchTab,
  updateCategoryOptionsForType,
  setCalendarDate,
  getCalendarDate,
  setAgendaFilter,
  setSelectedDay,
  openEditModal,
  closeEditModal,
  exportToCSV,
  formatMoneyValue
} from "./ui.js?v=20260806s";

const dom = getDOM();

if (isSupabaseConfigured()) {
  const configNote = document.querySelector("#configNote");
  if (configNote) configNote.classList.add("hidden");
}

const LOADING_FALLBACK_MS = 12000;
let loadingFallbackTimer = null;

function setLoadingWithFallback(visible, options) {
  setLoading(visible, options);

  if (!visible) {
    if (loadingFallbackTimer) {
      window.clearTimeout(loadingFallbackTimer);
      loadingFallbackTimer = null;
    }
    return;
  }

  if (loadingFallbackTimer) {
    window.clearTimeout(loadingFallbackTimer);
  }

  loadingFallbackTimer = window.setTimeout(() => {
    showLoadingFallback();
  }, LOADING_FALLBACK_MS);
}

function getSyncErrorCopy(error) {
  const raw = String(error?.message || "").toLowerCase();

  if (!raw) {
    return {
      title: "Não foi possível sincronizar",
      message: "Ocorreu um erro inesperado. Você pode tentar novamente agora ou sair e entrar de novo."
    };
  }

  if (raw.includes("failed to fetch") || raw.includes("networkerror") || raw.includes("network request failed")) {
    return {
      title: "Sem conexão para sincronizar",
      message: "Verifique sua internet e tente novamente. Se persistir, saia e entre de novo."
    };
  }

  if (raw.includes("jwt") || raw.includes("token") || raw.includes("session")) {
    return {
      title: "Sua sessão pode ter expirado",
      message: "Tente novamente. Se não funcionar, saia da conta e entre de novo."
    };
  }

  if (raw.includes("permission") || raw.includes("rls") || raw.includes("forbidden") || raw.includes("not allowed")) {
    return {
      title: "Sem permissão para acessar este ambiente",
      message: "Pode ser uma regra de segurança (RLS) ou vínculo inexistente. Tente novamente ou saia da conta."
    };
  }

  return {
    title: "Falha ao sincronizar os dados",
    message: error.message || "Você pode tentar novamente agora ou sair e entrar de novo."
  };
}

const transactionFilters = {
  search: "",
  ownerProfileId: "",
  categoryId: "",
  startDate: "",
  endDate: "",
  type: "",
  workspaceId: ""
};

const dashboardFilters = {
  period: "30",
  ownerProfileId: ""
};

const billFilters = {
  workspaceId: "",
  ownerProfileId: "",
  status: ""
};

const goalFilters = {
  workspaceId: "",
  ownerProfileId: ""
};

const reportConfig = {
  type: "general",
  period: "month",
  detailLevel: "summary",
  customStart: "",
  customEnd: "",
  customTitle: "",
  scope: "individual"
};

function formDataToObject(formElement) {
  const obj = Object.fromEntries(new FormData(formElement).entries());
  // Converte campos de dinheiro formatados ("1.234,56") para número (1234.56)
  formElement.querySelectorAll("[data-money]").forEach(input => {
    const name = input.name;
    if (obj[name] !== undefined) {
      obj[name] = parseMoneyInput(String(obj[name]));
    }
  });
  return obj;
}

/**
 * Converte texto formatado em valor monetário para número.
 * Ex.: "1.234,56" → 1234.56 | "12,00" → 12 | "12" → 12 | "" → 0
 */
function parseMoneyInput(text) {
  if (!text || !text.trim()) return 0;
  // Remove pontos de milhar e substitui vírgula por ponto decimal
  const cleaned = text.replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : Math.round(value * 100) / 100;
}

/**
 * Inicializa o sistema de valor inteligente em todos os inputs [data-money]
 * dentro do escopo informado (ou document inteiro).
 * - Formata automaticamente enquanto digita (acumulando centavos)
 * - Formata automaticamente ao sair do campo (blur)
 * - Seleciona todo o conteúdo ao focar
 */
function initMoneyInputs(scope) {
  const root = scope || document;
  root.querySelectorAll("[data-money]").forEach(input => {
    // Evita inicialização duplicada
    if (input.dataset.moneyInit) return;
    input.dataset.moneyInit = "true";

    input.addEventListener("focus", () => {
      input.select();
    });

    input.addEventListener("blur", () => {
      const raw = input.value.trim();
      if (!raw) return;
      const num = parseMoneyInput(raw);
      if (num > 0) {
        input.value = formatMoneyValue(num);
      } else {
        input.value = "";
      }
    });

    // Formata como moeda em tempo real enquanto digita
    input.addEventListener("input", () => {
      // Extrai apenas os dígitos do valor
      let digits = input.value.replace(/\D/g, "");
      if (!digits) {
        input.value = "";
        return;
      }
      // Remove zeros à esquerda (exceto se for o único dígito)
      digits = digits.replace(/^0+(?=\d)/, "");
      // Converte para centavos (os dígitos representam centavos acumulados)
      const cents = parseInt(digits, 10) || 0;
      const value = cents / 100;
      // Formata como moeda brasileira
      input.value = value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
  });
}

/**
 * Verifica se o workspace selecionado é diferente do ativo e pede confirmação.
 */
function confirmWorkspaceSwitch(targetWorkspaceId) {
  const activeWorkspace = state.workspaces?.find(w => w.is_active);
  if (!activeWorkspace || activeWorkspace.id === targetWorkspaceId) return true;
  const targetWorkspace = state.workspaces?.find(w => w.id === targetWorkspaceId);
  const targetName = targetWorkspace?.name || "outro ambiente";
  const activeName = activeWorkspace.name || "ambiente atual";
  return window.confirm(
    `Você está em "${activeName}" e vai criar este registro em "${targetName}".\n\nIsso também ativará "${targetName}" como seu ambiente principal.\n\nDeseja continuar?`
  );
}

/**
 * Resolve o campo "Ambiente" (splitScope) do formulário:
 * - "self" → split_scope = "self" (Individual)
 * - UUID do workspace → ativa o workspace e seta split_scope = "both"
 */
async function resolveWorkspaceScope(formData) {
  const scope = formData.splitScope;
  if (scope && scope !== "self" && scope !== "both") {
    if (!confirmWorkspaceSwitch(scope)) {
      throw new Error("Operação cancelada.");
    }
    await setActiveWorkspace(scope);
    formData.splitScope = "both";
  } else if (!scope) {
    formData.splitScope = "both";
  }
  return formData;
}

/**
 * Resolve o campo "Ambiente" (scope) de eventos:
 * - "individual" → scope = "individual"
 * - UUID do workspace → ativa o workspace e seta scope = "group"
 */
async function resolveEventScope(formData) {
  const scope = formData.scope;
  if (scope && scope !== "individual" && scope !== "group") {
    if (!confirmWorkspaceSwitch(scope)) {
      throw new Error("Operação cancelada.");
    }
    await setActiveWorkspace(scope);
    formData.scope = "group";
  } else if (!scope) {
    formData.scope = "individual";
  }
  return formData;
}

function resetForm(formElement) {
  if (formElement && typeof formElement.reset === "function") {
    formElement.reset();
  }
}

/**
 * Debounce: atrasa a execução de uma função até que um tempo de silêncio tenha passado.
 */
function debounce(fn, delayMs = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delayMs);
  };
}

function previewAvatarInElement(element, url) {
  if (!element) return;
  const placeholder = element.querySelector(".avatar-placeholder");
  if (url) {
    let img = element.querySelector("img");
    if (!img) {
      if (placeholder) placeholder.remove();
      img = document.createElement("img");
      element.prepend(img);
    }
    img.src = url;
    img.alt = "Avatar";
  } else {
    const img = element.querySelector("img");
    if (img) img.remove();
    if (!placeholder) {
      const span = document.createElement("span");
      span.className = "avatar-placeholder";
      span.textContent = "?";
      element.appendChild(span);
    }
  }
}

let refreshInFlight = null;

// Gera ID temporário para atualização otimista
let _tempIdCounter = 0;
function generateTempId() {
  return `temp_${Date.now()}_${++_tempIdCounter}`;
}

// Atualização otimista: atualiza UI imediatamente, sincroniza depois
async function optimisticCreate({ createFn, localItem, stateKey, onSuccess, onError }) {
  // 1. Adiciona ao state local imediatamente
  const tempId = generateTempId();
  localItem.id = tempId;
  localItem._tempId = tempId;
  localItem._createdAt = new Date().toISOString();
  localItem._pending = true; // Marca como pendente até a API responder
  
  state[stateKey] = [...(state[stateKey] || []), localItem];
  
  // 2. Re-renderiza imediatamente (UI atualiza instantaneamente)
  renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
  
  // 3. Chama a API
  try {
    const result = await createFn();
    
    // 4. Marca como sincronizado (remove flag _pending)
    const item = state[stateKey]?.find(i => i.id === tempId);
    if (item) {
      item._pending = false;
      // Se a API retornou o item real, usa os dados reais
      if (result && result.id) {
        Object.assign(item, result);
      }
    }
    
    // 5. Re-renderiza para remover flag visual
    renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    
    if (onSuccess) {
      await onSuccess(result, tempId);
    }
    
    // 6. Refresh silencioso para garantir consistência total
    await refreshApp({ silent: true });
  } catch (error) {
    // 7. Se falhar, remove o item temporário
    state[stateKey] = (state[stateKey] || []).filter(item => item.id !== tempId);
    renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    if (onError) {
      onError(error);
    } else {
      throw error;
    }
  }
}

function refreshApp({ silent = false, sessionOverride, force = false } = {}) {
  if (refreshInFlight && !force) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    let keepLoaderVisible = false;
    try {
      if (!silent) setLoadingWithFallback(true);
      const session = sessionOverride ?? (await getSession());
      patchState({ session });

      if (!session) {
        clearState();
        setAuthMode(false);
        switchTab("dashboardTab");
        return;
      }

      const data = await bootstrapApp(session);
      data.bills = expandRecurringBills(data.bills || []);
      patchState({
        session,
        ...data
      });

      // Diagnóstico: verificar se os dados carregaram corretamente
      console.info(
        `[Entre Nós] Dados carregados:`,
        `transações=${(data.transactions || []).length},`,
        `contas=${(data.bills || []).length},`,
        `metas=${(data.goals || []).length},`,
        `eventos=${(data.events || []).length},`,
        `ambiente=${data.couple?.name || 'nenhum'},`,
        `active_couple_id=${data.profile?.active_couple_id || data.profile?.couple_id || 'null'}`
      );

      setAuthMode(true);
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    } catch (error) {
      console.error(error);
      // Se há sessão, mostra a tela do app mesmo com erro (evita ficar preso no login)
      if (patchState && state.session) {
        setAuthMode(true);
      }
      const { title, message } = getSyncErrorCopy(error);
      keepLoaderVisible = !silent;
      if (!silent) showLoadingFallback({ title, message });
      showToast(error.message || "Falha ao sincronizar os dados.", "error");
    } finally {
      if (!keepLoaderVisible) {
        setLoadingWithFallback(false);
      } else {
        // Remove apenas o timer para não disparar outro fallback por cima do erro exibido
        if (loadingFallbackTimer) {
          window.clearTimeout(loadingFallbackTimer);
          loadingFallbackTimer = null;
        }
      }
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function resetDatedForms() {
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthDate = nextMonth.toISOString().slice(0, 10);

  const transactionDate = document.querySelector('#transactionForm input[name="occurredOn"]');
  const billDate = document.querySelector('#billForm input[name="dueDate"]');
  const goalDate = document.querySelector('#goalForm input[name="targetDate"]');

  if (transactionDate) transactionDate.value = today;
  if (billDate) billDate.value = nextMonthDate;
  if (goalDate) goalDate.value = nextMonthDate;
}

function bindNavigation() {
  dom.navLinks.forEach((button) => {
    button.addEventListener("click", () => {
      patchState({ activeTab: button.dataset.tabTarget });
      switchTab(button.dataset.tabTarget);

      // Close sidebar on mobile after navigation
      const sidebarEl = document.querySelector(".sidebar");
      const sidebarOverlay = document.querySelector("#sidebarOverlay");
      if (sidebarEl?.classList.contains("sidebar-open")) {
        sidebarEl.classList.remove("sidebar-open");
        sidebarOverlay?.classList.remove("active");
      }

      // Scroll to top on tab switch
      const mainShell = document.querySelector(".main-shell");
      if (mainShell) mainShell.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function bindAuthForms() {
  const loginForm = document.querySelector("#loginForm");
  const signupForm = document.querySelector("#signupForm");
  const acceptInviteInsideForm = document.querySelector("#acceptInviteInsideForm");

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setLoadingWithFallback(true);
      const { email, password } = formDataToObject(loginForm);
      await signIn(email, password);
      showToast("Login realizado com sucesso.", "success");
      resetForm(loginForm);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingWithFallback(false);
    }
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setLoadingWithFallback(true);
      const payload = formDataToObject(signupForm);
      const result = await signUp(payload);
      showToast("Conta criada com sucesso.", "success");
      resetForm(signupForm);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingWithFallback(false);
    }
  });

  // Auth card toggle
  const showSignupLink = document.querySelector("#showSignupLink");
  const showLoginLink = document.querySelector("#showLoginLink");
  const loginCard = document.querySelector("#loginCard");
  const signupCard = document.querySelector("#signupCard");

  if (showSignupLink && loginCard && signupCard) {
    showSignupLink.addEventListener("click", (e) => {
      e.preventDefault();
      loginCard.classList.add("hidden");
      signupCard.classList.remove("hidden");
    });
  }
  if (showLoginLink && loginCard && signupCard) {
    showLoginLink.addEventListener("click", (e) => {
      e.preventDefault();
      signupCard.classList.add("hidden");
      loginCard.classList.remove("hidden");
    });
  }

  if (acceptInviteInsideForm) {
    acceptInviteInsideForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await handleAcceptInvite(acceptInviteInsideForm);
    });
  }

  const googleLoginButton = document.querySelector("#googleLoginButton");
  if (googleLoginButton) {
    googleLoginButton.addEventListener("click", async () => {
      try {
        setLoadingWithFallback(true);
        await signInWithGoogle();
      } catch (error) {
        showToast(error.message, "error");
        setLoadingWithFallback(false);
      }
    });
  }

  const googleSignupButton = document.querySelector("#googleSignupButton");
  if (googleSignupButton) {
    googleSignupButton.addEventListener("click", async () => {
      try {
        setLoadingWithFallback(true);
        await signInWithGoogle();
      } catch (error) {
        showToast(error.message, "error");
        setLoadingWithFallback(false);
      }
    });
  }
}

async function handleAcceptInvite(formElement, successMessage = "Você entrou no ambiente com sucesso.") {
  try {
    setLoadingWithFallback(true);
    const { inviteCode } = formDataToObject(formElement);
    if (!inviteCode) throw new Error("Informe o código do ambiente.");
    await acceptInvite(inviteCode);
    await refreshApp({ silent: true, force: true });
    showToast(successMessage, "success");
    resetForm(formElement);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoadingWithFallback(false);
  }
}

function bindAppForms() {
  const workspaceSetupForm = document.querySelector("#workspaceSetupForm");
  const onboardingInviteForm = document.querySelector("#onboardingInviteForm");
  const onboardingModeButtons = document.querySelectorAll("[data-onboarding-mode]");
  const onboardingCreatePanel = document.querySelector("#onboardingCreatePanel");
  const onboardingJoinPanel = document.querySelector("#onboardingJoinPanel");
  let currentOnboardingMode = "none";

  const setOnboardingMode = (mode) => {
    currentOnboardingMode = mode;
    onboardingModeButtons.forEach((button) => {
      const isActive = button.dataset.onboardingMode === mode;
      button.classList.toggle("primary-button", isActive);
      button.classList.toggle("ghost-button", !isActive);
    });

    if (onboardingCreatePanel) {
      if (mode === "create") {
        onboardingCreatePanel.classList.remove("hidden");
      } else {
        onboardingCreatePanel.classList.add("hidden");
      }
    }
    if (onboardingJoinPanel) {
      if (mode === "join") {
        onboardingJoinPanel.classList.remove("hidden");
      } else {
        onboardingJoinPanel.classList.add("hidden");
      }
    }
  };

  onboardingModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.onboardingMode || "create";
      if (currentOnboardingMode === mode) {
        // Toggle: collapse if clicking the same mode
        setOnboardingMode("none");
      } else {
        setOnboardingMode(mode);
      }
    });
  });
  // Initial state: "Criar ambiente" is highlighted as primary, but form is hidden
  currentOnboardingMode = "none";
  onboardingModeButtons.forEach((button) => {
    if (button.dataset.onboardingMode === "create") {
      button.classList.add("primary-button");
      button.classList.remove("ghost-button");
    } else {
      button.classList.add("ghost-button");
      button.classList.remove("primary-button");
    }
  });
  if (onboardingCreatePanel) onboardingCreatePanel.classList.add("hidden");
  if (onboardingJoinPanel) onboardingJoinPanel.classList.add("hidden");

  document.querySelector("#refreshButton").addEventListener("click", () => refreshApp());

  // ─── Dark Mode Toggle ───
  const darkModeToggle = document.querySelector("#darkModeToggle");
  const darkModeLabel = document.querySelector("#darkModeLabel");
  const savedTheme = localStorage.getItem("entre-nos-theme");
  // Dark mode é o padrão — só usa light se o usuário escolheu explicitamente
  if (savedTheme !== "light") {
    document.documentElement.setAttribute("data-theme", "dark");
    document.body.setAttribute("data-theme", "dark");
    if (darkModeLabel) darkModeLabel.textContent = "Modo claro";
  } else {
    document.documentElement.removeAttribute("data-theme");
    document.body.removeAttribute("data-theme");
    if (darkModeLabel) darkModeLabel.textContent = "Modo escuro";
  }
  if (darkModeToggle) {
    darkModeToggle.addEventListener("click", () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      if (isDark) {
        document.documentElement.removeAttribute("data-theme");
        document.body.removeAttribute("data-theme");
        localStorage.setItem("entre-nos-theme", "light");
        if (darkModeLabel) darkModeLabel.textContent = "Modo escuro";
      } else {
        document.documentElement.setAttribute("data-theme", "dark");
        document.body.setAttribute("data-theme", "dark");
        localStorage.setItem("entre-nos-theme", "dark");
        if (darkModeLabel) darkModeLabel.textContent = "Modo claro";
      }
    });
  }
  document.querySelector("#logoutButton").addEventListener("click", async () => {
    try {
      setLoadingWithFallback(true);
      await signOut();
      clearState();
      setAuthMode(false);
      showToast("Sessão encerrada.", "info");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingWithFallback(false);
    }
  });

  const retryButton = document.querySelector("#retryBootstrapButton");
  if (retryButton) {
    retryButton.addEventListener("click", () => refreshApp({ force: true }));
  }
  const logoutFromLoaderButton = document.querySelector("#logoutFromLoaderButton");
  if (logoutFromLoaderButton) {
    logoutFromLoaderButton.addEventListener("click", async () => {
      try {
        setLoadingWithFallback(true, { title: "Saindo da conta", message: "Encerrando sua sessão…" });
        await signOut();
        clearState();
        setAuthMode(false);
        showToast("Sessão encerrada.", "info");
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        setLoadingWithFallback(false);
      }
    });
  }

  if (dom.workspaceSelect) {
    dom.workspaceSelect.addEventListener("change", async (event) => {
      const workspaceId = event.target.value;
      if (!workspaceId) return;
      if (state.couple?.id === workspaceId) return;
      try {
        setLoadingWithFallback(true, {
          title: "Trocando ambiente",
          message: "Carregando os dados do ambiente selecionado…"
        });
        await setActiveWorkspace(workspaceId);
        await refreshApp({ silent: true, force: true });
        showToast("Ambiente atualizado.", "success");
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        setLoadingWithFallback(false);
      }
    });
  }

  // Environment selector dropdown
  const envSelectorTrigger = document.querySelector("#envSelectorTrigger");
  const envSelectorDropdown = document.querySelector("#envSelectorDropdown");
  const envSelectorList = document.querySelector("#envSelectorList");

  if (envSelectorTrigger && envSelectorDropdown) {
    envSelectorTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isExpanded = envSelectorTrigger.getAttribute("aria-expanded") === "true";
      envSelectorTrigger.setAttribute("aria-expanded", !isExpanded);
      envSelectorDropdown.classList.toggle("hidden", isExpanded);
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (event) => {
      if (!envSelectorDropdown.contains(event.target) && !envSelectorTrigger.contains(event.target)) {
        envSelectorTrigger.setAttribute("aria-expanded", "false");
        envSelectorDropdown.classList.add("hidden");
      }
    });
  }

  // Handle workspace selection from dropdown
  if (envSelectorList) {
    envSelectorList.addEventListener("click", async (event) => {
      const item = event.target.closest("[data-workspace-id]");
      if (!item) return;

      const workspaceId = item.dataset.workspaceId;
      if (!workspaceId) return;
      if (state.couple?.id === workspaceId) {
        // Already active, just close dropdown
        if (envSelectorTrigger) {
          envSelectorTrigger.setAttribute("aria-expanded", "false");
          envSelectorDropdown.classList.add("hidden");
        }
        return;
      }

      try {
        setLoadingWithFallback(true, {
          title: "Trocando ambiente",
          message: "Carregando os dados do ambiente selecionado…"
        });

        // Close dropdown
        if (envSelectorTrigger) {
          envSelectorTrigger.setAttribute("aria-expanded", "false");
          envSelectorDropdown.classList.add("hidden");
        }

        await setActiveWorkspace(workspaceId);
        await refreshApp({ silent: true, force: true });
        showToast("Ambiente atualizado.", "success");
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        setLoadingWithFallback(false);
      }
    });
  }

  document.querySelector("#notificationToggle").addEventListener("click", () => {
    dom.notificationPanel.classList.toggle("hidden");
  });

  document.querySelector("#markAllReadButton").addEventListener("click", async () => {
    try {
      await markAllNotificationsRead();
      await refreshApp({ silent: true });
      showToast("Notificações marcadas como lidas.", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  document.querySelector("#profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      setLoadingWithFallback(true);
      await updateProfile(formDataToObject(form));
      await refreshApp({ silent: true });
      showToast("Perfil salvo com sucesso.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingWithFallback(false);
    }
  });

  // Avatar file upload
  const avatarFileInput = document.querySelector("#avatarFileInput");
  const avatarRemoveBtn = document.querySelector("#avatarRemoveBtn");
  const profileFormAvatarUrl = document.querySelector('#profileForm input[name="avatarUrl"]');
  const profileAvatarPreview = document.querySelector("#profileAvatarPreview");

  if (avatarFileInput) {
    avatarFileInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        showToast("A imagem deve ter no máximo 2 MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        if (profileFormAvatarUrl) profileFormAvatarUrl.value = dataUrl;
        previewAvatarInElement(profileAvatarPreview, dataUrl);
        const removeBtn = document.querySelector("#avatarRemoveBtn");
        if (removeBtn) removeBtn.classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    });
  }

  if (avatarRemoveBtn) {
    avatarRemoveBtn.addEventListener("click", () => {
      if (profileFormAvatarUrl) profileFormAvatarUrl.value = "";
      previewAvatarInElement(profileAvatarPreview, "");
      avatarRemoveBtn.classList.add("hidden");
      if (avatarFileInput) avatarFileInput.value = "";
    });
  }

  // Collapsible sections in settings
  document.querySelectorAll("[data-collapse-target]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const targetId = toggle.dataset.collapseTarget;
      const target = document.getElementById(targetId);
      if (!target) return;
      const isExpanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!isExpanded));
      target.classList.toggle("hidden", isExpanded);
      toggle.classList.toggle("settings-collapsible-open", !isExpanded);
    });
  });

  // ─── Environment flow: copy invite code ───
  const envCopyCodeBtn = document.querySelector("#envCopyCodeBtn");
  if (envCopyCodeBtn) {
    envCopyCodeBtn.addEventListener("click", () => {
      const codeEl = document.querySelector("#envInviteCodeValue");
      if (!codeEl || codeEl.textContent === "—") return;
      navigator.clipboard.writeText(codeEl.textContent.trim()).then(() => {
        showToast("Código copiado!", "success");
      }).catch(() => {
        showToast("Não foi possível copiar o código.", "error");
      });
    });
  }

  // ─── Environment flow: generate invite code ───
  const envGenerateCodeBtn = document.querySelector("#envGenerateCodeBtn");
  if (envGenerateCodeBtn) {
    envGenerateCodeBtn.addEventListener("click", async () => {
      try {
        setLoadingWithFallback(true);
        const data = await createInvite(null);
        const inviteCode =
          Array.isArray(data) && data.length ? data[0].invite_code : data?.invite_code || "";

        // O código já está correto na resposta do backend via list_my_workspaces
        // Não armazenamos mais em state.generatedInviteCode para evitar confusão entre ambientes

        // Atualiza o código diretamente na UI para feedback imediato
        const codeEl = document.querySelector("#envInviteCodeValue");
        if (codeEl && inviteCode) {
          codeEl.textContent = inviteCode;
        }
        if (envGenerateCodeBtn) envGenerateCodeBtn.classList.add("hidden");
        const copyBtn = document.querySelector("#envCopyCodeBtn");
        if (copyBtn) copyBtn.classList.remove("hidden");

        // Força refresh completo para sincronizar estado
        await refreshApp({ silent: true, force: true });
        showToast(`Código gerado: ${inviteCode}`, "success");
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        setLoadingWithFallback(false);
      }
    });
  }


  const unlinkButton = document.querySelector("#unlinkButton");
  if (unlinkButton) {
    unlinkButton.addEventListener("click", async () => {
      if (!state.couple?.id) return;
      if (!window.confirm("Deseja realmente sair do ambiente ativo?")) return;
      try {
        setLoadingWithFallback(true);
        await leaveWorkspace(state.couple.id);
        await refreshApp({ silent: true, force: true });
        showToast("Você saiu do ambiente com sucesso.", "success");
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        setLoadingWithFallback(false);
      }
    });
  }

  const workspaceSetupFormSettings = document.querySelector("#workspaceSetupFormSettings");

  async function handleWorkspaceSetupSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      setLoadingWithFallback(true, {
        title: "Criando ambiente",
        message: "Preparando seu novo espaço…"
      });
      await setupWorkspace(formDataToObject(form));
      await refreshApp({ silent: true, force: true });
      showToast("Ambiente criado com sucesso.", "success");
      resetForm(form);

      // Close the create collapsible
      const createToggle = document.querySelector('[data-collapse-target="envCreateNew"]');
      const createBody = document.getElementById("envCreateNew");
      if (createToggle && createBody) {
        createBody.classList.add("hidden");
        createToggle.setAttribute("aria-expanded", "false");
        createToggle.classList.remove("settings-collapsible-open");
      }
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingWithFallback(false);
    }
  }

  if (workspaceSetupForm) {
    workspaceSetupForm.addEventListener("submit", handleWorkspaceSetupSubmit);
  }
  if (workspaceSetupFormSettings) {
    workspaceSetupFormSettings.addEventListener("submit", handleWorkspaceSetupSubmit);
  }

  if (onboardingInviteForm) {
    onboardingInviteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await handleAcceptInvite(onboardingInviteForm, "Convite aceito com sucesso.");
    });
  }

  document.querySelector("#categoryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      setLoadingWithFallback(true);
      await createCategory(formDataToObject(form));
      await refreshApp({ silent: true });
      showToast("Categoria criada.", "success");
      resetForm(form);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingWithFallback(false);
    }
  });

  document.querySelector("#goalForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const formData = formDataToObject(form);

      // Confirmação ao criar meta de forma individual
      if (formData.scope === "individual") {
        const confirmed = window.confirm(
          "Tem certeza que deseja criar esta meta de forma individual?\n\nSe for assim, não vinculará a nenhum ambiente/grupo de pessoas."
        );
        if (!confirmed) return;
      }
      
      // Atualização otimista: cria localmente e renderiza imediatamente
      const localGoal = {
        ...formData,
        name: formData.name,
        target_amount: Number(formData.targetAmount) || 0,
        target_date: formData.targetDate,
        current_amount: Number(formData.currentAmount) || 0,
        owner_profile_id: formData.ownerProfileId || state.profile?.id,
        _optimistic: true
      };
      
      await optimisticCreate({
        createFn: () => createGoal(formData),
        localItem: localGoal,
        stateKey: "goals",
        onSuccess: () => {
          showToast("Meta criada com sucesso.", "success");
          resetForm(form);
          resetDatedForms();
        },
        onError: (error) => {
          showToast(error.message || "Erro ao criar meta.", "error");
        }
      });
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingWithFallback(false);
    }
  });

  document.querySelector("#transactionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const formData = formDataToObject(form);

      // Confirmação ao lançar transação de forma individual
      if (formData.splitScope === "self") {
        const confirmed = window.confirm(
          "Tem certeza que deseja lançar esta transação de forma individual?\n\nSe for assim, não vinculará a nenhum ambiente/grupo de pessoas."
        );
        if (!confirmed) return;
      }

      const resolvedData = await resolveWorkspaceScope(formData);
      const selectedCategory = (state.categories || []).find((category) => category.id === resolvedData.categoryId);
      if (selectedCategory?.kind === "reserve" && !resolvedData.goalId) {
        throw new Error("Ao usar categoria de reserva, escolha uma meta para receber o aporte automático.");
      }
      
      // Atualização otimista: cria localmente e renderiza imediatamente
      const localTransaction = {
        ...resolvedData,
        amount: Number(formData.amount) || 0,
        occurred_on: formData.occurredOn || new Date().toISOString().slice(0, 10),
        owner_profile_id: formData.ownerProfileId || state.profile?.id,
        category_name: selectedCategory?.name,
        _optimistic: true
      };
      
      await optimisticCreate({
        createFn: () => createTransaction(resolvedData),
        localItem: localTransaction,
        stateKey: "transactions",
        onSuccess: () => {
          showToast(`${resolvedData.type === "income" ? "Receita" : "Despesa"} lançada com sucesso.`, "success");
          resetForm(form);
          resetDatedForms();
        },
        onError: (error) => {
          showToast(error.message || "Erro ao criar transação.", "error");
        }
      });
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingWithFallback(false);
    }
  });

  document.querySelector("#billForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const formData = formDataToObject(form);

      // Confirmação ao lançar conta de forma individual
      if (formData.splitScope === "self") {
        const confirmed = window.confirm(
          "Tem certeza que deseja lançar esta conta de forma individual?\n\nSe for assim, não vinculará a nenhum ambiente/grupo de pessoas."
        );
        if (!confirmed) return;
      }

      const resolvedData = await resolveWorkspaceScope(formData);
      
      // Atualização otimista: cria localmente e renderiza imediatamente
      const localBill = {
        ...resolvedData,
        amount: Number(formData.amount) || 0,
        due_date: formData.dueDate,
        owner_profile_id: formData.ownerProfileId || state.profile?.id,
        is_paid: false,
        _optimistic: true
      };
      
      await optimisticCreate({
        createFn: () => createBill(resolvedData),
        localItem: localBill,
        stateKey: "bills",
        onSuccess: () => {
          showToast("Conta cadastrada.", "success");
          resetForm(form);
          resetDatedForms();
          // Esconde o campo de recorrência após reset
          const recurrenceDayLabel = document.querySelector("#billRecurrenceDayLabel");
          if (recurrenceDayLabel) recurrenceDayLabel.classList.add("hidden");
        },
        onError: (error) => {
          showToast(error.message || "Erro ao criar conta.", "error");
        }
      });
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingWithFallback(false);
    }
  });

  // Toggle do campo "Dia do vencimento" quando marcar como recorrente
  const billIsRecurringCheckbox = document.querySelector("#billIsRecurring");
  if (billIsRecurringCheckbox) {
    billIsRecurringCheckbox.addEventListener("change", () => {
      const recurrenceDayLabel = document.querySelector("#billRecurrenceDayLabel");
      if (recurrenceDayLabel) {
        recurrenceDayLabel.classList.toggle("hidden", !billIsRecurringCheckbox.checked);
      }
    });
  }

  document.querySelector("#eventForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const formData = await resolveEventScope(formDataToObject(form));
      
      // Atualização otimista: cria localmente e renderiza imediatamente
      const localEvent = {
        ...formData,
        due_date: formData.dueDate,
        owner_profile_id: formData.ownerProfileId || state.profile?.id,
        is_done: false,
        _optimistic: true
      };
      
      await optimisticCreate({
        createFn: () => createEvent(formData),
        localItem: localEvent,
        stateKey: "events",
        onSuccess: () => {
          showToast("Compromisso adicionado à agenda.", "success");
          resetForm(form);
          resetDatedForms();
        },
        onError: (error) => {
          showToast(error.message || "Erro ao criar compromisso.", "error");
        }
      });
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingWithFallback(false);
    }
  });

  document.querySelector("#dashboardFiltersForm").addEventListener("input", (event) => {
    Object.assign(dashboardFilters, formDataToObject(event.currentTarget));
    renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
  });

  // ─── Bill Filters ───
  const billWorkspaceFilter = document.querySelector("#billWorkspaceFilter");
  const billOwnerFilter = document.querySelector("#billOwnerFilter");
  const billStatusFilter = document.querySelector("#billStatusFilter");

  if (billWorkspaceFilter) {
    billWorkspaceFilter.addEventListener("change", () => {
      billFilters.workspaceId = billWorkspaceFilter.value;
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  }
  if (billOwnerFilter) {
    billOwnerFilter.addEventListener("change", () => {
      billFilters.ownerProfileId = billOwnerFilter.value;
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  }
  if (billStatusFilter) {
    billStatusFilter.addEventListener("change", () => {
      billFilters.status = billStatusFilter.value;
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  }

  // ─── Transaction Filters ───
  const transactionWorkspaceFilter = document.querySelector("#transactionWorkspaceFilter");
  const filterOwnerSelect = document.querySelector("#filterOwnerSelect");
  const filterCategorySelect = document.querySelector("#filterCategorySelect");
  const filterTypeSelect = document.querySelector("#filterTypeSelect");
  const filterSearchInput = document.querySelector("#filterSearchInput");

  if (transactionWorkspaceFilter) {
    transactionWorkspaceFilter.addEventListener("change", () => {
      transactionFilters.workspaceId = transactionWorkspaceFilter.value;
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  }
  if (filterOwnerSelect) {
    filterOwnerSelect.addEventListener("change", () => {
      transactionFilters.ownerProfileId = filterOwnerSelect.value;
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  }
  if (filterCategorySelect) {
    filterCategorySelect.addEventListener("change", () => {
      transactionFilters.categoryId = filterCategorySelect.value;
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  }
  if (filterTypeSelect) {
    filterTypeSelect.addEventListener("change", () => {
      transactionFilters.type = filterTypeSelect.value;
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  }
  if (filterSearchInput) {
    filterSearchInput.addEventListener("input", debounce(() => {
      transactionFilters.search = filterSearchInput.value;
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    }, 300));
  }

  // ─── Goal Filters ───
  const goalWorkspaceFilter = document.querySelector("#goalWorkspaceFilter");
  const goalOwnerFilter = document.querySelector("#goalOwnerFilter");

  if (goalWorkspaceFilter) {
    goalWorkspaceFilter.addEventListener("change", () => {
      goalFilters.workspaceId = goalWorkspaceFilter.value;
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  }
  if (goalOwnerFilter) {
    goalOwnerFilter.addEventListener("change", () => {
      goalFilters.ownerProfileId = goalOwnerFilter.value;
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  }

  // ─── Report Scope Handler ───
  const reportScopeSelect = document.querySelector("#reportScopeSelect");
  if (reportScopeSelect) {
    reportScopeSelect.addEventListener("change", () => {
      reportConfig.scope = reportScopeSelect.value;
      renderReports(state, reportConfig);
    });
  }

  // ─── Report Event Handlers ───
  const reportTypeGrid = document.querySelector("#reportTypeGrid");
  if (reportTypeGrid) {
    reportTypeGrid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-report-type]");
      if (!card) return;
      reportTypeGrid.querySelectorAll(".report-type-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      reportConfig.type = card.dataset.reportType;
      // When selecting "period" (interval analysis), auto-show custom date inputs
      if (reportConfig.type === "period" && reportPeriodSelect && reportCustomDates) {
        reportPeriodSelect.value = "custom";
        reportConfig.period = "custom";
        reportCustomDates.classList.remove("hidden");
      }
      renderReports(state, reportConfig);
    });
  }

  const reportPeriodSelect = document.querySelector("#reportPeriodSelect");
  const reportCustomDates = document.querySelector("#reportCustomDates");
  if (reportPeriodSelect) {
    reportPeriodSelect.addEventListener("change", () => {
      reportConfig.period = reportPeriodSelect.value;
      if (reportCustomDates) reportCustomDates.classList.toggle("hidden", reportPeriodSelect.value !== "custom");
      renderReports(state, reportConfig);
    });
  }

  const reportStartDate = document.querySelector("#reportStartDate");
  const reportEndDate = document.querySelector("#reportEndDate");
  if (reportStartDate) {
    reportStartDate.addEventListener("change", () => {
      reportConfig.customStart = reportStartDate.value;
      renderReports(state, reportConfig);
    });
  }
  if (reportEndDate) {
    reportEndDate.addEventListener("change", () => {
      reportConfig.customEnd = reportEndDate.value;
      renderReports(state, reportConfig);
    });
  }

  const reportCustomTitle = document.querySelector("#reportCustomTitle");
  if (reportCustomTitle) {
    reportCustomTitle.addEventListener("input", () => {
      reportConfig.customTitle = reportCustomTitle.value.trim();
      renderReports(state, reportConfig);
    });
  }

  document.querySelectorAll("[data-report-detail]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-report-detail]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      reportConfig.detailLevel = btn.dataset.reportDetail;
      renderReports(state, reportConfig);
    });
  });

  // PDF Export
  const exportPdfButton = document.querySelector("#exportPdfButton");
  if (exportPdfButton) {
    exportPdfButton.addEventListener("click", async () => {
      const printArea = document.querySelector("#reportPrintArea");
      if (!printArea) {
        showToast("Nenhum relatório para exportar. Selecione um tipo de relatório primeiro.", "info");
        return;
      }

      try {
        exportPdfButton.disabled = true;
        exportPdfButton.textContent = "Gerando PDF...";

        const canvas = await window.html2canvas(printArea, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          windowWidth: printArea.scrollWidth,
          windowHeight: printArea.scrollHeight
        });

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF("p", "mm", "a4");
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const usableWidth = pdfWidth - margin * 2;
        const imgHeight = (canvas.height * usableWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = margin;
        const imgData = canvas.toDataURL("image/png");

        pdf.addImage(imgData, "PNG", margin, position, usableWidth, imgHeight);
        heightLeft -= (pdfHeight - margin * 2);

        while (heightLeft > 0) {
          position = margin - (imgHeight - heightLeft);
          pdf.addPage();
          pdf.addImage(imgData, "PNG", margin, position, usableWidth, imgHeight);
          heightLeft -= (pdfHeight - margin * 2);
        }

        const titles = {
          general: "Resumo Geral", period: "Relatorio por Periodo",
          top_expenses: "Maiores Gastos", top_incomes: "Maiores Receitas",
          by_category: "Gastos por Categoria", by_group: "Gastos por Grupo",
          comparison: "Comparativo", evolution: "Evolucao",
          recent: "Movimentacoes Recentes"
        };
        const defaultTitle = titles[reportConfig.type] || "Relatorio";
        const fileName = reportConfig.customTitle
          ? reportConfig.customTitle.replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, "").replace(/\s+/g, "_")
          : defaultTitle;
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        pdf.save(`${fileName}_${dateStr}.pdf`);

        showToast("PDF gerado com sucesso.", "success");
      } catch (error) {
        console.error(error);
        showToast("Erro ao gerar PDF. Tente novamente.", "error");
      } finally {
        exportPdfButton.disabled = false;
        exportPdfButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Exportar PDF';
      }
    });
  }

  const healthDetailsToggle = document.querySelector("#healthDetailsToggle");
  const healthDetailsBody = document.querySelector("#healthDetailsBody");
  if (healthDetailsToggle && healthDetailsBody) {
    healthDetailsToggle.addEventListener("click", () => {
      const isExpanded = healthDetailsToggle.getAttribute("aria-expanded") === "true";
      healthDetailsToggle.setAttribute("aria-expanded", String(!isExpanded));
      healthDetailsBody.classList.toggle("hidden", isExpanded);
      healthDetailsToggle.innerHTML = isExpanded
        ? 'Ver detalhes <span class="health-toggle-icon" aria-hidden="true">&#9660;</span>'
        : 'Ocultar detalhes <span class="health-toggle-icon health-toggle-icon-up" aria-hidden="true">&#9650;</span>';
    });
  }

  const transactionTypeSelect = document.querySelector('#transactionForm select[name="type"]');
  if (transactionTypeSelect) {
    transactionTypeSelect.addEventListener("change", () => {
      updateCategoryOptionsForType(state, transactionTypeSelect.value);
    });
  }

  // Calendar navigation
  const calendarPrevBtn = document.querySelector("#calendarPrevBtn");
  const calendarNextBtn = document.querySelector("#calendarNextBtn");
  const calendarTodayBtn = document.querySelector("#calendarTodayBtn");

  if (calendarPrevBtn) {
    calendarPrevBtn.addEventListener("click", () => {
      const currentDate = getCalendarDate();
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() - 1);
      setCalendarDate(newDate);
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  }

  if (calendarNextBtn) {
    calendarNextBtn.addEventListener("click", () => {
      const currentDate = getCalendarDate();
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() + 1);
      setCalendarDate(newDate);
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  }

  if (calendarTodayBtn) {
    calendarTodayBtn.addEventListener("click", () => {
      setCalendarDate(new Date());
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  }

  // Calendar day click handler
  const calendarGrid = document.querySelector("#calendarGrid");
  if (calendarGrid) {
    calendarGrid.addEventListener("click", (event) => {
      const dayEl = event.target.closest(".calendar-day[data-date]");
      if (!dayEl) return;
      const dateStr = dayEl.dataset.date;
      if (dateStr) {
        setSelectedDay(dateStr);
        renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
      }
    });
  }

  // Calendar day detail close button
  const calendarDayDetail = document.querySelector("#calendarDayDetail");
  if (calendarDayDetail) {
    calendarDayDetail.addEventListener("click", (event) => {
      if (event.target.closest(".calendar-day-detail-close")) {
        setSelectedDay(null);
        renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
      }
    });
  }

  // Agenda filter buttons
  const agendaFilterBtns = document.querySelectorAll("[data-agenda-filter]");
  agendaFilterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      agendaFilterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      setAgendaFilter(btn.dataset.agendaFilter);
      renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);
    });
  });

  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    let showedLoader = false;
    try {
      if (button.dataset.setActiveWorkspace) {
        setLoadingWithFallback(true, {
          title: "Trocando ambiente",
          message: "Atualizando o ambiente ativo…"
        });
        showedLoader = true;
        await setActiveWorkspace(button.dataset.setActiveWorkspace);
        await refreshApp({ silent: true, force: true });
        showToast("Ambiente ativado.", "success");
      }

      if (button.dataset.leaveWorkspace) {
        const workspaceId = button.dataset.leaveWorkspace;
        if (!window.confirm("Deseja realmente sair deste ambiente?")) return;
        setLoadingWithFallback(true, {
          title: "Saindo do ambiente",
          message: "Atualizando seus acessos…"
        });
        showedLoader = true;
        await leaveWorkspace(workspaceId);
        await refreshApp({ silent: true, force: true });
        showToast("Você saiu do ambiente selecionado.", "success");
      }

      if (button.dataset.deleteTransaction) {
        if (!window.confirm("Deseja realmente excluir esta transação?")) return;
        setLoadingWithFallback(true);
        showedLoader = true;
        await deleteTransaction(button.dataset.deleteTransaction);
        await refreshApp({ silent: true });
        showToast("Transação excluída.", "success");
      }

      if (button.dataset.deleteBill) {
        const billId = button.dataset.deleteBill;
        // Se for instância recorrente, confirma se quer excluir o template (afeta todas as instâncias)
        if (billId.startsWith("recur_")) {
          if (!window.confirm("Esta é uma conta recorrente. Deseja excluir a conta original e todas as suas instâncias futuras?")) return;
          const templateId = billId.split("_")[1];
          await deleteBill(templateId);
        } else {
          if (!window.confirm("Deseja realmente excluir esta conta?")) return;
          await deleteBill(billId);
        }
        setLoadingWithFallback(true);
        showedLoader = true;
        await refreshApp({ silent: true });
        showToast("Conta removida.", "success");
      }

      if (button.dataset.deleteCategory) {
        if (!window.confirm("Deseja realmente excluir esta categoria?")) return;
        setLoadingWithFallback(true);
        showedLoader = true;
        await deleteCategory(button.dataset.deleteCategory);
        await refreshApp({ silent: true });
        showToast("Categoria removida.", "success");
      }

      if (button.dataset.deleteGoal) {
        if (!window.confirm("Deseja realmente excluir esta meta?")) return;
        setLoadingWithFallback(true);
        showedLoader = true;
        await deleteGoal(button.dataset.deleteGoal);
        await refreshApp({ silent: true });
        showToast("Meta removida.", "success");
      }

      if (button.dataset.deleteEvent) {
        if (!window.confirm("Deseja realmente excluir este compromisso?")) return;
        setLoadingWithFallback(true);
        showedLoader = true;
        await deleteEvent(button.dataset.deleteEvent);
        await refreshApp({ silent: true });
        showToast("Compromisso excluído.", "success");
      }

      // Toggle bill paid — atualização otimista (UI muda instantaneamente)
      if (button.dataset.toggleBillPaid !== undefined && button.dataset.toggleBillPaid !== "") {
        const billId = button.dataset.toggleBillPaid;
        const currentPaid = button.dataset.currentPaid === "true";
        const newPaidState = !currentPaid;

        if (billId.startsWith("recur_")) {
          // Instância recorrente: busca o template e cria uma instância real
          const templateId = billId.split("_")[1];
          const templateBill = (state.bills || []).find(b => b.id === templateId);
          if (templateBill) {
            const instanceBill = (state.bills || []).find(b => b.id === billId);
            if (!currentPaid) {
              try {
                await createBillInstance({
                  title: templateBill.title,
                  amount: templateBill.amount,
                  dueDate: instanceBill?.due_date || templateBill.due_date,
                  ownerProfileId: templateBill.owner_profile_id,
                  splitScope: templateBill.split_scope,
                  isPaid: true
                });
              } catch (error) {
                console.error("Erro ao criar instância recorrente:", error);
                showToast("Erro ao marcar conta recorrente como paga.", "error");
                return;
              }
            } else if (instanceBill?.is_recurring_instance) {
              showToast("Esta é uma instância recorrente. Edite a conta original para desmarcar.", "info");
              return;
            }
          }
        } else {
          // Atualização otimista: muda o state local ANTES da chamada à API
          const bill = (state.bills || []).find(b => b.id === billId);

          // Aplica a mudança imediatamente no state local
          if (bill) {
            bill.is_paid = newPaidState;
            bill.paid_at = newPaidState ? new Date().toISOString() : null;
          }

          // Re-renderiza imediatamente (sem buscar do servidor)
          renderEverything(state, transactionFilters, dashboardFilters, reportConfig, billFilters, goalFilters);

          // Chama a API em background — não reverte se falhar
          toggleBillPaid(billId, newPaidState).catch((error) => {
            console.warn("Falha ao atualizar conta no servidor (UI já atualizada):", error);
          });
        }

        showToast(newPaidState ? "Conta marcada como paga." : "Conta marcada como pendente.", "success");
      }

      // Edit transaction
      if (button.dataset.editTransaction) {
        const record = (state.transactions || []).find(t => t.id === button.dataset.editTransaction);
        if (record) openEditModal("transaction", record, state);
      }

      // Edit bill
      if (button.dataset.editBill) {
        const billId = button.dataset.editBill;
        // Se for instância recorrente, busca o template original
        const realId = billId.startsWith("recur_") ? billId.split("_")[1] : billId;
        const record = (state.bills || []).find(b => b.id === realId);
        if (record) openEditModal("bill", record, state);
      }

      // Edit event
      if (button.dataset.editEvent) {
        const record = (state.events || []).find(e => e.id === button.dataset.editEvent);
        if (record) openEditModal("event", record, state);
      }

      // Edit goal
      if (button.dataset.editGoal) {
        const record = (state.goals || []).find(g => g.id === button.dataset.editGoal);
        if (record) openEditModal("goal", record, state);
      }

      // Edit category
      if (button.dataset.editCategory) {
        const record = (state.categories || []).find(c => c.id === button.dataset.editCategory);
        if (record) openEditModal("category", record, state);
      }

      // Inicializa campos de valor inteligente no modal de edição
      initMoneyInputs(document.querySelector("#editModalBody"));

      if (button.dataset.readNotification) {
        await markNotificationRead(button.dataset.readNotification);
        await refreshApp({ silent: true });
      }

      if (button.dataset.toggleEvent) {
        const eventId = button.dataset.toggleEvent;
        const currentDone = button.dataset.currentDone === "true";
        await toggleEventDone(eventId, !currentDone);
        await refreshApp({ silent: true });
        showToast(!currentDone ? "Compromisso marcado como realizado." : "Compromisso marcado como pendente.", "success");
      }

    } catch (error) {
      showToast(error.message, "error");
    } finally {
      // Só esconde o loader se esta operação mostrou o loader
      if (showedLoader) {
        setLoadingWithFallback(false);
      }
    }
  });

  // ─── Edit Modal Handlers ───
  const editModalClose = document.querySelector("#editModalClose");
  const editModal = document.querySelector("#editModal");
  if (editModalClose) {
    editModalClose.addEventListener("click", () => closeEditModal());
  }
  if (editModal) {
    editModal.addEventListener("click", (event) => {
      if (event.target === editModal) closeEditModal();
    });
  }

  // Edit form submit handler (delegated)
  const editModalBody = document.querySelector("#editModalBody");
  if (editModalBody) {
    // Toggle do campo de recorrência no modal de edição
    editModalBody.addEventListener("change", (event) => {
      if (event.target.id === "editBillIsRecurring") {
        const recurrenceDayLabel = editModalBody.querySelector("#editBillRecurrenceDayLabel");
        if (recurrenceDayLabel) {
          recurrenceDayLabel.classList.toggle("hidden", !event.target.checked);
        }
      }
    });

    editModalBody.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.target.closest("form");
      if (!form) return;
      const type = editModal.dataset.editType;
      const id = editModal.dataset.editId;
      const formData = formDataToObject(form);

      try {
        setLoadingWithFallback(true);
        if (type === "transaction") {
          await resolveWorkspaceScope(formData);
          await updateTransaction(id, formData);
        } else if (type === "bill") {
          await resolveWorkspaceScope(formData);
          await updateBill(id, formData);
        } else if (type === "event") {
          await resolveEventScope(formData);
          await updateEvent(id, formData);
        } else if (type === "goal") await updateGoal(id, formData);
        else if (type === "category") await updateCategory(id, formData);
        closeEditModal();
        await refreshApp({ silent: true });
        showToast("Registro atualizado com sucesso.", "success");
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        setLoadingWithFallback(false);
      }
    });
  }

  // ─── CSV Export ───
  const exportCsvButton = document.querySelector("#exportCsvButton");
  if (exportCsvButton) {
    exportCsvButton.addEventListener("click", () => {
      try {
        exportToCSV(state, reportConfig);
        showToast("CSV exportado com sucesso.", "success");
      } catch (error) {
        showToast("Erro ao exportar CSV.", "error");
      }
    });
  }
}

function boot() {
  bindNavigation();
  bindAuthForms();
  bindAppForms();
  resetDatedForms();
  initMoneyInputs();
  switchTab(state.activeTab);

  const dashboardFiltersForm = document.querySelector("#dashboardFiltersForm");
  if (dashboardFiltersForm) {
    dashboardFiltersForm.period.value = dashboardFilters.period;
    dashboardFiltersForm.ownerProfileId.value = dashboardFilters.ownerProfileId;
  }

  if (!isSupabaseConfigured()) {
    setAuthMode(false);
    showToast("Preencha `js/config.js` para conectar o projeto ao Supabase.", "info");
    return;
  }

  const mobileSidebarToggle = document.querySelector("#mobileSidebarToggle");
  const mobileSidebarClose = document.querySelector("#mobileSidebarClose");
  const sidebarEl = document.querySelector(".sidebar");
  const sidebarOverlay = document.querySelector("#sidebarOverlay");
  const toggleMobileSidebar = () => {
    sidebarEl?.classList.toggle("sidebar-open");
    sidebarOverlay?.classList.toggle("active");
  };
  if (mobileSidebarToggle) mobileSidebarToggle.addEventListener("click", toggleMobileSidebar);
  if (mobileSidebarClose) mobileSidebarClose.addEventListener("click", toggleMobileSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener("click", toggleMobileSidebar);

  // ─── Mobile Bottom Navigation ───
  const mobileMoreBtn = document.querySelector("#mobileMoreBtn");
  const mobileMoreMenu = document.querySelector("#mobileMoreMenu");
  const mobileMoreClose = document.querySelector("#mobileMoreClose");

  if (mobileMoreBtn && mobileMoreMenu) {
    mobileMoreBtn.addEventListener("click", () => {
      mobileMoreMenu.classList.toggle("hidden");
    });
  }
  if (mobileMoreClose && mobileMoreMenu) {
    mobileMoreClose.addEventListener("click", () => {
      mobileMoreMenu.classList.add("hidden");
    });
  }
  // Close more menu on backdrop click
  if (mobileMoreMenu) {
    mobileMoreMenu.addEventListener("click", (e) => {
      if (e.target === mobileMoreMenu) {
        mobileMoreMenu.classList.add("hidden");
      }
    });
  }
  // More menu items navigate to tabs
  document.querySelectorAll(".mobile-more-menu-item").forEach((item) => {
    item.addEventListener("click", () => {
      const tabId = item.dataset.tabTarget;
      if (tabId) {
        mobileMoreMenu?.classList.add("hidden");
        patchState({ activeTab: tabId });
        switchTab(tabId);
        const mainShell = document.querySelector(".main-shell");
        if (mainShell) mainShell.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });

  // ─── Mobile Notification Button ───
  const mobileNotifBtn = document.querySelector("#mobileNotifBtn");
  const notificationPanel = document.querySelector("#notificationPanel");
  if (mobileNotifBtn && notificationPanel) {
    mobileNotifBtn.addEventListener("click", () => {
      notificationPanel.classList.toggle("hidden");
      if (!notificationPanel.classList.contains("hidden")) {
        const mainShell = document.querySelector(".main-shell");
        if (mainShell) mainShell.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  // ─── Collapsible Filters (Mobile) ───
  document.querySelectorAll(".mobile-filter-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.filterTarget;
      const filterBar = document.querySelector(`#${targetId}`);
      if (!filterBar) return;
      const isExpanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!isExpanded));
      filterBar.classList.toggle("filters-expanded", !isExpanded);
    });
  });

  // Reset filter state on viewport resize
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth > 760) {
        document.querySelectorAll(".tab-filter-bar").forEach((bar) => {
          bar.classList.remove("filters-expanded");
        });
        document.querySelectorAll(".mobile-filter-toggle-btn").forEach((btn) => {
          btn.setAttribute("aria-expanded", "false");
        });
      }
    }, 150);
  });

  onAuthStateChange((_event, session) => {
    patchState({ session });

    window.setTimeout(() => {
      refreshApp({ silent: true, sessionOverride: session });
    }, 0);
  });

  refreshApp();
}

boot();
