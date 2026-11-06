"""Optional Redis fan-out and short-lived real-time state; local fallback is explicit."""

import asyncio, json, logging, os
from collections import defaultdict

logger = logging.getLogger(__name__)
connections = defaultdict(set)
redis_client = None
subscriber = None
listener_task = None


async def local_emit(uid, event, data):
    if uid is None:
        for owner in list(connections):
            await local_emit(owner, event, data)
        return
    for ws in list(connections[uid]):
        try:
            await ws.send_json({"event": event, "data": data})
        except Exception:
            connections[uid].discard(ws)


async def listen():
    async for message in subscriber.listen():
        if message["type"] == "message":
            payload = json.loads(message["data"])
            await local_emit(payload["uid"], payload["event"], payload["data"])


async def start():
    global redis_client, subscriber, listener_task
    if not os.getenv("REDIS_URL"):
        return
    import redis.asyncio as redis

    redis_client = redis.from_url(
        os.environ["REDIS_URL"], decode_responses=True, socket_connect_timeout=3
    )
    await redis_client.ping()
    subscriber = redis_client.pubsub()
    await subscriber.subscribe("freshwise:events")
    listener_task = asyncio.create_task(listen())


async def stop():
    if listener_task:
        listener_task.cancel()
        try:
            await listener_task
        except asyncio.CancelledError:
            pass
    if subscriber:
        await subscriber.aclose()
    if redis_client:
        await redis_client.aclose()


async def emit(uid, event, data):
    if redis_client:
        message = {"uid": uid, "event": event, "data": data}
        try:
            # Private state uses user-scoped keys and expires after five minutes.
            await redis_client.setex(
                f"freshwise:state:{uid}:{event}", 300, json.dumps(data)
            )
            await redis_client.publish("freshwise:events", json.dumps(message))
            return
        except Exception:
            logger.exception("Redis publish failed; using local connection fallback")
    await local_emit(uid, event, data)
