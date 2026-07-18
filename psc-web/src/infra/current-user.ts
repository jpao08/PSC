import { AuthenticationError } from "@/core/domain/models";
import { buildContainer } from "@/composition/build-container";
import { getSessionUserId } from "@/infra/session";
import { ensureUserActive } from "@/core/domain/rules";

export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) throw new AuthenticationError("Sessao ausente.");
  const container = buildContainer();
  const user = await container.userRepository.getById(userId);
  if (!user) throw new AuthenticationError("Usuario nao encontrado.");
  ensureUserActive(user);
  return user;
}
