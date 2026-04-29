import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import type { Member, MediaAsset } from '../../core/types'
import type { BranchSection } from '../generator'
import { FONT, FONT_BLACK, FONT_ITALIC, type BranchPalette } from '../theme'
import { config } from '../../config'

type PDFDoc = InstanceType<typeof PDFDocument>

const MARGIN = 60
const PHOTO_SIZE = 100

function resolvePhoto(p: string | null): string | null {
  if (!p) return null
  if (path.isAbsolute(p)) return p
  return path.join(config.dir, p)
}

export interface NuclearFamily {
  heads: Member[]
  children: Member[]
  branch: BranchSection | null
  familyMedia: MediaAsset[]
  familyId: number | null
  notes: string[]
}

export function renderFamilyPage(doc: PDFDoc, family: NuclearFamily, bgPalette?: BranchPalette): void {
  const { width, height } = doc.page
  const palette = family.branch?.palette ?? bgPalette

  // Full-page light tint background
  if (palette) {
    doc.rect(0, 0, width, height).fill(palette.light)
  }

  // Top accent bar
  doc.rect(0, 0, width, 6).fill(palette?.medium ?? '#cccccc')

  // Branch / generation label (top right)
  if (family.branch) {
    const gen = family.heads[0]?.generation
    const genSuffix = gen != null ? `, GENERACIÓN ${gen}` : ''
    doc.font(FONT).fontSize(9).fillColor(palette?.medium ?? '#888888')
      .text(`RAMA ${family.branch.firstName.toUpperCase()}${genSuffix}`, MARGIN, 18, { align: 'right', width: width - MARGIN * 2 })
  }

  // --- Parents section ---
  const parentsY = 40
  if (family.heads.length === 1) {
    renderParentBlock(doc, family.heads[0], MARGIN, parentsY, width - MARGIN * 2)
  } else {
    const colWidth = (width - MARGIN * 2 - 20) / 2
    renderParentBlock(doc, family.heads[0], MARGIN, parentsY, colWidth)
    renderParentBlock(doc, family.heads[1], MARGIN + colWidth + 20, parentsY, colWidth)
  }

  // --- Children section ---
  const sepY = parentsY + PHOTO_SIZE + 30
  if (family.children.length > 0) {
    const childLabelY = sepY + 12
    doc.font(FONT).fontSize(10).fillColor('#888888')
      .text('Hijos', MARGIN, childLabelY)

    const childStartY = childLabelY + 18
    const CHILD_COLS = 3
    const COL_GAP = 16
    const CHILD_PHOTO = 64
    const colWidth = (width - MARGIN * 2 - COL_GAP * (CHILD_COLS - 1)) / CHILD_COLS
    const CHILD_CARD_H = CHILD_PHOTO + 8

    for (let i = 0; i < family.children.length; i++) {
      const child = family.children[i]
      const row = Math.floor(i / CHILD_COLS)
      const col = i % CHILD_COLS
      const cx = MARGIN + col * (colWidth + COL_GAP)
      const cy = childStartY + row * (CHILD_CARD_H + 12)

      if (cy + CHILD_CARD_H > height - 50) break

      const photoPath = resolvePhoto(child.photoPath ?? null)
      if (photoPath && fs.existsSync(photoPath)) {
        doc.image(photoPath, cx, cy, { width: CHILD_PHOTO, height: CHILD_PHOTO, cover: [CHILD_PHOTO, CHILD_PHOTO] })
      } else {
        doc.rect(cx, cy, CHILD_PHOTO, CHILD_PHOTO).fill('#eeeeee')
      }

      const textX = cx + CHILD_PHOTO + 10
      const textW = colWidth - CHILD_PHOTO - 10

      doc.font(FONT_BLACK).fontSize(12).fillColor('#1a1a2e')
        .text(child.firstName, textX, cy, { width: textW })
      if (child.lastName) {
        doc.font(FONT).fontSize(9).fillColor('#4a4a4a')
          .text(child.lastName, textX, doc.y, { width: textW })
      }

      let textY = doc.y + 2
      for (const value of [child.city, child.occupation]) {
        if (!value) continue
        doc.font(FONT).fontSize(8).fillColor('#1a1a2e')
          .text(value, textX, textY, { width: textW })
        textY += 12
      }
    }
  }

  // --- Family media section ---
  const photoMedia = family.familyMedia.filter(m => m.mediaType === 'photo' || m.mediaType == null)
  if (photoMedia.length > 0) {
    let mediaStartY: number
    if (family.children.length > 0) {
      const CHILD_COLS = 3
      const COL_GAP = 16
      const CHILD_PHOTO = 64
      const CHILD_CARD_H = CHILD_PHOTO + 8
      const childRows = Math.ceil(family.children.length / CHILD_COLS)
      const childLabelY = sepY + 12
      const childStartY = childLabelY + 18
      mediaStartY = childStartY + childRows * (CHILD_CARD_H + 12) + 8
    } else {
      mediaStartY = sepY + 12
    }

    const MEDIA_COLS = 4
    const MEDIA_GAP = 10
    const mediaColW = (width - MARGIN * 2 - MEDIA_GAP * (MEDIA_COLS - 1)) / MEDIA_COLS

    if (mediaStartY + 30 + PHOTO_SIZE <= height - 50) {
      doc.font(FONT).fontSize(10).fillColor('#888888').text('Álbum', MARGIN, mediaStartY + 12)
      mediaStartY += 30
    }

    for (let i = 0; i < photoMedia.length; i++) {
      const asset = photoMedia[i]
      const row = Math.floor(i / MEDIA_COLS)
      const col = i % MEDIA_COLS
      const mx = MARGIN + col * (mediaColW + MEDIA_GAP)
      const my = mediaStartY + row * (PHOTO_SIZE + MEDIA_GAP)

      if (my + PHOTO_SIZE > height - 50) break

      const filePath = path.isAbsolute(asset.filePath)
        ? asset.filePath
        : path.join(config.dir, asset.filePath)

      if (fs.existsSync(filePath)) {
        doc.image(filePath, mx, my, { width: PHOTO_SIZE, height: PHOTO_SIZE, cover: [PHOTO_SIZE, PHOTO_SIZE] })
      } else {
        doc.rect(mx, my, PHOTO_SIZE, PHOTO_SIZE).fill('#eeeeee')
      }
    }
  }

  // --- Notes ---
  if (family.notes.length > 0) {
    const CHILD_COLS = 3
    const CHILD_PHOTO = 64
    const CHILD_CARD_H = CHILD_PHOTO + 8
    const childLabelY = sepY + 12
    const childStartY = childLabelY + 18
    const childRows = Math.ceil(family.children.length / CHILD_COLS)

    let notesStartY: number
    if (photoMedia.length > 0) {
      const mediaStart = family.children.length > 0
        ? childStartY + childRows * (CHILD_CARD_H + 12) + 8
        : sepY + 12
      const MEDIA_COLS = 4
      const MEDIA_GAP = 10
      const mediaRows = Math.ceil(photoMedia.length / MEDIA_COLS)
      notesStartY = mediaStart + 30 + mediaRows * (PHOTO_SIZE + MEDIA_GAP) + 8
    } else if (family.children.length > 0) {
      notesStartY = childStartY + childRows * (CHILD_CARD_H + 12) + 8
    } else {
      notesStartY = sepY + 12
    }

    if (notesStartY + 30 < height - 50) {
      doc.font(FONT).fontSize(10).fillColor('#888888').text('Notas', MARGIN, notesStartY + 12)
      let ny = notesStartY + 30
      for (const note of family.notes) {
        if (ny + 12 > height - 50) break
        doc.font(FONT).fontSize(9).fillColor('#333333').text(note, MARGIN, ny, { width: width - MARGIN * 2 })
        ny += 14
      }
    }
  }

  // Page number footer
  doc.font(FONT).fontSize(9).fillColor('#aaaaaa')
    .text(String(doc.bufferedPageRange().count), 0, height - 40, { align: 'center', width })
}

function renderParentBlock(doc: PDFDoc, member: Member, x: number, y: number, w: number): void {
  const photoPath = resolvePhoto(member.photoPath ?? null)
  if (photoPath && fs.existsSync(photoPath)) {
    doc.image(photoPath, x, y, { width: PHOTO_SIZE, height: PHOTO_SIZE, cover: [PHOTO_SIZE, PHOTO_SIZE] })
  } else {
    doc.rect(x, y, PHOTO_SIZE, PHOTO_SIZE).fill('#dddddd')
    doc.font(FONT).fontSize(9).fillColor('#999999')
      .text('Sin foto', x, y + PHOTO_SIZE / 2 - 5, { width: PHOTO_SIZE, align: 'center' })
  }

  const textX = x + PHOTO_SIZE + 14
  const textW = w - PHOTO_SIZE - 14

  doc.font(FONT_BLACK).fontSize(20).fillColor('#1a1a2e')
    .text(member.firstName, textX, y, { width: textW })
  if (member.lastName) {
    doc.font(FONT).fontSize(15).fillColor('#4a4a4a')
      .text(member.lastName, textX, doc.y, { width: textW })
  }

  let textY = doc.y + 4
  for (const value of [member.city, member.occupation]) {
    if (!value) continue
    doc.font(FONT).fontSize(9).fillColor('#1a1a2e')
      .text(value, textX, textY, { width: textW })
    textY += 14
  }
}
