import * as knex from 'knex'
import { Arguments } from 'yargs'

import * as migrations_sqlite from '../migrations/sqlite3'
import * as migrations_mysql from '../migrations/mysql'


export interface DatabaseMiddlewareArguments {
  db: knex.Knex
}

const isExternalDb = (args: Arguments) => {
  if(args.external_db) {

    const connection = args.external_db as knex.Knex.MySqlConnectionConfig

    if(connection.host && connection.user && connection.password && connection.database) {
      return true
    }

  }
  return false
}

export default async function database (args: Arguments): Promise<void> {
  let db:knex.Knex

  if(isExternalDb(args)) {
    db = knex.knex({
      client: 'mysql',
      connection: args.external_db as knex.Knex.MySqlConnectionConfig,
      migrations: {
        migrationSource: migrations_mysql
      },
      useNullAsDefault: true
    })
  } else {
    db = knex.knex({
      client: 'sqlite3',
      connection: {
        filename: args.dbpath as string
      },
      migrations: {
        migrationSource: migrations_sqlite
      },
      useNullAsDefault: true,
      acquireConnectionTimeout: 1000 * 60
    })
  }

  // Migrate
  await db.migrate.latest()

  // Helth check
  const healthCheck = await db('health_check').first()
  if(healthCheck) {
    await db('health_check').update({ checked_at: new Date().getTime() })
  } else {
    await db('health_check').insert({ checked_at: new Date().getTime() })
  }

  const checked = await db('health_check').first()
  console.log("Successful database health check.", JSON.stringify(checked))

  args.db = db
}
