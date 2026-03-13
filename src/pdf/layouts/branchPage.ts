import PDFDocument from 'pdfkit'
import type { Branch, Member } from '../../core/types'

type PDFDoc = InstanceType<typeof PDFDocument>

export function renderBranchDivider(doc: PDFDoc, branch: Branch, memberCount: number): void {
  const { width, height } = doc.page
  const accent = branch.colorHex ?? '#1a1a2e'

  // Full-page background
  doc.rect(0, 0, width, height).fill(accent)

  // Branch name
  doc
    .font('Helvetica-Bold')
    .fontSize(56)
    .fillColor('#ffffff')
    .text(branch.name, 72, height * 0.35, { align: 'center', width: width - 144 })

  // Member count
  doc
    .font('Helvetica')
    .fontSize(16)
    .fillColor('rgba(255,255,255,0.75)')
    .text(`${memberCount} miembros`, 0, height * 0.55, { align: 'center', width })

  // Bottom decoration
  doc.rect(0, height - 8, width, 8).fill('rgba(255,255,255,0.3)')
}
