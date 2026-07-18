from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from core.domain.models import BitrixUser
from core.ports.task_gateway import TaskGatewayPort
from adapters.output.supabase_bitrix_user_directory import SupabaseBitrixUserDirectory
from infra.bitrix_client import BitrixClient


BRAZIL_TZ = timezone(timedelta(hours=-3))


def _to_bitrix_deadline(due_date: date) -> str:
    # Keep deadline aligned with the selected calendar day in Brazil timezone.
    due_at = datetime.combine(due_date, time(hour=18, minute=0, second=0, microsecond=0))
    return due_at.replace(tzinfo=BRAZIL_TZ).isoformat(timespec="seconds")


class BitrixTaskGateway(TaskGatewayPort):
    def __init__(
        self,
        bitrix_client: BitrixClient,
        user_directory: SupabaseBitrixUserDirectory | None = None,
    ) -> None:
        self.bitrix_client = bitrix_client
        self.user_directory = user_directory

    def search_users(self, query: str, limit: int = 10) -> list[BitrixUser]:
        if self.user_directory is not None:
            users_from_supabase = self.user_directory.search_users(query=query, limit=limit)
            if users_from_supabase:
                return users_from_supabase

        rows = self.bitrix_client.search_users(query=query, limit=limit)
        users: list[BitrixUser] = []
        for row in rows:
            raw_id = row.get("ID")
            if raw_id is None:
                continue

            first_name = str(row.get("NAME") or "").strip()
            last_name = str(row.get("LAST_NAME") or "").strip()
            full_name = " ".join(part for part in [first_name, last_name] if part).strip()
            if not full_name:
                full_name = str(raw_id)

            raw_email = row.get("EMAIL")
            users.append(
                BitrixUser(
                    id=str(raw_id),
                    name=full_name,
                    email=str(raw_email).strip() if raw_email else None,
                )
            )
        return users

    def create_task(
        self,
        title: str,
        description: str,
        responsible_bitrix_user_id: str | None,
        due_date: date | None,
        creator_bitrix_user_id: str | None = None,
        observer_bitrix_user_ids: list[str] | None = None,
    ) -> str | None:
        fields = {
            "TITLE": title,
            "DESCRIPTION": description,
        }
        if responsible_bitrix_user_id:
            fields["RESPONSIBLE_ID"] = responsible_bitrix_user_id
        if due_date is not None:
            fields["DEADLINE"] = _to_bitrix_deadline(due_date)
        if creator_bitrix_user_id:
            fields["CREATED_BY"] = creator_bitrix_user_id
        if observer_bitrix_user_ids:
            fields["AUDITORS"] = observer_bitrix_user_ids
        return self.bitrix_client.create_task(fields)
