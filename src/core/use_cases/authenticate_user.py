from __future__ import annotations

from core.domain.models import AuthenticatedSession, AuthenticationError
from core.domain.rules import ensure_user_active, normalize_email, verify_password
from core.ports.repositories import SessionPort, UserRepositoryPort


class AuthenticateUser:
    def __init__(self, user_repository: UserRepositoryPort, session_port: SessionPort) -> None:
        self.user_repository = user_repository
        self.session_port = session_port

    def execute(self, email: str, password: str) -> AuthenticatedSession:
        normalized = normalize_email(email)
        user = self.user_repository.get_by_email(normalized)
        if user is None or not verify_password(password=password, stored_hash=user.password_hash):
            raise AuthenticationError("Email ou senha invalidos.")
        ensure_user_active(user)
        token = self.session_port.issue_token(user.id)
        return AuthenticatedSession(token=token, user=user)
