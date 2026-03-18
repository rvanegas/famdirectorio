import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import * as membersRepo from '../core/members.repository'
import * as relRepo from '../core/relationships.repository'
import type { Member, Relationship } from '../core/types'
import { renderCover } from './layouts/cover'
import { renderFamilyPage, type NuclearFamily } from './layouts/familyPage'
import { renderBranchDivider } from './layouts/branchPage'

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

function resolveGen2Ancestor(
  memberId: number,
  parentMap: Map<number, number>,
  memberMap: Map<number, Member>,
): number | null {
  let id: number | undefined = memberId
  for (let depth = 0; depth < 10; depth++) {
    const m = memberMap.get(id)
    if (!m) return null
    if (m.generation === 2) return m.id
    id = parentMap.get(id)
    if (id === undefined) return null
  }
  return null
}

function buildNuclearFamilies(
  members: Member[],
  allRels: Relationship[],
  memberMap: Map<number, Member>,
  gen2Map: Map<number, BranchSection>,
): NuclearFamily[] {
  const spouseMap = new Map<number, number[]>()
  const childrenMap = new Map<number, number[]>()
  const parentMap = new Map<number, number>()

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
      parentMap.set(rel.toMemberId, rel.fromMemberId)
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
    children.sort((a, b) => a.id - b.id)

    if (heads.length < 2 && children.length === 0) continue

    const gen2Id = resolveGen2Ancestor(member.id, parentMap, memberMap)
    const branch = gen2Id ? gen2Map.get(gen2Id) ?? null : null

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
  const allMembers = membersRepo.findAll()
  const memberMap = new Map(allMembers.map(m => [m.id, m]))
  const allRels = relRepo.findAll()

  // Build Gen-2 sections with ad hoc colors
  const gen2Members = membersRepo.findByGeneration(2)
  gen2Members.sort((a, b) => a.id - b.id)
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
    const allFamilies = buildNuclearFamilies(allMembers, allRels, memberMap, gen2Map)

    // Group families by Gen-2 section (null = root)
    const familiesBySection = new Map<number | null, NuclearFamily[]>()
    for (const family of allFamilies) {
      const key = family.branch?.id ?? null
      if (!familiesBySection.has(key)) familiesBySection.set(key, [])
      familiesBySection.get(key)!.push(family)
    }

    // Sort families within each group by generation
    for (const [, families] of familiesBySection) {
      families.sort((a, b) => a.generation - b.generation)
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

  doc.end()

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  return outputPath
}
