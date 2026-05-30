const state = {
  token: localStorage.getItem("psc_token") || "",
  user: null,
  indicators: [],
  selectedIndicatorId: null,
  selectedMonth: null,
  year: new Date().getFullYear(),
  areas: [],
  selectedBitrixUser: null,
  bitrixUserSearchTimer: null,
  bitrixUserSearchSequence: 0,
  executiveIndicatorFilter: "",
  executiveAreaFilter: "",
};

const monthsLabels = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const statusBox = document.getElementById("status");
const loginSection = document.getElementById("login-section");
const dashboard = document.getElementById("dashboard");
const indicatorsTable = document.getElementById("indicators-table");
const yearInput = document.getElementById("year-input");
const userName = document.getElementById("user-name");
const userRole = document.getElementById("user-role");
const weeklyPanel = document.getElementById("weekly-panel");
const weeklyTitle = document.getElementById("weekly-title");
const weeklyForm = document.getElementById("weekly-form");
const actionPlanPanel = document.getElementById("action-plan-panel");
const actionPlanIndicator = document.getElementById("action-plan-indicator");
const createIndicatorPanel = document.getElementById("create-indicator-panel");
const actionPlanResponsibleSearch = document.getElementById("ap-responsible-search");
const actionPlanResponsibleId = document.getElementById("ap-bitrix-user-id");
const actionPlanSuggestions = document.getElementById("ap-user-suggestions");
const actionPlanSelectedUser = document.getElementById("ap-selected-user");
const executiveFilters = document.getElementById("executive-filters");
const executiveIndicatorFilterInput = document.getElementById("exec-indicator-filter");
const executiveAreaFilterSelect = document.getElementById("exec-area-filter");

function setStatus(message, level = "") {
  statusBox.textContent = message || "";
  statusBox.className = `status ${level}`.trim();
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

async function api(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let detail = `Erro ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch (_) {
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function applyLoggedInView() {
  loginSection.classList.add("hidden");
  dashboard.classList.remove("hidden");
  userName.textContent = state.user.name;
  userRole.textContent = `(${state.user.role})`;

  const newIndicatorBtn = document.getElementById("new-indicator-btn");
  const shutdownBtn = document.getElementById("shutdown-btn");
  shutdownBtn.classList.remove("hidden");
  if (state.user.role === "executivo") {
    newIndicatorBtn.classList.remove("hidden");
    executiveFilters.classList.remove("hidden");
    executiveIndicatorFilterInput.value = state.executiveIndicatorFilter;
    executiveAreaFilterSelect.value = state.executiveAreaFilter;
  } else {
    newIndicatorBtn.classList.add("hidden");
    executiveFilters.classList.add("hidden");
    state.executiveIndicatorFilter = "";
    state.executiveAreaFilter = "";
    executiveIndicatorFilterInput.value = "";
    executiveAreaFilterSelect.value = "";
  }
}

function applyLoggedOutView() {
  loginSection.classList.remove("hidden");
  dashboard.classList.add("hidden");
  weeklyPanel.classList.add("hidden");
  actionPlanPanel.classList.add("hidden");
  createIndicatorPanel.classList.add("hidden");
  executiveFilters.classList.add("hidden");
}

async function bootstrap() {
  yearInput.value = String(state.year);

  if (!state.token) {
    applyLoggedOutView();
    return;
  }

  try {
    state.user = await api("/api/me");
    applyLoggedInView();
    await loadIndicators();
    setStatus("Sessao restaurada.", "success");
  } catch (error) {
    logout(false);
    setStatus(error.message, "error");
  }
}

async function loadIndicators() {
  state.year = Number(yearInput.value) || new Date().getFullYear();
  state.indicators = await api(`/api/indicators?year=${state.year}`);
  updateExecutiveAreaFilterOptions();
  renderIndicators();
}

function normalizeText(value) {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function updateExecutiveAreaFilterOptions() {
  if (!state.user || state.user.role !== "executivo") {
    return;
  }

  const currentValue = state.executiveAreaFilter;
  const uniqueAreas = new Map();
  state.indicators.forEach((row) => {
    if (!uniqueAreas.has(row.area_id)) {
      uniqueAreas.set(row.area_id, row.area_name || row.area_id);
    }
  });

  const sortedOptions = Array.from(uniqueAreas.entries()).sort((a, b) => {
    const left = normalizeText(a[1]);
    const right = normalizeText(b[1]);
    return left.localeCompare(right, "pt-BR");
  });

  executiveAreaFilterSelect.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "Todas as areas";
  executiveAreaFilterSelect.appendChild(allOption);

  sortedOptions.forEach(([areaId, areaName]) => {
    const option = document.createElement("option");
    option.value = areaId;
    option.textContent = areaName;
    executiveAreaFilterSelect.appendChild(option);
  });

  if (
    currentValue
    && sortedOptions.some(([areaId]) => areaId === currentValue)
  ) {
    executiveAreaFilterSelect.value = currentValue;
  } else {
    executiveAreaFilterSelect.value = "";
    state.executiveAreaFilter = "";
  }
}

function getFilteredIndicators() {
  if (!state.user || state.user.role !== "executivo") {
    return state.indicators;
  }

  const normalizedSearch = normalizeText(state.executiveIndicatorFilter);
  return state.indicators.filter((row) => {
    const areaMatches = !state.executiveAreaFilter || row.area_id === state.executiveAreaFilter;
    if (!areaMatches) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }

    const indicatorName = normalizeText(row.indicator_name);
    const areaName = normalizeText(row.area_name || row.area_id);
    return indicatorName.includes(normalizedSearch) || areaName.includes(normalizedSearch);
  });
}

function renderIndicators() {
  const isExecutive = state.user && state.user.role === "executivo";
  const visibleIndicators = getFilteredIndicators();

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headerRow.innerHTML = "";

  const indicatorHeader = document.createElement("th");
  indicatorHeader.textContent = "Indicador";
  headerRow.appendChild(indicatorHeader);

  if (isExecutive) {
    const areaHeader = document.createElement("th");
    areaHeader.textContent = "Area";
    headerRow.appendChild(areaHeader);
  }

  monthsLabels.forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);

  const tbody = document.createElement("tbody");
  visibleIndicators.forEach((row) => {
    const tr = document.createElement("tr");

    const indicatorCell = document.createElement("td");
    indicatorCell.textContent = row.indicator_name;
    if (isExecutive) {
      indicatorCell.classList.add("clickable");
      indicatorCell.title = "Clique para criar plano de acao";
      indicatorCell.addEventListener("click", () => showActionPlanForm(row));
    }
    tr.appendChild(indicatorCell);

    if (isExecutive) {
      const areaCell = document.createElement("td");
      areaCell.textContent = row.area_name || row.area_id;
      tr.appendChild(areaCell);
    }

    for (let month = 1; month <= 12; month += 1) {
      const monthCell = document.createElement("td");
      const monthItem = row.months.find((item) => item.month === month);
      monthCell.textContent = formatNumber(monthItem ? monthItem.value : null);

      if (!isExecutive) {
        monthCell.classList.add("clickable");
        monthCell.title = "Clique para editar semanas";
        monthCell.addEventListener("click", () => showWeeklyPanel(row, month));
      }
      tr.appendChild(monthCell);
    }

    tbody.appendChild(tr);
  });

  if (visibleIndicators.length === 0) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = isExecutive ? 14 : 13;
    emptyCell.textContent = "Nenhum indicador encontrado para o filtro selecionado.";
    emptyCell.className = "muted";
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  }

  indicatorsTable.innerHTML = "";
  indicatorsTable.appendChild(thead);
  indicatorsTable.appendChild(tbody);
}

function clearBitrixResponsibleSelection() {
  state.selectedBitrixUser = null;
  actionPlanResponsibleId.value = "";
  actionPlanSelectedUser.textContent = "";
}

function hideBitrixSuggestions() {
  actionPlanSuggestions.classList.add("hidden");
  actionPlanSuggestions.innerHTML = "";
}

function selectBitrixUser(user) {
  state.selectedBitrixUser = user;
  actionPlanResponsibleSearch.value = user.name;
  actionPlanResponsibleId.value = user.id;
  actionPlanSelectedUser.textContent = user.email
    ? `${user.name} (${user.email})`
    : user.name;
  hideBitrixSuggestions();
}

function renderBitrixSuggestions(users) {
  actionPlanSuggestions.innerHTML = "";

  if (!users || users.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.style.padding = "8px 10px";
    empty.textContent = "Nenhum usuario encontrado.";
    actionPlanSuggestions.appendChild(empty);
    actionPlanSuggestions.classList.remove("hidden");
    return;
  }

  users.forEach((user) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-item";
    button.textContent = user.email ? `${user.name} (${user.email})` : user.name;
    button.addEventListener("click", () => selectBitrixUser(user));
    actionPlanSuggestions.appendChild(button);
  });

  actionPlanSuggestions.classList.remove("hidden");
}

function renderBitrixSuggestionError(message) {
  actionPlanSuggestions.innerHTML = "";
  const errorNode = document.createElement("div");
  errorNode.className = "muted";
  errorNode.style.padding = "8px 10px";
  errorNode.textContent = message || "Falha ao buscar usuarios no Bitrix24.";
  actionPlanSuggestions.appendChild(errorNode);
  actionPlanSuggestions.classList.remove("hidden");
}

async function searchBitrixUsers(query) {
  const sequence = state.bitrixUserSearchSequence + 1;
  state.bitrixUserSearchSequence = sequence;
  const users = await api(`/api/bitrix-users?query=${encodeURIComponent(query)}&limit=10`);

  if (sequence !== state.bitrixUserSearchSequence) {
    return;
  }
  renderBitrixSuggestions(users);
}

async function showWeeklyPanel(row, month) {
  state.selectedIndicatorId = row.indicator_id;
  state.selectedMonth = month;

  const response = await api(
    `/api/indicators/${row.indicator_id}/weekly-values?year=${state.year}&month=${month}`,
  );

  weeklyPanel.classList.remove("hidden");
  actionPlanPanel.classList.add("hidden");
  weeklyTitle.textContent = `${row.indicator_name} - ${monthsLabels[month - 1]} / ${state.year}`;

  weeklyForm.innerHTML = "";
  response.weeks.forEach((weekItem) => {
    const label = document.createElement("label");
    label.textContent = `Semana ${weekItem.week_number}`;

    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.min = "0";
    input.name = `week-${weekItem.week_number}`;
    input.value = weekItem.value ?? "";
    label.appendChild(input);
    weeklyForm.appendChild(label);
  });

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Salvar semanas preenchidas";
  saveButton.addEventListener("click", saveWeeklyValues);
  weeklyForm.appendChild(saveButton);
}

async function saveWeeklyValues() {
  const inputs = Array.from(weeklyForm.querySelectorAll("input"));
  let sentCount = 0;

  for (const input of inputs) {
    if (!input.value) {
      continue;
    }
    const weekNumber = Number(input.name.replace("week-", ""));
    await api(`/api/indicators/${state.selectedIndicatorId}/weekly-values`, {
      method: "POST",
      body: JSON.stringify({
        year: state.year,
        month: state.selectedMonth,
        week_number: weekNumber,
        value: String(input.value),
      }),
    });
    sentCount += 1;
  }

  await loadIndicators();
  setStatus(`${sentCount} valor(es) semanal(is) salvos.`, "success");
}

function showActionPlanForm(row) {
  weeklyPanel.classList.add("hidden");
  actionPlanPanel.classList.remove("hidden");

  document.getElementById("action-plan-form").reset();
  clearBitrixResponsibleSelection();
  hideBitrixSuggestions();
  document.getElementById("ap-indicator-id").value = row.indicator_id;
  actionPlanIndicator.textContent = `${row.indicator_name} (${row.area_name || row.area_id})`;
}

async function submitActionPlan(event) {
  event.preventDefault();
  if (!state.selectedBitrixUser || !actionPlanResponsibleId.value) {
    throw new Error("Selecione um responsavel na lista do Bitrix24.");
  }

  const payload = {
    indicator_id: document.getElementById("ap-indicator-id").value,
    title: document.getElementById("ap-title").value,
    problem_description: document.getElementById("ap-problem").value,
    expected_action: document.getElementById("ap-expected").value,
    bitrix_responsible_id: actionPlanResponsibleId.value,
    responsible_name: state.selectedBitrixUser.name,
    responsible_email: state.selectedBitrixUser.email || null,
    due_date: document.getElementById("ap-due-date").value || null,
  };

  const created = await api("/api/action-plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  setStatus(
    `Plano de acao criado. Status: ${created.status}. `
      + `Bitrix task: ${created.bitrix_task_id || "pendente"}`,
    "success",
  );
  event.target.reset();
  document.getElementById("ap-indicator-id").value = payload.indicator_id;
  clearBitrixResponsibleSelection();
  hideBitrixSuggestions();
}

async function openCreateIndicatorPanel() {
  createIndicatorPanel.classList.remove("hidden");
  actionPlanPanel.classList.add("hidden");
  weeklyPanel.classList.add("hidden");

  if (state.areas.length === 0) {
    state.areas = await api("/api/areas");
  }

  const areaSelect = document.getElementById("ci-area");
  areaSelect.innerHTML = "";
  state.areas.forEach((area) => {
    const option = document.createElement("option");
    option.value = area.id;
    option.textContent = area.name;
    areaSelect.appendChild(option);
  });
}

async function submitCreateIndicator(event) {
  event.preventDefault();

  const payload = {
    area_id: document.getElementById("ci-area").value,
    name: document.getElementById("ci-name").value,
    description: document.getElementById("ci-description").value || null,
    aggregation_type: document.getElementById("ci-aggregation").value,
    unit: document.getElementById("ci-unit").value || null,
    target_value: document.getElementById("ci-target").value || null,
  };

  await api("/api/indicators", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  createIndicatorPanel.classList.add("hidden");
  event.target.reset();
  await loadIndicators();
  setStatus("Indicador cadastrado com sucesso.", "success");
}

function logout(showMessage = true) {
  state.token = "";
  state.user = null;
  state.indicators = [];
  state.executiveIndicatorFilter = "";
  state.executiveAreaFilter = "";
  localStorage.removeItem("psc_token");
  applyLoggedOutView();
  indicatorsTable.innerHTML = "";
  if (showMessage) {
    setStatus("Sessao encerrada.", "success");
  }
}

async function shutdownApplication() {
  const confirmed = window.confirm(
    "Deseja encerrar a aplicacao agora? Isso vai derrubar o servidor e liberar a porta.",
  );
  if (!confirmed) {
    return;
  }

  try {
    await api("/api/system/shutdown", { method: "POST" });
  } catch (error) {
    const message = error && error.message ? error.message : "Falha ao solicitar encerramento.";
    setStatus(message, "error");
    return;
  }

  setStatus("Aplicacao em encerramento. Esta aba pode ser fechada.", "success");
  localStorage.removeItem("psc_token");
  // Tenta fechar a aba imediatamente apos o clique do usuario.
  window.open("", "_self");
  window.close();

  // Fallback para navegadores que bloqueiam window.close em abas nao abertas por script.
  setTimeout(() => {
    if (!window.closed) {
      window.location.replace("about:blank");
    }
  }, 150);
}

actionPlanResponsibleSearch.addEventListener("input", () => {
  const query = actionPlanResponsibleSearch.value.trim();

  if (
    state.selectedBitrixUser
    && query.toLowerCase() !== state.selectedBitrixUser.name.toLowerCase()
  ) {
    clearBitrixResponsibleSelection();
  }

  if (state.bitrixUserSearchTimer) {
    clearTimeout(state.bitrixUserSearchTimer);
    state.bitrixUserSearchTimer = null;
  }

  if (query.length < 2) {
    hideBitrixSuggestions();
    return;
  }

  state.bitrixUserSearchTimer = setTimeout(async () => {
    try {
      await searchBitrixUsers(query);
    } catch (error) {
      renderBitrixSuggestionError("Erro na busca. Tente novamente.");
      setStatus(error.message, "error");
    }
  }, 250);
});

actionPlanResponsibleSearch.addEventListener("blur", () => {
  setTimeout(() => {
    if (document.activeElement && actionPlanSuggestions.contains(document.activeElement)) {
      return;
    }
    hideBitrixSuggestions();
  }, 120);
});

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const payload = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    state.token = payload.access_token;
    state.user = payload.user;
    localStorage.setItem("psc_token", state.token);
    applyLoggedInView();
    await loadIndicators();
    setStatus("Login realizado com sucesso.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("reload-btn").addEventListener("click", async () => {
  try {
    await loadIndicators();
    setStatus("Dados atualizados.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

executiveIndicatorFilterInput.addEventListener("input", () => {
  state.executiveIndicatorFilter = executiveIndicatorFilterInput.value || "";
  renderIndicators();
});

executiveAreaFilterSelect.addEventListener("change", () => {
  state.executiveAreaFilter = executiveAreaFilterSelect.value || "";
  renderIndicators();
});

document.getElementById("logout-btn").addEventListener("click", () => logout(true));
document.getElementById("shutdown-btn").addEventListener("click", async () => {
  await shutdownApplication();
});
document.getElementById("action-plan-form").addEventListener("submit", async (event) => {
  try {
    await submitActionPlan(event);
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("new-indicator-btn").addEventListener("click", async () => {
  try {
    await openCreateIndicatorPanel();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("ci-cancel").addEventListener("click", () => {
  createIndicatorPanel.classList.add("hidden");
});

document.getElementById("create-indicator-form").addEventListener("submit", async (event) => {
  try {
    await submitCreateIndicator(event);
  } catch (error) {
    setStatus(error.message, "error");
  }
});

bootstrap();
