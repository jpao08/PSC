from __future__ import annotations

import uuid
from typing import Any

from admin.users_app import AdminUserPayload, AdminUserRepository, verify_admin_password
from core.domain.rules import verify_password


class FakeResponse:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class FakeQuery:
    def __init__(self, client: "FakeClient", table_name: str) -> None:
        self.client = client
        self.table_name = table_name
        self.filters: list[tuple[str, Any]] = []
        self.in_filters: list[tuple[str, list[str]]] = []
        self.operation = "select"
        self.payload: dict[str, Any] | list[dict[str, Any]] | None = None

    def select(self, _columns: str) -> "FakeQuery":
        self.operation = "select"
        return self

    def insert(self, payload: dict[str, Any] | list[dict[str, Any]]) -> "FakeQuery":
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload: dict[str, Any]) -> "FakeQuery":
        self.operation = "update"
        self.payload = payload
        return self

    def delete(self) -> "FakeQuery":
        self.operation = "delete"
        return self

    def eq(self, field: str, value: Any) -> "FakeQuery":
        self.filters.append((field, value))
        return self

    def in_(self, field: str, values: list[str]) -> "FakeQuery":
        self.in_filters.append((field, values))
        return self

    def order(self, _field: str) -> "FakeQuery":
        return self

    def execute(self) -> FakeResponse:
        rows = self.client.tables.setdefault(self.table_name, [])
        if self.operation == "insert":
            payloads = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted: list[dict[str, Any]] = []
            for payload in payloads:
                row = dict(payload or {})
                if self.table_name == "users":
                    row.setdefault("id", str(uuid.uuid4()))
                rows.append(row)
                inserted.append(row)
            return FakeResponse(inserted)

        matched = [row for row in rows if self._matches(row)]
        if self.operation == "update":
            for row in matched:
                row.update(dict(self.payload or {}))
            return FakeResponse(matched)
        if self.operation == "delete":
            self.client.tables[self.table_name] = [row for row in rows if not self._matches(row)]
            return FakeResponse(matched)
        return FakeResponse(matched)

    def _matches(self, row: dict[str, Any]) -> bool:
        for field, value in self.filters:
            if row.get(field) != value:
                return False
        for field, values in self.in_filters:
            if row.get(field) not in values:
                return False
        return True


class FakeClient:
    def __init__(self) -> None:
        self.tables: dict[str, list[dict[str, Any]]] = {
            "users": [],
            "user_area_access": [],
            "areas": [],
        }

    def table(self, table_name: str) -> FakeQuery:
        return FakeQuery(self, table_name)


def test_admin_password_rejects_wrong_password() -> None:
    assert verify_admin_password("wrong", "secret") is False
    assert verify_admin_password("secret", "secret") is True


def test_admin_create_user_generates_password_hash_and_area_links() -> None:
    client = FakeClient()
    repository = AdminUserRepository(client=client)  # type: ignore[arg-type]
    created = repository.create_user(
        AdminUserPayload(
            email=" Gestor@Empresa.com ",
            name="Gestor",
            role="gestor_area",
            password="senha-segura",
            area_ids=["area-A", "area-B", "area-A"],
        )
    )

    user_row = client.tables["users"][0]
    assert created["email"] == "gestor@empresa.com"
    assert verify_password("senha-segura", user_row["password_hash"]) is True
    assert [row["area_id"] for row in client.tables["user_area_access"]] == ["area-A", "area-B"]


def test_admin_update_user_replaces_area_links() -> None:
    client = FakeClient()
    repository = AdminUserRepository(client=client)  # type: ignore[arg-type]
    client.tables["users"].append({
        "id": "user-1",
        "email": "old@example.com",
        "name": "Old",
        "role": "gestor_area",
        "password_hash": "hash",
        "area_id": "area-A",
        "is_active": True,
        "can_edit_projected_value": False,
    })
    client.tables["user_area_access"].extend([
        {"user_id": "user-1", "area_id": "area-A"},
        {"user_id": "user-1", "area_id": "area-B"},
    ])

    updated = repository.update_user(
        "user-1",
        AdminUserPayload(
            email="new@example.com",
            name="New",
            role="gestor_area",
            password=None,
            area_ids=["area-C"],
        ),
    )

    assert updated["area_ids"] == ["area-C"]
    assert client.tables["user_area_access"] == [{"user_id": "user-1", "area_id": "area-C"}]
