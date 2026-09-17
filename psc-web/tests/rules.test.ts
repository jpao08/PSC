import { describe, expect, it } from "vitest";
import {
  calculateAchievementPercent,
  calculateAnnualValue,
  buildQuarterSummary,
  calculateMonthlyValue,
  classifyPerformance,
  ensureCanEditIndicatorMaturity,
  ensureCanEditFinancialDrilldown,
  ensureCanUseCommercialDrilldown,
  ensureCanViewFinancialDrilldown,
  ensureCanViewIndicator,
  resolveMonthStatus,
  validateConfidenceLevel
} from "../src/core/domain/rules";
import { AuthorizationError, Indicator, User, ValidationError } from "../src/core/domain/models";

const baseUser: User = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  role: "gestor_area",
  areaId: "area-1",
  areaIds: ["area-1"],
  isActive: true,
  canEditProjectedValue: false,
  canEditIndicatorMaturity: false,
  canUseIssueReports: false,
  canAdminUsers: false,
  canViewCommercialDrilldown: false,
  canViewMarketingDrilldown: false,
  canViewFinancialDrilldown: false,
  canEditFinancialDrilldown: false,
  bitrixUserId: "42",
  bitrixPortalDomain: "portal.bitrix24.com.br"
};

const indicator: Indicator = {
  id: "indicator-1",
  areaId: "area-1",
  areaName: "Area",
  areaHexColor: "#0b6bcb",
  name: "Indicador",
  description: null,
  formula: null,
  aggregationType: "avg",
  unitId: null,
  unit: null,
  maturityLevel: null,
  isActive: true
};

describe("rules", () => {
  it("resolves monthly value as the latest cumulative weekly value", () => {
    const values = [
      { weekNumber: 1, value: 100 },
      { weekNumber: 2, value: 150 },
      { weekNumber: 3, value: 200 },
      { weekNumber: 4, value: 250 }
    ];
    expect(calculateMonthlyValue(values, "sum", 2026, 2)).toBe(250);
    expect(calculateMonthlyValue(values, "latest", 2026, 2)).toBe(250);
    expect(calculateMonthlyValue(values, "avg", 2026, 2)).toBe(250);
  });

  it("consolidates quarters and completeness by indicator type", () => {
    const baseMonths = [
      { month: 1, value: 100, target: 100, status: resolveMonthStatus(100, false) },
      { month: 2, value: 150, target: 150, status: resolveMonthStatus(150, false) },
      { month: 3, value: 200, target: 200, status: resolveMonthStatus(200, false) }
    ];
    expect(buildQuarterSummary({ quarter: 1, aggregationType: "sum", monthValues: baseMonths, annualTarget: 1000, isClosed: true }).value).toBe(450);
    expect(buildQuarterSummary({ quarter: 1, aggregationType: "latest", monthValues: baseMonths, annualTarget: 1000, isClosed: true }).value).toBe(200);
    expect(buildQuarterSummary({ quarter: 1, aggregationType: "avg", monthValues: baseMonths, annualTarget: 1000, isClosed: true }).value).toBe(150);

    const incomplete = buildQuarterSummary({
      quarter: 1,
      aggregationType: "sum",
      annualTarget: null,
      isClosed: false,
      monthValues: [
        { month: 1, value: 0, target: null, status: resolveMonthStatus(0, false) },
        { month: 2, value: null, target: null, status: resolveMonthStatus(null, true) },
        { month: 3, value: null, target: null, status: resolveMonthStatus(null, false) }
      ]
    });
    expect(incomplete.value).toBe(0);
    expect(incomplete.filledCount).toBe(1);
    expect(incomplete.expectedCount).toBe(2);
    expect(incomplete.completenessPercent).toBe(50);
  });

  it("reports weekly progress for the open current month in the current quarter", () => {
    const summary = buildQuarterSummary({
      quarter: 3,
      aggregationType: "sum",
      annualTarget: null,
      isClosed: false,
      currentMonth: 9,
      monthValues: [
        { month: 7, value: 12, target: null, status: "filled", weeklyFilledCount: 4, weeklyExpectedCount: 4 },
        { month: 8, value: null, target: null, status: "not_calculable", weeklyFilledCount: 0, weeklyExpectedCount: 4 },
        { month: 9, value: 5, target: null, status: "filled", weeklyFilledCount: 1, weeklyExpectedCount: 4 }
      ]
    });

    expect(summary.value).toBe(17);
    expect(summary.filledWeeks).toBe(5);
    expect(summary.expectedWeeks).toBe(8);
    expect(summary.weekCompletenessPercent).toBe(62.5);
    expect(summary.currentMonthWeekProgress).toEqual({ month: 9, filledWeeks: 1, expectedWeeks: 4 });
    expect(summary.analysis).toContain("Mes vigente ainda aberto");
  });

  it("allows managers to view indicators from their areas", () => {
    expect(() => ensureCanViewIndicator(baseUser, indicator)).not.toThrow();
    expect(() => ensureCanViewIndicator({ ...baseUser, role: "gestor_tatico" }, indicator)).not.toThrow();
    expect(() => ensureCanViewIndicator({ ...baseUser, role: "gestor_operacional" }, indicator)).not.toThrow();
  });

  it("blocks managers from other areas", () => {
    expect(() => ensureCanViewIndicator(baseUser, { ...indicator, areaId: "area-2" })).toThrow(AuthorizationError);
  });

  it("allows only executives or flagged users to edit indicator maturity", () => {
    expect(() => ensureCanEditIndicatorMaturity(baseUser, indicator)).toThrow(AuthorizationError);
    expect(() =>
      ensureCanEditIndicatorMaturity({ ...baseUser, role: "executivo_visualizacao", canEditIndicatorMaturity: true }, indicator)
    ).not.toThrow();
    expect(() => ensureCanEditIndicatorMaturity({ ...baseUser, role: "executivo" }, indicator)).not.toThrow();
  });

  it("uses explicit Drill Down permissions", () => {
    expect(() => ensureCanUseCommercialDrilldown(baseUser)).toThrow(AuthorizationError);
    expect(() => ensureCanUseCommercialDrilldown({ ...baseUser, canViewCommercialDrilldown: true })).not.toThrow();
    expect(() => ensureCanViewFinancialDrilldown({ ...baseUser, canEditFinancialDrilldown: true })).not.toThrow();
    expect(() => ensureCanEditFinancialDrilldown({ ...baseUser, canViewFinancialDrilldown: true })).toThrow(AuthorizationError);
    expect(() => ensureCanEditFinancialDrilldown({ ...baseUser, role: "executivo" })).not.toThrow();
  });

  it("classifies performance scale boundaries", () => {
    expect(classifyPerformance(null)).toBe("neutral");
    expect(classifyPerformance(0)).toBe("not_reliable");
    expect(classifyPerformance(30)).toBe("not_reliable");
    expect(classifyPerformance(31)).toBe("fragile");
    expect(classifyPerformance(50)).toBe("fragile");
    expect(classifyPerformance(51)).toBe("functional");
    expect(classifyPerformance(70)).toBe("functional");
    expect(classifyPerformance(71)).toBe("reliable");
    expect(classifyPerformance(90)).toBe("reliable");
    expect(classifyPerformance(91)).toBe("strategic");
    expect(classifyPerformance(101)).toBe("strategic");
  });

  it("validates confidence and annual calculations", () => {
    expect(validateConfidenceLevel(100)).toBe(100);
    expect(() => validateConfidenceLevel(100.01)).toThrow(ValidationError);
    expect(calculateAnnualValue([{ month: 1, value: 80 }, { month: 2, value: 75 }], "sum")).toBe(155);
    expect(calculateAchievementPercent(68, 100)).toBe(68);
    expect(calculateAchievementPercent(68, 0)).toBeNull();
  });
});
