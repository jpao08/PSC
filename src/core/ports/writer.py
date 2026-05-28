from typing import Protocol
from core.domain.models import Report

class WriterPort(Protocol):
    def write(self, report: Report) -> None: ...
