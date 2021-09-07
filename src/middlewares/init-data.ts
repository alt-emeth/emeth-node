import { Arguments } from 'yargs'
import { DatabaseMiddlewareArguments } from './database'

export default async function initData (args: Arguments): Promise<void> {
  const db = (args as unknown as DatabaseMiddlewareArguments).db

  await db('masterports').delete()
}