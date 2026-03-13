import PDFDocument from 'pdfkit'

type PDFDoc = InstanceType<typeof PDFDocument>

export interface TocEntry {
  label: string
  pageNumber: number
}

export function renderToc(doc: PDFDoc, entries: TocEntry[]): void {
  const { width } = doc.page
  const margin = 72

  doc
    .font('Helvetica-Bold')
    .fontSize(28)
    .fillColor('#1a1a2e')
    .text('Contenido', margin, 80)

  doc
    .moveTo(margin, 120)
    .lineTo(width - margin, 120)
    .strokeColor('#1a1a2e')
    .lineWidth(1)
    .stroke()

  let y = 140
  for (const entry of entries) {
    if (y > doc.page.height - 100) {
      doc.addPage()
      y = 80
    }

    const dots = '.'.repeat(Math.max(0, Math.floor((width - margin * 2 - 200) / 5)))

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#1a1a2e')
      .text(entry.label, margin, y, { continued: false, width: width - margin * 2 - 60 })

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#666666')
      .text(String(entry.pageNumber), width - margin - 30, y, { align: 'right', width: 30 })

    y += 22
  }
}
