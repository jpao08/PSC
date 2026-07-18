import { AdminUserPayload, UserRepositoryPort } from "../ports/repositories";
import { User } from "../domain/models";
import { ensureExecutiveAdmin, ensureValidRole } from "../domain/rules";

export class ProvisionBitrixUser {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(admin: User, payload: AdminUserPayload): Promise<User> {
    ensureExecutiveAdmin(admin);
    ensureValidRole(payload.role);
    return this.userRepository.upsertFromBitrix(payload);
  }
}
