from pathlib import Path
from core.domain.models import Report

class LocalWriter:
    def __init__(self, out_dir: Path) -> None:
        self.out_dir = out_dir
        self.out_dir.mkdir(parents=True, exist_ok=True)

    def write(self, report: Report) -> None:
        out_file = self.out_dir / "report.txt"
        lines = ["Report", "------", f"Issues: {len(report.issues)}"]
        for i in report.issues:
            lines.append(f"- {i.code}: {i.message}")
        out_file.write_text("\n".join(lines), encoding="utf-8")
