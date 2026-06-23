import pg from "pg";

const { Client } = pg;

const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_PUBLIC_URL or DATABASE_URL is required");
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const queries = [
  "select count(*) as jobs from jobs",
  "select count(*) as snapshots from comms_job_snapshots",
  "select count(*) as states from comms_job_states",
  "select count(*) as queue from comms_queue",
];

try {
  await client.connect();
  for (const q of queries) {
    const result = await client.query(q);
    console.log(q, result.rows[0]);
  }
} finally {
  await client.end();
}
