import json
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.orm import Session as DatabaseSession
from .database import Product, Session


def seed(connection=None):
    session = DatabaseSession(bind=connection) if connection is not None else Session()
    with session as db, db.begin():
        if db.scalar(select(Product.id).limit(1)):
            return
        records = json.loads(
            (Path(__file__).resolve().parents[2] / "data/products.json").read_text()
        )
        db.add_all(Product(**p) for p in records)
