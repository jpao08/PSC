from core.domain.models import InputData, Issue

def validate(data: InputData) -> list[Issue]:
    issues: list[Issue] = []
    if data.value < 0:
        issues.append(Issue(code="NEGATIVE_VALUE", message="Value must be non-negative."))
    return issues
