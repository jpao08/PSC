import {
  AggregationType,
  AuthenticationError,
  AuthorizationError,
  Indicator,
  IssueStatus,
  PerformanceClassification,
  Role,
  User,
  ValidationError
} from "./models";

const areaScopedRoles = new Set<Role>(["gestor_area", "gestor_tatico", "gestor_operacional"]);
const globalViewRoles = new Set<Role>(["executivo", "executivo_visualizacao"]);
const validRoles = new Set<Role>([...areaScopedRoles, ...globalViewRoles]);
const validAggregations = new Set<AggregationType>(["sum", "avg", "latest"]);
const validIssueStatuses = new Set<string>([
  "Nao Iniciada",
  "Não Iniciada",
  "NÃ£o Iniciada",
  "Em Planejamento",
  "Em atendimento",
  "Delegada",
  "Recusada",
  "Concluido",
  "Concluído",
  "ConcluÃ­do"
]);
const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;

export function ensureUserActive(user: User): void {
  if (!user.isActive) throw new AuthenticationError("Usuario inativo.");
}

export function ensureRole(user: User, expectedRole: Role): void {
  if (user.role !== expectedRole) throw new AuthorizationError("Voce nao tem permissao para esta operacao.");
}

export function ensureExecutiveAdmin(user: User): void {
  ensureUserActive(user);
  if (user.role !== "executivo" && !user.canAdminUsers) {
    throw new AuthorizationError("Usuario sem permissao para administrar contas.");
  }
}

export function ensureValidRole(role: string): asserts role is Role {
  if (!validRoles.has(role as Role)) throw new ValidationError("Role invalida.");
}

export function ensureValidAggregation(value: string): asserts value is AggregationType {
  if (!validAggregations.has(value as AggregationType)) {
    throw new ValidationError("Tipo de agregacao invalido. Use sum, avg ou latest.");
  }
}

export function getUserAreaIds(user: User): string[] {
  const ids = [...user.areaIds];
  if (user.areaId && !ids.includes(user.areaId)) ids.push(user.areaId);
  return ids;
}

export function ensureCanViewIndicator(user: User, indicator: Indicator): void {
  if (globalViewRoles.has(user.role)) return;
  if (areaScopedRoles.has(user.role) && getUserAreaIds(user).includes(indicator.areaId)) return;
  throw new AuthorizationError("Usuario sem permissao para acessar este indicador.");
}

export function ensureCanEditWeeklyValue(user: User, indicator: Indicator): void {
  ensureUserActive(user);
  if (user.role !== "gestor_area") throw new AuthorizationError("Somente gestor de area pode atualizar valores semanais.");
  if (!getUserAreaIds(user).includes(indicator.areaId)) {
    throw new AuthorizationError("Indicador nao pertence a area do gestor.");
  }
}

export function ensureCanEditProjectedValue(user: User, indicator: Indicator): void {
  ensureCanViewIndicator(user, indicator);
  if (!user.canEditProjectedValue) {
    throw new AuthorizationError("Usuario sem permissao para cadastrar valor projetado.");
  }
}

export function ensureCanEditIndicatorMaturity(user: User, indicator: Indicator): void {
  ensureCanViewIndicator(user, indicator);
  if (user.role === "executivo" || user.canEditIndicatorMaturity) return;
  throw new AuthorizationError("Usuario sem permissao para editar maturidade do indicador.");
}

export function ensureCanUseIssueReports(user: User): void {
  if (user.role === "executivo" || user.canUseIssueReports) return;
  throw new AuthorizationError("Usuario sem permissao para acessar Issue Reports.");
}

export function ensureCanUseCommercialDrilldown(user: User): void {
  ensureUserActive(user);
  if (user.role === "executivo" || user.role === "executivo_visualizacao" || user.canAdminUsers) return;
  throw new AuthorizationError("Usuario sem permissao para acessar Drill Down Comercial.");
}

export function ensureCanStartCommercialSync(user: User): void {
  ensureUserActive(user);
  if (user.canAdminUsers) return;
  throw new AuthorizationError("Somente Admin pode iniciar sincronizacao comercial.");
}

export function ensureExecutiveIssueAccess(user: User): void {
  ensureUserActive(user);
  if (user.role !== "executivo") {
    throw new AuthorizationError("Somente executivo pode administrar Issue Reports.");
  }
}

export function ensureIssueGutValue(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new ValidationError(`${fieldName} deve estar entre 1 e 5.`);
  }
  return value;
}

export function ensureIssueStatus(value: string): IssueStatus {
  const clean = value.trim();
  if (!validIssueStatuses.has(clean)) throw new ValidationError("Status de Issue Report invalido.");
  return clean as IssueStatus;
}

export function ensureRequiredText(value: string, fieldName: string): string {
  const clean = value.trim();
  if (!clean) throw new ValidationError(`Campo obrigatorio: ${fieldName}.`);
  return clean;
}

export function ensureHexColorOrNull(value: string | null | undefined, fieldName = "hex_color"): string | null {
  if (!value || !value.trim()) return null;
  const clean = value.trim();
  if (!hexColorPattern.test(clean)) throw new ValidationError(`Campo ${fieldName} deve seguir o formato #RRGGBB.`);
  return clean;
}

export function ensureMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new ValidationError("Mes deve estar entre 1 e 12.");
}

export function ensureWeek(weekNumber: number): void {
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 4) {
    throw new ValidationError("Faixa deve estar entre 1 e 4.");
  }
}

export function getMonthRanges(year: number, month: number): Array<[number, number, number]> {
  ensureMonth(month);
  const lastDay = new Date(year, month, 0).getDate();
  return [
    [1, 1, 7],
    [2, 8, 14],
    [3, 15, 21],
    [4, 22, lastDay]
  ];
}

export function getRangeDaysCount(year: number, month: number, weekNumber: number): number {
  ensureWeek(weekNumber);
  const found = getMonthRanges(year, month).find(([number]) => number === weekNumber);
  if (!found) throw new ValidationError("Faixa mensal invalida.");
  return found[2] - found[1] + 1;
}

export function calculateMonthlyValue(
  values: Array<{ weekNumber: number; value: number }>,
  aggregationType: AggregationType,
  year: number,
  month: number
): number | null {
  if (values.length === 0) return null;
  if (aggregationType === "sum") return values.reduce((total, item) => total + item.value, 0);
  if (aggregationType === "latest") {
    return [...values].sort((left, right) => right.weekNumber - left.weekNumber)[0]?.value ?? null;
  }

  let weightedTotal = 0;
  let totalDays = 0;
  for (const item of values) {
    const days = getRangeDaysCount(year, month, item.weekNumber);
    weightedTotal += item.value * days;
    totalDays += days;
  }
  return totalDays === 0 ? null : weightedTotal / totalDays;
}

export function validateConfidenceLevel(value: number | null): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new ValidationError("Confianca deve estar entre 0 e 100.");
  }
  return value;
}

export function classifyPerformance(value: number | null): PerformanceClassification {
  if (value == null || Number.isNaN(value)) return "neutral";
  if (value <= 30) return "not_reliable";
  if (value <= 50) return "fragile";
  if (value <= 70) return "functional";
  if (value <= 90) return "reliable";
  return "strategic";
}

export function calculateAchievementPercent(value: number | null, target: number | null): number | null {
  if (value == null || target == null || target === 0) return null;
  return (value / target) * 100;
}

export function calculateAnnualValue(
  values: Array<{ month: number; value: number }>,
  aggregationType: AggregationType
): number | null {
  if (values.length === 0) return null;
  if (aggregationType === "sum") return values.reduce((total, item) => total + item.value, 0);
  if (aggregationType === "latest") {
    return [...values].sort((left, right) => right.month - left.month)[0]?.value ?? null;
  }
  return values.reduce((total, item) => total + item.value, 0) / values.length;
}
