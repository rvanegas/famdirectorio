import { db } from '../db/client'
import { media } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { MediaAsset } from './types'

function toMedia(row: typeof media.$inferSelect): MediaAsset {
  return {
    ...row,
    memberId: row.memberId ?? null,
    familyId: row.familyId ?? null,
    mediaType: row.mediaType ?? null,
    isPrimary: row.isPrimary === 1,
  }
}

export function findById(id: number): MediaAsset | null {
  const row = db.select().from(media).where(eq(media.id, id)).get()
  return row ? toMedia(row) : null
}

export function findAll(): MediaAsset[] {
  return db.select().from(media).all().map(toMedia)
}

export function findByMember(memberId: number): MediaAsset[] {
  return db.select().from(media).where(eq(media.memberId, memberId)).all().map(toMedia)
}

export function findByFamily(familyId: number): MediaAsset[] {
  return db.select().from(media).where(eq(media.familyId, familyId)).all().map(toMedia)
}

export function findPrimary(memberId: number): MediaAsset | null {
  const row = db
    .select()
    .from(media)
    .where(eq(media.memberId, memberId))
    .all()
    .find((m) => m.isPrimary === 1)
  return row ? toMedia(row) : null
}

export function findFamilyPrimary(familyId: number): MediaAsset | null {
  const row = db
    .select()
    .from(media)
    .where(eq(media.familyId, familyId))
    .all()
    .find((m) => m.isPrimary === 1)
  return row ? toMedia(row) : null
}

type CreateOptions = {
  mediaType?: MediaAsset['mediaType']
  caption?: string
  isPrimary?: boolean
} & ({ memberId: number; familyId?: never } | { familyId: number; memberId?: never })

export function create(filePath: string, options: CreateOptions): MediaAsset {
  const { memberId, familyId, mediaType, caption, isPrimary } = options
  if (isPrimary) {
    if (memberId != null) {
      db.update(media).set({ isPrimary: 0 }).where(eq(media.memberId, memberId)).run()
    } else {
      db.update(media).set({ isPrimary: 0 }).where(eq(media.familyId, familyId!)).run()
    }
  }
  const result = db
    .insert(media)
    .values({
      memberId: memberId ?? null,
      familyId: familyId ?? null,
      filePath,
      mediaType: mediaType ?? 'photo',
      caption: caption ?? null,
      isPrimary: isPrimary ? 1 : 0,
    })
    .returning()
    .get()
  return toMedia(result)
}

export function setPrimary(mediaId: number): boolean {
  const asset = db.select().from(media).where(eq(media.id, mediaId)).get()
  if (!asset) return false
  if (asset.memberId != null) {
    db.update(media).set({ isPrimary: 0 }).where(eq(media.memberId, asset.memberId)).run()
  } else if (asset.familyId != null) {
    db.update(media).set({ isPrimary: 0 }).where(eq(media.familyId, asset.familyId)).run()
  }
  db.update(media).set({ isPrimary: 1 }).where(eq(media.id, mediaId)).run()
  return true
}

export function remove(id: number): boolean {
  const result = db.delete(media).where(eq(media.id, id)).run()
  return result.changes > 0
}
