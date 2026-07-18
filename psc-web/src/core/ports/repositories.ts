import {
  ActionPlan,
  AggregationType,
  Area,
  BitrixUser,
  Indicator,
  IndicatorTableRow,
  IndicatorUnit,
  IndicatorValue,
  IssueReport,
  IssueTag,
  Role,
  User,
  WinReport,
  WinTag
} from "../domain/models";

export type AdminUserPayload = {
  bitrixUser: BitrixUser;
  role: Role;
  areaIds: string[];
  isActive: boolean;
  canEditProjectedValue: boolean;
  canEditIndicatorMaturity: boolean;
  canUseIssueReports: boolean;
  canAdminUsers: boolean;
};

export interface UserRepositoryPort {
  getById(userId: string): Promise<User | null>;
  getByBitrixIdentity(bitrixUserId: string, portalDomain: string | null): Promise<User | null>;
  listUsers(): Promise<User[]>;
  upsertFromBitrix(payload: AdminUserPayload): Promise<User>;
  deactivateUser(userId: string): Promise<void>;
}

export interface IndicatorRepositoryPort {
  listAreas(): Promise<Area[]>;
  listUnits(): Promise<IndicatorUnit[]>;
  listActive(areaIds?: string[] | null): Promise<Indicator[]>;
  getById(indicatorId: string): Promise<Indicator | null>;
  createArea(name: string, hexColor: string | null): Promise<Area>;
  updateArea(areaId: string, name: string, hexColor: string | null): Promise<Area>;
  deactivateArea(areaId: string): Promise<void>;
  createIndicator(input: {
    areaId: string;
    name: string;
    description: string | null;
    aggregationType: AggregationType;
    unitId: string;
    maturityLevel: number | null;
    createdBy: string;
  }): Promise<Indicator>;
  updateIndicator(indicatorId: string, input: {
    areaId: string;
    name: string;
    description: string | null;
    aggregationType: AggregationType;
    unitId: string;
    maturityLevel: number | null;
  }): Promise<Indicator>;
  updateIndicatorMaturity(indicatorId: string, maturityLevel: number | null): Promise<Indicator>;
  deleteIndicatorWithHistory(indicatorId: string): Promise<void>;
  listWeeklyValues(indicatorIds: string[], year: number, month?: number): Promise<IndicatorValue[]>;
  upsertWeeklyValue(value: IndicatorValue): Promise<void>;
  listMonthTargets(indicatorIds: string[], year: number): Promise<Array<{ indicatorId: string; month: number; targetValue: number }>>;
  listMonthProjections(indicatorIds: string[], year: number): Promise<Array<{ indicatorId: string; month: number; projectedValue: number }>>;
  listMonthNotApplicable(indicatorIds: string[], year: number): Promise<Array<{ indicatorId: string; month: number }>>;
  upsertMonthProjection(indicatorId: string, year: number, month: number, projectedValue: number, userId: string): Promise<void>;
  deleteMonthProjection(indicatorId: string, year: number, month: number): Promise<void>;
  upsertMonthTarget(indicatorId: string, year: number, month: number, targetValue: number, userId: string): Promise<void>;
  deleteMonthTarget(indicatorId: string, year: number, month: number): Promise<void>;
  setMonthNotApplicable(indicatorId: string, year: number, month: number, notApplicable: boolean, userId: string): Promise<void>;
  listIndicatorTable(user: User, year: number): Promise<IndicatorTableRow[]>;
}

export interface ActionPlanRepositoryPort {
  listActionPlans(indicatorId: string): Promise<ActionPlan[]>;
  createActionPlan(input: Omit<ActionPlan, "id" | "bitrixTaskId" | "status"> & { bitrixTaskId: string | null; status: string }): Promise<ActionPlan>;
  addHistory(actionPlanId: string, eventType: string, description: string, createdBy: string): Promise<void>;
}

export interface IssueReportRepositoryPort {
  listIssueReports(requesterId?: string | null): Promise<IssueReport[]>;
  createIssueReport(input: {
    title: string;
    requesterId: string;
    areaId: string | null;
    isOtherArea: boolean;
    requesterGravity: number;
    requesterUrgency: number;
    requesterTendency: number;
    ocorrencia: string;
    identificacaoCausa: string;
    propostaSolucao: string;
  }): Promise<IssueReport>;
  updateExecutiveReview(input: {
    issueId: string;
    executiveGravity: number | null;
    executiveUrgency: number | null;
    executiveTendency: number | null;
    status: string | null;
    reviewedBy: string;
  }): Promise<IssueReport>;
  softDeleteIssueReport(issueId: string, deletedBy: string): Promise<void>;
  replaceIssueTags(issueId: string, tagIds: string[], updatedBy: string): Promise<IssueReport>;
  listIssueTags(): Promise<IssueTag[]>;
  createIssueTag(name: string, color: string | null, createdBy: string): Promise<IssueTag>;
  updateIssueTag(tagId: string, name: string, color: string | null): Promise<IssueTag>;
  deactivateIssueTag(tagId: string): Promise<void>;
}

export interface WinReportRepositoryPort {
  listWinReports(requesterId?: string | null): Promise<WinReport[]>;
  createWinReport(input: {
    title: string;
    requesterId: string;
    areaId: string | null;
    isOtherArea: boolean;
    requesterGravity: number;
    requesterUrgency: number;
    requesterTendency: number;
    ocorrencia: string;
    identificacaoCausa: string;
    propostaSolucao: string;
  }): Promise<WinReport>;
  updateExecutiveReview(input: {
    winId: string;
    executiveGravity: number | null;
    executiveUrgency: number | null;
    executiveTendency: number | null;
    status: string | null;
    reviewedBy: string;
  }): Promise<WinReport>;
  softDeleteWinReport(winId: string, deletedBy: string): Promise<void>;
  replaceWinTags(winId: string, tagIds: string[], updatedBy: string): Promise<WinReport>;
  listWinTags(): Promise<WinTag[]>;
  createWinTag(name: string, color: string | null, createdBy: string): Promise<WinTag>;
  updateWinTag(tagId: string, name: string, color: string | null): Promise<WinTag>;
  deactivateWinTag(tagId: string): Promise<void>;
}

export interface BitrixGatewayPort {
  exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string | null; portalDomain: string | null }>;
  getCurrentUser(accessToken: string, portalDomain: string | null): Promise<BitrixUser>;
  searchUsers(query: string, limit: number): Promise<BitrixUser[]>;
  createTask(input: {
    title: string;
    description: string;
    responsibleBitrixUserId: string | null;
    dueDate: string | null;
  }): Promise<string | null>;
}
