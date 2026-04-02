import PDFDocument from 'pdfkit'
import type { Member } from '../../core/types'
import type { FamilyNoteRow } from '../../core/familyNotes.repository'

type PDFDoc = InstanceType<typeof PDFDocument>

const MARGIN = 60

export interface FamilyWithNotes {
  familyId: number
  heads: Member[]
  notes: FamilyNoteRow[]
}

export function renderNotesSection(doc: PDFDoc, families: FamilyWithNotes[]): void {
  const all = families.filter(f => f.notes.length > 0)
  if (all.length === 0) return

  doc.addPage()
  const { width } = doc.page

  // Section title
  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor('#1a1a2e')
    .text('Notas', MARGIN, 60, { width: width - MARGIN * 2 })

  doc
    .moveTo(MARGIN, doc.y + 8)
    .lineTo(width - MARGIN, doc.y + 8)
    .strokeColor('#dddddd')
    .lineWidth(0.5)
    .stroke()

  let y = doc.y + 24

  for (const family of all) {
    const familyLabel = family.heads
      .map(h => `${h.firstName}${h.lastName ? ' ' + h.lastName : ''}`)
      .join(' & ')

    // Family name as subheader
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#2E4057')
      .text(familyLabel, MARGIN, y, { width: width - MARGIN * 2 })

    y = doc.y + 4

    for (const note of family.notes) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#333333')
        .text(note.content, MARGIN + 12, y, { width: width - MARGIN * 2 - 12 })
      y = doc.y + 10
    }

    y += 10

    // Page overflow guard
    if (y > doc.page.height - 80) {
      doc.addPage()
      y = 60
    }
  }
}
