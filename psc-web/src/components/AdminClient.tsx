"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Area, BitrixUser, Role, User } from "@/core/domain/models";
import { api } from "./api";

type FormState = {
  role: Role;
  areaIds: string[];
  isActive: boolean;
  canEditProjectedValue: boolean;
  canEditIndicatorMaturity: boolean;
  canUseIssueReports: boolean;
  canAdminUsers: boolean;
};

const defaultForm: FormState = {
  role: "gestor_area",
  areaIds: [],
  isActive: true,
  canEditProjectedValue: false,
  canEditIndicatorMaturity: false,
  canUseIssueReports: false,
  canAdminUsers: false
};

export default function AdminClient({ initialUser }: { initialUser: User }) {
  const [admin] = useState(initialUser);
  const [users, setUsers] = useState<User[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<BitrixUser[]>([]);
  const [selectedBitrixUser, setSelectedBitrixUser] = useState<BitrixUser | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [status, setStatus] = useState("");
  const existingUser = useMemo(() => {
    if (!selectedBitrixUser) return null;
    return users.find((user) => user.bitrixUserId === selectedBitrixUser.id) ?? null;
  }, [selectedBitrixUser, users]);

  async function loadData() {
    const [loadedUsers, loadedAreas] = await Promise.all([api<User[]>("/api/admin/users"), api<Area[]>("/api/areas")]);
    setUsers(loadedUsers);
    setAreas(loadedAreas);
  }

  useEffect(() => {
    loadData().catch((error) => setStatus(error instanceof Error ? error.message : "Falha ao carregar admin."));
  }, []);

  useEffect(() => {
    if (!existingUser) return;
    setForm({
      role: existingUser.role,
      areaIds: existingUser.areaIds,
      isActive: existingUser.isActive,
      canEditProjectedValue: existingUser.canEditProjectedValue,
      canEditIndicatorMaturity: existingUser.canEditIndicatorMaturity,
      canUseIssueReports: existingUser.canUseIssueReports,
      canAdminUsers: existingUser.canAdminUsers
    });
  }, [existingUser]);

  async function searchBitrixUsers(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      setSuggestions(await api<BitrixUser[]>(`/api/bitrix-users?query=${encodeURIComponent(value)}&limit=10`));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao buscar usuarios Bitrix.");
    }
  }

  function selectBitrixUser(user: BitrixUser) {
    setSelectedBitrixUser(user);
    setQuery(`${user.name}${user.email ? ` · ${user.email}` : ""} · ID ${user.id}`);
    setSuggestions([]);
    const localUser = users.find((item) => item.bitrixUserId === user.id);
    if (!localUser) setForm(defaultForm);
  }

  function toggleArea(areaId: string) {
    setForm((current) => ({
      ...current,
      areaIds: current.areaIds.includes(areaId)
        ? current.areaIds.filter((id) => id !== areaId)
        : [...current.areaIds, areaId]
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedBitrixUser) {
      setStatus("Selecione um usuario Bitrix primeiro.");
      return;
    }
    try {
      await api<User>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          bitrixUser: selectedBitrixUser,
          ...form
        })
      });
      setStatus(existingUser ? "Usuario PSC atualizado." : "Usuario Bitrix habilitado no PSC.");
      setSelectedBitrixUser(null);
      setQuery("");
      setForm(defaultForm);
      await loadData();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar usuario.");
    }
  }

  async function deactivate(user: User) {
    if (!window.confirm(`Desativar ${user.name}?`)) return;
    await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
    setStatus("Usuario desativado.");
    await loadData();
  }

  return (
    <main className="container">
      <h1 className="page-title">
        Admin PSC <span className="version-badge">Bitrix</span>
      </h1>
      <p className="subtitle">Habilite usuários existentes no Bitrix e defina suas permissões no PSC.</p>
      <section className="status">{status}</section>

      <section className="toolbar card">
        <div>
          <strong>{admin.name}</strong>
          <span className="muted"> · administrador executivo</span>
        </div>
        <div className="toolbar-actions">
          <a className="button-link compact secondary-link" href="/dashboard">Dashboard</a>
        </div>
      </section>

      <section className="card">
        <h2>{existingUser ? "Editar usuário PSC" : "Habilitar usuário Bitrix"}</h2>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Buscar usuário no Bitrix
            <input value={query} onChange={(event) => searchBitrixUsers(event.target.value)} placeholder="Digite nome ou email" />
          </label>
          {suggestions.length > 0 ? (
            <div className="suggestions">
              {suggestions.map((user) => (
                <button className="suggestion-item" type="button" key={user.id} onClick={() => selectBitrixUser(user)}>
                  <strong>{user.name}</strong>
                  <span className="muted"> · {user.email ?? "sem email"} · ID {user.id}</span>
                </button>
              ))}
            </div>
          ) : null}
          {selectedBitrixUser ? (
            <p className="selected-user">
              Selecionado: <strong>{selectedBitrixUser.name}</strong>
              <span className="muted"> · {selectedBitrixUser.email ?? "sem email"} · ID {selectedBitrixUser.id}</span>
              {existingUser ? <span className="tag-badge">Já existe no PSC</span> : null}
            </p>
          ) : null}

          <label>
            Perfil
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
              <option value="gestor_area">Gestor de Área</option>
              <option value="gestor_tatico">Gestor Tático</option>
              <option value="gestor_operacional">Gestor Operacional</option>
              <option value="executivo">Executivo</option>
              <option value="executivo_visualizacao">Executivo Visualização</option>
            </select>
          </label>

          <fieldset className="gut-fieldset">
            <legend>Áreas vinculadas</legend>
            <div className="area-checkbox-grid">
              {areas.map((area) => (
                <label className="checkbox-line" key={area.id}>
                  <input type="checkbox" checked={form.areaIds.includes(area.id)} onChange={() => toggleArea(area.id)} />
                  {area.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="gut-inputs">
            <label className="checkbox-line">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
              Conta ativa
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={form.canEditProjectedValue}
                onChange={(event) => setForm({ ...form, canEditProjectedValue: event.target.checked })}
              />
              Pode editar projeção
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={form.canEditIndicatorMaturity}
                onChange={(event) => setForm({ ...form, canEditIndicatorMaturity: event.target.checked })}
              />
              Pode editar maturidade
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={form.canUseIssueReports}
                onChange={(event) => setForm({ ...form, canUseIssueReports: event.target.checked })}
              />
              Pode usar Issue Reports
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={form.canAdminUsers}
                onChange={(event) => setForm({ ...form, canAdminUsers: event.target.checked })}
              />
              Pode administrar usuários
            </label>
          </div>

          <div className="toolbar-actions">
            <button type="submit">{existingUser ? "Atualizar usuário" : "Habilitar usuário"}</button>
            <button type="button" className="secondary" onClick={() => { setSelectedBitrixUser(null); setQuery(""); setForm(defaultForm); }}>
              Limpar
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Usuários habilitados</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Nome</th><th>Email</th><th>ID Bitrix</th><th>Perfil</th><th>Áreas</th><th>Permissões</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.bitrixUserId ?? "-"}</td>
                  <td>{user.role}</td>
                  <td>{user.areaIds.map((areaId) => areas.find((area) => area.id === areaId)?.name ?? areaId).join(", ") || "-"}</td>
                  <td>{[
                    user.canEditProjectedValue ? "Projeção" : "",
                    user.canEditIndicatorMaturity ? "Maturidade" : "",
                    user.canUseIssueReports ? "Issue Reports" : "",
                    user.canAdminUsers ? "Admin usuários" : ""
                  ].filter(Boolean).join(", ") || "-"}</td>
                  <td>{user.isActive ? "Ativo" : "Inativo"}</td>
                  <td>
                    <button type="button" onClick={() => selectBitrixUser({ id: user.bitrixUserId ?? "", name: user.name, email: user.email, portalDomain: user.bitrixPortalDomain })}>
                      Editar
                    </button>
                    <button type="button" className="danger" disabled={!user.isActive} onClick={() => deactivate(user)}>
                      Desativar
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? <tr><td colSpan={8} className="muted">Nenhum usuário habilitado.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
