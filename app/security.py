import os
import secrets
import string
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from passlib.context import CryptContext


JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("METAM_JWT_SECRET") or secrets.token_urlsafe(48)
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
