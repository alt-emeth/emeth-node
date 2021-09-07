import * as knex from 'knex'

const migration = {
  async up (knex: knex.Knex): Promise<void> {
    await knex.schema.raw('CREATE TABLE IF NOT EXISTS jobs (jobId TEXT PRIMARY KEY, assignedNode TEXT, status INTEGER, assignedBlock INTEGER, numOfAttempt INTEGER, createdAt INTEGER, updatedAt INTEGER)')
    await knex.schema.raw('CREATE TABLE IF NOT EXISTS lastWatchedBlock (id INTEGER PRIMARY KEY, blockNumber INTEGER)')
    await knex.schema.raw('CREATE TABLE IF NOT EXISTS workers (ipAddress TEXT PRIMARY KEY, port INTEGER, batchSize INTEGER, powerCapacity INTEGER)')
    await knex.schema.raw('CREATE TABLE IF NOT EXISTS lastNodeSlotIndex (id INTEGER PRIMARY KEY, slotIndex INTEGER)')
    await knex.schema.raw('CREATE TABLE IF NOT EXISTS masterports (port INTEGER PRIMARY KEY, jobId TEXT)')

    await knex.schema.raw('CREATE INDEX status_idx ON jobs (status)')
  },
  async down (knex: knex.Knex): Promise<void> {
    await knex.schema
      .dropTable('jobs')
      .dropTable('lastWatchedBlock')
      .dropTable('workers')
      .dropTable('lastNodeSlotIndex')
  }
}

export default migration
