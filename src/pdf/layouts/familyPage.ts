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
const ALBUM_ROW_H = 165
const ALBUM_GAP = 10
const BOTTOM_MARGIN = 50

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

function renderPageChrome(doc: PDFDoc, family: NuclearFamily, palette: BranchPalette | undefined): void {
  const { width, height } = doc.page
  if (palette) doc.rect(0, 0, width, height).fill(palette.light)
  doc.rect(0, 0, width, 6).fill(palette?.medium ?? '#cccccc')
  if (family.branch) {
    const gen = family.heads[0]?.generation
    const genSuffix = gen != null ? `, GENERACIÓN ${gen}` : ''
    doc.font(FONT).fontSize(9).fillColor(palette?.medium ?? '#888888')
      .text(`RAMA ${family.branch.firstName.toUpperCase()}${genSuffix}`, MARGIN, 18, { align: 'right', width: width - MARGIN * 2 })
  }
  doc.font(FONT).fontSize(9).fillColor('#aaaaaa')
    .text(String(doc.bufferedPageRange().count), 0, height - 40, { align: 'center', width })
}

// Returns the Y position after the last rendered row (or labelY if no photos).
function renderAlbumSection(
  doc: PDFDoc,
  photos: MediaAsset[],
  labelY: number,
  family: NuclearFamily,
  palette: BranchPalette | undefined,
): number {
  const { width, height } = doc.page
  const availableWidth = width - MARGIN * 2
  const bottomLimit = height - BOTTOM_MARGIN

  type PDFImage = { width: number; height: number }
  type Entry = { img: PDFImage; displayW: number }
  const entries: Entry[] = []

  for (const asset of photos) {
    const filePath = path.isAbsolute(asset.filePath) ? asset.filePath : path.join(config.dir, asset.filePath)
    if (!fs.existsSync(filePath)) continue
    try {
      // openImage exists at runtime but is missing from @types/pdfkit
      const img: PDFImage = (doc as any).openImage(filePath)
      const displayW = Math.round(ALBUM_ROW_H * (img.width / img.height))
      entries.push({ img, displayW })
    } catch {
      continue
    }
  }

  if (entries.length === 0) return labelY

  // Pack entries into rows with exact ALBUM_GAP between photos.
  type Row = Entry[]
  const rows: Row[] = []
  let currentRow: Row = []
  let currentRowW = 0

  for (const entry of entries) {
    const needed = currentRow.length === 0 ? entry.displayW : entry.displayW + ALBUM_GAP
    if (currentRow.length > 0 && currentRowW + needed > availableWidth) {
      rows.push(currentRow)
      currentRow = [entry]
      currentRowW = entry.displayW
    } else {
      currentRow.push(entry)
      currentRowW += needed
    }
  }
  if (currentRow.length > 0) rows.push(currentRow)

  let y = labelY
  let isFirstPage = true

  for (const row of rows) {
    const labelH = isFirstPage ? 20 : 0
    if (y + labelH + ALBUM_ROW_H > bottomLimit) {
      doc.addPage()
      renderPageChrome(doc, family, palette)
      y = MARGIN + 20
      doc.font(FONT).fontSize(10).fillColor('#888888').text('Álbum (cont.)', MARGIN, y)
      y += 20
      isFirstPage = false
    } else if (isFirstPage) {
      doc.font(FONT).fontSize(10).fillColor('#888888').text('Álbum', MARGIN, y)
      y += 20
      isFirstPage = false
    }

    let x = MARGIN
    for (let i = 0; i < row.length; i++) {
      const entry = row[i]
      if (i > 0) x += ALBUM_GAP
      doc.image(entry.img as any, x, y, { width: entry.displayW, height: ALBUM_ROW_H })
      x += entry.displayW
    }
    y += ALBUM_ROW_H + ALBUM_GAP
  }

  return y
}

export function renderFamilyPage(doc: PDFDoc, family: NuclearFamily, bgPalette?: BranchPalette): void {
  const { width, height } = doc.page
  const palette = family.branch?.palette ?? bgPalette
  const bottomLimit = height - BOTTOM_MARGIN

  renderPageChrome(doc, family, palette)

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
  let afterChildrenY = sepY + 12

  if (family.children.length > 0) {
    const childLabelY = sepY + 12
    doc.font(FONT).fontSize(10).fillColor('#888888').text('Hijos', MARGIN, childLabelY)

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

      if (cy + CHILD_CARD_H > bottomLimit) break

      const photoPath = resolvePhoto(child.photoPath ?? null)
      if (photoPath && fs.existsSync(photoPath)) {
        doc.image(photoPath, cx, cy, { width: CHILD_PHOTO, height: CHILD_PHOTO, cover: [CHILD_PHOTO, CHILD_PHOTO] })
      } else {
        doc.rect(cx, cy, CHILD_PHOTO, CHILD_PHOTO).fill('#eeeeee')
      }

      const textX = cx + CHILD_PHOTO + 10
      const textW = colWidth - CHILD_PHOTO - 10

      doc.font(FONT_BLACK).fontSize(12).fillColor('#1a1a2e').text(child.firstName, textX, cy, { width: textW })
      if (child.lastName) {
        doc.font(FONT).fontSize(9).fillColor('#4a4a4a').text(child.lastName, textX, doc.y, { width: textW })
      }

      let textY = doc.y + 2
      for (const value of [child.city, child.occupation]) {
        if (!value) continue
        doc.font(FONT).fontSize(8).fillColor('#1a1a2e').text(value, textX, textY, { width: textW })
        textY += 12
      }
    }

    const childRows = Math.ceil(family.children.length / CHILD_COLS)
    afterChildrenY = childStartY + childRows * (CHILD_CARD_H + 12) + 8
  }

  // --- Family media (album) section ---
  const photoMedia = family.familyMedia.filter(m => m.mediaType === 'photo' || m.mediaType == null)
  let afterAlbumY = afterChildrenY

  if (photoMedia.length > 0) {
    afterAlbumY = renderAlbumSection(doc, photoMedia, afterChildrenY, family, palette)
  }

  // --- Notes ---
  if (family.notes.length > 0 && afterAlbumY + 30 < height - BOTTOM_MARGIN) {
    doc.font(FONT).fontSize(10).fillColor('#888888').text('Notas', MARGIN, afterAlbumY + 12)
    let ny = afterAlbumY + 30
    for (const note of family.notes) {
      if (ny + 12 > height - BOTTOM_MARGIN) break
      doc.font(FONT).fontSize(9).fillColor('#333333').text(note, MARGIN, ny, { width: width - MARGIN * 2 })
      ny += 14
    }
  }
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

  doc.font(FONT_BLACK).fontSize(20).fillColor('#1a1a2e').text(member.firstName, textX, y, { width: textW })
  if (member.lastName) {
    doc.font(FONT).fontSize(15).fillColor('#4a4a4a').text(member.lastName, textX, doc.y, { width: textW })
  }

  let textY = doc.y + 4
  for (const value of [member.city, member.occupation]) {
    if (!value) continue
    doc.font(FONT).fontSize(9).fillColor('#1a1a2e').text(value, textX, textY, { width: textW })
    textY += 14
  }
}
