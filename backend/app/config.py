"""Centralized configuration via pydantic-settings.

All secrets and environment-specific values are read from env vars
or a .env file. Defaults are safe for local development only.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── environment ──────────────────────────────────────────────
    ENVIRONMENT: Literal["dev", "staging", "production"] = "dev"

    # ── database ─────────────────────────────────────────────────
    DATABASE_URL: str = f"sqlite:///{ROOT_DIR / 'backend' / 'tracelink.sqlite3'}"
    DB_PATH: str = str(ROOT_DIR / "backend" / "tracelink.sqlite3")

    # ── Firebase ─────────────────────────────────────────────────
    FIREBASE_PROJECT_ID: str = "tracelink-793ba"
    # In production: paste full serviceAccountKey.json content as a string
    # In dev: leave empty and it falls back to the local JSON file
    FIREBASE_SERVICE_ACCOUNT_JSON: str = ""
    FIREBASE_SERVICE_ACCOUNT_PATH: str = str(ROOT_DIR / "backend" / "serviceAccountKey.json")
    GOOGLE_APPLICATION_CREDENTIALS: str = str(ROOT_DIR / "backend" / "serviceAccountKey.json")

    # ── CORS ─────────────────────────────────────────────────────
    CORS_ORIGINS: str = "*"

    # ── default admin seed ────────────────────────────────────────
    DEFAULT_ADMIN_EMAIL: str = "harshjain0621@gmail.com"
    DEFAULT_ADMIN_PASSWORD: str = "FIREBASE_AUTH"

    # ── rate limiting ─────────────────────────────────────────────
    LOGIN_RATE_LIMIT_PER_MINUTE: int = 10


settings = Settings()

if settings.ENVIRONMENT == "production":
    if settings.CORS_ORIGINS.strip() in {"", "*"}:
        raise RuntimeError("CORS_ORIGINS must be restricted in production")
