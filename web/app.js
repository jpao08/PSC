const state = {
  token: localStorage.getItem("psc_token") || "",
  user: null,
  indicators: [],
  selectedIndicatorId: null,
  selectedMonth: null,
  year: new Date().getFullYear(),
  areas: [],
  units: [],
  selectedBitrixUser: null,
  bitrixUserSearchTimer: null,
  bitrixUserSearchSequence: 0,
  executiveIndicatorFilter: "",
  executiveAreaFilter: "",
  executiveIndicatorActionMode: "none",
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
const executiveIndicatorActions = document.getElementById("executive-indicator-actions");
const execAddIndicatorBtn = document.getElementById("exec-add-indicator-btn");
const execEditIndicatorsBtn = document.getElementById("exec-edit-indicators-btn");
const execDeleteIndicatorsBtn = document.getElementById("exec-delete-indicators-btn");
const execIndicatorModeHint = document.getElementById("exec-indicator-mode-hint");
const createIndicatorTitle = document.getElementById("create-indicator-title");
const createIndicatorSubmit = document.getElementById("ci-submit");
const createIndicatorId = document.getElementById("ci-indicator-id");

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

function formatIndicatorDisplayName(row) {
  const unit = row && row.unit ? String(row.unit).trim() : "";
  if (!unit) {
    return row.indicator_name;
  }
  return `${row.indicator_name} [${unit}]`;
}

function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== "string") {
    return null;
  }
  const normalized = hex.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return null;
  }
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildMonthCellContent(monthItem) {
  const wrapper = document.createElement("div");
  wrapper.className = "month-cell";

  const valueNode = document.createElement("div");
  valueNode.className = "month-value";
  valueNode.textContent = formatNumber(monthItem ? monthItem.value : null);
  if (monthItem && monthItem.below_target) {
    valueNode.classList.add("below-target");
  }
  wrapper.appendChild(valueNode);

  if (monthItem && monthItem.monthly_target !== null && monthItem.monthly_target !== undefined) {
    const targetNode = document.createElement("div");
    targetNode.className = "month-target";
    targetNode.textContent = `Meta: ${formatNumber(monthItem.monthly_target)}`;
    wrapper.appendChild(targetNode);
  }

  return wrapper;
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

  const shutdownBtn = document.getElementById("shutdown-btn");
  shutdownBtn.classList.remove("hidden");
  if (state.user.role === "executivo") {
    executiveFilters.classList.remove("hidden");
    executiveIndicatorActions.classList.remove("hidden");
    executiveIndicatorFilterInput.value = state.executiveIndicatorFilter;
    executiveAreaFilterSelect.value = state.executiveAreaFilter;
    setExecutiveIndicatorActionMode(state.executiveIndicatorActionMode || "none");
  } else {
    executiveFilters.classList.add("hidden");
    executiveIndicatorActions.classList.add("hidden");
    state.executiveIndicatorFilter = "";
    state.executiveAreaFilter = "";
    state.executiveIndicatorActionMode = "none";
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
  executiveIndicatorActions.classList.add("hidden");
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

function setExecutiveIndicatorActionMode(mode) {
  if (!state.user || state.user.role !== "executivo") {
    state.executiveIndicatorActionMode = "none";
    return;
  }

  state.executiveIndicatorActionMode = mode;

  execEditIndicatorsBtn.classList.toggle("mode-active", mode === "edit");
  execDeleteIndicatorsBtn.classList.toggle("mode-active", mode === "delete");

  if (mode === "edit") {
    execIndicatorModeHint.textContent = "Modo edicao ativo: clique no nome do indicador na tabela.";
  } else if (mode === "delete") {
    execIndicatorModeHint.textContent = "Modo exclusao ativo: clique no nome do indicador na tabela.";
  } else {
    execIndicatorModeHint.textContent = "Clique no nome do indicador para criar plano de acao.";
  }
}

async function handleExecutiveIndicatorClick(row) {
  if (state.executiveIndicatorActionMode === "edit") {
    await openCreateIndicatorPanel(row);
    return;
  }
  if (state.executiveIndicatorActionMode === "delete") {
    await deleteIndicator(row);
    return;
  }
  showActionPlanForm(row);
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
    const areaTint = hexToRgba(row.area_hex_color, 0.17);
    if (areaTint) {
      tr.style.backgroundColor = areaTint;
    }

    const indicatorCell = document.createElement("td");
    if (isExecutive) {
      const indicatorButton = document.createElement("button");
      indicatorButton.type = "button";
      indicatorButton.className = "indicator-link";
      indicatorButton.textContent = formatIndicatorDisplayName(row);
      if (state.executiveIndicatorActionMode === "edit") {
        indicatorButton.title = "Clique para editar este indicador";
      } else if (state.executiveIndicatorActionMode === "delete") {
        indicatorButton.title = "Clique para apagar este indicador e todo o historico";
      } else {
        indicatorButton.title = "Clique para criar plano de acao";
      }
      indicatorButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        try {
          await handleExecutiveIndicatorClick(row);
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
      indicatorCell.appendChild(indicatorButton);
    } else {
      indicatorCell.textContent = formatIndicatorDisplayName(row);
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
      monthCell.appendChild(buildMonthCellContent(monthItem));

      if (isExecutive) {
        monthCell.classList.add("clickable");
        monthCell.title = "Clique para cadastrar ou atualizar a meta mensal";
        monthCell.addEventListener("click", async () => {
          try {
            await editMonthlyTarget(row, month);
          } catch (error) {
            setStatus(error.message, "error");
          }
        });
      } else {
        monthCell.classList.add("clickable");
        monthCell.title = "Clique para editar faixas do mes";
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

async function editMonthlyTarget(row, month) {
  const monthName = monthsLabels[month - 1];
  const monthItem = row.months.find((item) => item.month === month);
  const currentTarget = monthItem && monthItem.monthly_target !== null && monthItem.monthly_target !== undefined
    ? String(monthItem.monthly_target)
    : "";

  const typedValue = window.prompt(
    `Informe a meta mensal para ${formatIndicatorDisplayName(row)} em ${monthName}/${state.year}:`,
    currentTarget,
  );
  if (typedValue === null) {
    return;
  }

  const normalizedValue = typedValue.trim().replace(",", ".");
  if (!normalizedValue) {
    throw new Error("Informe um valor numerico para a meta mensal.");
  }

  await api(`/api/indicators/${row.indicator_id}/monthly-target`, {
    method: "POST",
    body: JSON.stringify({
      year: state.year,
      month,
      target_value: normalizedValue,
    }),
  });

  await loadIndicators();
  setStatus(`Meta mensal salva para ${monthName}/${state.year}.`, "success");
}

async function deleteIndicator(row) {
  const confirmed = window.confirm(
    `Deseja apagar o indicador \"${formatIndicatorDisplayName(row)}\"? Esta acao exclui o indicador e todo o historico dele.`,
  );
  if (!confirmed) {
    return;
  }

  await api(`/api/indicators/${row.indicator_id}`, { method: "DELETE" });
  await loadIndicators();
  setStatus("Indicador apagado com sucesso.", "success");
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
  weeklyTitle.textContent = `${formatIndicatorDisplayName(row)} - ${monthsLabels[month - 1]} / ${state.year}`;

  weeklyForm.innerHTML = "";
  response.weeks.forEach((weekItem) => {
    const label = document.createElement("label");
    label.textContent = weekItem.label || `Faixa ${weekItem.week_number}`;

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
  saveButton.textContent = "Salvar faixas preenchidas";
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
  setStatus(`${sentCount} valor(es) de faixa salvos.`, "success");
}

function showActionPlanForm(row) {
  weeklyPanel.classList.add("hidden");
  actionPlanPanel.classList.remove("hidden");

  document.getElementById("action-plan-form").reset();
  clearBitrixResponsibleSelection();
  hideBitrixSuggestions();
  document.getElementById("ap-indicator-id").value = row.indicator_id;
  actionPlanIndicator.textContent = `${formatIndicatorDisplayName(row)} (${row.area_name || row.area_id})`;
}

async function submitActionPlan(event) {
  event.preventDefault();
  if (!state.selectedBitrixUser || !actionPlanResponsibleId.value) {
    throw new Error("Selecione um responsavel na lista do Bitrix24.");
  }

  const payload = {
    indicator_id: document.getElementById("ap-indicator-id").value,
    title: document.getElementById("ap-title").value,
    ocorrencia: document.getElementById("ap-ocorrencia").value,
    identificacao_causa: document.getElementById("ap-causa").value,
    proposta_solucao: document.getElementById("ap-solucao").value,
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

async function openCreateIndicatorPanel(indicatorRow = null) {
  createIndicatorPanel.classList.remove("hidden");
  actionPlanPanel.classList.add("hidden");
  weeklyPanel.classList.add("hidden");

  if (state.areas.length === 0) {
    state.areas = await api("/api/areas");
  }
  if (state.units.length === 0) {
    state.units = await api("/api/indicator-units");
  }

  const areaSelect = document.getElementById("ci-area");
  areaSelect.innerHTML = "";
  state.areas.forEach((area) => {
    const option = document.createElement("option");
    option.value = area.id;
    option.textContent = area.name;
    areaSelect.appendChild(option);
  });

  const unitSelect = document.getElementById("ci-unit-id");
  unitSelect.innerHTML = "";
  state.units.forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = unit.label;
    unitSelect.appendChild(option);
  });

  if (indicatorRow) {
    createIndicatorTitle.textContent = "Editar indicador";
    createIndicatorSubmit.textContent = "Salvar alteracoes";
    createIndicatorId.value = indicatorRow.indicator_id;
    areaSelect.value = indicatorRow.area_id;
    document.getElementById("ci-name").value = indicatorRow.indicator_name || "";
    document.getElementById("ci-description").value = indicatorRow.description || "";
    document.getElementById("ci-aggregation").value = indicatorRow.aggregation_type || "sum";
    if (indicatorRow.unit_id) {
      unitSelect.value = indicatorRow.unit_id;
    }
  } else {
    createIndicatorTitle.textContent = "Cadastrar indicador";
    createIndicatorSubmit.textContent = "Salvar indicador";
    document.getElementById("create-indicator-form").reset();
    createIndicatorId.value = "";
  }
}

async function submitCreateIndicator(event) {
  event.preventDefault();

  const editingIndicatorId = createIndicatorId.value || "";
  const payload = {
    area_id: document.getElementById("ci-area").value,
    name: document.getElementById("ci-name").value,
    description: document.getElementById("ci-description").value || null,
    aggregation_type: document.getElementById("ci-aggregation").value,
    unit_id: document.getElementById("ci-unit-id").value,
  };

  if (editingIndicatorId) {
    await api(`/api/indicators/${editingIndicatorId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  } else {
    await api("/api/indicators", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  createIndicatorPanel.classList.add("hidden");
  event.target.reset();
  createIndicatorId.value = "";
  await loadIndicators();
  setStatus(
    editingIndicatorId
      ? "Indicador atualizado com sucesso."
      : "Indicador cadastrado com sucesso.",
    "success",
  );
}

function logout(showMessage = true) {
  state.token = "";
  state.user = null;
  state.indicators = [];
  state.units = [];
  state.executiveIndicatorFilter = "";
  state.executiveAreaFilter = "";
  state.executiveIndicatorActionMode = "none";
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

execAddIndicatorBtn.addEventListener("click", async () => {
  try {
    setExecutiveIndicatorActionMode("none");
    await openCreateIndicatorPanel();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

execEditIndicatorsBtn.addEventListener("click", () => {
  const nextMode = state.executiveIndicatorActionMode === "edit" ? "none" : "edit";
  setExecutiveIndicatorActionMode(nextMode);
});

execDeleteIndicatorsBtn.addEventListener("click", () => {
  const nextMode = state.executiveIndicatorActionMode === "delete" ? "none" : "delete";
  setExecutiveIndicatorActionMode(nextMode);
});

document.getElementById("ci-cancel").addEventListener("click", () => {
  createIndicatorPanel.classList.add("hidden");
  document.getElementById("create-indicator-form").reset();
  createIndicatorId.value = "";
  createIndicatorTitle.textContent = "Cadastrar indicador";
  createIndicatorSubmit.textContent = "Salvar indicador";
});

document.getElementById("create-indicator-form").addEventListener("submit", async (event) => {
  try {
    await submitCreateIndicator(event);
  } catch (error) {
    setStatus(error.message, "error");
  }
});

bootstrap();
