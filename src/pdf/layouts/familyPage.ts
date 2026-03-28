import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import type { Member, MediaAsset } from '../../core/types'
import type { BranchSection } from '../generator'

type PDFDoc = InstanceType<typeof PDFDocument>

const MARGIN = 60
const PHOTO_SIZE = 100

function resolvePhoto(p: string | null): string | null {
  if (!p) return null
  if (path.isAbsolute(p)) return p
  return path.join(process.env.FAM_DIR!, p)
}

function branchColor(colorHex: string | null | undefined): string {
  return colorHex ?? '#1a1a2e'
}

export interface NuclearFamily {
  heads: Member[]    // 1 or 2 parents/heads
  children: Member[]
  branch: BranchSection | null
  familyMedia: MediaAsset[]
}

export function renderFamilyPage(doc: PDFDoc, family: NuclearFamily): void {
  const { width, height } = doc.page
  const accent = branchColor(family.branch?.colorHex)

  // Top accent bar
  doc.rect(0, 0, width, 6).fill(accent)

  // Branch label (top right)
  if (family.branch) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(accent)
      .text(`RAMA ${family.branch.firstName.toUpperCase()}`, MARGIN, 18, { align: 'right', width: width - MARGIN * 2 })
  }

  // --- Parents section ---
  const parentsY = 40
  if (family.heads.length === 1) {
    renderParentBlock(doc, family.heads[0], MARGIN, parentsY, width - MARGIN * 2)
  } else {
    const colWidth = (width - MARGIN * 2 - 20) / 2
    renderParentBlock(doc, family.heads[0], MARGIN, parentsY, colWidth)
    // Vertical divider between parents
    const divX = MARGIN + colWidth + 10
    const divTop = parentsY
    const divBot = parentsY + PHOTO_SIZE + 20
    doc.moveTo(divX, divTop).lineTo(divX, divBot).strokeColor('#dddddd').lineWidth(0.5).stroke()
    renderParentBlock(doc, family.heads[1], MARGIN + colWidth + 20, parentsY, colWidth)
  }

  // Separator line
  const sepY = parentsY + PHOTO_SIZE + 30
  doc.moveTo(MARGIN, sepY).lineTo(width - MARGIN, sepY).strokeColor('#dddddd').lineWidth(0.5).stroke()

  // --- Children section ---
  if (family.children.length > 0) {
    const childLabelY = sepY + 12
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#888888')
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

      if (cy + CHILD_CARD_H > height - 50) break // don't overflow page

      // Photo on the left
      const photoPath = resolvePhoto(child.photoPath ?? null)
      if (photoPath && fs.existsSync(photoPath)) {
        doc.image(photoPath, cx, cy, {
          width: CHILD_PHOTO,
          height: CHILD_PHOTO,
          cover: [CHILD_PHOTO, CHILD_PHOTO],
        })
      } else {
        doc.rect(cx, cy, CHILD_PHOTO, CHILD_PHOTO).fill('#eeeeee')
      }

      // Name + city + occupation to the right of photo
      const textX = cx + CHILD_PHOTO + 10
      const textW = colWidth - CHILD_PHOTO - 10

      // First name — bold, prominent
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a1a2e')
        .text(child.firstName, textX, cy, { width: textW })
      // Last name — lighter weight, off-black, second row
      if (child.lastName) {
        doc.font('Helvetica').fontSize(8).fillColor('#4a4a4a')
          .text(child.lastName, textX, cy + 14, { width: textW })
      }

      // Details pinned below name rows, explicit Y to prevent overwrite
      let textY = cy + 30
      const childDetails: [string, string | null | undefined][] = [
        ['Ciudad', child.city],
        ['Ocupación', child.occupation],
      ]
      for (const [, value] of childDetails) {
        if (!value) continue
        doc.font('Helvetica').fontSize(7.5).fillColor('#1a1a2e')
          .text(value, textX, textY, { width: textW })
        textY += 12
      }
    }
  }

  // --- Family media section ---
  const photoMedia = family.familyMedia.filter(m => m.mediaType === 'photo' || m.mediaType == null)
  if (photoMedia.length > 0) {
    // Determine Y start: after children or after separator if no children
    let mediaStartY: number
    if (family.children.length > 0) {
      const CHILD_COLS = 3
      const COL_GAP = 16
      const CHILD_PHOTO = 64
      const CHILD_CARD_H = CHILD_PHOTO + 8
      const childCount = Math.min(family.children.length, /* same cap */ family.children.length)
      const childRows = Math.ceil(childCount / CHILD_COLS)
      const childLabelY = sepY + 12
      const childStartY = childLabelY + 18
      mediaStartY = childStartY + childRows * (CHILD_CARD_H + 12) + 8
    } else {
      mediaStartY = sepY + 12
    }

    const MEDIA_COLS = 4
    const MEDIA_GAP = 10
    const mediaColW = (width - MARGIN * 2 - MEDIA_GAP * (MEDIA_COLS - 1)) / MEDIA_COLS

    // Only draw separator + label if at least one image fits on the page
    if (mediaStartY + 30 + PHOTO_SIZE <= height - 50) {
      doc.moveTo(MARGIN, mediaStartY).lineTo(width - MARGIN, mediaStartY).strokeColor('#dddddd').lineWidth(0.5).stroke()
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#888888').text('Álbum', MARGIN, mediaStartY + 12)
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
        : path.join(process.env.FAM_DIR!, asset.filePath)

      if (fs.existsSync(filePath)) {
        doc.image(filePath, mx, my, {
          width: PHOTO_SIZE,
          height: PHOTO_SIZE,
          cover: [PHOTO_SIZE, PHOTO_SIZE],
        })
      } else {
        doc.rect(mx, my, PHOTO_SIZE, PHOTO_SIZE).fill('#eeeeee')
      }
    }
  }

  // Page number footer
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#aaaaaa')
    .text(String(doc.bufferedPageRange().count), 0, height - 40, { align: 'center', width })
}

function renderParentBlock(
  doc: PDFDoc,
  member: Member,
  x: number,
  y: number,
  w: number,
): void {
  // Photo
  const photoPath = resolvePhoto(member.photoPath ?? null)
  if (photoPath && fs.existsSync(photoPath)) {
    doc.image(photoPath, x, y, {
      width: PHOTO_SIZE,
      height: PHOTO_SIZE,
      cover: [PHOTO_SIZE, PHOTO_SIZE],
    })
  } else {
    doc.rect(x, y, PHOTO_SIZE, PHOTO_SIZE).fill('#dddddd')
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#999999')
      .text('Sin foto', x, y + PHOTO_SIZE / 2 - 5, { width: PHOTO_SIZE, align: 'center' })
  }

  // Name + details to the right of photo
  const textX = x + PHOTO_SIZE + 14
  const textW = w - PHOTO_SIZE - 14

  // First name — bold, large
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1a2e')
    .text(member.firstName, textX, y, { width: textW })
  // Last name — regular weight, off-black, second row
  if (member.lastName) {
    doc.font('Helvetica').fontSize(13).fillColor('#4a4a4a')
      .text(member.lastName, textX, y + 20, { width: textW })
  }

  // Details pinned below name rows, explicit Y to prevent overwrite
  let textY = y + 42

  const details: [string, string | null | undefined][] = [
    ['Ciudad', member.city],
    ['Ocupación', member.occupation],
  ]

  for (const [, value] of details) {
    if (!value) continue
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a2e')
      .text(value, textX, textY, { width: textW })
    textY += 14
  }

}
