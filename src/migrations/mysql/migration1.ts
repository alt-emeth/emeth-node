import * as knex from 'knex'

const migration = {
  async up (knex: knex.Knex): Promise<void> {
    await knex.schema.raw('CREATE TABLE IF NOT EXISTS jobs (job_id VARCHAR(256), data_size_mb INT, program_id INT NOT NULL, status TINYINT NOT NULL, num_attempt TINYINT NOT NULL DEFAULT 0, PRIMARY KEY(job_id), INDEX status_idx (status))')
    await knex.schema.raw('CREATE TABLE IF NOT EXISTS contributions (job_id VARCHAR(256), num_attempt TINYINT, worker_address VARCHAR(256), master_address VARCHAR(256) NOT NULL, status TINYINT NOT NULL DEFAULT 0, started_at BIGINT NOT NULL, ended_at BIGINT, contribution INT, PRIMARY KEY(job_id, num_attempt, worker_address))')
    await knex.schema.raw('CREATE TABLE IF NOT EXISTS last_watched_job_index (job_index INT PRIMARY KEY)')

    await knex.schema.raw('CREATE TABLE IF NOT EXISTS workers (url VARCHAR(256) PRIMARY KEY, address VARCHAR(256), power_capacity INT)')
    await knex.schema.raw('CREATE TABLE IF NOT EXISTS last_node_slot_index (slot_index BIGINT)')

    await knex.schema.raw('CREATE TABLE IF NOT EXISTS health_check (checked_at BIGINT)')
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
