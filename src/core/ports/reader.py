from typing import Protocol
from core.domain.models import InputData

class ReaderPort(Protocol):
    def read(self) -> InputData: ...
