import os, secrets
from datetime import datetime, timedelta, timezone
import jwt
from argon2 import PasswordHasher
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .database import User, get_db

SECRET = os.getenv("JWT_SECRET")
if not SECRET:
    if os.getenv("ENVIRONMENT") == "production":
        raise RuntimeError("JWT_SECRET is required in production")
    SECRET = secrets.token_hex(32)
if len(SECRET) < 32:
    raise RuntimeError("JWT_SECRET must have at least 32 characters")
hasher = PasswordHasher()
bearer = HTTPBearer()


def token(uid, scope="api"):
    return jwt.encode(
        {
            "sub": str(uid),
            "scope": scope,
            "exp": datetime.now(timezone.utc)
            + timedelta(
                hours=8 if scope == "api" else 0, minutes=0 if scope == "api" else 1
            ),
        },
        SECRET,
        algorithm="HS256",
    )


def decode(value, scope="api"):
    try:
        p = jwt.decode(value, SECRET, algorithms=["HS256"])
        if p.get("scope") != scope:
            raise ValueError()
        return int(p["sub"])
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(401, "Invalid or expired token")


def current(
    auth: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)
):
    user = db.get(User, decode(auth.credentials))
    if not user:
        raise HTTPException(401, "User not found")
    return user
