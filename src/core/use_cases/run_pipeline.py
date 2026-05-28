from core.domain.models import Report
from core.domain.rules import validate
from core.ports.reader import ReaderPort
from core.ports.writer import WriterPort

class RunPipeline:
    def __init__(self, reader: ReaderPort, writer: WriterPort) -> None:
        self.reader = reader
        self.writer = writer

    def execute(self) -> Report:
        data = self.reader.read()
        issues = validate(data)
        report = Report(issues=issues)
        self.writer.write(report)
        return report
