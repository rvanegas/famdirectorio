import PDFDocument from 'pdfkit'
import type { BranchSection } from '../generator'

type PDFDoc = InstanceType<typeof PDFDocument>

export function renderBranchDivider(doc: PDFDoc, branch: BranchSection, memberCount: number): void {
  const { width, height } = doc.page
  const accent = branch.colorHex ?? '#1a1a2e'

  // Full-page background
  doc.rect(0, 0, width, height).fill(accent)

  const nameFontSize = 40
  const nameLineHeight = nameFontSize * 1.35
  const lines = [branch.firstName, branch.lastName].filter(Boolean)
  const totalNameHeight = lines.length * nameLineHeight
  const blockStart = (height - totalNameHeight) / 2 - 10

  // Label above the block
  doc
    .font('Helvetica')
    .fontSize(16)
    .fillColor('#ffffff', 0.75)
    .text('Rama', 72, blockStart - 48, { align: 'center', width: width - 144 })

  // Name lines
  let y = blockStart
  for (const line of lines) {
    doc
      .font('Helvetica-Bold')
      .fontSize(nameFontSize)
      .fillColor('#ffffff')
      .text(line, 72, y, { align: 'center', width: width - 144 })
    y += nameLineHeight
  }

  // Member count below the block
  doc
    .font('Helvetica')
    .fontSize(16)
    .fillColor('#ffffff', 0.75)
    .text(`${memberCount} miembros`, 0, y + 32, { align: 'center', width })

  // Bottom decoration
  doc.fillColor('#ffffff', 0.3).rect(0, height - 8, width, 8).fill()
}
