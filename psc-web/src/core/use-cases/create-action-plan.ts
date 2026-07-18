import { ActionPlan, User } from "../domain/models";
import { ActionPlanRepositoryPort, BitrixGatewayPort, IndicatorRepositoryPort } from "../ports/repositories";
import { ensureCanViewIndicator, ensureRequiredText, ensureRole, ensureUserActive } from "../domain/rules";
import { NotFoundError } from "../domain/models";

export type CreateActionPlanInput = {
  indicatorId: string;
  title: string;
  ocorrencia: string;
  identificacaoCausa: string;
  propostaSolucao: string;
  bitrixResponsibleId: string;
  responsibleName: string;
  responsibleEmail: string | null;
  dueDate: string | null;
};

export class CreateActionPlan {
  constructor(
    private readonly actionPlanRepository: ActionPlanRepositoryPort,
    private readonly indicatorRepository: IndicatorRepositoryPort,
    private readonly bitrixGateway: BitrixGatewayPort
  ) {}

  async execute(user: User, input: CreateActionPlanInput): Promise<ActionPlan> {
    ensureUserActive(user);
    ensureRole(user, "executivo");
    const indicator = await this.indicatorRepository.getById(input.indicatorId);
    if (!indicator) throw new NotFoundError("Indicador nao encontrado.");
    ensureCanViewIndicator(user, indicator);

    const title = ensureRequiredText(input.title, "titulo");
    const ocorrencia = ensureRequiredText(input.ocorrencia, "ocorrencia");
    const identificacaoCausa = ensureRequiredText(input.identificacaoCausa, "identificacao da causa");
    const propostaSolucao = ensureRequiredText(input.propostaSolucao, "proposta da solucao");
    const bitrixResponsibleId = ensureRequiredText(input.bitrixResponsibleId, "responsavel do Bitrix24");
    const responsibleName = ensureRequiredText(input.responsibleName, "responsavel");

    const description = [
      `Indicador: ${indicator.name}`,
      `Area: ${indicator.areaName ?? indicator.areaId}`,
      `Ocorrencia: ${ocorrencia}`,
      `Identificacao da Causa: ${identificacaoCausa}`,
      `Proposta da Solucao: ${propostaSolucao}`,
      `Responsavel Bitrix ID: ${bitrixResponsibleId}`,
      `Responsavel: ${responsibleName}`,
      `Email: ${input.responsibleEmail ?? "-"}`,
      `Prazo: ${input.dueDate ?? "-"}`
    ].join("\n");

    let bitrixTaskId: string | null = null;
    let status = "created";
    try {
      bitrixTaskId = await this.bitrixGateway.createTask({
        title,
        description,
        responsibleBitrixUserId: bitrixResponsibleId,
        dueDate: input.dueDate
      });
      if (!bitrixTaskId) status = "bitrix_pending";
    } catch {
      status = "bitrix_pending";
    }

    const plan = await this.actionPlanRepository.createActionPlan({
      indicatorId: input.indicatorId,
      title,
      ocorrencia,
      identificacaoCausa,
      propostaSolucao,
      bitrixResponsibleId,
      responsibleName,
      responsibleEmail: input.responsibleEmail,
      dueDate: input.dueDate,
      bitrixTaskId,
      status,
      createdBy: user.id
    });
    await this.actionPlanRepository.addHistory(
      plan.id,
      "created",
      `Plano criado. Tentativa de criacao no Bitrix24: ${bitrixTaskId ? `ok (${bitrixTaskId})` : "pendente/falha"}`,
      user.id
    );
    return plan;
  }
}
