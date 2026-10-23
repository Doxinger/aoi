import asyncio
import json
import logging

import asyncpg

from .config import MIGRATIONS_DIR, database_url, db_pool_max, db_pool_min, purge_interval

logger = logging.getLogger("aoi.db")

_pool = None
_purge_task = None


async def _init_connection(conn):
    for typename in ("json", "jsonb"):
        await conn.set_type_codec(typename, encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def init_db():
    global _pool, _purge_task
    schema = (MIGRATIONS_DIR / "schema.sql").read_text(encoding="utf-8")
    _pool = await asyncpg.create_pool(
        database_url(),
        min_size=db_pool_min(),
        max_size=db_pool_max(),
        max_inactive_connection_lifetime=300,
        command_timeout=20,
        init=_init_connection,
    )
    async with _pool.acquire() as conn:
        await conn.execute(schema)
    _purge_task = asyncio.create_task(_purge_loop())
    logger.info("База данных подключена: пул %d-%d", db_pool_min(), db_pool_max())


async def close_db():
    global _pool, _purge_task
    if _purge_task:
        _purge_task.cancel()
        _purge_task = None
    if _pool:
        await _pool.close()
        _pool = None


def pool():
    if _pool is None:
        raise RuntimeError("База данных не инициализирована")
    return _pool


async def fetch(sql, *args):
    async with pool().acquire() as conn:
        return await conn.fetch(sql, *args)


async def fetchrow(sql, *args):
    async with pool().acquire() as conn:
        return await conn.fetchrow(sql, *args)


async def fetchval(sql, *args):
    async with pool().acquire() as conn:
        return await conn.fetchval(sql, *args)


async def execute(sql, *args):
    async with pool().acquire() as conn:
        return await conn.execute(sql, *args)


async def _purge_loop():
    while True:
        await asyncio.sleep(purge_interval())
        try:
            await execute(
                "DELETE FROM sessions WHERE expires_at < now() - interval '7 days' "
                "OR revoked_at < now() - interval '7 days'"
            )
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.error("Очистка сессий не выполнена: %s", error)
