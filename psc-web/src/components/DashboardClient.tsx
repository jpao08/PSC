"use client";

import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionPlan,
  AggregationType,
  Area,
  BitrixUser,
  IndicatorTableRow,
  IndicatorUnit,
  IssueReport,
  IssueTag,
  User,
  WinReport,
  WinTag
} from "@/core/domain/models";
import { api } from "./api";

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const issueStatuses = ["Nao Iniciada", "Em Planejamento", "Em atendimento", "Delegada", "Recusada", "Concluido"];
const issuePlaceholders = {
  ocorrencia: "Descricao da ocorrencia encontrada (anomalia).",
  identificacaoCausa: "Dissertacao explicando qual foi a causa da ocorrencia encontrada.",
  propostaSolucao: "Lista de atividades, datas limite e responsaveis para resolver a ocorrencia de forma definitiva ou paliativa."
};
const gutOptions = [
  ["1", "1 - Baixo"],
  ["2", "2 - Moderado"],
  ["3", "3 - Medio"],
  ["4", "4 - Alto"],
  ["5", "5 - Critico"]
] as const;

type WeeklyPayload = {
  indicatorId: string;
  year: number;
  month: number;
  weeks: Array<{
    weekNumber: number;
    label: string;
    startDay: number;
    endDay: number;
    value: number | null;
  }>;
};

type IssueFormState = {
  title: string;
  areaId: string;
  isOtherArea: boolean;
  requesterGravity: string;
  requesterUrgency: string;
  requesterTendency: string;
  ocorrencia: string;
  identificacaoCausa: string;
  propostaSolucao: string;
};

type IssueTagFormState = {
  id: string;
  name: string;
  color: string;
};

type IssueSortMode = "executive" | "requester" | "date";
type ReportTab = "indicators" | "issues" | "wins";

type ActionPlanFormState = {
  title: string;
  ocorrencia: string;
  identificacaoCausa: string;
  propostaSolucao: string;
  bitrixResponsibleId: string;
  responsibleName: string;
  responsibleEmail: string | null;
  responsibleSearch: string;
  dueDate: string;
};

type IndicatorFormState = {
  id: string;
  areaId: string;
  name: string;
  description: string;
  aggregationType: AggregationType;
  unitId: string;
  maturityLevel: string;
};

type MaturityEditorState = {
  row: IndicatorTableRow;
  maturityLevel: string;
};

type AnnualPlanningState = {
  row: IndicatorTableRow;
  annualTarget: string;
  confidenceLevel: string;
};

type AreaFormState = {
  mode: "create" | "edit" | "delete";
  id: string;
  name: string;
  hexColor: string;
};

const emptyIssueForm: IssueFormState = {
  title: "",
  areaId: "",
  isOtherArea: false,
  requesterGravity: "",
  requesterUrgency: "",
  requesterTendency: "",
  ocorrencia: "",
  identificacaoCausa: "",
  propostaSolucao: ""
};

const emptyTagForm: IssueTagFormState = {
  id: "",
  name: "",
  color: "#0b6bcb"
};

const emptyActionPlanForm: ActionPlanFormState = {
  title: "",
  ocorrencia: "",
  identificacaoCausa: "",
  propostaSolucao: "",
  bitrixResponsibleId: "",
  responsibleName: "",
  responsibleEmail: null,
  responsibleSearch: "",
  dueDate: ""
};

const emptyIndicatorForm: IndicatorFormState = {
  id: "",
  areaId: "",
  name: "",
  description: "",
  aggregationType: "sum",
  unitId: "",
  maturityLevel: ""
};

const emptyAreaForm: AreaFormState = {
  mode: "create",
  id: "",
  name: "",
  hexColor: "#1d4ed8"
};

function formatNumber(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

const performanceLabels: Record<string, string> = {
  neutral: "Nao informado",
  not_reliable: "Nao confiavel",
  fragile: "Fragil",
  functional: "Funcional",
  reliable: "Confiavel",
  strategic: "Estrategico"
};

function PerformanceBadge({ value, classification }: { value: number | null; classification: string }) {
  return (
    <span className={`performance-badge performance-${classification}`} title={performanceLabels[classification] ?? classification}>
      {formatNumber(value)}
    </span>
  );
}

function hexToRgba(hex: string | null, alpha: number): string {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return "rgba(11,107,203,0.08)";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function issueAreaLabel(issue: IssueReport | WinReport): string {
  return issue.isOtherArea ? "Outras" : issue.areaName ?? issue.areaId ?? "-";
}

function formatStatus(status: string): string {
  const normalized = normalizeText(status);
  if (normalized.includes("iniciada")) return "Nao Iniciada";
  if (normalized.includes("conclu")) return "Concluido";
  return status;
}

function priorityPreview(gravity: string, urgency: string, tendency: string): string {
  const values = [gravity, urgency, tendency].map(Number);
  if (values.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) return "-";
  return String(values[0] * values[1] * values[2]);
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>): void {
  const blob = new Blob([`\uFEFF${toCsv(rows)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardClient({ initialUser }: { initialUser: User }) {
  const [user] = useState(initialUser);
  const [year, setYear] = useState(new Date().getFullYear());
  const [indicators, setIndicators] = useState<IndicatorTableRow[]>([]);
  const [issues, setIssues] = useState<IssueReport[]>([]);
  const [issueTags, setIssueTags] = useState<IssueTag[]>([]);
  const [wins, setWins] = useState<WinReport[]>([]);
  const [winTags, setWinTags] = useState<WinTag[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [indicatorUnits, setIndicatorUnits] = useState<IndicatorUnit[]>([]);
  const [activeTab, setActiveTab] = useState<ReportTab>("indicators");
  const [search, setSearch] = useState("");
  const [indicatorAreaFilter, setIndicatorAreaFilter] = useState<string[]>([]);
  const [issueSearch, setIssueSearch] = useState("");
  const [issueAreaFilter, setIssueAreaFilter] = useState("");
  const [issueStatusFilter, setIssueStatusFilter] = useState("");
  const [issueRequesterFilter, setIssueRequesterFilter] = useState("");
  const [issueDateFrom, setIssueDateFrom] = useState("");
  const [issueDateTo, setIssueDateTo] = useState("");
  const [issueTagFilter, setIssueTagFilter] = useState<string[]>([]);
  const [issueSort, setIssueSort] = useState<IssueSortMode>("executive");
  const [winSearch, setWinSearch] = useState("");
  const [winAreaFilter, setWinAreaFilter] = useState("");
  const [winStatusFilter, setWinStatusFilter] = useState("");
  const [winRequesterFilter, setWinRequesterFilter] = useState("");
  const [winDateFrom, setWinDateFrom] = useState("");
  const [winDateTo, setWinDateTo] = useState("");
  const [winTagFilter, setWinTagFilter] = useState<string[]>([]);
  const [winSort, setWinSort] = useState<IssueSortMode>("date");
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [showTagsPanel, setShowTagsPanel] = useState(false);
  const [showWinForm, setShowWinForm] = useState(false);
  const [showWinTagsPanel, setShowWinTagsPanel] = useState(false);
  const [indicatorActionMode, setIndicatorActionMode] = useState<"plan" | "edit" | "delete">("plan");
  const [issueForm, setIssueForm] = useState<IssueFormState>(emptyIssueForm);
  const [tagForm, setTagForm] = useState<IssueTagFormState>(emptyTagForm);
  const [winForm, setWinForm] = useState<IssueFormState>(emptyIssueForm);
  const [winTagForm, setWinTagForm] = useState<IssueTagFormState>(emptyTagForm);
  const [indicatorForm, setIndicatorForm] = useState<IndicatorFormState | null>(null);
  const [maturityEditor, setMaturityEditor] = useState<MaturityEditorState | null>(null);
  const [annualPlanning, setAnnualPlanning] = useState<AnnualPlanningState | null>(null);
  const [areaForm, setAreaForm] = useState<AreaFormState | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<IssueReport | null>(null);
  const [selectedWin, setSelectedWin] = useState<WinReport | null>(null);
  const [priorityEditor, setPriorityEditor] = useState<{
    issue: IssueReport;
    gravity: string;
    urgency: string;
    tendency: string;
  } | null>(null);
  const [winPriorityEditor, setWinPriorityEditor] = useState<{
    win: WinReport;
    gravity: string;
    urgency: string;
    tendency: string;
  } | null>(null);
  const [actionPlanEditor, setActionPlanEditor] = useState<{
    row: IndicatorTableRow;
    form: ActionPlanFormState;
    suggestions: BitrixUser[];
  } | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [weeklyEditor, setWeeklyEditor] = useState<{
    row: IndicatorTableRow;
    month: number;
    payload: WeeklyPayload;
    values: Record<number, string>;
    projectedValue: string;
    notApplicable: boolean;
  } | null>(null);
  const [monthlyPlanning, setMonthlyPlanning] = useState<{
    row: IndicatorTableRow;
    month: number;
    projectedValue: string;
    targetValue: string;
  } | null>(null);

  const canUseIssues = user.role === "executivo" || user.canUseIssueReports;
  const isExecutive = user.role === "executivo";
  const canEditMaturity = isExecutive || user.canEditIndicatorMaturity;
  const canAdmin = user.role === "executivo" || user.canAdminUsers;
  const currentMonth = year === new Date().getFullYear() ? new Date().getMonth() + 1 : null;

  const filteredIndicators = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const areaSet = new Set(indicatorAreaFilter);
    return indicators.filter((row) => {
      const matchesText = !needle || `${row.indicatorName} ${row.areaName ?? ""}`.toLowerCase().includes(needle);
      const matchesArea = areaSet.size === 0 || areaSet.has(row.areaId);
      return matchesText && matchesArea;
    });
  }, [indicatorAreaFilter, indicators, search]);

  const filteredIssues = useMemo(() => {
    const needle = normalizeText(issueSearch.trim());
    const selectedTagIds = new Set(issueTagFilter);
    const from = issueDateFrom ? new Date(`${issueDateFrom}T00:00:00`) : null;
    const to = issueDateTo ? new Date(`${issueDateTo}T23:59:59`) : null;
    return issues
      .filter((issue) => {
        const areaId = issue.isOtherArea ? "__other__" : issue.areaId ?? "";
        const matchesArea = !issueAreaFilter || issueAreaFilter === areaId;
        const matchesStatus = !issueStatusFilter || formatStatus(issue.status) === issueStatusFilter;
        const matchesRequester = !issueRequesterFilter || issue.requesterId === issueRequesterFilter;
        const createdAt = issue.createdAt ? new Date(issue.createdAt) : new Date(0);
        const matchesDate = (!from || createdAt >= from) && (!to || createdAt <= to);
        const issueTagIds = new Set(issue.tags.map((tag) => tag.id));
        const matchesTags = selectedTagIds.size === 0 || [...selectedTagIds].some((tagId) => issueTagIds.has(tagId));
        const haystack = normalizeText(`${issue.title} ${issue.areaName ?? ""} ${issue.requesterName ?? ""} ${issue.ocorrencia}`);
        return matchesArea && matchesStatus && matchesRequester && matchesDate && matchesTags && (!needle || haystack.includes(needle));
      })
      .sort((left, right) => {
        if (issueSort === "date") return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        if (issueSort === "requester") return right.requesterPriorityScore - left.requesterPriorityScore;
        return (right.executivePriorityScore ?? right.requesterPriorityScore) - (left.executivePriorityScore ?? left.requesterPriorityScore);
      });
  }, [issueAreaFilter, issueDateFrom, issueDateTo, issueRequesterFilter, issueSearch, issueSort, issueStatusFilter, issueTagFilter, issues]);

  const filteredWins = useMemo(() => {
    const needle = normalizeText(winSearch.trim());
    const selectedTagIds = new Set(winTagFilter);
    const from = winDateFrom ? new Date(`${winDateFrom}T00:00:00`) : null;
    const to = winDateTo ? new Date(`${winDateTo}T23:59:59`) : null;
    return wins
      .filter((win) => {
        const areaId = win.isOtherArea ? "__other__" : win.areaId ?? "";
        const matchesArea = !winAreaFilter || winAreaFilter === areaId;
        const matchesStatus = !winStatusFilter || formatStatus(win.status) === winStatusFilter;
        const matchesRequester = !winRequesterFilter || win.requesterId === winRequesterFilter;
        const createdAt = win.createdAt ? new Date(win.createdAt) : new Date(0);
        const matchesDate = (!from || createdAt >= from) && (!to || createdAt <= to);
        const winTagIds = new Set(win.tags.map((tag) => tag.id));
        const matchesTags = selectedTagIds.size === 0 || [...selectedTagIds].some((tagId) => winTagIds.has(tagId));
        const haystack = normalizeText(`${win.title} ${win.areaName ?? ""} ${win.requesterName ?? ""} ${win.ocorrencia}`);
        return matchesArea && matchesStatus && matchesRequester && matchesDate && matchesTags && (!needle || haystack.includes(needle));
      })
      .sort((left, right) => {
        if (winSort === "date") return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        if (winSort === "requester") return right.requesterPriorityScore - left.requesterPriorityScore;
        return (right.executivePriorityScore ?? right.requesterPriorityScore) - (left.executivePriorityScore ?? left.requesterPriorityScore);
      });
  }, [winAreaFilter, winDateFrom, winDateTo, winRequesterFilter, winSearch, winSort, winStatusFilter, winTagFilter, wins]);

  const issueRequesters = useMemo(() => {
    const requesters = new Map<string, string>();
    issues.forEach((issue) => requesters.set(issue.requesterId, issue.requesterName ?? issue.requesterId));
    return [...requesters.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [issues]);

  const issueTitles = useMemo(() => [...new Set(issues.map((issue) => issue.title).filter(Boolean))], [issues]);
  const winRequesters = useMemo(() => {
    const requesters = new Map<string, string>();
    wins.forEach((win) => requesters.set(win.requesterId, win.requesterName ?? win.requesterId));
    return [...requesters.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [wins]);

  const winTitles = useMemo(() => [...new Set(wins.map((win) => win.title).filter(Boolean))], [wins]);

  const loadIndicators = useCallback(async () => {
    setLoading(true);
    try {
      setIndicators(await api<IndicatorTableRow[]>(`/api/indicators?year=${year}`));
      setStatus("Indicadores carregados.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao carregar indicadores.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  const loadIssues = useCallback(async () => {
    if (!canUseIssues) return;
    try {
      const [loadedIssues, loadedAreas, loadedTags] = await Promise.all([
        api<IssueReport[]>("/api/issue-reports"),
        api<Area[]>("/api/areas"),
        api<IssueTag[]>("/api/issue-tags")
      ]);
      setIssues(loadedIssues);
      setAreas(loadedAreas);
      setIssueTags(loadedTags);
      setStatus("Issue Reports carregados.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao carregar Issue Reports.");
    }
  }, [canUseIssues]);

  const loadWins = useCallback(async () => {
    if (!canUseIssues) return;
    try {
      const [loadedWins, loadedAreas, loadedTags] = await Promise.all([
        api<WinReport[]>("/api/wins"),
        api<Area[]>("/api/areas"),
        api<WinTag[]>("/api/win-tags")
      ]);
      setWins(loadedWins);
      setAreas(loadedAreas);
      setWinTags(loadedTags);
      setStatus("Wins carregadas.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao carregar Wins.");
    }
  }, [canUseIssues]);

  const loadAdminMetadata = useCallback(async () => {
    if (!isExecutive) return;
    try {
      const [loadedAreas, loadedUnits] = await Promise.all([
        api<Area[]>("/api/areas"),
        api<IndicatorUnit[]>("/api/indicator-units")
      ]);
      setAreas(loadedAreas);
      setIndicatorUnits(loadedUnits);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao carregar dados administrativos.");
    }
  }, [isExecutive]);

  useEffect(() => {
    loadIndicators();
  }, [loadIndicators]);

  useEffect(() => {
    loadAdminMetadata();
  }, [loadAdminMetadata]);

  useEffect(() => {
    if (activeTab === "issues") loadIssues();
    if (activeTab === "wins") loadWins();
  }, [activeTab, loadIssues, loadWins]);

  async function logout() {
    await api("/api/logout", { method: "POST", body: "{}" });
    window.location.href = "/login";
  }

  function canEditIndicator(row: IndicatorTableRow): boolean {
    if (user.role !== "gestor_area") return false;
    const areaIds = new Set(user.areaIds || []);
    if (user.areaId) areaIds.add(user.areaId);
    return areaIds.has(row.areaId);
  }

  async function openWeeklyEditor(row: IndicatorTableRow, month: number) {
    if (!canEditIndicator(row)) return;
    try {
      const payload = await api<WeeklyPayload>(
        `/api/indicators/${row.indicatorId}/weekly-values?year=${year}&month=${month}`
      );
      setWeeklyEditor({
        row,
        month,
        payload,
        projectedValue: String(row.months.find((item) => item.month === month)?.projectedValue ?? ""),
        notApplicable: Boolean(row.months.find((item) => item.month === month)?.notApplicable),
        values: Object.fromEntries(payload.weeks.map((week) => [week.weekNumber, week.value == null ? "" : String(week.value)]))
      });
      setStatus(`Editando ${row.indicatorName} em ${months[month - 1]}/${year}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao abrir edicao semanal.");
    }
  }

  function openMonthlyPlanning(row: IndicatorTableRow, month: number) {
    const monthItem = row.months.find((item) => item.month === month);
    setMonthlyPlanning({
      row,
      month,
      projectedValue: String(monthItem?.projectedValue ?? ""),
      targetValue: String(monthItem?.monthlyTarget ?? "")
    });
    setStatus(`Planejamento mensal de ${row.indicatorName} em ${months[month - 1]}/${year}.`);
  }

  function openAnnualPlanning(row: IndicatorTableRow) {
    if (!isExecutive) return;
    setAnnualPlanning({
      row,
      annualTarget: String(row.annualTarget ?? ""),
      confidenceLevel: String(row.confidenceLevel ?? "")
    });
    setStatus(`Planejamento anual de ${row.indicatorName}/${year}.`);
  }

  async function saveIndicatorModal() {
    if (!weeklyEditor) return;
    try {
      const entries = Object.entries(weeklyEditor.values)
        .map(([weekNumber, value]) => ({ weekNumber: Number(weekNumber), value: value.trim() }))
        .filter((entry) => entry.value !== "");

      await Promise.all(
        entries.map((entry) =>
          api(`/api/indicators/${weeklyEditor.row.indicatorId}/weekly-values`, {
            method: "POST",
            body: JSON.stringify({
              year,
              month: weeklyEditor.month,
              weekNumber: entry.weekNumber,
              value: entry.value
            })
          })
        )
      );

      if (user.canEditProjectedValue) {
        await api(`/api/indicators/${weeklyEditor.row.indicatorId}/monthly-projection`, {
          method: "POST",
          body: JSON.stringify({
            year,
            month: weeklyEditor.month,
            projectedValue: weeklyEditor.projectedValue
          })
        });
      }

      await api(`/api/indicators/${weeklyEditor.row.indicatorId}/monthly-not-applicable`, {
        method: "POST",
        body: JSON.stringify({
          year,
          month: weeklyEditor.month,
          notApplicable: weeklyEditor.notApplicable
        })
      });

      setWeeklyEditor(null);
      await loadIndicators();
      setStatus("Valores salvos.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar valores.");
    }
  }

  async function saveMonthlyPlanning() {
    if (!monthlyPlanning) return;
    try {
      if (user.canEditProjectedValue) {
        await api(`/api/indicators/${monthlyPlanning.row.indicatorId}/monthly-projection`, {
          method: "POST",
          body: JSON.stringify({
            year,
            month: monthlyPlanning.month,
            projectedValue: monthlyPlanning.projectedValue
          })
        });
      }

      if (isExecutive) {
        await api(`/api/indicators/${monthlyPlanning.row.indicatorId}/monthly-target`, {
          method: "POST",
          body: JSON.stringify({
            year,
            month: monthlyPlanning.month,
            targetValue: monthlyPlanning.targetValue
          })
        });
      }

      setMonthlyPlanning(null);
      await loadIndicators();
      setStatus("Planejamento mensal salvo.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar planejamento mensal.");
    }
  }

  async function saveAnnualPlanning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!annualPlanning) return;
    try {
      await api(`/api/indicators/${annualPlanning.row.indicatorId}/annual-planning`, {
        method: "POST",
        body: JSON.stringify({
          year,
          annualTarget: annualPlanning.annualTarget,
          confidenceLevel: annualPlanning.confidenceLevel
        })
      });
      setAnnualPlanning(null);
      await loadIndicators();
      setStatus("Planejamento anual salvo.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar planejamento anual.");
    }
  }

  async function submitIssueReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api<IssueReport>("/api/issue-reports", {
        method: "POST",
        body: JSON.stringify({
          ...issueForm,
          requesterGravity: Number(issueForm.requesterGravity),
          requesterUrgency: Number(issueForm.requesterUrgency),
          requesterTendency: Number(issueForm.requesterTendency)
        })
      });
      setIssueForm(emptyIssueForm);
      setShowIssueForm(false);
      await loadIssues();
      setStatus("Issue Report criado.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao criar Issue Report.");
    }
  }

  async function submitIssueTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const url = tagForm.id ? `/api/issue-tags/${tagForm.id}` : "/api/issue-tags";
      const method = tagForm.id ? "PUT" : "POST";
      await api<IssueTag>(url, {
        method,
        body: JSON.stringify({ name: tagForm.name, color: tagForm.color })
      });
      setTagForm(emptyTagForm);
      await loadIssues();
      setStatus(tagForm.id ? "Tag atualizada." : "Tag criada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar tag.");
    }
  }

  async function deleteIssueTag(tag: IssueTag) {
    if (!window.confirm(`Apagar a tag "${tag.name}" da visualizacao?`)) return;
    try {
      await api(`/api/issue-tags/${tag.id}`, { method: "DELETE" });
      setTagForm(emptyTagForm);
      await loadIssues();
      setStatus("Tag apagada da visualizacao.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao apagar tag.");
    }
  }

  async function updateIssueTags(issue: IssueReport, selectedOptions: HTMLCollectionOf<HTMLOptionElement>) {
    try {
      const tagIds = Array.from(selectedOptions).map((option) => option.value);
      await api<IssueReport>(`/api/issue-reports/${issue.id}/tags`, {
        method: "PATCH",
        body: JSON.stringify({ tagIds })
      });
      await loadIssues();
      setStatus("Tags do Issue atualizadas.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao atualizar tags do Issue.");
    }
  }

  async function updateIssueStatus(issue: IssueReport, nextStatus: string) {
    try {
      await api<IssueReport>(`/api/issue-reports/${issue.id}/executive-review`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      await loadIssues();
      setStatus("Status do Issue Report atualizado.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao atualizar status.");
    }
  }

  async function saveExecutivePriority(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!priorityEditor) return;
    try {
      await api<IssueReport>(`/api/issue-reports/${priorityEditor.issue.id}/executive-review`, {
        method: "PATCH",
        body: JSON.stringify({
          executiveGravity: Number(priorityEditor.gravity),
          executiveUrgency: Number(priorityEditor.urgency),
          executiveTendency: Number(priorityEditor.tendency)
        })
      });
      setPriorityEditor(null);
      await loadIssues();
      setStatus("Prioridade executiva atualizada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao atualizar prioridade executiva.");
    }
  }

  async function deleteIssueReport(issue: IssueReport) {
    if (!window.confirm(`Apagar o Issue "${issue.title}" da visualizacao?`)) return;
    try {
      await api(`/api/issue-reports/${issue.id}`, { method: "DELETE" });
      await loadIssues();
      setStatus("Issue Report apagado da visualizacao.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao apagar Issue Report.");
    }
  }

  async function submitWinReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api<WinReport>("/api/wins", {
        method: "POST",
        body: JSON.stringify({
          title: winForm.title,
          areaId: winForm.areaId,
          isOtherArea: winForm.isOtherArea,
          description: winForm.ocorrencia
        })
      });
      setWinForm(emptyIssueForm);
      setShowWinForm(false);
      await loadWins();
      setStatus("Win criada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao criar Win.");
    }
  }

  async function submitWinTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const url = winTagForm.id ? `/api/win-tags/${winTagForm.id}` : "/api/win-tags";
      const method = winTagForm.id ? "PUT" : "POST";
      await api<WinTag>(url, {
        method,
        body: JSON.stringify({ name: winTagForm.name, color: winTagForm.color })
      });
      setWinTagForm(emptyTagForm);
      await loadWins();
      setStatus(winTagForm.id ? "Tag de Win atualizada." : "Tag de Win criada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar tag de Win.");
    }
  }

  async function deleteWinTag(tag: WinTag) {
    if (!window.confirm(`Apagar a tag "${tag.name}" da visualizacao?`)) return;
    try {
      await api(`/api/win-tags/${tag.id}`, { method: "DELETE" });
      setWinTagForm(emptyTagForm);
      await loadWins();
      setStatus("Tag de Win apagada da visualizacao.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao apagar tag de Win.");
    }
  }

  async function updateWinTags(win: WinReport, selectedOptions: HTMLCollectionOf<HTMLOptionElement>) {
    try {
      const tagIds = Array.from(selectedOptions).map((option) => option.value);
      await api<WinReport>(`/api/wins/${win.id}/tags`, {
        method: "PATCH",
        body: JSON.stringify({ tagIds })
      });
      await loadWins();
      setStatus("Tags da Win atualizadas.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao atualizar tags da Win.");
    }
  }

  async function updateWinStatus(win: WinReport, nextStatus: string) {
    try {
      await api<WinReport>(`/api/wins/${win.id}/executive-review`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      await loadWins();
      setStatus("Status da Win atualizado.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao atualizar status da Win.");
    }
  }

  async function saveWinExecutivePriority(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!winPriorityEditor) return;
    try {
      await api<WinReport>(`/api/wins/${winPriorityEditor.win.id}/executive-review`, {
        method: "PATCH",
        body: JSON.stringify({
          executiveGravity: Number(winPriorityEditor.gravity),
          executiveUrgency: Number(winPriorityEditor.urgency),
          executiveTendency: Number(winPriorityEditor.tendency)
        })
      });
      setWinPriorityEditor(null);
      await loadWins();
      setStatus("Prioridade executiva da Win atualizada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao atualizar prioridade da Win.");
    }
  }

  async function deleteWinReport(win: WinReport) {
    if (!window.confirm(`Apagar a Win "${win.title}" da visualizacao?`)) return;
    try {
      await api(`/api/wins/${win.id}`, { method: "DELETE" });
      await loadWins();
      setStatus("Win apagada da visualizacao.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao apagar Win.");
    }
  }

  function openMaturityEditor(row: IndicatorTableRow) {
    if (!canEditMaturity) return;
    setMaturityEditor({
      row,
      maturityLevel: row.maturityLevel == null ? "" : String(row.maturityLevel)
    });
    setStatus(`Editando maturidade de ${row.indicatorName}.`);
  }

  async function saveMaturity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!maturityEditor) return;
    try {
      await api(`/api/indicators/${maturityEditor.row.indicatorId}/maturity`, {
        method: "PATCH",
        body: JSON.stringify({ maturityLevel: maturityEditor.maturityLevel })
      });
      setMaturityEditor(null);
      await loadIndicators();
      setStatus("Maturidade atualizada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao atualizar maturidade.");
    }
  }

  function openActionPlan(row: IndicatorTableRow) {
    setActionPlanEditor({
      row,
      form: {
        ...emptyActionPlanForm,
        title: `Plano de acao - ${row.indicatorName}`
      },
      suggestions: []
    });
    setStatus(`Criando plano de acao para ${row.indicatorName}.`);
  }

  function openIndicatorCreate() {
    setIndicatorForm({ ...emptyIndicatorForm, areaId: areas[0]?.id ?? "", unitId: indicatorUnits[0]?.id ?? "" });
  }

  function openIndicatorEdit(row: IndicatorTableRow) {
    setIndicatorForm({
      id: row.indicatorId,
      areaId: row.areaId,
      name: row.indicatorName,
      description: row.description ?? "",
      aggregationType: row.aggregationType,
      unitId: row.unitId ?? indicatorUnits[0]?.id ?? "",
      maturityLevel: row.maturityLevel == null ? "" : String(row.maturityLevel)
    });
  }

  async function deleteIndicator(row: IndicatorTableRow) {
    if (!window.confirm(`Apagar o indicador "${row.indicatorName}" e todo o historico relacionado?`)) return;
    try {
      await api(`/api/indicators/${row.indicatorId}`, { method: "DELETE" });
      await loadIndicators();
      setIndicatorActionMode("plan");
      setStatus("Indicador apagado.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao apagar indicador.");
    }
  }

  function handleExecutiveIndicatorClick(row: IndicatorTableRow) {
    if (indicatorActionMode === "edit") {
      openIndicatorEdit(row);
      return;
    }
    if (indicatorActionMode === "delete") {
      deleteIndicator(row);
      return;
    }
    openActionPlan(row);
  }

  async function submitIndicator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!indicatorForm) return;
    try {
      const url = indicatorForm.id ? `/api/indicators/${indicatorForm.id}` : "/api/indicators";
      const method = indicatorForm.id ? "PUT" : "POST";
      await api(url, {
        method,
        body: JSON.stringify({
          areaId: indicatorForm.areaId,
          name: indicatorForm.name,
          description: indicatorForm.description,
          aggregationType: indicatorForm.aggregationType,
          unitId: indicatorForm.unitId,
          maturityLevel: indicatorForm.maturityLevel
        })
      });
      setIndicatorForm(null);
      setIndicatorActionMode("plan");
      await loadIndicators();
      setStatus(indicatorForm.id ? "Indicador atualizado." : "Indicador criado.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar indicador.");
    }
  }

  function openAreaForm(mode: AreaFormState["mode"]) {
    const firstArea = areas[0];
    setAreaForm({
      mode,
      id: mode === "create" ? "" : firstArea?.id ?? "",
      name: mode === "create" ? "" : firstArea?.name ?? "",
      hexColor: mode === "create" ? "#1d4ed8" : firstArea?.hexColor ?? "#1d4ed8"
    });
  }

  function selectAreaForForm(areaId: string) {
    const selected = areas.find((area) => area.id === areaId);
    setAreaForm((current) =>
      current
        ? {
            ...current,
            id: areaId,
            name: selected?.name ?? "",
            hexColor: selected?.hexColor ?? "#1d4ed8"
          }
        : current
    );
  }

  async function submitArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!areaForm) return;
    try {
      if (areaForm.mode === "delete") {
        if (!window.confirm(`Apagar a area "${areaForm.name}" da visualizacao?`)) return;
        await api(`/api/areas/${areaForm.id}`, { method: "DELETE" });
      } else {
        const url = areaForm.mode === "edit" ? `/api/areas/${areaForm.id}` : "/api/areas";
        const method = areaForm.mode === "edit" ? "PUT" : "POST";
        await api(url, {
          method,
          body: JSON.stringify({ name: areaForm.name, hexColor: areaForm.hexColor })
        });
      }
      setAreaForm(null);
      await loadAdminMetadata();
      await loadIndicators();
      setStatus(areaForm.mode === "delete" ? "Area apagada." : areaForm.mode === "edit" ? "Area atualizada." : "Area criada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar area.");
    }
  }

  async function searchActionPlanResponsible(query: string) {
    setActionPlanEditor((current) =>
      current
        ? {
            ...current,
            form: {
              ...current.form,
              responsibleSearch: query,
              bitrixResponsibleId: "",
              responsibleName: "",
              responsibleEmail: null
            }
          }
        : current
    );
    if (query.trim().length < 2) {
      setActionPlanEditor((current) => (current ? { ...current, suggestions: [] } : current));
      return;
    }
    try {
      const suggestions = await api<BitrixUser[]>(`/api/bitrix-users?query=${encodeURIComponent(query)}&limit=8`);
      setActionPlanEditor((current) => (current ? { ...current, suggestions } : current));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao buscar responsavel no Bitrix.");
    }
  }

  function selectActionPlanResponsible(bitrixUser: BitrixUser) {
    setActionPlanEditor((current) =>
      current
        ? {
            ...current,
            suggestions: [],
            form: {
              ...current.form,
              bitrixResponsibleId: bitrixUser.id,
              responsibleName: bitrixUser.name,
              responsibleEmail: bitrixUser.email,
              responsibleSearch: bitrixUser.email ? `${bitrixUser.name} - ${bitrixUser.email}` : bitrixUser.name
            }
          }
        : current
    );
  }

  async function submitActionPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionPlanEditor) return;
    try {
      await api<ActionPlan>("/api/action-plans", {
        method: "POST",
        body: JSON.stringify({
          indicatorId: actionPlanEditor.row.indicatorId,
          title: actionPlanEditor.form.title,
          ocorrencia: actionPlanEditor.form.ocorrencia,
          identificacaoCausa: actionPlanEditor.form.identificacaoCausa,
          propostaSolucao: actionPlanEditor.form.propostaSolucao,
          bitrixResponsibleId: actionPlanEditor.form.bitrixResponsibleId,
          responsibleName: actionPlanEditor.form.responsibleName,
          responsibleEmail: actionPlanEditor.form.responsibleEmail,
          dueDate: actionPlanEditor.form.dueDate || null
        })
      });
      setActionPlanEditor(null);
      setStatus("Plano de acao salvo.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar plano de acao.");
    }
  }

  function exportIndicatorsCsv() {
    if (!isExecutive) return;
    const rows: Array<Array<string | number | null | undefined>> = [
      [
        "Indicador",
        "Area",
        "Unidade",
        "Maturidade",
        "Real Anual",
        "Projetado Anual",
        "Meta Anual",
        "Confianca",
        ...months.flatMap((month) => [`${month} Real`, `${month} Projetado`, `${month} Meta`, `${month} N/A`])
      ],
      ...filteredIndicators.map((row) => [
        row.indicatorName,
        row.areaName ?? row.areaId,
        row.unit,
        row.maturityLevel,
        row.annualReal,
        row.annualProjected,
        row.annualTarget,
        row.confidenceLevel,
        ...row.months.flatMap((month) => [
          month.value,
          month.projectedValue,
          month.monthlyTarget,
          month.notApplicable ? "Sim" : "Nao"
        ])
      ])
    ];
    downloadCsv(`psc-indicadores-${year}-${exportDateStamp()}.csv`, rows);
    setStatus("Exportacao de indicadores gerada.");
  }

  function exportIssuesCsv() {
    if (!isExecutive) return;
    const rows: Array<Array<string | number | null | undefined>> = [
      [
        "Titulo",
        "Solicitante",
        "Area",
        "Tags",
        "Gravidade Solicitante",
        "Urgencia Solicitante",
        "Tendencia Solicitante",
        "Prioridade Solicitante",
        "Gravidade Executiva",
        "Urgencia Executiva",
        "Tendencia Executiva",
        "Prioridade Executiva",
        "Status",
        "Data",
        "Ocorrencia",
        "Identificacao da causa",
        "Proposta de Solucao"
      ],
      ...filteredIssues.map((issue) => [
        issue.title,
        issue.requesterName ?? issue.requesterId,
        issueAreaLabel(issue),
        issue.tags.map((tag) => tag.name).join("; "),
        issue.requesterGravity,
        issue.requesterUrgency,
        issue.requesterTendency,
        issue.requesterPriorityScore,
        issue.executiveGravity,
        issue.executiveUrgency,
        issue.executiveTendency,
        issue.executivePriorityScore,
        formatStatus(issue.status),
        new Date(issue.createdAt).toLocaleDateString("pt-BR"),
        issue.ocorrencia,
        issue.identificacaoCausa,
        issue.propostaSolucao
      ])
    ];
    downloadCsv(`psc-issues-${exportDateStamp()}.csv`, rows);
    setStatus("Exportacao de Issues gerada.");
  }

  return (
    <main className="container">
      <h1 className="page-title">
        Gestao de Indicadores <span className="version-badge">Web</span>
      </h1>
      <p className="subtitle">Aplicacao serverless em Next.js com autenticacao Bitrix.</p>
      <section className="status">{loading ? "Carregando..." : status}</section>

      <section className="toolbar card">
        <div>
          <strong>{user.name}</strong>
          <span className="muted"> - {user.role}</span>
        </div>
        <div className="toolbar-actions">
          <label className="inline-field">
            Ano
            <input value={year} min={2000} max={2100} type="number" onChange={(event) => setYear(Number(event.target.value))} />
          </label>
          {canAdmin ? <a className="button-link compact secondary-link" href="/admin">Admin</a> : null}
          <button type="button" onClick={loadIndicators}>Recarregar</button>
          <button type="button" className="danger" onClick={logout}>Sair</button>
        </div>
      </section>

      <nav className="app-tabs">
        <button className={`tab-btn ${activeTab === "indicators" ? "active" : ""}`} type="button" onClick={() => setActiveTab("indicators")}>
          Indicadores
        </button>
        {canUseIssues ? (
          <button className={`tab-btn ${activeTab === "issues" ? "active" : ""}`} type="button" onClick={() => setActiveTab("issues")}>
            Issue Reports
          </button>
        ) : null}
        {canUseIssues ? (
          <button className={`tab-btn ${activeTab === "wins" ? "active" : ""}`} type="button" onClick={() => setActiveTab("wins")}>
            Wins
          </button>
        ) : null}
      </nav>

      {activeTab === "indicators" ? (
        <section className="card app-view">
          <div className="toolbar-actions filters-row">
            <label>
              Filtrar indicador ou area
              <input value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            {isExecutive ? (
              <label>
                Areas
                <select
                  multiple
                  size={4}
                  value={indicatorAreaFilter}
                  onChange={(event) => setIndicatorAreaFilter(Array.from(event.target.selectedOptions).map((option) => option.value))}
                >
                  {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          {isExecutive ? (
            <>
              <div className="toolbar-actions indicator-admin-actions">
                <button type="button" onClick={() => openAreaForm("create")}>Adicionar Area</button>
                <button type="button" className="secondary" onClick={() => openAreaForm("edit")}>Editar Areas</button>
                <button type="button" className="danger" onClick={() => openAreaForm("delete")}>Apagar Areas</button>
              </div>
              <div className="toolbar-actions indicator-admin-actions">
                <button type="button" onClick={openIndicatorCreate}>Adicionar Indicador</button>
                <button type="button" className="secondary" onClick={exportIndicatorsCsv}>Exportar Indicadores CSV</button>
                <button
                  type="button"
                  className={indicatorActionMode === "edit" ? "" : "secondary"}
                  onClick={() => setIndicatorActionMode((current) => (current === "edit" ? "plan" : "edit"))}
                >
                  Editar Indicadores
                </button>
                <button
                  type="button"
                  className={indicatorActionMode === "delete" ? "danger" : "secondary"}
                  onClick={() => setIndicatorActionMode((current) => (current === "delete" ? "plan" : "delete"))}
                >
                  Apagar Indicadores
                </button>
                <span className="muted">
                  {indicatorActionMode === "edit"
                    ? "Clique no indicador para editar."
                    : indicatorActionMode === "delete"
                      ? "Clique no indicador para apagar."
                      : "Clique no indicador para criar plano de acao."}
                </span>
              </div>
            </>
          ) : null}
          <div className="table-wrap">
            <div className="indicator-table-shell">
              <div className="indicator-table-panel identity-panel">
                <table className="indicator-table indicator-table-split">
                  <colgroup>
                    <col className="indicator-col" />
                    <col className="area-col" />
                    <col className="maturity-col" />
                  </colgroup>
                  <thead>
                    <tr><th colSpan={3} className="section-header">Identificação</th></tr>
                    <tr>
                      <th>Indicador</th>
                      <th>Area</th>
                      <th>Maturidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIndicators.map((row) => (
                      <tr key={row.indicatorId} style={{ "--area-row-bg": hexToRgba(row.areaHexColor, 0.08) } as CSSProperties}>
                        <td className="indicator-name-cell">
                          {isExecutive ? (
                            <button className="indicator-link" type="button" onClick={() => handleExecutiveIndicatorClick(row)} title="Clique para acao executiva">
                              {row.indicatorName}{row.unit ? ` - ${row.unit}` : ""}
                            </button>
                          ) : (
                            <>
                              {row.indicatorName}{row.unit ? <span className="muted"> - {row.unit}</span> : null}
                            </>
                          )}
                        </td>
                        <td>{row.areaName ?? row.areaId}</td>
                        <td
                          className={canEditMaturity ? "clickable-cell" : ""}
                          onClick={() => openMaturityEditor(row)}
                          title={canEditMaturity ? "Editar maturidade" : undefined}
                        >
                          <PerformanceBadge value={row.maturityLevel} classification={row.maturityClassification} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="indicator-table-panel months-panel">
                <table className="indicator-table indicator-table-split months-table">
                  <thead>
                    <tr><th colSpan={months.length} className="section-header">Meses</th></tr>
                    <tr>
                      {months.map((month, index) => (
                        <th key={month} className={currentMonth === index + 1 ? "current-month current-month-top" : ""}>{month}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIndicators.map((row, rowIndex) => (
                      <tr key={row.indicatorId} style={{ "--area-row-bg": hexToRgba(row.areaHexColor, 0.08) } as CSSProperties}>
                        {row.months.map((item) => (
                          <td
                            key={item.month}
                            className={`${item.belowTarget ? "below-target-cell" : ""} ${currentMonth === item.month ? `current-month ${rowIndex === filteredIndicators.length - 1 ? "current-month-bottom" : ""}` : ""} ${canEditIndicator(row) || isExecutive ? "clickable-cell" : ""}`.trim()}
                            onClick={() => (isExecutive ? openMonthlyPlanning(row, item.month) : openWeeklyEditor(row, item.month))}
                            title={isExecutive ? "Cadastrar planejamento mensal" : canEditIndicator(row) ? "Editar valores" : undefined}
                          >
                            <div className="month-cell">
                              <span className={item.belowTarget ? "month-value below-target" : "month-value"}>{item.notApplicable ? "N/A" : formatNumber(item.value)}</span>
                              <span className="month-projected">Proj. {formatNumber(item.projectedValue)}</span>
                              <span className="month-target">Meta {formatNumber(item.monthlyTarget)}</span>
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="indicator-table-panel annual-panel">
                <table className="indicator-table indicator-table-split">
                  <colgroup>
                    <col className="annual-col" />
                    <col className="annual-col" />
                    <col className="annual-col" />
                    <col className="annual-col" />
                  </colgroup>
                  <thead>
                    <tr><th colSpan={4} className="section-header">Consolidado Anual</th></tr>
                    <tr>
                      <th>Real Anual</th>
                      <th>Projetado Anual</th>
                      <th>Meta Anual</th>
                      <th>Confiança</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIndicators.map((row) => (
                      <tr key={row.indicatorId} style={{ "--area-row-bg": hexToRgba(row.areaHexColor, 0.08) } as CSSProperties}>
                        <td>{formatNumber(row.annualReal)}</td>
                        <td>
                          <PerformanceBadge value={row.annualProjected} classification={row.projectedAchievementClassification} />
                          <span className="month-target">{row.projectedAchievementPercent == null ? "" : `${formatNumber(row.projectedAchievementPercent)}%`}</span>
                        </td>
                        <td className={isExecutive ? "clickable-cell" : ""} onClick={() => openAnnualPlanning(row)}>{formatNumber(row.annualTarget)}</td>
                        <td className={isExecutive ? "clickable-cell" : ""} onClick={() => openAnnualPlanning(row)} title={isExecutive ? "Editar planejamento anual" : undefined}>
                          <PerformanceBadge value={row.confidenceLevel} classification={row.confidenceClassification} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {filteredIndicators.length === 0 ? <div className="empty-table-message muted">Nenhum indicador encontrado.</div> : null}
          </div>
        </section>
      ) : activeTab === "issues" ? (
        <section className="card app-view">
          <div className="toolbar">
            <h2>Issue Reports</h2>
            <div className="toolbar-actions">
              {isExecutive ? (
                <>
                  <button type="button" className="secondary" onClick={exportIssuesCsv}>Exportar Issues CSV</button>
                  <button type="button" className="secondary" onClick={() => setShowTagsPanel((value) => !value)}>Gerenciar Tags</button>
                </>
              ) : null}
              <button type="button" onClick={() => setShowIssueForm((value) => !value)}>Novo Issue</button>
            </div>
          </div>

          {isExecutive && showTagsPanel ? (
            <section className="tag-panel">
              <form className="tag-form toolbar-actions" onSubmit={submitIssueTag}>
                <label>
                  Nome da tag
                  <input required value={tagForm.name} onChange={(event) => setTagForm({ ...tagForm, name: event.target.value })} />
                </label>
                <label>
                  Cor
                  <input className="color-input" type="color" value={tagForm.color} onChange={(event) => setTagForm({ ...tagForm, color: event.target.value })} />
                </label>
                <button type="submit">{tagForm.id ? "Atualizar Tag" : "Salvar Tag"}</button>
                <button type="button" className="secondary" onClick={() => setTagForm(emptyTagForm)}>Limpar</button>
              </form>
              <div className="tag-list">
                {issueTags.map((tag) => (
                  <div className="tag-row" key={tag.id}>
                    <span className="tag-badge" style={{ backgroundColor: tag.color ?? "#d8e9ff" }}>{tag.name}</span>
                    <div className="toolbar-actions">
                      <button type="button" className="secondary" onClick={() => setTagForm({ id: tag.id, name: tag.name, color: tag.color ?? "#0b6bcb" })}>Editar</button>
                      <button type="button" className="danger" onClick={() => deleteIssueTag(tag)}>Apagar</button>
                    </div>
                  </div>
                ))}
                {issueTags.length === 0 ? <p className="muted">Nenhuma tag cadastrada.</p> : null}
              </div>
            </section>
          ) : null}

          {showIssueForm ? (
            <form className="form-grid issue-form" onSubmit={submitIssueReport}>
              <label>
                Titulo
                <input required value={issueForm.title} onChange={(event) => setIssueForm({ ...issueForm, title: event.target.value })} />
              </label>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={issueForm.isOtherArea}
                  onChange={(event) => setIssueForm({ ...issueForm, isOtherArea: event.target.checked, areaId: "" })}
                />
                Outras areas
              </label>
              {!issueForm.isOtherArea ? (
                <label>
                  Area
                  <select required value={issueForm.areaId} onChange={(event) => setIssueForm({ ...issueForm, areaId: event.target.value })}>
                    <option value="">Selecione</option>
                    {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                  </select>
                </label>
              ) : null}
              <fieldset className="gut-fieldset">
                <legend>Prioridade do Solicitante</legend>
                <div className="gut-inputs">
                  <label>
                    Gravidade
                    <select required value={issueForm.requesterGravity} onChange={(event) => setIssueForm({ ...issueForm, requesterGravity: event.target.value })}>
                      <option value="">Selecione</option>
                      {gutOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    Urgencia
                    <select required value={issueForm.requesterUrgency} onChange={(event) => setIssueForm({ ...issueForm, requesterUrgency: event.target.value })}>
                      <option value="">Selecione</option>
                      {gutOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    Tendencia
                    <select required value={issueForm.requesterTendency} onChange={(event) => setIssueForm({ ...issueForm, requesterTendency: event.target.value })}>
                      <option value="">Selecione</option>
                      {gutOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </div>
              </fieldset>
              <label>
                Ocorrencia
                <textarea
                  required
                  placeholder={issuePlaceholders.ocorrencia}
                  value={issueForm.ocorrencia}
                  onChange={(event) => setIssueForm({ ...issueForm, ocorrencia: event.target.value })}
                />
              </label>
              <label>
                Identificacao da causa
                <textarea
                  required
                  placeholder={issuePlaceholders.identificacaoCausa}
                  value={issueForm.identificacaoCausa}
                  onChange={(event) => setIssueForm({ ...issueForm, identificacaoCausa: event.target.value })}
                />
              </label>
              <label>
                Proposta de Solucao
                <textarea
                  required
                  placeholder={issuePlaceholders.propostaSolucao}
                  value={issueForm.propostaSolucao}
                  onChange={(event) => setIssueForm({ ...issueForm, propostaSolucao: event.target.value })}
                />
              </label>
              <div className="toolbar-actions">
                <button type="submit">Salvar Issue</button>
                <button type="button" className="secondary" onClick={() => setShowIssueForm(false)}>Fechar</button>
              </div>
            </form>
          ) : null}

          <div className="toolbar-actions filters-row">
            <label>
              Data inicial
              <input type="date" value={issueDateFrom} onChange={(event) => setIssueDateFrom(event.target.value)} />
            </label>
            <label>
              Data final
              <input type="date" value={issueDateTo} onChange={(event) => setIssueDateTo(event.target.value)} />
            </label>
            <label>
              Solicitante
              <select value={issueRequesterFilter} onChange={(event) => setIssueRequesterFilter(event.target.value)}>
                <option value="">Todos</option>
                {issueRequesters.map(([requesterId, requesterName]) => <option key={requesterId} value={requesterId}>{requesterName}</option>)}
              </select>
            </label>
            <label>
              Area
              <select value={issueAreaFilter} onChange={(event) => setIssueAreaFilter(event.target.value)}>
                <option value="">Todas</option>
                <option value="__other__">Outras</option>
                {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
            </label>
            <label>
              Tags
              <select
                multiple
                size={3}
                value={issueTagFilter}
                onChange={(event) => setIssueTagFilter(Array.from(event.target.selectedOptions).map((option) => option.value))}
              >
                {issueTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
            </label>
            <label>
              Buscar Issue
              <input list="issue-title-suggestions" value={issueSearch} onChange={(event) => setIssueSearch(event.target.value)} />
              <datalist id="issue-title-suggestions">
                {issueTitles.map((title) => <option key={title} value={title} />)}
              </datalist>
            </label>
            <label>
              Status
              <select value={issueStatusFilter} onChange={(event) => setIssueStatusFilter(event.target.value)}>
                <option value="">Todos</option>
                {issueStatuses.map((statusOption) => <option key={statusOption} value={statusOption}>{statusOption}</option>)}
              </select>
            </label>
            <label>
              Ordenar por
              <select value={issueSort} onChange={(event) => setIssueSort(event.target.value as IssueSortMode)}>
                <option value="executive">Prioridade executiva</option>
                <option value="requester">Prioridade solicitante</option>
                <option value="date">Data</option>
              </select>
            </label>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Titulo</th>
                  <th>Solicitante</th>
                  <th>Area</th>
                  <th>Tags</th>
                  <th>Prior. Solicitante</th>
                  <th>Prior. Executivo</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.map((issue) => (
                  <tr key={issue.id}>
                    <td>{issue.title}</td>
                    <td>{issue.requesterName ?? "-"}</td>
                    <td>{issueAreaLabel(issue)}</td>
                    <td>
                      {isExecutive ? (
                        <select
                          className="tag-picker"
                          multiple
                          size={Math.min(Math.max(issueTags.length, 2), 5)}
                          value={issue.tags.map((tag) => tag.id)}
                          onChange={(event) => updateIssueTags(issue, event.target.selectedOptions)}
                        >
                          {issueTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                        </select>
                      ) : (
                        <span className="tag-badges">
                          {issue.tags.length > 0
                            ? issue.tags.map((tag) => <span className="tag-badge" key={tag.id} style={{ backgroundColor: tag.color ?? "#d8e9ff" }}>{tag.name}</span>)
                            : "-"}
                        </span>
                      )}
                    </td>
                    <td>{issue.requesterPriorityScore}</td>
                    <td>
                      {isExecutive ? (
                        <button
                          type="button"
                          className="priority-cell-button"
                          onClick={() =>
                            setPriorityEditor({
                              issue,
                              gravity: issue.executiveGravity == null ? "" : String(issue.executiveGravity),
                              urgency: issue.executiveUrgency == null ? "" : String(issue.executiveUrgency),
                              tendency: issue.executiveTendency == null ? "" : String(issue.executiveTendency)
                            })
                          }
                        >
                          {issue.executivePriorityScore ?? "Priorizar"}
                        </button>
                      ) : (
                        issue.executivePriorityScore ?? "-"
                      )}
                    </td>
                    <td>
                      {isExecutive ? (
                        <select value={formatStatus(issue.status)} onChange={(event) => updateIssueStatus(issue, event.target.value)}>
                          {issueStatuses.map((statusOption) => <option key={statusOption} value={statusOption}>{statusOption}</option>)}
                        </select>
                      ) : (
                        formatStatus(issue.status)
                      )}
                    </td>
                    <td>{new Date(issue.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td>
                      <div className="issue-actions">
                        <button type="button" onClick={() => setSelectedIssue(issue)}>Detalhar</button>
                        {isExecutive ? <button type="button" className="danger" onClick={() => deleteIssueReport(issue)}>Apagar</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredIssues.length === 0 ? <tr><td colSpan={9} className="muted">Nenhum Issue Report encontrado.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="card app-view">
          <div className="toolbar">
            <h2>Wins</h2>
            <div className="toolbar-actions">
              {isExecutive ? (
                <button type="button" className="secondary" onClick={() => setShowWinTagsPanel((value) => !value)}>Gerenciar Tags</button>
              ) : null}
              <button type="button" onClick={() => setShowWinForm((value) => !value)}>Nova Win</button>
            </div>
          </div>

          {isExecutive && showWinTagsPanel ? (
            <section className="tag-panel">
              <form className="tag-form toolbar-actions" onSubmit={submitWinTag}>
                <label>
                  Nome da tag
                  <input required value={winTagForm.name} onChange={(event) => setWinTagForm({ ...winTagForm, name: event.target.value })} />
                </label>
                <label>
                  Cor
                  <input className="color-input" type="color" value={winTagForm.color} onChange={(event) => setWinTagForm({ ...winTagForm, color: event.target.value })} />
                </label>
                <button type="submit">{winTagForm.id ? "Atualizar Tag" : "Salvar Tag"}</button>
                <button type="button" className="secondary" onClick={() => setWinTagForm(emptyTagForm)}>Limpar</button>
              </form>
              <div className="tag-list">
                {winTags.map((tag) => (
                  <div className="tag-row" key={tag.id}>
                    <span className="tag-badge" style={{ backgroundColor: tag.color ?? "#d8e9ff" }}>{tag.name}</span>
                    <div className="toolbar-actions">
                      <button type="button" className="secondary" onClick={() => setWinTagForm({ id: tag.id, name: tag.name, color: tag.color ?? "#0b6bcb" })}>Editar</button>
                      <button type="button" className="danger" onClick={() => deleteWinTag(tag)}>Apagar</button>
                    </div>
                  </div>
                ))}
                {winTags.length === 0 ? <p className="muted">Nenhuma tag cadastrada.</p> : null}
              </div>
            </section>
          ) : null}

          {showWinForm ? (
            <form className="form-grid issue-form" onSubmit={submitWinReport}>
              <label>
                Titulo
                <input required value={winForm.title} onChange={(event) => setWinForm({ ...winForm, title: event.target.value })} />
              </label>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={winForm.isOtherArea}
                  onChange={(event) => setWinForm({ ...winForm, isOtherArea: event.target.checked, areaId: "" })}
                />
                Outras areas
              </label>
              {!winForm.isOtherArea ? (
                <label>
                  Area
                  <select required value={winForm.areaId} onChange={(event) => setWinForm({ ...winForm, areaId: event.target.value })}>
                    <option value="">Selecione</option>
                    {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                  </select>
                </label>
              ) : null}
              <label>
                Descricao
                <textarea required value={winForm.ocorrencia} onChange={(event) => setWinForm({ ...winForm, ocorrencia: event.target.value })} />
              </label>
              <div className="toolbar-actions">
                <button type="submit">Salvar Win</button>
                <button type="button" className="secondary" onClick={() => setShowWinForm(false)}>Fechar</button>
              </div>
            </form>
          ) : null}

          <div className="toolbar-actions filters-row">
            <label>
              Data inicial
              <input type="date" value={winDateFrom} onChange={(event) => setWinDateFrom(event.target.value)} />
            </label>
            <label>
              Data final
              <input type="date" value={winDateTo} onChange={(event) => setWinDateTo(event.target.value)} />
            </label>
            <label>
              Solicitante
              <select value={winRequesterFilter} onChange={(event) => setWinRequesterFilter(event.target.value)}>
                <option value="">Todos</option>
                {winRequesters.map(([requesterId, requesterName]) => <option key={requesterId} value={requesterId}>{requesterName}</option>)}
              </select>
            </label>
            <label>
              Area
              <select value={winAreaFilter} onChange={(event) => setWinAreaFilter(event.target.value)}>
                <option value="">Todas</option>
                <option value="__other__">Outras</option>
                {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
            </label>
            <label>
              Tags
              <select
                multiple
                size={3}
                value={winTagFilter}
                onChange={(event) => setWinTagFilter(Array.from(event.target.selectedOptions).map((option) => option.value))}
              >
                {winTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
            </label>
            <label>
              Buscar Win
              <input list="win-title-suggestions" value={winSearch} onChange={(event) => setWinSearch(event.target.value)} />
              <datalist id="win-title-suggestions">
                {winTitles.map((title) => <option key={title} value={title} />)}
              </datalist>
            </label>
            <label>
              Status
              <select value={winStatusFilter} onChange={(event) => setWinStatusFilter(event.target.value)}>
                <option value="">Todos</option>
                {issueStatuses.map((statusOption) => <option key={statusOption} value={statusOption}>{statusOption}</option>)}
              </select>
            </label>
            <label>
              Ordenar por
              <select value={winSort} onChange={(event) => setWinSort(event.target.value as IssueSortMode)}>
                <option value="date">Data</option>
              </select>
            </label>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Titulo</th>
                  <th>Solicitante</th>
                  <th>Area</th>
                  <th>Tags</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredWins.map((win) => (
                  <tr key={win.id}>
                    <td>{win.title}</td>
                    <td>{win.requesterName ?? "-"}</td>
                    <td>{issueAreaLabel(win)}</td>
                    <td>
                      {isExecutive ? (
                        <select
                          className="tag-picker"
                          multiple
                          size={Math.min(Math.max(winTags.length, 2), 5)}
                          value={win.tags.map((tag) => tag.id)}
                          onChange={(event) => updateWinTags(win, event.target.selectedOptions)}
                        >
                          {winTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                        </select>
                      ) : (
                        <span className="tag-badges">
                          {win.tags.length > 0
                            ? win.tags.map((tag) => <span className="tag-badge" key={tag.id} style={{ backgroundColor: tag.color ?? "#d8e9ff" }}>{tag.name}</span>)
                            : "-"}
                        </span>
                      )}
                    </td>
                    <td>
                      {isExecutive ? (
                        <select value={formatStatus(win.status)} onChange={(event) => updateWinStatus(win, event.target.value)}>
                          {issueStatuses.map((statusOption) => <option key={statusOption} value={statusOption}>{statusOption}</option>)}
                        </select>
                      ) : (
                        formatStatus(win.status)
                      )}
                    </td>
                    <td>{new Date(win.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td>
                      <div className="issue-actions">
                        <button type="button" onClick={() => setSelectedWin(win)}>Detalhar</button>
                        {isExecutive ? <button type="button" className="danger" onClick={() => deleteWinReport(win)}>Apagar</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredWins.length === 0 ? <tr><td colSpan={7} className="muted">Nenhuma Win encontrada.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {areaForm ? (
        <section className="modal-overlay">
          <div className="modal-content">
            <h2>{areaForm.mode === "create" ? "Criar Area" : areaForm.mode === "edit" ? "Editar Area" : "Apagar Area"}</h2>
            <form className="form-grid" onSubmit={submitArea}>
              {areaForm.mode !== "create" ? (
                <label>
                  Area
                  <select value={areaForm.id} onChange={(event) => selectAreaForForm(event.target.value)} required>
                    {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                  </select>
                </label>
              ) : null}
              {areaForm.mode !== "delete" ? (
                <>
                  <label>
                    Nome
                    <input required value={areaForm.name} onChange={(event) => setAreaForm({ ...areaForm, name: event.target.value })} />
                  </label>
                  <label>
                    Cor
                    <input className="color-input" type="color" value={areaForm.hexColor} onChange={(event) => setAreaForm({ ...areaForm, hexColor: event.target.value })} />
                  </label>
                </>
              ) : (
                <p className="muted">A area sera desativada e deixara de aparecer nos fluxos ativos.</p>
              )}
              <div className="toolbar-actions">
                <button type="submit" className={areaForm.mode === "delete" ? "danger" : ""}>
                  {areaForm.mode === "delete" ? "Apagar Area" : "Salvar Area"}
                </button>
                <button type="button" className="secondary" onClick={() => setAreaForm(null)}>Fechar</button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {indicatorForm ? (
        <section className="modal-overlay">
          <div className="modal-content action-plan-modal">
            <h2>{indicatorForm.id ? "Editar indicador" : "Cadastrar indicador"}</h2>
            <form className="form-grid" onSubmit={submitIndicator}>
              <label>
                Area
                <select required value={indicatorForm.areaId} onChange={(event) => setIndicatorForm({ ...indicatorForm, areaId: event.target.value })}>
                  <option value="">Selecione</option>
                  {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                </select>
              </label>
              <label>
                Nome
                <input required value={indicatorForm.name} onChange={(event) => setIndicatorForm({ ...indicatorForm, name: event.target.value })} />
              </label>
              <label>
                Descricao
                <textarea value={indicatorForm.description} onChange={(event) => setIndicatorForm({ ...indicatorForm, description: event.target.value })} />
              </label>
              <label>
                Agregacao
                <select
                  required
                  value={indicatorForm.aggregationType}
                  onChange={(event) => setIndicatorForm({ ...indicatorForm, aggregationType: event.target.value as AggregationType })}
                >
                  <option value="sum">Soma</option>
                  <option value="avg">Media ponderada</option>
                  <option value="latest">Ultimo valor</option>
                </select>
              </label>
              <label>
                Unidade
                <select required value={indicatorForm.unitId} onChange={(event) => setIndicatorForm({ ...indicatorForm, unitId: event.target.value })}>
                  <option value="">Selecione</option>
                  {indicatorUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
                </select>
              </label>
              <label>
                Maturidade
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={indicatorForm.maturityLevel}
                  onChange={(event) => setIndicatorForm({ ...indicatorForm, maturityLevel: event.target.value })}
                />
              </label>
              <div className="toolbar-actions">
                <button type="submit">Salvar indicador</button>
                <button type="button" className="secondary" onClick={() => setIndicatorForm(null)}>Fechar</button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {weeklyEditor ? (
        <section className="modal-overlay">
          <div className="modal-content">
            <h2>Valores mensais</h2>
            <p className="muted">{weeklyEditor.row.indicatorName} - {months[weeklyEditor.month - 1]}/{year}</p>
            <div className="form-grid">
              {weeklyEditor.payload.weeks.map((week) => (
                <label key={week.weekNumber}>
                  {week.label}
                  <input
                    type="number"
                    step="0.01"
                    value={weeklyEditor.values[week.weekNumber] ?? ""}
                    onChange={(event) =>
                      setWeeklyEditor((current) =>
                        current
                          ? {
                              ...current,
                              values: { ...current.values, [week.weekNumber]: event.target.value }
                            }
                          : current
                      )
                    }
                  />
                </label>
              ))}
              {user.canEditProjectedValue ? (
                <label>
                  Valor projetado mensal
                  <input
                    type="number"
                    step="0.01"
                    value={weeklyEditor.projectedValue}
                    onChange={(event) =>
                      setWeeklyEditor((current) => (current ? { ...current, projectedValue: event.target.value } : current))
                    }
                  />
                </label>
              ) : null}
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={weeklyEditor.notApplicable}
                  onChange={(event) =>
                    setWeeklyEditor((current) => (current ? { ...current, notApplicable: event.target.checked } : current))
                  }
                />
                Marcar mes como N/A
              </label>
              <div className="toolbar-actions">
                <button type="button" onClick={saveIndicatorModal}>Salvar</button>
                <button type="button" className="secondary" onClick={() => setWeeklyEditor(null)}>Fechar</button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {monthlyPlanning ? (
        <section className="modal-overlay">
          <div className="modal-content">
            <h2>Planejamento Mensal</h2>
            <p className="muted">{monthlyPlanning.row.indicatorName} - {months[monthlyPlanning.month - 1]}/{year}</p>
            <div className="form-grid">
              {user.canEditProjectedValue ? (
                <label>
                  Valor projetado mensal
                  <input
                    type="number"
                    step="0.01"
                    value={monthlyPlanning.projectedValue}
                    onChange={(event) =>
                      setMonthlyPlanning((current) => (current ? { ...current, projectedValue: event.target.value } : current))
                    }
                  />
                </label>
              ) : null}
              {isExecutive ? (
                <label>
                  Meta mensal
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={monthlyPlanning.targetValue}
                    onChange={(event) =>
                      setMonthlyPlanning((current) => (current ? { ...current, targetValue: event.target.value } : current))
                    }
                  />
                </label>
              ) : null}
              <div className="toolbar-actions">
                <button type="button" onClick={saveMonthlyPlanning}>Salvar</button>
                <button type="button" className="secondary" onClick={() => setMonthlyPlanning(null)}>Fechar</button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {actionPlanEditor ? (
        <section className="modal-overlay">
          <div className="modal-content action-plan-modal">
            <h2>Novo plano de acao</h2>
            <p className="muted">{actionPlanEditor.row.indicatorName}</p>
            <form className="form-grid" onSubmit={submitActionPlan}>
              <label>
                Titulo
                <input
                  required
                  value={actionPlanEditor.form.title}
                  onChange={(event) =>
                    setActionPlanEditor({ ...actionPlanEditor, form: { ...actionPlanEditor.form, title: event.target.value } })
                  }
                />
              </label>
              <label>
                Ocorrencia
                <textarea
                  required
                  value={actionPlanEditor.form.ocorrencia}
                  onChange={(event) =>
                    setActionPlanEditor({ ...actionPlanEditor, form: { ...actionPlanEditor.form, ocorrencia: event.target.value } })
                  }
                />
              </label>
              <label>
                Identificacao da causa
                <textarea
                  required
                  value={actionPlanEditor.form.identificacaoCausa}
                  onChange={(event) =>
                    setActionPlanEditor({ ...actionPlanEditor, form: { ...actionPlanEditor.form, identificacaoCausa: event.target.value } })
                  }
                />
              </label>
              <label>
                Proposta de Solucao
                <textarea
                  required
                  value={actionPlanEditor.form.propostaSolucao}
                  onChange={(event) =>
                    setActionPlanEditor({ ...actionPlanEditor, form: { ...actionPlanEditor.form, propostaSolucao: event.target.value } })
                  }
                />
              </label>
              <label>
                Responsavel Bitrix
                <input
                  required
                  value={actionPlanEditor.form.responsibleSearch}
                  onChange={(event) => searchActionPlanResponsible(event.target.value)}
                  placeholder="Digite nome ou email"
                />
              </label>
              {actionPlanEditor.suggestions.length > 0 ? (
                <div className="suggestions">
                  {actionPlanEditor.suggestions.map((bitrixUser) => (
                    <button className="suggestion-item" type="button" key={bitrixUser.id} onClick={() => selectActionPlanResponsible(bitrixUser)}>
                      <strong>{bitrixUser.name}</strong>
                      <span className="muted">{bitrixUser.email ? ` - ${bitrixUser.email}` : ""} - ID {bitrixUser.id}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {actionPlanEditor.form.bitrixResponsibleId ? (
                <p className="selected-user">
                  <strong>{actionPlanEditor.form.responsibleName}</strong>
                  <span className="muted">ID Bitrix {actionPlanEditor.form.bitrixResponsibleId}</span>
                </p>
              ) : null}
              <label>
                Prazo
                <input
                  type="date"
                  value={actionPlanEditor.form.dueDate}
                  onChange={(event) =>
                    setActionPlanEditor({ ...actionPlanEditor, form: { ...actionPlanEditor.form, dueDate: event.target.value } })
                  }
                />
              </label>
              <div className="toolbar-actions">
                <button type="submit" disabled={!actionPlanEditor.form.bitrixResponsibleId}>Salvar plano de acao</button>
                <button type="button" className="secondary" onClick={() => setActionPlanEditor(null)}>Fechar</button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {maturityEditor ? (
        <section className="modal-overlay">
          <div className="modal-content">
            <h2>Editar maturidade</h2>
            <p className="muted">{maturityEditor.row.indicatorName}</p>
            <form className="form-grid" onSubmit={saveMaturity}>
              <label>
                Maturidade
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={maturityEditor.maturityLevel}
                  onChange={(event) => setMaturityEditor({ ...maturityEditor, maturityLevel: event.target.value })}
                />
              </label>
              <div className="toolbar-actions">
                <button type="submit">Salvar maturidade</button>
                <button type="button" className="secondary" onClick={() => setMaturityEditor(null)}>Fechar</button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {annualPlanning ? (
        <section className="modal-overlay">
          <div className="modal-content">
            <h2>Planejamento anual</h2>
            <p className="muted">{annualPlanning.row.indicatorName} - {year}</p>
            <form className="form-grid" onSubmit={saveAnnualPlanning}>
              <label>
                Meta anual
                <input
                  type="number"
                  step="0.01"
                  value={annualPlanning.annualTarget}
                  onChange={(event) => setAnnualPlanning({ ...annualPlanning, annualTarget: event.target.value })}
                />
              </label>
              <label>
                Confianca
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={annualPlanning.confidenceLevel}
                  onChange={(event) => setAnnualPlanning({ ...annualPlanning, confidenceLevel: event.target.value })}
                />
              </label>
              <div className="toolbar-actions">
                <button type="submit">Salvar planejamento</button>
                <button type="button" className="secondary" onClick={() => setAnnualPlanning(null)}>Fechar</button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {priorityEditor ? (
        <section className="modal-overlay">
          <div className="modal-content">
            <h2>Prioridade Executiva</h2>
            <p className="muted">{priorityEditor.issue.title}</p>
            <form className="form-grid" onSubmit={saveExecutivePriority}>
              <div className="gut-inputs">
                <label>
                  Gravidade
                  <select required value={priorityEditor.gravity} onChange={(event) => setPriorityEditor({ ...priorityEditor, gravity: event.target.value })}>
                    <option value="">Selecione</option>
                    {gutOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Urgencia
                  <select required value={priorityEditor.urgency} onChange={(event) => setPriorityEditor({ ...priorityEditor, urgency: event.target.value })}>
                    <option value="">Selecione</option>
                    {gutOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Tendencia
                  <select required value={priorityEditor.tendency} onChange={(event) => setPriorityEditor({ ...priorityEditor, tendency: event.target.value })}>
                    <option value="">Selecione</option>
                    {gutOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
              <p className="priority-score-preview">Score: <strong>{priorityPreview(priorityEditor.gravity, priorityEditor.urgency, priorityEditor.tendency)}</strong></p>
              <div className="toolbar-actions">
                <button type="submit">Salvar prioridade</button>
                <button type="button" className="secondary" onClick={() => setPriorityEditor(null)}>Fechar</button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {winPriorityEditor ? (
        <section className="modal-overlay">
          <div className="modal-content">
            <h2>Prioridade Executiva</h2>
            <p className="muted">{winPriorityEditor.win.title}</p>
            <form className="form-grid" onSubmit={saveWinExecutivePriority}>
              <div className="gut-inputs">
                <label>
                  Gravidade
                  <select required value={winPriorityEditor.gravity} onChange={(event) => setWinPriorityEditor({ ...winPriorityEditor, gravity: event.target.value })}>
                    <option value="">Selecione</option>
                    {gutOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Urgencia
                  <select required value={winPriorityEditor.urgency} onChange={(event) => setWinPriorityEditor({ ...winPriorityEditor, urgency: event.target.value })}>
                    <option value="">Selecione</option>
                    {gutOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Tendencia
                  <select required value={winPriorityEditor.tendency} onChange={(event) => setWinPriorityEditor({ ...winPriorityEditor, tendency: event.target.value })}>
                    <option value="">Selecione</option>
                    {gutOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
              <p className="priority-score-preview">Score: <strong>{priorityPreview(winPriorityEditor.gravity, winPriorityEditor.urgency, winPriorityEditor.tendency)}</strong></p>
              <div className="toolbar-actions">
                <button type="submit">Salvar prioridade</button>
                <button type="button" className="secondary" onClick={() => setWinPriorityEditor(null)}>Fechar</button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {selectedIssue ? (
        <section className="modal-overlay">
          <div className="modal-content issue-detail-body">
            <h2>{selectedIssue.title}</h2>
            <p className="muted">
              {issueAreaLabel(selectedIssue)} - Prioridade {selectedIssue.executivePriorityScore ?? selectedIssue.requesterPriorityScore}
            </p>
            <p><strong>Status:</strong> {formatStatus(selectedIssue.status)}</p>
            <p><strong>Solicitante:</strong> {selectedIssue.requesterName ?? "-"}</p>
            <p><strong>GUT solicitante:</strong> G{selectedIssue.requesterGravity} - U{selectedIssue.requesterUrgency} - T{selectedIssue.requesterTendency}</p>
            {selectedIssue.executivePriorityScore ? (
              <p><strong>GUT executivo:</strong> G{selectedIssue.executiveGravity} - U{selectedIssue.executiveUrgency} - T{selectedIssue.executiveTendency}</p>
            ) : null}
            <p><strong>Tags:</strong> {selectedIssue.tags.length > 0 ? selectedIssue.tags.map((tag) => tag.name).join(", ") : "-"}</p>
            <p><strong>Ocorrencia:</strong><br />{selectedIssue.ocorrencia}</p>
            <p><strong>Identificacao da causa:</strong><br />{selectedIssue.identificacaoCausa}</p>
            <p><strong>Proposta de Solucao:</strong><br />{selectedIssue.propostaSolucao}</p>
            <div className="toolbar-actions">
              <button type="button" onClick={() => setSelectedIssue(null)}>Fechar</button>
            </div>
          </div>
        </section>
      ) : null}

      {selectedWin ? (
        <section className="modal-overlay">
          <div className="modal-content issue-detail-body">
            <h2>{selectedWin.title}</h2>
            <p className="muted">{issueAreaLabel(selectedWin)}</p>
            <p><strong>Status:</strong> {formatStatus(selectedWin.status)}</p>
            <p><strong>Solicitante:</strong> {selectedWin.requesterName ?? "-"}</p>
            <p><strong>Tags:</strong> {selectedWin.tags.length > 0 ? selectedWin.tags.map((tag) => tag.name).join(", ") : "-"}</p>
            <p><strong>Descricao:</strong><br />{selectedWin.ocorrencia}</p>
            <div className="toolbar-actions">
              <button type="button" onClick={() => setSelectedWin(null)}>Fechar</button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
