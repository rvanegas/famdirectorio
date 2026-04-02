import { db } from '../db/client'
import { familyNotes } from '../db/schema'
import { eq } from 'drizzle-orm'

export type FamilyNoteRow = typeof familyNotes.$inferSelect

export function findAll(): FamilyNoteRow[] {
  return db.select().from(familyNotes).all()
}

export function findByFamily(familyId: number): FamilyNoteRow[] {
  return db.select().from(familyNotes).where(eq(familyNotes.familyId, familyId)).all()
}

export function create(familyId: number, content: string): FamilyNoteRow {
  const row = db.insert(familyNotes).values({ familyId, content }).returning().get()!
  return row
}

export function remove(id: number): void {
  db.delete(familyNotes).where(eq(familyNotes.id, id)).run()
}
