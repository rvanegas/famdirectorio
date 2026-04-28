import PDFDocument from 'pdfkit'
import type { Member, Orphan } from '../../core/types'
import { FONT, FONT_BLACK, FONT_ITALIC } from '../theme'

type PDFDoc = InstanceType<typeof PDFDocument>

const MARGIN = 60
const COL_GAP = 24
const HEADING_COLOR = '#1a1a2e'
const NAME_COLOR = '#333333'
const SUBTEXT_COLOR = '#888888'

type IndexEntry = { group: string; members: Member[] }

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

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
        `${a.lastName ?? ''} ${a.firstName}`.localeCompare(`${b.lastName ?? ''} ${b.firstName}`, 'es')
      ),
    }))
}

function buildBirthdayIndex(members: Member[]): IndexEntry[] {
  const map = new Map<number, Member[]>() // keyed by month (1–12)
  for (const m of members) {
    if (!m.birthday) continue
    const month = parseInt(m.birthday.slice(0, 2), 10)
    if (!map.has(month)) map.set(month, [])
    map.get(month)!.push(m)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, ms]) => ({
      group: MONTH_NAMES[month - 1],
      members: ms.slice().sort((a, b) => {
        const dayA = parseInt(a.birthday!.slice(3, 5), 10)
        const dayB = parseInt(b.birthday!.slice(3, 5), 10)
        return dayA - dayB
      }),
    }))
}

function fullName(m: Member): string {
  return `${m.firstName} ${m.lastName ?? ''}`.trim()
}

function lastFirst(m: Member): string {
  return m.lastName ? `${m.lastName}, ${m.firstName}` : m.firstName
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
    .font(FONT_BLACK)
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
      .font(FONT_BLACK)
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
        .font(FONT)
        .fontSize(9)
        .fillColor(NAME_COLOR)
        .text(lastFirst(m), colX() + 8, y, { width: colW - 8 })
      if (m.city && title.includes('Ocupación')) {
        // show city as subtext inline
        const nameW = doc.widthOfString(lastFirst(m))
        const subX = colX() + 8 + nameW + 4
        if (subX + 20 < colX() + colW) {
          doc
            .font(FONT_ITALIC)
            .fontSize(8)
            .fillColor(SUBTEXT_COLOR)
            .text(`— ${m.city}`, subX, y + 0.5, { width: colX() + colW - subX })
        }
      } else if (m.occupation && title.includes('Ciudad')) {
        const nameW = doc.widthOfString(lastFirst(m))
        const subX = colX() + 8 + nameW + 4
        if (subX + 20 < colX() + colW) {
          doc
            .font(FONT_ITALIC)
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

function renderBirthdayIndex(doc: PDFDoc, members: Member[]): void {
  const { width, height } = doc.page
  const colW = (width - MARGIN * 2 - COL_GAP) / 2

  doc.rect(0, 0, width, 6).fill(HEADING_COLOR)
  doc
    .font(FONT_BLACK)
    .fontSize(24)
    .fillColor(HEADING_COLOR)
    .text('Índice de Cumpleaños', MARGIN, 28, { width: width - MARGIN * 2 })
  doc
    .moveTo(MARGIN, 62)
    .lineTo(width - MARGIN, 62)
    .strokeColor('#dddddd')
    .lineWidth(0.5)
    .stroke()

  const entries = buildBirthdayIndex(members)

  let col = 0
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
    ensureSpace(Math.min(16 + 14 + entry.members.length * 13, 30))

    doc
      .font(FONT_BLACK)
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
      const day = m.birthday!.slice(3, 5)
      doc
        .font(FONT_BLACK)
        .fontSize(9)
        .fillColor(SUBTEXT_COLOR)
        .text(day, colX() + 8, y, { width: 18 })
      doc
        .font(FONT)
        .fontSize(9)
        .fillColor(NAME_COLOR)
        .text(lastFirst(m), colX() + 28, y, { width: colW - 28 })
      y += 13
    }

    y += 6
  }
}

function renderContactIndex(doc: PDFDoc, members: Member[]): void {
  const { width, height } = doc.page
  const colW = (width - MARGIN * 2 - COL_GAP) / 2

  doc.rect(0, 0, width, 6).fill(HEADING_COLOR)
  doc
    .font(FONT_BLACK)
    .fontSize(24)
    .fillColor(HEADING_COLOR)
    .text('Índice de Contactos', MARGIN, 28, { width: width - MARGIN * 2 })
  doc
    .moveTo(MARGIN, 62)
    .lineTo(width - MARGIN, 62)
    .strokeColor('#dddddd')
    .lineWidth(0.5)
    .stroke()

  const contacts = members
    .filter(m => m.phone || m.email || m.instagram)
    .slice()
    .sort((a, b) =>
      `${a.lastName ?? ''} ${a.firstName}`.localeCompare(`${b.lastName ?? ''} ${b.firstName}`, 'es')
    )

  let col = 0
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

  for (const m of contacts) {
    const lines = (m.phone ? 1 : 0) + (m.email ? 1 : 0) + (m.instagram ? 1 : 0)
    ensureSpace(14 + lines * 11)

    doc
      .font(FONT_BLACK)
      .fontSize(9)
      .fillColor(NAME_COLOR)
      .text(lastFirst(m), colX() + 8, y, { width: colW - 8 })
    y += 13

    if (m.phone) {
      doc
        .font(FONT)
        .fontSize(8)
        .fillColor(SUBTEXT_COLOR)
        .text(m.phone, colX() + 16, y, { width: colW - 16 })
      y += 11
    }
    if (m.email) {
      doc
        .font(FONT)
        .fontSize(8)
        .fillColor(SUBTEXT_COLOR)
        .text(m.email, colX() + 16, y, { width: colW - 16 })
      y += 11
    }
    if (m.instagram) {
      doc
        .font(FONT)
        .fontSize(8)
        .fillColor(SUBTEXT_COLOR)
        .text(m.instagram, colX() + 16, y, { width: colW - 16 })
      y += 11
    }

    y += 4
  }
}

export function renderOrphansPage(doc: PDFDoc, orphans: Orphan[]): void {
  const { width, height } = doc.page
  const colW = (width - MARGIN * 2 - COL_GAP) / 2

  doc.rect(0, 0, width, 6).fill(HEADING_COLOR)
  doc
    .font(FONT_BLACK)
    .fontSize(24)
    .fillColor(HEADING_COLOR)
    .text('Por Identificar', MARGIN, 28, { width: width - MARGIN * 2 })
  doc
    .moveTo(MARGIN, 62)
    .lineTo(width - MARGIN, 62)
    .strokeColor('#dddddd')
    .lineWidth(0.5)
    .stroke()

  const sorted = orphans.slice().sort((a, b) => {
    const la = a.lastName ?? '', lb = b.lastName ?? ''
    return la.localeCompare(lb, 'es') || a.firstName.localeCompare(b.firstName, 'es')
  })

  let col = 0
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

  for (const o of sorted) {
    ensureSpace(13)
    const name = o.lastName ? `${o.lastName}, ${o.firstName}` : o.firstName
    const bday = o.birthday ?? ''
    const label = bday ? `${name}  —  ${bday}` : name
    doc
      .font(FONT)
      .fontSize(9)
      .fillColor(NAME_COLOR)
      .text(label, colX() + 8, y, { width: colW - 8 })
    y += 13
  }
}

export function renderIndexes(doc: PDFDoc, members: Member[]): void {
  // --- Occupation index ---
  doc.addPage()
  renderIndexSection(doc, 'Índice por Ocupación', buildIndex(members, m => m.occupation))

  // --- Location index ---
  doc.addPage()
  renderIndexSection(doc, 'Índice por Ciudad', buildIndex(members, m => m.city))

  // --- Contact index ---
  doc.addPage()
  renderContactIndex(doc, members)

  // --- Birthday index ---
  doc.addPage()
  renderBirthdayIndex(doc, members)
}
