import "server-only";
import mysql, { type Pool } from "mysql2/promise";

const DB_HOST = (process.env.DB_HOST ?? "localhost").trim();
const DB_USER = (process.env.DB_USER ?? "root").trim();
const DB_PASS = process.env.DB_PASS ?? "";
const DB_NAME = (process.env.DB_NAME ?? "").trim();
const DB_PORT = Number(process.env.DB_PORT ?? 3306);
const DB_CONNECT_TIMEOUT = Number(process.env.DB_CONNECT_TIMEOUT ?? 5000);

function assertDbEnv(): void {
  if (!DB_NAME) {
    throw new Error("缺少数据库配置：请在 .env 中设置 DB_NAME");
  }
}

declare global {
  var __mysqlPool__: Pool | undefined;
}

async function createDatabaseIfMissing(): Promise<void> {
  assertDbEnv();
  const connection = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    port: DB_PORT,
    connectTimeout: DB_CONNECT_TIMEOUT,
    multipleStatements: false,
  });

  try {
    await connection.query(
      "CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      [DB_NAME],
    );
  } finally {
    await connection.end();
  }
}

export async function getDbPool(): Promise<Pool> {
  if (globalThis.__mysqlPool__) {
    return globalThis.__mysqlPool__;
  }

  await createDatabaseIfMissing();

  const pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    port: DB_PORT,
    connectTimeout: DB_CONNECT_TIMEOUT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: false,
  });

  globalThis.__mysqlPool__ = pool;
  return pool;
}
