from core.use_cases.run_pipeline import RunPipeline
from core.domain.models import InputData, Report

class FakeReader:
    def read(self) -> InputData:
        return InputData(value=-1)

class FakeWriter:
    def __init__(self):
        self.written: Report | None = None
    def write(self, report: Report) -> None:
        self.written = report

def test_use_case_writes_report():
    writer = FakeWriter()
    uc = RunPipeline(reader=FakeReader(), writer=writer)
    report = uc.execute()
    assert writer.written is not None
    assert len(report.issues) == 1
