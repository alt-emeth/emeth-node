import * as knex from 'knex'
import { Arguments } from 'yargs'

import * as migrations from '../migrations'

export interface DatabaseMiddlewareArguments {
  db: knex.Knex
}

export default function database (args: Arguments): void {
  const db = knex.knex({
    client: 'sqlite3',
    connection: {
      filename: args.dbpath as string
    },
    migrations: {
      migrationSource: migrations
    },
    useNullAsDefault: true
  })

  // HACK
  return db.migrate.latest().then(() => {
    args.db = db
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  }) as unknown as void
}
