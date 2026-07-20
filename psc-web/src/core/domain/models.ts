export type Role =
  | "gestor_area"
  | "gestor_tatico"
  | "gestor_operacional"
  | "executivo"
  | "executivo_visualizacao";
export type AggregationType = "sum" | "avg" | "latest";
export type IssueStatus =
  | "Concluido"
  | "Concluído"
  | "Em atendimento"
  | "Em Planejamento"
  | "Delegada"
  | "Recusada"
  | "Nao Iniciada"
  | "Não Iniciada";

export class DomainError extends Error {}
export class AuthenticationError extends DomainError {}
export class AuthorizationError extends DomainError {}
export class ValidationError extends DomainError {}
export class NotFoundError extends DomainError {}

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  areaId: string | null;
  areaIds: string[];
  isActive: boolean;
  canEditProjectedValue: boolean;
  canEditIndicatorMaturity: boolean;
  canUseIssueReports: boolean;
  canAdminUsers: boolean;
  bitrixUserId: string | null;
  bitrixPortalDomain: string | null;
};

export type BitrixUser = {
  id: string;
  name: string;
  email: string | null;
  portalDomain?: string | null;
};

export type Area = {
  id: string;
  name: string;
  hexColor: string | null;
  isActive: boolean;
};

export type IndicatorUnit = {
  id: string;
  code: string;
  label: string;
};

export type Indicator = {
  id: string;
  areaId: string;
  areaName: string | null;
  areaHexColor: string | null;
  name: string;
  description: string | null;
  aggregationType: AggregationType;
  unitId: string | null;
  unit: string | null;
  maturityLevel: number | null;
  isActive: boolean;
};

export type IndicatorValue = {
  indicatorId: string;
  year: number;
  month: number;
  weekNumber: number;
  value: number;
  sourceUserId: string;
};

export type IndicatorTableRow = {
  indicatorId: string;
  indicatorName: string;
  areaId: string;
  areaName: string | null;
  areaHexColor: string | null;
  description: string | null;
  aggregationType: AggregationType;
  unitId: string | null;
  unit: string | null;
  maturityLevel: number | null;
  annualTarget: number | null;
  annualProjected: number | null;
  annualReal: number | null;
  confidenceLevel: number | null;
  projectedAchievementPercent: number | null;
  maturityClassification: PerformanceClassification;
  confidenceClassification: PerformanceClassification;
  projectedAchievementClassification: PerformanceClassification;
  months: Array<{
    month: number;
    value: number | null;
    projectedValue: number | null;
    monthlyTarget: number | null;
    notApplicable: boolean;
    belowTarget: boolean;
  }>;
};

export type PerformanceClassification =
  | "neutral"
  | "not_reliable"
  | "fragile"
  | "functional"
  | "reliable"
  | "strategic";

export type ActionPlan = {
  id: string;
  indicatorId: string;
  title: string;
  ocorrencia: string;
  identificacaoCausa: string;
  propostaSolucao: string;
  bitrixResponsibleId: string | null;
  responsibleName: string;
  responsibleEmail: string | null;
  dueDate: string | null;
  bitrixTaskId: string | null;
  status: string;
  createdBy: string;
};

export type IssueTag = {
  id: string;
  name: string;
  color: string | null;
  isActive: boolean;
};

export type IssueReport = {
  id: string;
  title: string;
  requesterId: string;
  requesterName: string | null;
  areaId: string | null;
  areaName: string | null;
  isOtherArea: boolean;
  requesterGravity: number;
  requesterUrgency: number;
  requesterTendency: number;
  requesterPriorityScore: number;
  executiveGravity: number | null;
  executiveUrgency: number | null;
  executiveTendency: number | null;
  executivePriorityScore: number | null;
  ocorrencia: string;
  identificacaoCausa: string;
  propostaSolucao: string;
  status: IssueStatus;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  tags: IssueTag[];
};

export type WinTag = IssueTag;

export type WinReport = {
  id: string;
  title: string;
  requesterId: string;
  requesterName: string | null;
  areaId: string | null;
  areaName: string | null;
  isOtherArea: boolean;
  requesterGravity: number;
  requesterUrgency: number;
  requesterTendency: number;
  requesterPriorityScore: number;
  executiveGravity: number | null;
  executiveUrgency: number | null;
  executiveTendency: number | null;
  executivePriorityScore: number | null;
  ocorrencia: string;
  identificacaoCausa: string;
  propostaSolucao: string;
  status: IssueStatus;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  tags: WinTag[];
};
