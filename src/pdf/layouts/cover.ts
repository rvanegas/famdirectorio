import PDFDocument from 'pdfkit'

type PDFDoc = InstanceType<typeof PDFDocument>

export function renderCover(doc: PDFDoc, memberCount: number): void {
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

  // Year
  doc
    .font('Helvetica')
    .fontSize(13)
    .fillColor('#aaaacc')
    .text(String(new Date().getFullYear()), 0, height * 0.87, { align: 'center', width })

  // Bottom bar
  doc.rect(0, height - 8, width, 8).fill('#e8d5b7')
}
