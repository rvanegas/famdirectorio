import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import * as membersRepo from '../core/members.repository'
import * as branchesRepo from '../core/branches.repository'
import * as mediaRepo from '../core/media.repository'
import type { Branch, Member } from '../core/types'
import { renderCover } from './layouts/cover'
import { renderToc, type TocEntry } from './layouts/toc'
import { renderMemberPage, renderMemberGrid } from './layouts/memberPage'
import { renderBranchDivider } from './layouts/branchPage'

// Assign distinct colors to branches
const BRANCH_COLORS = [
  '#2E4057', '#048A81', '#54C6EB', '#8EE3EF', '#CAF0F8',
  '#5C4033', '#8D6E63', '#A1887F', '#795548', '#4E342E',
  '#1B5E20', '#2E7D32', '#388E3C', '#43A047', '#1565C0',
]

export interface GenerateOptions {
  branchName?: string
  memberId?: number
  outputPath?: string
}

export async function generatePdf(options: GenerateOptions = {}): Promise<string> {
  const outputDir = path.resolve(process.cwd(), 'data/output')
  fs.mkdirSync(outputDir, { recursive: true })

  const dateStr = new Date().toISOString().slice(0, 10)
  const suffix = options.branchName
    ? `-${options.branchName.replace(/\s+/g, '-')}`
    : options.memberId
    ? `-member-${options.memberId}`
    : ''
  const outputPath = options.outputPath ?? path.join(outputDir, `yearbook${suffix}-${dateStr}.pdf`)

  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 0,
    autoFirstPage: false,
    bufferPages: true,
  })

  const stream = fs.createWriteStream(outputPath)
  doc.pipe(stream)

  // --- Collect data ---
  let allBranches = branchesRepo.findAll()

  // Assign colors
  const branchMap = new Map<number, Branch>()
  allBranches = allBranches.map((b, i) => {
    const colored = { ...b, colorHex: b.colorHex ?? BRANCH_COLORS[i % BRANCH_COLORS.length] }
    branchMap.set(colored.id, colored)
    return colored
  })

  let allMembers: Member[]
  if (options.memberId) {
    const m = membersRepo.findById(options.memberId)
    allMembers = m ? [m] : []
  } else if (options.branchName) {
    const branch = branchesRepo.findByName(options.branchName)
    if (!branch) throw new Error(`Branch "${options.branchName}" not found`)
    allMembers = branchesRepo.findMembersInBranch(branch.id)
    allBranches = [{ ...branch, colorHex: branchMap.get(branch.id)?.colorHex ?? null }]
  } else {
    allMembers = membersRepo.findAll()
  }

  const tocEntries: TocEntry[] = []

  // --- Cover ---
  doc.addPage()
  renderCover(doc, allMembers.length, allBranches.length)
  tocEntries.push({ label: 'Portada', pageNumber: 1 })

  // --- TOC placeholder (will be filled via bufferedPageRange) ---
  doc.addPage()
  const tocPageIndex = doc.bufferedPageRange().count - 1

  // --- Member pages ---
  if (options.memberId) {
    // Single member
    const member = allMembers[0]
    if (member) {
      doc.addPage()
      renderMemberPage(doc, member, member.branchId ? branchMap.get(member.branchId) ?? null : null)
    }
  } else {
    // Group by branch → sorted by generation within each branch
    const membersByBranch = new Map<number | null, Member[]>()
    for (const member of allMembers) {
      const key = member.branchId ?? null
      if (!membersByBranch.has(key)) membersByBranch.set(key, [])
      membersByBranch.get(key)!.push(member)
    }

    // First: root members (no branch)
    const rootMembers = membersByBranch.get(null) ?? []
    for (const m of rootMembers.sort((a, b) => (a.generation ?? 99) - (b.generation ?? 99))) {
      doc.addPage()
      renderMemberPage(doc, m, null)
    }

    // Then each branch
    for (const branch of allBranches) {
      const branchMembers = (membersByBranch.get(branch.id) ?? []).sort(
        (a, b) => (a.generation ?? 99) - (b.generation ?? 99),
      )
      if (branchMembers.length === 0) continue

      // Branch divider page
      doc.addPage()
      const branchPageNum = doc.bufferedPageRange().count
      renderBranchDivider(doc, branch, branchMembers.length)
      tocEntries.push({ label: branch.name, pageNumber: branchPageNum })

      // Gen 1-2 members: full page each
      const fullPageMembers = branchMembers.filter((m) => (m.generation ?? 99) <= 2)
      const gridMembers = branchMembers.filter((m) => (m.generation ?? 99) > 2)

      for (const m of fullPageMembers) {
        doc.addPage()
        renderMemberPage(doc, m, branchMap.get(branch.id) ?? null)
      }

      // Gen 3+: 4-per-page grid
      for (let i = 0; i < gridMembers.length; i += 4) {
        doc.addPage()
        renderMemberGrid(doc, gridMembers.slice(i, i + 4), branchMap)
      }
    }
  }

  // --- Fill TOC ---
  doc.switchToPage(tocPageIndex)
  renderToc(doc, tocEntries)

  doc.end()

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  return outputPath
}
