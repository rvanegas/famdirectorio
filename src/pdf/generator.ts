import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import * as membersRepo from '../core/members.repository'
import * as relRepo from '../core/relationships.repository'
import type { Member, Relationship } from '../core/types'
import { renderCover } from './layouts/cover'
import { renderFamilyPage, type NuclearFamily } from './layouts/familyPage'
import { renderBranchDivider } from './layouts/branchPage'
import { renderIndexes } from './layouts/indexPage'

// Assign distinct colors to Gen-2 sections
const BRANCH_COLORS = [
  '#2E4057', '#048A81', '#54C6EB', '#8EE3EF', '#CAF0F8',
  '#5C4033', '#8D6E63', '#A1887F', '#795548', '#4E342E',
  '#1B5E20', '#2E7D32', '#388E3C', '#43A047', '#1565C0',
]

export type BranchSection = { id: number; name: string; colorHex: string }

export interface GenerateOptions {
  outputPath?: string
}

// A member is Gen-2 if their parent is a root member.
function isGen2(id: number, parentMap: Map<number, number>, rootSet: Set<number>): boolean {
  const parentId = parentMap.get(id)
  return parentId !== undefined && rootSet.has(parentId)
}

function depthFromRoot(id: number, parentMap: Map<number, number>, rootSet: Set<number>): number {
  if (rootSet.has(id)) return 1
  let depth = 1
  let current: number | undefined = id
  while ((current = parentMap.get(current)) !== undefined) {
    depth++
    if (rootSet.has(current)) break
  }
  return depth
}

function resolveGen2Ancestor(
  memberId: number,
  parentMap: Map<number, number>,
  rootSet: Set<number>,
): number | null {
  let id: number | undefined = memberId
  for (let i = 0; i < 10; i++) {
    if (id === undefined) return null
    if (isGen2(id, parentMap, rootSet)) return id
    id = parentMap.get(id)
  }
  return null
}

function buildNuclearFamilies(
  members: Member[],
  allRels: Relationship[],
  memberMap: Map<number, Member>,
  gen2Map: Map<number, BranchSection>,
  parentMap: Map<number, number>,
  rootSet: Set<number>,
): NuclearFamily[] {
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

    for (const spouseId of spouseMap.get(member.id) ?? []) {
      if (!processed.has(spouseId)) {
        const spouse = memberMap.get(spouseId)
        if (spouse) {
          heads.push(spouse)
          processed.add(spouseId)
        }
      }
    }

    const childIds = new Set<number>()
    for (const head of heads) {
      for (const cid of childrenMap.get(head.id) ?? []) {
        childIds.add(cid)
      }
    }

    const children = [...childIds]
      .map(id => memberMap.get(id))
      .filter(Boolean) as Member[]
    children.sort((a, b) => {
      if (a.seniority === null && b.seniority === null) return a.id - b.id
      if (a.seniority === null) return 1
      if (b.seniority === null) return -1
      return a.seniority - b.seniority
    })

    if (heads.length < 2 && children.length === 0) continue

    let gen2Id: number | null = null
    for (const head of heads) {
      gen2Id = resolveGen2Ancestor(head.id, parentMap, rootSet)
      if (gen2Id) break
    }
    const branch = gen2Id ? gen2Map.get(gen2Id) ?? null : null

    families.push({
      heads,
      children,
      branch,
    })
  }

  return families
}

export async function generatePdf(options: GenerateOptions = {}): Promise<string> {
  const outputDir = path.resolve(process.cwd(), 'data/output')
  fs.mkdirSync(outputDir, { recursive: true })

  const dateStr = new Date().toISOString().slice(0, 10)
  const outputPath = options.outputPath ?? path.join(outputDir, `Directorio Durán Mazuera ${dateStr}.pdf`)

  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 0,
    autoFirstPage: false,
    bufferPages: true,
  })

  const stream = fs.createWriteStream(outputPath)
  doc.pipe(stream)

  // --- Collect data ---
  const allMembers = membersRepo.findAll()
  const memberMap = new Map(allMembers.map(m => [m.id, m]))
  const allRels = relRepo.findAll()

  const parentMap = new Map<number, number>()
  for (const rel of allRels) {
    if (rel.type === 'child') parentMap.set(rel.toMemberId, rel.fromMemberId)
  }

  const rootSet = new Set(allMembers.filter(m => m.isRoot).map(m => m.id))

  // Build Gen-2 sections with ad hoc colors
  const gen2Members = allMembers.filter(m => isGen2(m.id, parentMap, rootSet))
  gen2Members.sort((a, b) => {
    if (a.seniority === null && b.seniority === null) return a.id - b.id
    if (a.seniority === null) return 1
    if (b.seniority === null) return -1
    return a.seniority - b.seniority
  })
  const gen2Map = new Map<number, BranchSection>()
  for (let i = 0; i < gen2Members.length; i++) {
    const m = gen2Members[i]
    gen2Map.set(m.id, {
      id: m.id,
      name: `Rama ${m.firstName} ${m.lastName ?? ''}`.trim(),
      colorHex: BRANCH_COLORS[i % BRANCH_COLORS.length],
    })
  }

  // --- Cover ---
  doc.addPage()
  renderCover(doc, allMembers.length)

  // --- Family pages ---
  {
    const allFamilies = buildNuclearFamilies(allMembers, allRels, memberMap, gen2Map, parentMap, rootSet)

    // Group families by Gen-2 section (null = root)
    const familiesBySection = new Map<number | null, NuclearFamily[]>()
    for (const family of allFamilies) {
      const key = family.branch?.id ?? null
      if (!familiesBySection.has(key)) familiesBySection.set(key, [])
      familiesBySection.get(key)!.push(family)
    }

    // Sort families within each group by depth from root
    for (const [, families] of familiesBySection) {
      families.sort((a, b) => depthFromRoot(a.heads[0].id, parentMap, rootSet) - depthFromRoot(b.heads[0].id, parentMap, rootSet))
    }

    // First: root families (no section), sorted by generation
    const rootFamilies = familiesBySection.get(null) ?? []
    for (const family of rootFamilies) {
      doc.addPage()
      renderFamilyPage(doc, family)
    }

    // Then each Gen-2 section
    for (const section of gen2Map.values()) {
      const sectionFamilies = familiesBySection.get(section.id) ?? []
      if (sectionFamilies.length === 0) continue

      doc.addPage()
      renderBranchDivider(doc, section, sectionFamilies.reduce((n, f) => n + f.heads.length, 0))

      for (const family of sectionFamilies) {
        doc.addPage()
        renderFamilyPage(doc, family)
      }
    }
  }

  // --- Indexes ---
  renderIndexes(doc, allMembers)

  doc.end()

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  return outputPath
}
