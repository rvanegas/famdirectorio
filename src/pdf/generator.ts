import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import * as membersRepo from '../core/members.repository'
import * as relRepo from '../core/relationships.repository'
import * as mediaRepo from '../core/media.repository'
import type { Member, Relationship } from '../core/types'
import { renderCover, renderForeword, renderFamilyCover } from './layouts/cover'
import { renderFamilyPage, type NuclearFamily } from './layouts/familyPage'
import { renderBranchDivider } from './layouts/branchPage'
import { renderIndexes } from './layouts/indexPage'

// Base color matches the root family cover page background
export const ROOT_COVER_COLOR = '#2E4057'

function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const v = max
  const s = max === 0 ? 0 : (max - min) / max
  let h = 0
  if (max !== min) {
    if (max === r) h = (60 * ((g - b) / (max - min)) + 360) % 360
    else if (max === g) h = 60 * ((b - r) / (max - min)) + 120
    else h = 60 * ((r - g) / (max - min)) + 240
  }
  return [h, s, v]
}

function hsvToHex(h: number, s: number, v: number): string {
  const i = Math.floor(h / 60) % 6
  const f = h / 60 - Math.floor(h / 60)
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
  const [r, g, b] = [
    [v, t, p, p, q, v], [q, v, v, t, p, p], [p, p, q, v, v, t],
  ].map(ch => ch[i])
  const hex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

// Compute branch colors: same H/S as root cover, V linearly from 100% down to 50% of base V
function branchColors(count: number): string[] {
  const [h, s, v] = hexToHsv(ROOT_COVER_COLOR)
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1)
    const range = (1 - v) * 0.5
    const vLow = Math.max(0, v - range * 0.2)
    const vHigh = Math.min(1, v + range * 1.2)
    return hsvToHex(h, s, vLow + (vHigh - vLow) * t)
  })
}

export type BranchSection = { id: number; firstName: string; lastName: string; colorHex: string }

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
  // Enrich photoPath from media table for members that don't have one set directly
  const primaryMedia = mediaRepo.findAll().filter(m => m.isPrimary)
  const primaryPhotoMap = new Map(primaryMedia.map(m => [m.memberId, m.filePath]))
  for (const m of allMembers) {
    if (!m.photoPath && primaryPhotoMap.has(m.id)) {
      m.photoPath = primaryPhotoMap.get(m.id)!
    }
  }
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
  const colors = branchColors(gen2Members.length)
  const gen2Map = new Map<number, BranchSection>()
  for (let i = 0; i < gen2Members.length; i++) {
    const m = gen2Members[i]
    gen2Map.set(m.id, {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName ?? '',
      colorHex: colors[i],
    })
  }

  // --- Cover (global) ---
  doc.addPage()
  renderCover(doc, allMembers.length)

  // --- Foreword ---
  const forewordPath = path.resolve(process.cwd(), 'data/foreword.md')
  if (fs.existsSync(forewordPath)) {
    doc.addPage()
    renderForeword(doc, fs.readFileSync(forewordPath, 'utf8'))
  }

  // --- Root family cover ---
  const rootMembers = allMembers.filter(m => rootSet.has(m.id))
  const gen2MembersList = allMembers.filter(m => isGen2(m.id, parentMap, rootSet))
  gen2MembersList.sort((a, b) => {
    if (a.seniority === null && b.seniority === null) return a.id - b.id
    if (a.seniority === null) return 1
    if (b.seniority === null) return -1
    return a.seniority - b.seniority
  })
  doc.addPage()
  renderFamilyCover(
    doc,
    rootMembers.map(m => ({ firstName: m.firstName, lastName: m.lastName ?? '' })),
    rootMembers.length + gen2MembersList.length,
  )

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
