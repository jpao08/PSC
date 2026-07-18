import { AuthenticationError, BitrixUser, User } from "../domain/models";
import { UserRepositoryPort } from "../ports/repositories";
import { ensureUserActive } from "../domain/rules";

export class ResolveBitrixLogin {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(bitrixUser: BitrixUser, portalDomain: string | null): Promise<User> {
    const user = await this.userRepository.getByBitrixIdentity(bitrixUser.id, portalDomain);
    if (!user) {
      throw new AuthenticationError("Usuario Bitrix ainda nao habilitado no PSC.");
    }
    ensureUserActive(user);
    return user;
  }
}
