import PDFDocument from 'pdfkit'
import { ROOT_COVER_COLOR } from '../generator'

type PDFDoc = InstanceType<typeof PDFDocument>

function formatDateEs(date: Date): string {
  return date.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function renderCover(doc: PDFDoc, memberCount: number, version: number): void {
  const { width, height } = doc.page

  // Background
  doc.rect(0, 0, width, height).fill('#1a1a2e')

  // Decorative top bar
  doc.rect(0, 0, width, 8).fill('#e8d5b7')

  // Main title
  doc
    .font('Helvetica-Bold')
    .fontSize(52)
    .fillColor('#e8d5b7')
    .text('Familia', 0, height * 0.25, { align: 'center', width })

  doc
    .font('Helvetica-Bold')
    .fontSize(64)
    .fillColor('#ffffff')
    .text('Durán Mazuera', 0, height * 0.35, { align: 'center', width })

  // Subtitle / year
  doc
    .font('Helvetica')
    .fontSize(18)
    .fillColor('#e8d5b7')
    .text('Directorio Familiar', 0, height * 0.52, { align: 'center', width })

  // Divider
  doc
    .moveTo(width * 0.3, height * 0.58)
    .lineTo(width * 0.7, height * 0.58)
    .strokeColor('#e8d5b7')
    .lineWidth(1)
    .stroke()

  // Stats
  doc
    .font('Helvetica')
    .fontSize(13)
    .fillColor('#aaaacc')
    .text(`${memberCount} miembros`, 0, height * 0.61, { align: 'center', width })

  // Date + version
  doc
    .font('Helvetica')
    .fontSize(13)
    .fillColor('#aaaacc')
    .text(`${formatDateEs(new Date())} · v${version}`, 0, height * 0.87, { align: 'center', width })

  // Bottom bar
  doc.rect(0, height - 8, width, 8).fill('#e8d5b7')
}

export function renderForeword(doc: PDFDoc, markdown: string): void {
  const { width, height } = doc.page
  const margin = 72
  const contentWidth = width - margin * 2

  doc.rect(0, 0, width, height).fill('#faf8f3')
  doc.rect(0, 0, width, 8).fill('#e8d5b7')
  doc.rect(0, height - 8, width, 8).fill('#e8d5b7')

  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor('#1a1a2e')
    .text('Prólogo', margin, margin + 20, { width: contentWidth, align: 'center' })

  doc
    .moveTo(margin, margin + 56)
    .lineTo(width - margin, margin + 56)
    .strokeColor('#e8d5b7')
    .lineWidth(1)
    .stroke()

  let y = margin + 72
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine
      .replace(/^#+\s*/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^[-*]\s+/, '• ')

    if (line.trim() === '') {
      y += 8
      continue
    }

    const isHeading = /^#+/.test(rawLine)
    doc
      .font(isHeading ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(isHeading ? 14 : 11)
      .fillColor('#1a1a2e')
      .text(line, margin, y, { width: contentWidth, align: 'justify' })

    y = doc.y + (isHeading ? 6 : 4)
    if (y > height - margin) break
  }
}

export function renderFamilyCover(
  doc: PDFDoc,
  rootNames: { firstName: string; lastName: string }[],
  memberCount: number,
): void {
  const { width, height } = doc.page

  doc.rect(0, 0, width, height).fill(ROOT_COVER_COLOR)

  // Build lines: firstName / lastName per person, with · between people
  type Line = { text: string; bullet: boolean }
  const lines: Line[] = []
  rootNames.forEach((name, i) => {
    lines.push({ text: name.firstName, bullet: false })
    if (name.lastName) lines.push({ text: name.lastName, bullet: false })
    if (i < rootNames.length - 1) lines.push({ text: '·', bullet: true })
  })

  const nameFontSize = 40
  const nameLineHeight = nameFontSize * 1.35
  const bulletHeight = 72
  const totalNameHeight = lines.reduce((h, l) => h + (l.bullet ? bulletHeight : nameLineHeight), 0)
  const blockStart = (height - totalNameHeight) / 2 - 10

  doc
    .font('Helvetica')
    .fontSize(16)
    .fillColor('#ffffff', 0.75)
    .text('Origen', 72, blockStart - 48, { align: 'center', width: width - 144 })

  let y = blockStart
  for (const line of lines) {
    if (line.bullet) {
      doc
        .font('Helvetica')
        .fontSize(72)
        .fillColor('#ffffff', 0.5)
        .text(line.text, 72, y + (bulletHeight - 72) / 2, { align: 'center', width: width - 144 })
      y += bulletHeight
    } else {
      doc
        .font('Helvetica-Bold')
        .fontSize(nameFontSize)
        .fillColor('#ffffff')
        .text(line.text, 72, y, { align: 'center', width: width - 144 })
      y += nameLineHeight
    }
  }

  doc
    .font('Helvetica')
    .fontSize(16)
    .fillColor('#ffffff', 0.75)
    .text(`${memberCount} miembros`, 0, y + 32, { align: 'center', width })

  doc.fillColor('#ffffff', 0.3).rect(0, height - 8, width, 8).fill()
}
