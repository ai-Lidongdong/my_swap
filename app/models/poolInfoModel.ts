import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDbPool } from "@/app/lib/mysql";

export type Address = `0x${string}`;

export interface PoolInfoContract {
  pool: Address;
  token0: Address;
  token1: Address;
  index: number;
  fee: number;
  feeProtocol: number;
  tickLower: number;
  tickUpper: number;
  tick: number;
  sqrtPriceX96: bigint;
  liquidity: bigint;
}

export interface PoolInfoRow {
  poolAddress: Address;
  token0: Address;
  token1: Address;
  poolIndex: number;
  fee: number;
  feeProtocol: number;
  tickLower: number;
  tickUpper: number;
  tick: number;
  sqrtPriceX96: string;
  liquidity: string;
}

export interface PoolInfoPageResult {
  list: PoolInfoRow[];
  total: number;
  page: number;
  pageSize: number;
}

type PoolInfoDbRow = RowDataPacket & {
  pool_address: Address;
  token0: Address;
  token1: Address;
  pool_index: number;
  fee: number;
  fee_protocol: number;
  tick_lower: number;
  tick_upper: number;
  tick: number;
  sqrt_price_x96: string;
  liquidity: string;
};

const TABLE_NAME = "pool_infos";

declare global {
  var __poolInfoTableInitPromise__: Promise<void> | undefined;
}

const createPoolInfoTableSql = `
  CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    pool_address VARCHAR(42) NOT NULL,
    token0 VARCHAR(42) NOT NULL,
    token1 VARCHAR(42) NOT NULL,
    pool_index INT UNSIGNED NOT NULL,
    fee MEDIUMINT UNSIGNED NOT NULL,
    fee_protocol TINYINT UNSIGNED NOT NULL,
    tick_lower MEDIUMINT NOT NULL,
    tick_upper MEDIUMINT NOT NULL,
    tick MEDIUMINT NOT NULL,
    sqrt_price_x96 DECIMAL(50, 0) NOT NULL,
    liquidity DECIMAL(39, 0) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_pool_address (pool_address),
    KEY idx_token_pair (token0, token1),
    KEY idx_pool_index (pool_index)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const checkPoolInfoTableExistsSql = `
  SELECT 1
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = ?
  LIMIT 1
`;

export function toPoolInfoRow(input: PoolInfoContract): PoolInfoRow {
  return {
    poolAddress: input.pool,
    token0: input.token0,
    token1: input.token1,
    poolIndex: input.index,
    fee: input.fee,
    feeProtocol: input.feeProtocol,
    tickLower: input.tickLower,
    tickUpper: input.tickUpper,
    tick: input.tick,
    sqrtPriceX96: input.sqrtPriceX96.toString(),
    liquidity: input.liquidity.toString(),
  };
}

export async function ensurePoolInfoTableInitialized(): Promise<void> {
  if (!globalThis.__poolInfoTableInitPromise__) {
    globalThis.__poolInfoTableInitPromise__ = (async () => {
      const pool = await getDbPool();
      const [rows] = await pool.query<RowDataPacket[]>(checkPoolInfoTableExistsSql, [
        TABLE_NAME,
      ]);

      if (rows.length > 0) {
        console.log(`[mysql] table exists: ${TABLE_NAME}`);
        return;
      }

      await pool.query(createPoolInfoTableSql);
      console.log(`[mysql] table ready: ${TABLE_NAME}`);
    })().catch((error) => {
      // 初始化失败后允许后续请求重试，避免一直持有 rejected Promise
      globalThis.__poolInfoTableInitPromise__ = undefined;
      throw error;
    });
  }
  await globalThis.__poolInfoTableInitPromise__;
}

export async function upsertPoolInfo(row: PoolInfoRow): Promise<void> {
  await ensurePoolInfoTableInitialized();
  const pool = await getDbPool();

  const sql = `
    INSERT INTO ${TABLE_NAME} (
      pool_address, token0, token1, pool_index,
      fee, fee_protocol, tick_lower, tick_upper, tick,
      sqrt_price_x96, liquidity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      token0 = VALUES(token0),
      token1 = VALUES(token1),
      pool_index = VALUES(pool_index),
      fee = VALUES(fee),
      fee_protocol = VALUES(fee_protocol),
      tick_lower = VALUES(tick_lower),
      tick_upper = VALUES(tick_upper),
      tick = VALUES(tick),
      sqrt_price_x96 = VALUES(sqrt_price_x96),
      liquidity = VALUES(liquidity),
      updated_at = CURRENT_TIMESTAMP
  `;

  await pool.execute<ResultSetHeader>(sql, [
    row.poolAddress,
    row.token0,
    row.token1,
    row.poolIndex,
    row.fee,
    row.feeProtocol,
    row.tickLower,
    row.tickUpper,
    row.tick,
    row.sqrtPriceX96,
    row.liquidity,
  ]);
}

export async function getPoolInfoByAddress(
  poolAddress: Address,
): Promise<PoolInfoRow | null> {
  await ensurePoolInfoTableInitialized();
  const pool = await getDbPool();

  const [rows] = await pool.query<PoolInfoDbRow[]>(
    `SELECT * FROM ${TABLE_NAME} WHERE pool_address = ? LIMIT 1`,
    [poolAddress],
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    poolAddress: row.pool_address,
    token0: row.token0,
    token1: row.token1,
    poolIndex: row.pool_index,
    fee: row.fee,
    feeProtocol: row.fee_protocol,
    tickLower: row.tick_lower,
    tickUpper: row.tick_upper,
    tick: row.tick,
    sqrtPriceX96: row.sqrt_price_x96,
    liquidity: row.liquidity,
  };
}

export async function listPoolInfoAddresses(): Promise<Address[]> {
  await ensurePoolInfoTableInitialized();
  const pool = await getDbPool();

  const [rows] = await pool.query<(RowDataPacket & { pool_address: Address })[]>(
    `SELECT pool_address FROM ${TABLE_NAME}`,
  );

  return rows.map((row) => row.pool_address);
}

export async function listPoolInfosByPage(
  page: number,
  pageSize: number,
): Promise<PoolInfoPageResult> {
  await ensurePoolInfoTableInitialized();
  const pool = await getDbPool();

  const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const normalizedPageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10;
  const offset = (normalizedPage - 1) * normalizedPageSize;

  const [countRows] = await pool.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM ${TABLE_NAME}`,
  );
  const total = countRows[0]?.total ?? 0;

  const [rows] = await pool.query<PoolInfoDbRow[]>(
    `
      SELECT
        pool_address, token0, token1, pool_index, fee, fee_protocol,
        tick_lower, tick_upper, tick, sqrt_price_x96, liquidity
      FROM ${TABLE_NAME}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `,
    [normalizedPageSize, offset],
  );

  const list: PoolInfoRow[] = rows.map((row) => ({
    poolAddress: row.pool_address,
    token0: row.token0,
    token1: row.token1,
    poolIndex: row.pool_index,
    fee: row.fee,
    feeProtocol: row.fee_protocol,
    tickLower: row.tick_lower,
    tickUpper: row.tick_upper,
    tick: row.tick,
    sqrtPriceX96: row.sqrt_price_x96,
    liquidity: row.liquidity,
  }));

  return {
    list,
    total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
}

export async function listAllPoolInfos(): Promise<PoolInfoRow[]> {
  await ensurePoolInfoTableInitialized();
  const pool = await getDbPool();

  const [rows] = await pool.query<PoolInfoDbRow[]>(
    `
      SELECT
        pool_address, token0, token1, pool_index, fee, fee_protocol,
        tick_lower, tick_upper, tick, sqrt_price_x96, liquidity
      FROM ${TABLE_NAME}
      ORDER BY id DESC
    `,
  );

  return rows.map((row) => ({
    poolAddress: row.pool_address,
    token0: row.token0,
    token1: row.token1,
    poolIndex: row.pool_index,
    fee: row.fee,
    feeProtocol: row.fee_protocol,
    tickLower: row.tick_lower,
    tickUpper: row.tick_upper,
    tick: row.tick,
    sqrtPriceX96: row.sqrt_price_x96,
    liquidity: row.liquidity,
  }));
}
