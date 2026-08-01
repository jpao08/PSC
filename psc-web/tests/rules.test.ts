import { describe, expect, it } from "vitest";
import {
  calculateAchievementPercent,
  calculateAnnualValue,
  calculateMonthlyValue,
  classifyPerformance,
  ensureCanEditIndicatorMaturity,
  ensureCanEditFinancialDrilldown,
  ensureCanUseCommercialDrilldown,
  ensureCanViewFinancialDrilldown,
  ensureCanViewIndicator,
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
  aggregationType: "avg",
  unitId: null,
  unit: null,
  maturityLevel: null,
  isActive: true
};

describe("rules", () => {
  it("calculates sum, latest and weighted average monthly values", () => {
    const values = [
      { weekNumber: 1, value: 10 },
      { weekNumber: 2, value: 20 },
      { weekNumber: 4, value: 40 }
    ];
    expect(calculateMonthlyValue(values, "sum", 2026, 2)).toBe(70);
    expect(calculateMonthlyValue(values, "latest", 2026, 2)).toBe(40);
    expect(calculateMonthlyValue(values, "avg", 2026, 2)).toBeCloseTo(23.3333333333);
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
