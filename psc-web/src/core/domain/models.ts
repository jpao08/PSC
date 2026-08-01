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
  canViewCommercialDrilldown: boolean;
  canViewMarketingDrilldown: boolean;
  canViewFinancialDrilldown: boolean;
  canEditFinancialDrilldown: boolean;
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
    valueSource: "manual" | "financial_drilldown" | "marketing_drilldown" | "empty" | "not_applicable";
    financialDrilldownValue: number | null;
    marketingDrilldownValue: number | null;
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

export type CommercialMetricKind = "flow" | "stock";
export type CommercialMetricUnit = "quantity" | "money";
export type CommercialSyncStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type CommercialSyncJob = {
  jobId: string;
  jobType: string;
  status: CommercialSyncStatus;
  startedAt: string | null;
  currentStep: string | null;
  processedRecords: number;
  totalRecords: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CommercialDrilldownRow = {
  responsibleId: string | null;
  responsibleName: string;
  responsibleActive: boolean;
  isTotal?: boolean;
  months: Record<string, number | null>;
  annualSummary: number | null;
};

export type CommercialDrilldownMetric = {
  metricKey: string;
  label: string;
  kind: CommercialMetricKind;
  unit: CommercialMetricUnit;
  summaryLabel: string;
  rows: CommercialDrilldownRow[];
};

export type CommercialDrilldownDashboard = {
  year: number;
  months: number[];
  responsibles: Array<{
    responsibleId: string | null;
    responsibleName: string;
    active: boolean;
  }>;
  metrics: CommercialDrilldownMetric[];
  lastSuccessfulSyncAt: string | null;
  activeJob: CommercialSyncJob | null;
};

export type CommercialDrilldownItem = {
  dealId: string;
  title: string | null;
  responsibleId: string | null;
  responsibleName: string;
  responsibleStatus: "active" | "inactive";
  stageId: string | null;
  stageName: string | null;
  eventDate: string | null;
  referenceDate: string | null;
  quantityContribution: number | null;
  monetaryContribution: number | null;
  opportunity: number | null;
  currencyId: string | null;
  bitrixUrl: string | null;
};

export type CommercialDrilldownItemsPage = {
  year: number;
  month: number;
  metricKey: string;
  responsibleId: string | null;
  page: number;
  pageSize: number;
  totalItems: number;
  items: CommercialDrilldownItem[];
};

export type CommercialSyncStartResult = {
  jobId: string;
  status: CommercialSyncStatus;
  created: boolean;
  message: string;
};

export type MarketingMetricKind = "flow" | "ratio";
export type MarketingMetricUnit = "quantity" | "percentage";

export type MarketingDrilldownRow = {
  channel: string;
  isTotal?: boolean;
  months: Record<string, number | null>;
  numeratorMonths: Record<string, number | null>;
  denominatorMonths: Record<string, number | null>;
  annualSummary: number | null;
};

export type MarketingDrilldownMetric = {
  metricKey: string;
  label: string;
  indicatorName: string;
  kind: MarketingMetricKind;
  unit: MarketingMetricUnit;
  summaryLabel: string;
  rows: MarketingDrilldownRow[];
};

export type MarketingDrilldownDashboard = {
  year: number;
  months: number[];
  channels: string[];
  metrics: MarketingDrilldownMetric[];
  lastSuccessfulSyncAt: string | null;
  activeJob: CommercialSyncJob | null;
};

export type MarketingDrilldownItem = {
  dealId: string;
  title: string | null;
  categoryId: number;
  channel: string;
  stageId: string | null;
  stageName: string | null;
  eventDate: string | null;
  quantityContribution: number | null;
  numeratorContribution: number | null;
  denominatorContribution: number | null;
  bitrixUrl: string | null;
};

export type MarketingDrilldownItemsPage = {
  year: number;
  month: number;
  metricKey: string;
  channel: string | null;
  page: number;
  pageSize: number;
  totalItems: number;
  items: MarketingDrilldownItem[];
};

export type MonthlyCellState = "empty" | "zero" | "value" | "not_applicable" | "error" | "processing";
export type FinancialValueType = "integer" | "decimal" | "percentage" | "money";
export type FinancialAggregationType = "sum" | "avg" | "ratio" | "latest" | "formula";

export type FinancialUnit = {
  id: string;
  name: string;
  bitrixSpaItemId: string;
  bitrixEntityTypeId: number;
  bitrixCategoryId: number;
  isActive: boolean;
  lastSyncedAt: string | null;
};

export type FinancialIndicator = {
  id: string;
  name: string;
  description: string | null;
  valueType: FinancialValueType;
  aggregationType: FinancialAggregationType;
  displayOrder: number;
  isActive: boolean;
};

export type FinancialDrilldownRow = {
  unitId: string | null;
  unitName: string;
  isTotal: boolean;
  months: Record<string, number | null>;
  periodTotal: number | null;
};

export type FinancialDrilldownTable = {
  indicator: FinancialIndicator;
  rows: FinancialDrilldownRow[];
};

export type FinancialDrilldownDashboard = {
  year: number;
  months: number[];
  units: FinancialUnit[];
  indicators: FinancialIndicator[];
  tables: FinancialDrilldownTable[];
};
