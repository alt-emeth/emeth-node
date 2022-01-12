import { Knex } from 'knex'

import migration1 from './migration1'

export async function getMigrations (loadExtensions: string[]): Promise<string[]> {
  return ['migration1']
}

export function getMigrationName (migration: string): string {
  return migration
}

export function getMigration (migration: string): Knex.Migration {
  switch (migration) {
    case 'migration1':
      return migration1
  }

  throw new Error('Migration not found')
}
