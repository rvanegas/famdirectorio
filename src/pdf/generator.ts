import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import * as membersRepo from '../core/members.repository'
import * as branchesRepo from '../core/branches.repository'
import * as relRepo from '../core/relationships.repository'
import type { Branch, Member, Relationship } from '../core/types'
import { renderCover } from './layouts/cover'
import { renderFamilyPage, type NuclearFamily } from './layouts/familyPage'
import { renderBranchDivider } from './layouts/branchPage'

// Assign distinct colors to branches
const BRANCH_COLORS = [
  '#2E4057', '#048A81', '#54C6EB', '#8EE3EF', '#CAF0F8',
  '#5C4033', '#8D6E63', '#A1887F', '#795548', '#4E342E',
  '#1B5E20', '#2E7D32', '#388E3C', '#43A047', '#1565C0',
]

export interface GenerateOptions {
  outputPath?: string
}

function buildNuclearFamilies(
  members: Member[],
  allRels: Relationship[],
  memberMap: Map<number, Member>,
  branchMap: Map<number, Branch>,
): NuclearFamily[] {
  // Build spouse and children lookup maps from all relationships
  const spouseMap = new Map<number, number[]>()
  const childrenMap = new Map<number, number[]>()

  for (const rel of allRels) {
    if (rel.type === 'spouse') {
      for (const [a, b] of [[rel.fromMemberId, rel.toMemberId], [rel.toMemberId, rel.fromMemberId]] as [number, number][]) {
        if (!spouseMap.has(a)) spouseMap.set(a, [])
        if (!spouseMap.get(a)!.includes(b)) spouseMap.get(a)!.push(b)
      }
    }
    if (rel.type === 'child') {
      // fromMemberId is parent, toMemberId is child
      if (!childrenMap.has(rel.fromMemberId)) childrenMap.set(rel.fromMemberId, [])
      childrenMap.get(rel.fromMemberId)!.push(rel.toMemberId)
    }
  }

  const processed = new Set<number>()
  const families: NuclearFamily[] = []

  for (const member of members) {
    if (processed.has(member.id)) continue
    processed.add(member.id)

    const heads: Member[] = [member]

    // Add spouse if not yet processed
    for (const spouseId of spouseMap.get(member.id) ?? []) {
      if (!processed.has(spouseId)) {
        const spouse = memberMap.get(spouseId)
        if (spouse) {
          heads.push(spouse)
          processed.add(spouseId)
        }
      }
    }

    // Collect children from all heads (union, deduped)
    const childIds = new Set<number>()
    for (const head of heads) {
      for (const cid of childrenMap.get(head.id) ?? []) {
        childIds.add(cid)
      }
    }

    const children = [...childIds]
      .map(id => memberMap.get(id))
      .filter(Boolean) as Member[]
    children.sort((a, b) => a.id - b.id)

    const branch = member.branchId ? branchMap.get(member.branchId) ?? null : null

    // Only create a family page if there's a spouse or children
    if (heads.length < 2 && children.length === 0) continue

    families.push({
      heads,
      children,
      generation: member.generation ?? 99,
      branch,
    })
  }

  return families
}

export async function generatePdf(options: GenerateOptions = {}): Promise<string> {
  const outputDir = path.resolve(process.cwd(), 'data/output')
  fs.mkdirSync(outputDir, { recursive: true })

  const dateStr = new Date().toISOString().slice(0, 10)
  const outputPath = options.outputPath ?? path.join(outputDir, `yearbook-${dateStr}.pdf`)

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

  const allMembers = membersRepo.findAll()
  const memberMap = new Map(allMembers.map(m => [m.id, m]))
  const allRels = relRepo.findAll()

  // --- Cover ---
  doc.addPage()
  renderCover(doc, allMembers.length, allBranches.length)


  // --- Family pages ---
  {
    const allFamilies = buildNuclearFamilies(allMembers, allRels, memberMap, branchMap)

    // Group families by branch (null = root)
    const familiesByBranch = new Map<number | null, NuclearFamily[]>()
    for (const family of allFamilies) {
      const key = family.branch?.id ?? null
      if (!familiesByBranch.has(key)) familiesByBranch.set(key, [])
      familiesByBranch.get(key)!.push(family)
    }

    // Sort families within each group by generation
    for (const [, families] of familiesByBranch) {
      families.sort((a, b) => a.generation - b.generation)
    }

    // First: root families (no branch), sorted by generation
    const rootFamilies = familiesByBranch.get(null) ?? []
    for (const family of rootFamilies) {
      doc.addPage()
      renderFamilyPage(doc, family)
    }

    // Then each branch
    for (const branch of allBranches) {
      const branchFamilies = familiesByBranch.get(branch.id) ?? []
      if (branchFamilies.length === 0) continue

      // Branch divider page
      doc.addPage()
      const branchPageNum = doc.bufferedPageRange().count
      renderBranchDivider(doc, branch, branchFamilies.reduce((n, f) => n + f.heads.length, 0))

      // One page per nuclear family
      for (const family of branchFamilies) {
        doc.addPage()
        renderFamilyPage(doc, family)
      }
    }
  }

  doc.end()

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  return outputPath
}
