from backend.app.database import Base, engine
from backend.app.seed import seed

Base.metadata.create_all(engine)
seed()
