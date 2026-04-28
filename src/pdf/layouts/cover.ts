import PDFDocument from 'pdfkit'
import type { BranchPalette } from '../theme'
import { FONT, FONT_BLACK, FONT_ITALIC, COVER_BG, ARBOL_PORTADA, ARBOL_RAIZ, ARBOL_RAMA_L, ARBOL_RAMA_R, drawImageMultiply } from '../theme'

type PDFDoc = InstanceType<typeof PDFDocument>

function formatDateEs(date: Date): string {
  return date.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function renderCover(doc: PDFDoc, memberCount: number, version: number): void {
  const { width, height } = doc.page

  doc.rect(0, 0, width, height).fill(COVER_BG)
  doc.rect(0, 0, width, 8).fill('#e8d5b7')

  doc.font(FONT_BLACK).fontSize(52).fillColor('#e8d5b7')
    .text('Familia', 0, height * 0.22, { align: 'center', width })

  doc.font(FONT_BLACK).fontSize(64).fillColor('#ffffff')
    .text('Durán Mazuera', 0, height * 0.31, { align: 'center', width })

  // Wide acacia silhouette between title and date line
  const portadaW = width - 40
  const portadaH = portadaW / (1572 / 408)
  drawImageMultiply(doc, ARBOL_PORTADA, 20, height * 0.59, portadaW, portadaH)

  doc.font(FONT).fontSize(13).fillColor('#aaaacc')
    .text(`${memberCount} miembros · ${formatDateEs(new Date())} · v${version}`, 0, height * 0.87, { align: 'center', width })

  doc.rect(0, height - 8, width, 8).fill('#e8d5b7')
}

export function renderForeword(doc: PDFDoc, markdown: string): void {
  const { width, height } = doc.page
  const margin = 63
  const contentWidth = width - margin * 2

  doc.rect(0, 0, width, height).fill('#faf8f3')
  doc.rect(0, 0, width, 8).fill('#e8d5b7')
  doc.rect(0, height - 8, width, 8).fill('#e8d5b7')

  doc.font(FONT_BLACK).fontSize(22).fillColor('#1a1a2e')
    .text('Prólogo', margin, margin + 20, { width: contentWidth, align: 'center' })

  doc.moveTo(margin, margin + 56).lineTo(width - margin, margin + 56)
    .strokeColor('#e8d5b7').lineWidth(1).stroke()

  let y = margin + 72
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine
      .replace(/^#+\s*/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^[-*]\s+/, '• ')

    if (line.trim() === '') { y += 8; continue }

    const isHeading = /^#+/.test(rawLine)
    doc.font(isHeading ? FONT_BLACK : FONT).fontSize(isHeading ? 14 : 11).fillColor('#1a1a2e')
      .text(line, margin, y, { width: contentWidth, align: 'justify' })

    y = doc.y + (isHeading ? 6 : 4)
    if (y > height - margin) break
  }
}

export function renderFamilyCover(
  doc: PDFDoc,
  rootNames: { firstName: string; lastName: string }[],
  memberCount: number,
  palette: BranchPalette,
): void {
  const { width, height } = doc.page
  const textW = width - 144
  const countY = height * 0.85

  doc.rect(0, 0, width, height).fill(palette.saturated)

  doc.font(FONT).fontSize(13).fillColor('#000000')
    .text('Origen', 72, height * 0.11, { align: 'center', width: textW })

  let y = height * 0.17
  rootNames.forEach((name, i) => {
    doc.font(FONT).fontSize(44).fillColor('#000000')
      .text(name.firstName, 72, y, { align: 'center', width: textW })
    y = doc.y + 2
    if (name.lastName) {
      doc.font(FONT).fontSize(22).fillColor('#000000')
        .text(name.lastName, 72, y, { align: 'center', width: textW })
      y = doc.y + 6
    }
    if (i < rootNames.length - 1) {
      doc.font(FONT).fontSize(28).fillColor('#000000')
        .text('*', 72, y + 10, { align: 'center', width: textW })
      y = doc.y + 14
    }
  })

  const nameEnd = doc.y

  // Centered raiz silhouette, vertically centered between names and member count
  const treeH = 185
  const treeW = Math.round(treeH * (752 / 440))
  const treeY = (nameEnd + countY - treeH) / 2
  drawImageMultiply(doc, ARBOL_RAIZ, Math.round((width - treeW) / 2), treeY, treeW, treeH)

  doc.font(FONT).fontSize(13).fillColor('#000000')
    .text(`${memberCount} Miembros`, 72, countY, { align: 'center', width: textW })
}
