import PDFDocument from 'pdfkit'
import type { Member } from '../../core/types'

type PDFDoc = InstanceType<typeof PDFDocument>

const MARGIN = 60
const COL_GAP = 24
const HEADING_COLOR = '#1a1a2e'
const NAME_COLOR = '#333333'
const SUBTEXT_COLOR = '#888888'

type IndexEntry = { group: string; members: Member[] }

function buildIndex(members: Member[], key: (m: Member) => string | null): IndexEntry[] {
  const map = new Map<string, Member[]>()
  for (const m of members) {
    const k = key(m)?.trim()
    if (!k) continue
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(m)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([group, ms]) => ({
      group,
      members: ms.slice().sort((a, b) =>
        `${a.firstName} ${a.lastName ?? ''}`.localeCompare(`${b.firstName} ${b.lastName ?? ''}`, 'es')
      ),
    }))
}

function fullName(m: Member): string {
  return `${m.firstName} ${m.lastName ?? ''}`.trim()
}

function renderIndexSection(
  doc: PDFDoc,
  title: string,
  entries: IndexEntry[],
): void {
  const { width, height } = doc.page
  const colW = (width - MARGIN * 2 - COL_GAP) / 2

  // Title page header
  doc.rect(0, 0, width, 6).fill(HEADING_COLOR)
  doc
    .font('Helvetica-Bold')
    .fontSize(24)
    .fillColor(HEADING_COLOR)
    .text(title, MARGIN, 28, { width: width - MARGIN * 2 })
  doc
    .moveTo(MARGIN, 62)
    .lineTo(width - MARGIN, 62)
    .strokeColor('#dddddd')
    .lineWidth(0.5)
    .stroke()

  let col = 0   // 0 = left, 1 = right
  let y = 76

  const colX = () => MARGIN + col * (colW + COL_GAP)

  const advanceCol = () => {
    if (col === 0) {
      col = 1
      y = 76
    } else {
      doc.addPage()
      doc.rect(0, 0, width, 6).fill(HEADING_COLOR)
      col = 0
      y = 76
    }
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > height - MARGIN) advanceCol()
  }

  for (const entry of entries) {
    // Each group: heading + names. Estimate height needed for heading + at least first name.
    const groupH = 16 + 14 + entry.members.length * 13
    // If the whole group fits on remaining space use it, otherwise just ensure heading + 1 name fits
    ensureSpace(Math.min(groupH, 30))

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(HEADING_COLOR)
      .text(entry.group, colX(), y, { width: colW })
    y += 14

    doc
      .moveTo(colX(), y)
      .lineTo(colX() + colW, y)
      .strokeColor('#eeeeee')
      .lineWidth(0.5)
      .stroke()
    y += 4

    for (const m of entry.members) {
      ensureSpace(13)
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(NAME_COLOR)
        .text(fullName(m), colX() + 8, y, { width: colW - 8 })
      if (m.city && title.includes('Ocupación')) {
        // show city as subtext inline
        const nameW = doc.widthOfString(fullName(m))
        const subX = colX() + 8 + nameW + 4
        if (subX + 20 < colX() + colW) {
          doc
            .font('Helvetica-Oblique')
            .fontSize(8)
            .fillColor(SUBTEXT_COLOR)
            .text(`— ${m.city}`, subX, y + 0.5, { width: colX() + colW - subX })
        }
      } else if (m.occupation && title.includes('Ciudad')) {
        const nameW = doc.widthOfString(fullName(m))
        const subX = colX() + 8 + nameW + 4
        if (subX + 20 < colX() + colW) {
          doc
            .font('Helvetica-Oblique')
            .fontSize(8)
            .fillColor(SUBTEXT_COLOR)
            .text(`— ${m.occupation}`, subX, y + 0.5, { width: colX() + colW - subX })
        }
      }
      y += 13
    }

    y += 6 // gap after group
  }
}

export function renderIndexes(doc: PDFDoc, members: Member[]): void {
  // --- Occupation index ---
  doc.addPage()
  renderIndexSection(doc, 'Índice por Ocupación', buildIndex(members, m => m.occupation))

  // --- Location index ---
  doc.addPage()
  renderIndexSection(doc, 'Índice por Ciudad', buildIndex(members, m => m.city))
}
