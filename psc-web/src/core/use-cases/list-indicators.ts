import { IndicatorRepositoryPort } from "../ports/repositories";
import { User } from "../domain/models";
import { ensureUserActive } from "../domain/rules";

export class ListIndicators {
  constructor(private readonly indicatorRepository: IndicatorRepositoryPort) {}

  async execute(user: User, year: number) {
    ensureUserActive(user);
    return this.indicatorRepository.listIndicatorTable(user, year);
  }
}
