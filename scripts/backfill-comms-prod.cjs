const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_PUBLIC_URL or DATABASE_URL');
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const upsertSnapshots = await client.query(`
    INSERT INTO comms_job_snapshots (
      external_job_id,
      account_code,
      client_name,
      site_name,
      job_type,
      status,
      priority,
      short_description,
      engineer_name,
      last_visit_date,
      next_action_due_date,
      created_date,
      last_updated_date,
      raw_import_metadata,
      import_batch_id,
      last_synced_at
    )
    SELECT
      j.job_id,
      j.account_code,
      ca.account_name,
      j.site_name,
      j.job_type,
      j.status,
      j.priority,
      j.short_description,
      j.engineer_name,
      j.last_visit_date,
      j.next_action_due_date,
      j.created_date,
      j.last_updated_date,
      json_build_object(
        'sourcePortalStatus', j.source_portal_status,
        'isWorkshop', j.is_workshop,
        'importBatchId', j.import_batch_id
      )::text,
      j.import_batch_id,
      NOW()
    FROM jobs j
    LEFT JOIN customer_accounts ca ON ca.account_code = j.account_code
    ON CONFLICT (external_job_id) DO UPDATE SET
      account_code = EXCLUDED.account_code,
      client_name = EXCLUDED.client_name,
      site_name = EXCLUDED.site_name,
      job_type = EXCLUDED.job_type,
      status = EXCLUDED.status,
      priority = EXCLUDED.priority,
      short_description = EXCLUDED.short_description,
      engineer_name = EXCLUDED.engineer_name,
      last_visit_date = EXCLUDED.last_visit_date,
      next_action_due_date = EXCLUDED.next_action_due_date,
      created_date = EXCLUDED.created_date,
      last_updated_date = EXCLUDED.last_updated_date,
      raw_import_metadata = EXCLUDED.raw_import_metadata,
      import_batch_id = EXCLUDED.import_batch_id,
      last_synced_at = NOW();
  `);

  const insertStates = await client.query(`
    INSERT INTO comms_job_states (
      external_job_id,
      last_known_status,
      next_comms_due_at,
      created_at,
      updated_at
    )
    SELECT
      j.job_id,
      j.status,
      NOW(),
      NOW(),
      NOW()
    FROM jobs j
    LEFT JOIN comms_job_states s ON s.external_job_id = j.job_id
    WHERE s.external_job_id IS NULL;
  `);

  const counts = await client.query(`
    SELECT
      (SELECT count(*)::int FROM jobs) AS jobs,
      (SELECT count(*)::int FROM comms_job_snapshots) AS snapshots,
      (SELECT count(*)::int FROM comms_job_states) AS states;
  `);

  console.log(
    JSON.stringify({
      snapshotsCommand: upsertSnapshots.command,
      snapshotsAffected: upsertSnapshots.rowCount,
      statesInserted: insertStates.rowCount,
      counts: counts.rows[0],
    })
  );

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
