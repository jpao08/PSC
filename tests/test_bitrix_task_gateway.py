from __future__ import annotations

from datetime import date

from adapters.output.bitrix_task_gateway import BitrixTaskGateway


class FakeBitrixClient:
    def __init__(self) -> None:
        self.last_fields: dict[str, object] | None = None

    def create_task(self, fields: dict[str, object]) -> str:
        self.last_fields = fields
        return "BITRIX-1"

    def search_users(self, query: str, limit: int = 10) -> list[dict[str, object]]:
        return []


def test_create_task_sends_deadline_with_brazil_time() -> None:
    client = FakeBitrixClient()
    gateway = BitrixTaskGateway(bitrix_client=client)

    gateway.create_task(
        title="Titulo",
        description="Descricao",
        responsible_bitrix_user_id="42",
        due_date=date(2026, 6, 5),
    )

    assert client.last_fields is not None
    assert client.last_fields.get("DEADLINE") == "2026-06-05T18:00:00-03:00"


def test_create_task_without_due_date_does_not_send_deadline() -> None:
    client = FakeBitrixClient()
    gateway = BitrixTaskGateway(bitrix_client=client)

    gateway.create_task(
        title="Titulo",
        description="Descricao",
        responsible_bitrix_user_id="42",
        due_date=None,
    )

    assert client.last_fields is not None
    assert "DEADLINE" not in client.last_fields
