from pathlib import Path
from core.domain.models import InputData
from core.use_cases.run_pipeline import RunPipeline
from adapters.output.local_writer import LocalWriter

class InlineReader:
    def __init__(self, value: float) -> None:
        self.value = value

    def read(self) -> InputData:
        return InputData(value=self.value, meta=None)

def build_container(value: float):
    reader = InlineReader(value=value)
    writer = LocalWriter(out_dir=Path("out"))
    use_case = RunPipeline(reader=reader, writer=writer)
    return {"reader": reader, "writer": writer, "use_case": use_case}
