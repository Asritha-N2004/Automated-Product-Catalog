"""Vercel ASGI entrypoint. Cloud writes require an attached durable database."""

import os
from fastapi import FastAPI
from fastapi.responses import JSONResponse


def create_app():
    if os.getenv("DATABASE_URL"):
        from backend.app.main import app as configured_app

        return configured_app
    setup = FastAPI(title="Freshwise deployment setup")

    @setup.get("/api/health")
    def health():
        return JSONResponse(
            {
                "status": "setup_required",
                "database_configured": False,
                "detail": "Database setup required: connect a Neon PostgreSQL database to this Vercel project, then redeploy.",
            },
            status_code=503,
        )

    @setup.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
    def setup_required(path: str):
        return JSONResponse(
            {
                "detail": "Database setup required: connect a Neon PostgreSQL database to this Vercel project, then redeploy. Your data is not stored in temporary server memory."
            },
            status_code=503,
        )

    return setup


app = create_app()
