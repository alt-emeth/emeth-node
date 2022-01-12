import * as knex from 'knex'

const migration = {
  async up (knex: knex.Knex): Promise<void> {
    await knex.schema.raw("CREATE TABLE IF NOT EXISTS jobs (job_id TEXT, data_size_mb INTEGER, program_id INTEGER NOT NULL, status INTEGER NOT NULL, num_attempt TINYINT NOT NULL DEFAULT 0, PRIMARY KEY(job_id))")
    await knex.schema.raw('CREATE TABLE IF NOT EXISTS contributions (job_id TEXT, num_attempt TINYINT, worker_address TEXT, master_address TEXT NOT NULL, status TINYINT NOT NULL DEFAULT 0, started_at BIGINT NOT NULL, ended_at BIGINT, contribution INTEGER, PRIMARY KEY(job_id, num_attempt, worker_address))')
    await knex.schema.raw('CREATE TABLE IF NOT EXISTS last_watched_job_index (job_index INTEGER PRIMARY KEY)')

    await knex.schema.raw('CREATE TABLE IF NOT EXISTS workers (url TEXT PRIMARY KEY, address TEXT, power_capacity INTEGER)')
    await knex.schema.raw('CREATE TABLE IF NOT EXISTS last_node_slot_index (slot_index INTEGER)')

    await knex.schema.raw('CREATE TABLE IF NOT EXISTS health_check (checked_at INTEGER)')

    await knex.schema.raw('CREATE INDEX IF NOT EXISTS status_idx ON jobs (status)')
  },
  async down (knex: knex.Knex): Promise<void> {
    await knex.schema
      .dropTableIfExists('jobs')
      .dropTableIfExists('contributions')
      .dropTableIfExists('last_watched_job_index')
      .dropTableIfExists('workers')
      .dropTableIfExists('last_node_slot_index')
      .dropTableIfExists('health_check')
  }
}

export default migration
