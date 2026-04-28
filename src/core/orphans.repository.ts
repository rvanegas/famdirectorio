import { db } from '../db/client'
import { orphans } from '../db/schema'
import type { Orphan } from './types'

export function findAll(): Orphan[] {
  return db.select().from(orphans).all() as Orphan[]
}
