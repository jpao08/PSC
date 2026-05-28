from core.domain.models import InputData
from core.domain.rules import validate

def test_negative_value_creates_issue():
    issues = validate(InputData(value=-1))
    assert len(issues) == 1
    assert issues[0].code == "NEGATIVE_VALUE"
