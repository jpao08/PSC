const state = {
  token: localStorage.getItem("psc_users_admin_token") || "",
  users: [],
  areas: [],
};

const statusBox = document.getElementById("status");
const loginCard = document.getElementById("login-card");
const adminPanel = document.getElementById("admin-panel");
const usersTable = document.getElementById("users-table");
const userForm = document.getElementById("user-form");
const areaSelect = document.getElementById("area-ids");

function setStatus(message, level = "") {
  statusBox.textContent = message || "";
  statusBox.className = `status ${level}`.trim();
}

async function api(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  headers["Content-Type"] = headers["Content-Type"] || "application/json";
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
  return response.json();
}

function applySession() {
  const loggedIn = !!state.token;
  loginCard.classList.toggle("hidden", loggedIn);
  adminPanel.classList.toggle("hidden", !loggedIn);
}

async function loadData() {
  state.areas = await api("/api/areas");
  state.users = await api("/api/users");
  populateAreas();
  renderUsers();
}

function populateAreas(selectedAreaIds = []) {
  const selected = new Set(selectedAreaIds);
  areaSelect.innerHTML = "";
  state.areas.forEach((area) => {
    const option = document.createElement("option");
    option.value = area.id;
    option.textContent = area.name;
    option.selected = selected.has(area.id);
    areaSelect.appendChild(option);
  });
}

function renderUsers() {
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Areas</th><th>Status</th><th>Acoes</th></tr>";
  const tbody = document.createElement("tbody");

  state.users.forEach((user) => {
    const tr = document.createElement("tr");
    const areaNames = (user.area_ids || [])
      .map((areaId) => state.areas.find((area) => area.id === areaId)?.name || areaId)
      .join(", ");
    tr.innerHTML = `
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td>${escapeHtml(user.role)}</td>
      <td>${escapeHtml(areaNames || "-")}</td>
      <td>${user.is_active ? "Ativo" : "Inativo"}</td>
      <td></td>
    `;
    const actionsCell = tr.querySelector("td:last-child");
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Editar";
    editButton.addEventListener("click", () => fillForm(user));
    actionsCell.appendChild(editButton);

    const deactivateButton = document.createElement("button");
    deactivateButton.type = "button";
    deactivateButton.className = "danger";
    deactivateButton.textContent = "Desativar";
    deactivateButton.disabled = !user.is_active;
    deactivateButton.addEventListener("click", async () => deactivateUser(user));
    actionsCell.appendChild(deactivateButton);
    tbody.appendChild(tr);
  });

  if (state.users.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="6" class="muted">Nenhum usuario encontrado.</td>';
    tbody.appendChild(tr);
  }

  usersTable.innerHTML = "";
  usersTable.appendChild(thead);
  usersTable.appendChild(tbody);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clearForm() {
  userForm.reset();
  document.getElementById("user-id").value = "";
  document.getElementById("is-active").checked = true;
  document.getElementById("password").required = true;
  document.getElementById("form-title").textContent = "Novo usuario";
  populateAreas();
}

function fillForm(user) {
  document.getElementById("form-title").textContent = "Editar usuario";
  document.getElementById("user-id").value = user.id;
  document.getElementById("name").value = user.name || "";
  document.getElementById("email").value = user.email || "";
  document.getElementById("password").value = "";
  document.getElementById("password").required = false;
  document.getElementById("role").value = user.role || "gestor_area";
  document.getElementById("is-active").checked = !!user.is_active;
  document.getElementById("can-edit-projected").checked = !!user.can_edit_projected_value;
  populateAreas(user.area_ids || []);
}

function buildPayload() {
  return {
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    password: document.getElementById("password").value || null,
    role: document.getElementById("role").value,
    is_active: document.getElementById("is-active").checked,
    can_edit_projected_value: document.getElementById("can-edit-projected").checked,
    area_ids: Array.from(areaSelect.selectedOptions).map((option) => option.value),
  };
}

async function deactivateUser(user) {
  if (!confirm(`Desativar usuario ${user.name}?`)) {
    return;
  }
  await api(`/api/users/${user.id}`, { method: "DELETE" });
  setStatus("Usuario desativado.", "success");
  await loadData();
}

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const password = document.getElementById("admin-password").value;
    const payload = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    state.token = payload.access_token;
    localStorage.setItem("psc_users_admin_token", state.token);
    applySession();
    await loadData();
    setStatus("Admin autenticado.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const userId = document.getElementById("user-id").value;
    const payload = buildPayload();
    if (userId) {
      await api(`/api/users/${userId}`, { method: "PUT", body: JSON.stringify(payload) });
      setStatus("Usuario atualizado.", "success");
    } else {
      await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
      setStatus("Usuario criado.", "success");
    }
    clearForm();
    await loadData();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("new-user-btn").addEventListener("click", clearForm);
document.getElementById("clear-form-btn").addEventListener("click", clearForm);
document.getElementById("reload-btn").addEventListener("click", async () => {
  try {
    await loadData();
    setStatus("Dados recarregados.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});
document.getElementById("logout-btn").addEventListener("click", () => {
  state.token = "";
  localStorage.removeItem("psc_users_admin_token");
  applySession();
});
document.getElementById("shutdown-btn").addEventListener("click", async () => {
  if (!confirm("Encerrar o admin de usuarios?")) {
    return;
  }
  try {
    await api("/api/system/shutdown", { method: "POST", body: JSON.stringify({}) });
    setStatus("Admin em encerramento.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

applySession();
if (state.token) {
  loadData().catch((error) => {
    state.token = "";
    localStorage.removeItem("psc_users_admin_token");
    applySession();
    setStatus(error.message, "error");
  });
}
