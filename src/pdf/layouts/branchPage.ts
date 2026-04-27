import PDFDocument from 'pdfkit'
import type { BranchSection } from '../generator'
import { FONT, ARBOL_RAMA_L, ARBOL_RAMA_R, drawImageMultiply } from '../theme'

type PDFDoc = InstanceType<typeof PDFDocument>

export function renderBranchDivider(doc: PDFDoc, branch: BranchSection, memberCount: number, branchIndex: number): void {
  const { width, height } = doc.page

  doc.rect(0, 0, width, height).fill(branch.palette.saturated)

  const labelY = height * 0.21
  const nameY  = height * 0.26
  const countY = height * 0.84
  const textW  = width - 144

  doc.font(FONT).fontSize(13).fillColor('#000000')
    .text('Rama', 72, labelY, { align: 'center', width: textW })

  doc.font(FONT).fontSize(54).fillColor('#000000')
    .text(branch.firstName, 72, nameY, { align: 'center', width: textW })

  if (branch.lastName) {
    doc.font(FONT).fontSize(26).fillColor('#000000')
      .text(branch.lastName, 72, doc.y + 2, { align: 'center', width: textW })
  }

  const nameEnd = doc.y

  // Tree vertically centered in the gap between name and member count;
  // shifted inward from the corner by half the asset width.
  const treeH = 200
  const treeW = Math.round(treeH * (508 / 580))
  const treeY = (nameEnd + countY - treeH) / 2
  if (branchIndex % 2 === 0) {
    drawImageMultiply(doc, ARBOL_RAMA_L, Math.round(treeW / 2), treeY, treeW, treeH)
  } else {
    drawImageMultiply(doc, ARBOL_RAMA_R, width - Math.round(treeW / 2) - treeW, treeY, treeW, treeH)
  }

  doc.font(FONT).fontSize(13).fillColor('#000000')
    .text(`${memberCount} Miembros`, 72, countY, { align: 'center', width: textW })
}
