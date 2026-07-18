import { describe, expect, it } from "vitest";
import { ProvisionBitrixUser } from "../src/core/use-cases/provision-bitrix-user";
import { AdminUserPayload, UserRepositoryPort } from "../src/core/ports/repositories";
import { User } from "../src/core/domain/models";

const admin: User = {
  id: "admin",
  email: "admin@example.com",
  name: "Admin",
  role: "executivo",
  areaId: null,
  areaIds: [],
  isActive: true,
  canEditProjectedValue: true,
  canEditIndicatorMaturity: true,
  canUseIssueReports: true,
  canAdminUsers: true,
  bitrixUserId: "1",
  bitrixPortalDomain: "portal"
};

describe("ProvisionBitrixUser", () => {
  it("upserts a PSC user from a selected Bitrix user", async () => {
    const payload: AdminUserPayload = {
      bitrixUser: { id: "99", name: "Pessoa Bitrix", email: "pessoa@example.com", portalDomain: "portal" },
      role: "gestor_area",
      areaIds: ["area-1"],
      isActive: true,
      canEditProjectedValue: false,
      canEditIndicatorMaturity: true,
      canUseIssueReports: true,
      canAdminUsers: false
    };
    const repository: UserRepositoryPort = {
      getById: async () => null,
      getByBitrixIdentity: async () => null,
      listUsers: async () => [],
      deactivateUser: async () => undefined,
      upsertFromBitrix: async (input) => ({
        id: "local-99",
        email: input.bitrixUser.email ?? "",
        name: input.bitrixUser.name,
        role: input.role,
        areaId: input.areaIds[0] ?? null,
        areaIds: input.areaIds,
        isActive: input.isActive,
        canEditProjectedValue: input.canEditProjectedValue,
        canEditIndicatorMaturity: input.canEditIndicatorMaturity,
        canUseIssueReports: input.canUseIssueReports,
        canAdminUsers: input.canAdminUsers,
        bitrixUserId: input.bitrixUser.id,
        bitrixPortalDomain: input.bitrixUser.portalDomain ?? null
      })
    };

    const created = await new ProvisionBitrixUser(repository).execute(admin, payload);
    expect(created.bitrixUserId).toBe("99");
    expect(created.canUseIssueReports).toBe(true);
  });
});
