import { db } from '../db/client'
import { media, members } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { MediaAsset } from './types'

function toMedia(row: typeof media.$inferSelect): MediaAsset {
  return {
    ...row,
    mediaType: row.mediaType ?? null,
    isPrimary: row.isPrimary === 1,
  }
}

export function findByMember(memberId: number): MediaAsset[] {
  return db.select().from(media).where(eq(media.memberId, memberId)).all().map(toMedia)
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

export function create(
  memberId: number,
  filePath: string,
  options: { mediaType?: MediaAsset['mediaType']; caption?: string; isPrimary?: boolean } = {},
): MediaAsset {
  // If setting as primary, clear existing primary first
  if (options.isPrimary) {
    db.update(media).set({ isPrimary: 0 }).where(eq(media.memberId, memberId)).run()
  }
  const result = db
    .insert(media)
    .values({
      memberId,
      filePath,
      mediaType: options.mediaType ?? 'photo',
      caption: options.caption ?? null,
      isPrimary: options.isPrimary ? 1 : 0,
    })
    .returning()
    .get()
  return toMedia(result)
}

export function setPrimary(mediaId: number): boolean {
  const asset = db.select().from(media).where(eq(media.id, mediaId)).get()
  if (!asset) return false
  db.update(media).set({ isPrimary: 0 }).where(eq(media.memberId, asset.memberId)).run()
  db.update(media).set({ isPrimary: 1 }).where(eq(media.id, mediaId)).run()
  return true
}

export function remove(id: number): boolean {
  const result = db.delete(media).where(eq(media.id, id)).run()
  return result.changes > 0
}
