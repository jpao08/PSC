from __future__ import annotations

from dataclasses import dataclass

from adapters.output.bitrix_task_gateway import BitrixTaskGateway
from adapters.output.supabase_bitrix_user_directory import SupabaseBitrixUserDirectory
from adapters.output.supabase_repositories import (
    SimpleTokenService,
    SupabaseActionPlanRepository,
    SupabaseIndicatorRepository,
    SupabaseUserRepository,
)
from core.ports.repositories import (
    ActionPlanRepositoryPort,
    IndicatorRepositoryPort,
    SessionPort,
    UserRepositoryPort,
)
from core.ports.task_gateway import TaskGatewayPort
from core.use_cases.authenticate_user import AuthenticateUser
from core.use_cases.create_action_plan import CreateActionPlan
from core.use_cases.create_area import CreateArea
from core.use_cases.create_indicator import CreateIndicator
from core.use_cases.delete_area import DeleteArea
from core.use_cases.delete_indicator import DeleteIndicator
from core.use_cases.list_indicators import ListIndicators
from core.use_cases.register_indicator_value import RegisterIndicatorValue
from core.use_cases.search_bitrix_users import SearchBitrixUsers
from core.use_cases.update_area import UpdateArea
from core.use_cases.update_indicator import UpdateIndicator
from core.use_cases.upsert_indicator_month_projection import UpsertIndicatorMonthProjection
from core.use_cases.upsert_indicator_month_target import UpsertIndicatorMonthTarget
from infra.bitrix_client import BitrixClient
from infra.config import Settings
from infra.logging import configure_logging
from infra.supabase_client import (
    build_optional_users_supabase_client,
    build_supabase_client,
)


@dataclass(frozen=True)
class Container:
    settings: Settings
    session_port: SessionPort
    user_repository: UserRepositoryPort
    indicator_repository: IndicatorRepositoryPort
    action_plan_repository: ActionPlanRepositoryPort
    task_gateway: TaskGatewayPort
    authenticate_user: AuthenticateUser
    list_indicators: ListIndicators
    register_indicator_value: RegisterIndicatorValue
    create_action_plan: CreateActionPlan
    create_indicator: CreateIndicator
    update_indicator: UpdateIndicator
    delete_indicator: DeleteIndicator
    create_area: CreateArea
    update_area: UpdateArea
    delete_area: DeleteArea
    upsert_indicator_month_target: UpsertIndicatorMonthTarget
    upsert_indicator_month_projection: UpsertIndicatorMonthProjection
    search_bitrix_users: SearchBitrixUsers


def build_container() -> Container:
    settings = Settings.from_env()
    configure_logging(settings.log_level)

    supabase_client = build_supabase_client(settings)
    users_supabase_client = build_optional_users_supabase_client(settings)
    bitrix_client = BitrixClient(settings.bitrix_webhook_url)

    session_port = SimpleTokenService(
        secret_key=settings.app_secret_key,
        ttl_minutes=settings.app_token_ttl_minutes,
    )
    user_repository = SupabaseUserRepository(client=supabase_client)
    indicator_repository = SupabaseIndicatorRepository(client=supabase_client)
    action_plan_repository = SupabaseActionPlanRepository(client=supabase_client)
    user_directory = None
    if users_supabase_client is not None and settings.users_supabase_table:
        user_directory = SupabaseBitrixUserDirectory(
            client=users_supabase_client,
            table_name=settings.users_supabase_table,
        )
    elif settings.users_supabase_table:
        # Permite usar a tabela no mesmo projeto Supabase principal.
        user_directory = SupabaseBitrixUserDirectory(
            client=supabase_client,
            table_name=settings.users_supabase_table,
        )

    task_gateway = BitrixTaskGateway(
        bitrix_client=bitrix_client,
        user_directory=user_directory,
    )

    return Container(
        settings=settings,
        session_port=session_port,
        user_repository=user_repository,
        indicator_repository=indicator_repository,
        action_plan_repository=action_plan_repository,
        task_gateway=task_gateway,
        authenticate_user=AuthenticateUser(
            user_repository=user_repository,
            session_port=session_port,
        ),
        list_indicators=ListIndicators(indicator_repository=indicator_repository),
        register_indicator_value=RegisterIndicatorValue(indicator_repository=indicator_repository),
        create_action_plan=CreateActionPlan(
            action_plan_repository=action_plan_repository,
            indicator_repository=indicator_repository,
            task_gateway=task_gateway,
        ),
        create_indicator=CreateIndicator(indicator_repository=indicator_repository),
        update_indicator=UpdateIndicator(indicator_repository=indicator_repository),
        delete_indicator=DeleteIndicator(indicator_repository=indicator_repository),
        create_area=CreateArea(indicator_repository=indicator_repository),
        update_area=UpdateArea(indicator_repository=indicator_repository),
        delete_area=DeleteArea(indicator_repository=indicator_repository),
        upsert_indicator_month_target=UpsertIndicatorMonthTarget(
            indicator_repository=indicator_repository
        ),
        upsert_indicator_month_projection=UpsertIndicatorMonthProjection(
            indicator_repository=indicator_repository
        ),
        search_bitrix_users=SearchBitrixUsers(task_gateway=task_gateway),
    )
