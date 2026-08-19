import logging
import os
import secrets
import string
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from jose import jwt
from passlib.context import CryptContext


logger = logging.getLogger(__name__)


def resolve_jwt_secret(env_var: str, *, purpose: str) -> str:
    """Read a JWT signing secret from the environment.

    Never falls back to a fixed, source-visible literal: an attacker who reads
    the repository could otherwise forge valid tokens for any user. If the
    environment variable is unset, a random secret is generated for this
    process instead, so tokens simply won't survive a restart until a real
    secret is configured.
    """
    value = os.getenv(env_var)
    if value:
        return value
    generated = secrets.token_urlsafe(32)
    logger.warning(
        "%s is not set; generated a random secret for %s. Sessions will not persist across "
        "restarts. Set %s explicitly for any shared, staging, or production deployment.",
        env_var, purpose, env_var,
    )
    return generated


JWT_SECRET = resolve_jwt_secret("JWT_SECRET", purpose="the primary platform JWT")
JWT_ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


PASSWORD_EXPIRY_DAYS = 90
PASSWORD_EXPIRY_WARNING_DAYS = 10


def password_policy() -> dict:
    return {
        "min_length": 12,
        "requires_uppercase": True,
        "requires_lowercase": True,
        "requires_number": True,
        "requires_special": True,
        "expires_every_days": PASSWORD_EXPIRY_DAYS,
        "expiry_warning_days": PASSWORD_EXPIRY_WARNING_DAYS,
        "last_password_reuse_blocked": 3,
    }


def validate_password_strength(password: str) -> list[str]:
    errors: list[str] = []
    if len(password) < 12:
        errors.append("Use at least 12 characters.")
    if not any(char.isupper() for char in password):
        errors.append("Include at least one uppercase letter.")
    if not any(char.islower() for char in password):
        errors.append("Include at least one lowercase letter.")
    if not any(char.isdigit() for char in password):
        errors.append("Include at least one number.")
    if not any(char in string.punctuation for char in password):
        errors.append("Include at least one special character.")
    return errors


def generate_secure_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()-_=+"
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if not validate_password_strength(password):
            return password


def create_token(
    subject: str,
    tenant_id: str,
    permissions: list[str],
    minutes: int = 30,
    claims: dict[str, object] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, object] = {
        "jti": str(uuid4()),
        "sub": subject,
        "tenant_id": tenant_id,
        "permissions": permissions,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
    }
    if claims:
        payload.update(claims)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
