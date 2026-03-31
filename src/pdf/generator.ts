import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { PDFDocument as LibPDFDocument, PDFName } from 'pdf-lib'
import * as membersRepo from '../core/members.repository'
import * as relRepo from '../core/relationships.repository'
import * as mediaRepo from '../core/media.repository'
import * as nucFamRepo from '../core/nuclearFamilies.repository'
import { getNextVersion } from '../core/pdfSettings.repository'
import type { Member, Relationship, MediaAsset } from '../core/types'
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

// A member is Gen-2 if any of their parents is a root member.
function isGen2(id: number, parentMap: Map<number, number[]>, rootSet: Set<number>): boolean {
  return (parentMap.get(id) ?? []).some(parentId => rootSet.has(parentId))
}

function resolveGen2Ancestor(
  memberId: number,
  parentMap: Map<number, number[]>,
  rootSet: Set<number>,
): number | null {
  const visited = new Set<number>()
  function dfs(id: number): number | null {
    if (visited.has(id)) return null
    visited.add(id)
    if (isGen2(id, parentMap, rootSet)) return id
    for (const parentId of parentMap.get(id) ?? []) {
      const result = dfs(parentId)
      if (result !== null) return result
    }
    return null
  }
  return dfs(memberId)
}

function buildNuclearFamilies(
  members: Member[],
  allRels: Relationship[],
  memberMap: Map<number, Member>,
  gen2Map: Map<number, BranchSection>,
  parentMap: Map<number, number[]>,
  rootSet: Set<number>,
  dbFamilies: nucFamRepo.NuclearFamilyRow[],
  familyMediaMap: Map<number, MediaAsset[]>,
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

    // Blood member (has parents in the tree) goes first; in-law goes second
    if (heads.length === 2) {
      const hasParents = (m: Member) => (parentMap.get(m.id) ?? []).length > 0
      if (!hasParents(heads[0]) && hasParents(heads[1])) {
        heads.reverse()
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

    const headIds = new Set(heads.map(h => h.id))
    const dbFamily = dbFamilies.find(f => {
      const p1 = f.parent1Id, p2 = f.parent2Id ?? null
      return headIds.has(p1) && (p2 === null ? headIds.size === 1 : headIds.has(p2))
    })
    const familyMedia = dbFamily ? (familyMediaMap.get(dbFamily.id) ?? []) : []

    families.push({
      heads,
      children,
      branch,
      familyMedia,
    })
  }

  return families
}

export async function generatePdf(options: GenerateOptions = {}): Promise<string> {
  const outputDir = path.resolve(process.cwd(), 'data/output')
  fs.mkdirSync(outputDir, { recursive: true })

  const dateStr = new Date().toISOString().slice(0, 10)
  const version = getNextVersion()
  const outputPath = options.outputPath ?? path.join(outputDir, `Directorio Durán Mazuera v${version} ${dateStr}.pdf`)

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

  const parentMap = new Map<number, number[]>()
  for (const rel of allRels) {
    if (rel.type === 'child') {
      const parents = parentMap.get(rel.toMemberId) ?? []
      parents.push(rel.fromMemberId)
      parentMap.set(rel.toMemberId, parents)
    }
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
  renderCover(doc, allMembers.length, version)

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
    const dbFamilies = nucFamRepo.findAll()
    const familyMediaMap = new Map<number, MediaAsset[]>()
    for (const f of dbFamilies) {
      const assets = mediaRepo.findByFamily(f.id)
      if (assets.length > 0) familyMediaMap.set(f.id, assets)
    }
    const allFamilies = buildNuclearFamilies(allMembers, allRels, memberMap, gen2Map, parentMap, rootSet, dbFamilies, familyMediaMap)

    // Group families by Gen-2 section (null = root)
    const familiesBySection = new Map<number | null, NuclearFamily[]>()
    for (const family of allFamilies) {
      const key = family.branch?.id ?? null
      if (!familiesBySection.has(key)) familiesBySection.set(key, [])
      familiesBySection.get(key)!.push(family)
    }

    // Sort families: primary by generation (stored, spouse-aware), secondary by seniority
    const familySortKey = (f: NuclearFamily) => {
      const head = f.heads[0]
      const depth = head.generation ?? 1
      const seniority = head.seniority ?? Infinity
      return [depth, seniority, head.id] as [number, number, number]
    }
    const cmpFamilies = (a: NuclearFamily, b: NuclearFamily) => {
      const [ad, as_, ai] = familySortKey(a)
      const [bd, bs, bi] = familySortKey(b)
      return ad !== bd ? ad - bd : as_ !== bs ? as_ - bs : ai - bi
    }
    for (const [, families] of familiesBySection) {
      families.sort(cmpFamilies)
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

  // Remove empty AcroForm entry that PDFKit adds by default, which causes
  // macOS Preview to show an unwanted "AutoFill" banner.
  const pdfBytes = fs.readFileSync(outputPath)
  const pdfDoc = await LibPDFDocument.load(pdfBytes)
  pdfDoc.catalog.delete(PDFName.of('AcroForm'))
  fs.writeFileSync(outputPath, await pdfDoc.save())

  return outputPath
}
