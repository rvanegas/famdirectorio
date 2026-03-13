import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import type { Member } from '../../core/types'
import type { Branch } from '../../core/types'

type PDFDoc = InstanceType<typeof PDFDocument>

const MARGIN = 60
const PHOTO_SIZE = 140

function branchColor(colorHex: string | null | undefined): string {
  return colorHex ?? '#1a1a2e'
}

export function renderMemberPage(
  doc: PDFDoc,
  member: Member,
  branch: Branch | null,
): void {
  const { width, height } = doc.page
  const accent = branchColor(branch?.colorHex)

  // Top accent bar
  doc.rect(0, 0, width, 6).fill(accent)

  // Branch label (top right)
  if (branch) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(accent)
      .text(branch.name.toUpperCase(), MARGIN, 18, { align: 'right', width: width - MARGIN * 2 })
  }

  // Photo placeholder or actual photo
  const photoX = MARGIN
  const photoY = 40
  const photoPath = member.photoPath ? path.resolve(process.cwd(), member.photoPath) : null

  if (photoPath && fs.existsSync(photoPath)) {
    doc.image(photoPath, photoX, photoY, { width: PHOTO_SIZE, height: PHOTO_SIZE, cover: [PHOTO_SIZE, PHOTO_SIZE] })
  } else {
    // Grey placeholder
    doc.rect(photoX, photoY, PHOTO_SIZE, PHOTO_SIZE).fill('#dddddd')
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#999999')
      .text('Sin foto', photoX, photoY + PHOTO_SIZE / 2 - 6, { width: PHOTO_SIZE, align: 'center' })
  }

  // Name (right of photo)
  const textX = MARGIN + PHOTO_SIZE + 24
  const textWidth = width - textX - MARGIN

  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor('#1a1a2e')
    .text(`${member.firstName} ${member.lastName ?? ''}`.trim(), textX, photoY, { width: textWidth })

  let textY = photoY + 34

  const details: [string, string | null | undefined][] = [
    ['Generación', member.generation ? String(member.generation) : null],
    ['Ciudad', member.city],
    ['Ocupación', member.occupation],
    ['Email', member.email],
    ['Teléfono', member.phone],
  ]

  for (const [label, value] of details) {
    if (!value) continue
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#666666')
      .text(`${label}:`, textX, textY, { continued: true, width: textWidth })
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#1a1a2e')
      .text(` ${value}`, { width: textWidth })
    textY += 16
  }

  // Relation text below photo
  if (member.relationText) {
    const relY = photoY + PHOTO_SIZE + 12
    doc
      .font('Helvetica-Oblique')
      .fontSize(10)
      .fillColor('#666666')
      .text(member.relationText, MARGIN, relY, { width: PHOTO_SIZE + 24 + textWidth })
  }

  // Notes
  if (member.notes) {
    const notesY = Math.max(photoY + PHOTO_SIZE + 40, textY + 20)
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#444444')
      .text(member.notes, MARGIN, notesY, { width: width - MARGIN * 2 })
  }

  // Bottom page number placeholder (filled by generator)
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#aaaaaa')
    .text(String(doc.bufferedPageRange().count), 0, height - 40, {
      align: 'center',
      width,
    })
}

export function renderMemberGrid(
  doc: PDFDoc,
  pageMembers: Member[],
  branches: Map<number, Branch>,
): void {
  // 2-column grid for Gen 3+ members (half-page each)
  const { width, height } = doc.page
  const colWidth = (width - MARGIN * 3) / 2
  const rowHeight = (height - 120) / 2
  const positions = [
    { x: MARGIN, y: 80 },
    { x: MARGIN * 2 + colWidth, y: 80 },
    { x: MARGIN, y: 80 + rowHeight + 20 },
    { x: MARGIN * 2 + colWidth, y: 80 + rowHeight + 20 },
  ]

  pageMembers.slice(0, 4).forEach((member, i) => {
    const pos = positions[i]
    const branch = member.branchId ? branches.get(member.branchId) ?? null : null
    renderMemberMini(doc, member, branch, pos.x, pos.y, colWidth, rowHeight)
  })
}

function renderMemberMini(
  doc: PDFDoc,
  member: Member,
  branch: Branch | null,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const accent = branchColor(branch?.colorHex)
  const miniPhoto = 70

  // Border
  doc.rect(x, y, w, h).strokeColor('#dddddd').lineWidth(0.5).stroke()

  // Accent top
  doc.rect(x, y, w, 3).fill(accent)

  // Photo
  const photoPath = member.photoPath ? path.resolve(process.cwd(), member.photoPath) : null
  if (photoPath && fs.existsSync(photoPath)) {
    doc.image(photoPath, x + 8, y + 10, { width: miniPhoto, height: miniPhoto, cover: [miniPhoto, miniPhoto] })
  } else {
    doc.rect(x + 8, y + 10, miniPhoto, miniPhoto).fill('#eeeeee')
  }

  const tx = x + miniPhoto + 16
  const tw = w - miniPhoto - 24

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1a2e').text(
    `${member.firstName} ${member.lastName ?? ''}`.trim(),
    tx, y + 10, { width: tw },
  )

  const info = [member.city, member.occupation].filter(Boolean).join(' · ')
  if (info) {
    doc.font('Helvetica').fontSize(9).fillColor('#666666').text(info, tx, y + 26, { width: tw })
  }
}
