from dataclasses import dataclass
from typing import Any

@dataclass(frozen=True)
class InputData:
    value: float
    meta: dict[str, Any] | None = None

@dataclass(frozen=True)
class Issue:
    code: str
    message: str

@dataclass(frozen=True)
class Report:
    issues: list[Issue]
