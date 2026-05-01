import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Standard connect-pg-simple table schema
const sql = `
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
) WITH (OIDS=FALSE);
ALTER TABLE "user_sessions" DROP CONSTRAINT IF EXISTS "user_sessions_pkey";
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");
`;

await pool.query(sql);
console.log("user_sessions table ready");
await pool.end();
