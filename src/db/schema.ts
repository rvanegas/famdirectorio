import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const members = sqliteTable('members', {
  id: integer('id').primaryKey({ autoIncrement: false }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  email: text('email'),
  phone: text('phone'),
  city: text('city'),
  occupation: text('occupation'),
  attended2023: integer('attended_2023'),
  isAlive: integer('is_alive').notNull().default(1),
  earlyDeath: integer('early_death').default(0),
  isRoot: integer('is_root').default(0),
  seniority: integer('seniority'),
  generation: integer('generation'),
  instagram: text('instagram'),
  birthday: text('birthday'),
  photoPath: text('photo_path'),
  notes: text('notes'),
  descVerifiedAt: text('desc_verified_at'),
  requestedAt: text('requested_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

export const relationships = sqliteTable('relationships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fromMemberId: integer('from_member_id')
    .notNull()
    .references(() => members.id),
  toMemberId: integer('to_member_id')
    .notNull()
    .references(() => members.id),
  type: text('type', { enum: ['child', 'spouse'] }).notNull(),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export const nuclearFamilies = sqliteTable('nuclear_families', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parent1Id: integer('parent1_id').notNull().references(() => members.id),
  parent2Id: integer('parent2_id').references(() => members.id),
  verifiedAt: text('verified_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export const media = sqliteTable('media', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  memberId: integer('member_id').references(() => members.id),
  familyId: integer('family_id').references(() => nuclearFamilies.id),
  filePath: text('file_path').notNull(),
  mediaType: text('media_type', { enum: ['photo', 'document', 'video'] }),
  caption: text('caption'),
  isPrimary: integer('is_primary').default(0),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export const emailLogs = sqliteTable('email_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  memberId: integer('member_id').references(() => members.id),
  toEmail: text('to_email').notNull(),
  template: text('template').notNull(),
  subject: text('subject').notNull(),
  pdfName: text('pdf_name'),
  status: text('status', { enum: ['sent', 'error'] }).notNull(),
  error: text('error'),
  sentAt: text('sent_at').default(sql`(datetime('now'))`),
})

export type Member = typeof members.$inferSelect
export type NewMember = typeof members.$inferInsert
export type Relationship = typeof relationships.$inferSelect
export type NewRelationship = typeof relationships.$inferInsert
export type Media = typeof media.$inferSelect
export type NewMedia = typeof media.$inferInsert
export type NuclearFamily = typeof nuclearFamilies.$inferSelect
export type NewNuclearFamily = typeof nuclearFamilies.$inferInsert
export const pdfSettings = sqliteTable('pdf_settings', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
})

export type EmailLog = typeof emailLogs.$inferSelect
export type NewEmailLog = typeof emailLogs.$inferInsert

export const familyNotes = sqliteTable('family_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  familyId: integer('family_id').notNull().references(() => nuclearFamilies.id),
  content: text('content').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export type FamilyNote = typeof familyNotes.$inferSelect
export type NewFamilyNote = typeof familyNotes.$inferInsert

export const orphans = sqliteTable('orphans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  birthday: text('birthday'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export type Orphan = typeof orphans.$inferSelect
export type NewOrphan = typeof orphans.$inferInsert
