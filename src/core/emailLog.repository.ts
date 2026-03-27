import { db } from '../db/client'
import { emailLogs } from '../db/schema'
import type { NewEmailLog } from '../db/schema'
import { desc } from 'drizzle-orm'

export function logEmail(entry: Omit<NewEmailLog, 'id' | 'sentAt'>): void {
  db.insert(emailLogs).values(entry).run()
}

export function findAll() {
  return db.select().from(emailLogs).orderBy(desc(emailLogs.sentAt)).all()
}
