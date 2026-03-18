import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import type { Member } from '../../core/types'
import type { BranchSection } from '../generator'

type PDFDoc = InstanceType<typeof PDFDocument>

const MARGIN = 60
const PHOTO_SIZE = 100

function branchColor(colorHex: string | null | undefined): string {
  return colorHex ?? '#1a1a2e'
}

export interface NuclearFamily {
  heads: Member[]    // 1 or 2 parents/heads
  children: Member[]
  branch: BranchSection | null
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
      .text(family.branch.name.toUpperCase(), MARGIN, 18, { align: 'right', width: width - MARGIN * 2 })
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
    const CHILD_PHOTO = 64
    const CHILD_NAME_H = 20
    const CHILD_CARD_H = CHILD_PHOTO + CHILD_NAME_H + 6
    const CHILD_CARD_W = 82
    const cardsPerRow = Math.floor((width - MARGIN * 2) / CHILD_CARD_W)

    for (let i = 0; i < family.children.length; i++) {
      const child = family.children[i]
      const row = Math.floor(i / cardsPerRow)
      const col = i % cardsPerRow
      const cx = MARGIN + col * CHILD_CARD_W
      const cy = childStartY + row * (CHILD_CARD_H + 8)

      if (cy + CHILD_CARD_H > height - 50) break // don't overflow page

      const photoPath = child.photoPath ? path.resolve(process.cwd(), child.photoPath) : null
      if (photoPath && fs.existsSync(photoPath)) {
        doc.image(photoPath, cx, cy, {
          width: CHILD_PHOTO,
          height: CHILD_PHOTO,
          cover: [CHILD_PHOTO, CHILD_PHOTO],
        })
      } else {
        doc.rect(cx, cy, CHILD_PHOTO, CHILD_PHOTO).fill('#eeeeee')
      }

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#1a1a2e')
        .text(
          `${child.firstName} ${child.lastName ?? ''}`.trim(),
          cx,
          cy + CHILD_PHOTO + 3,
          { width: CHILD_PHOTO, align: 'center' },
        )

      if (child.city) {
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#888888')
          .text(child.city, cx, cy + CHILD_PHOTO + 12, { width: CHILD_PHOTO, align: 'center' })
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
  const photoPath = member.photoPath ? path.resolve(process.cwd(), member.photoPath) : null
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

  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor('#1a1a2e')
    .text(`${member.firstName} ${member.lastName ?? ''}`.trim(), textX, y, { width: textW })

  let textY = y + 24

  const details: [string, string | null | undefined][] = [
    ['Ciudad', member.city],
    ['Ocupación', member.occupation],
    ['Email', member.email],
    ['Teléfono', member.phone],
  ]

  for (const [label, value] of details) {
    if (!value) continue
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#666666')
      .text(`${label}:`, textX, textY, { continued: true, width: textW })
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a2e').text(` ${value}`, { width: textW })
    textY += 13
  }

}
