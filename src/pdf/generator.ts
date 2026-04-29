import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { PDFDocument as LibPDFDocument, PDFName, PDFArray, PDFDict } from 'pdf-lib'
import * as membersRepo from '../core/members.repository'
import * as relRepo from '../core/relationships.repository'
import * as mediaRepo from '../core/media.repository'
import * as nucFamRepo from '../core/nuclearFamilies.repository'
import * as familyNotesRepo from '../core/familyNotes.repository'
import * as orphansRepo from '../core/orphans.repository'
import { getNextVersion } from '../core/pdfSettings.repository'
import type { Member, Relationship, MediaAsset } from '../core/types'
import { renderCover, renderForeword, renderFamilyCover } from './layouts/cover'
import { renderFamilyPage, type NuclearFamily } from './layouts/familyPage'
import { renderBranchDivider } from './layouts/branchPage'
import { renderIndexes, renderOrphansPage } from './layouts/indexPage'
import { registerFonts, ROOT_PALETTE, BRANCH_PALETTE, type BranchPalette } from './theme'
import { config } from '../config'

export type BranchSection = { id: number; firstName: string; lastName: string; palette: BranchPalette }

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
  notesByFamilyId: Map<number, string[]>,
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
    const notes = dbFamily ? (notesByFamilyId.get(dbFamily.id) ?? []) : []

    families.push({
      heads,
      children,
      branch,
      familyMedia,
      familyId: dbFamily?.id ?? null,
      notes,
    })
  }

  return families
}

export async function generatePdf(options: GenerateOptions = {}): Promise<string> {
  const outputDir = path.join(config.dir, 'data/output')
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
  registerFonts(doc)

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

  // Build Gen-2 sections.
  const gen2Members = allMembers.filter(m => isGen2(m.id, parentMap, rootSet))
  gen2Members.sort((a, b) => {
    if (a.seniority === null && b.seniority === null) return a.id - b.id
    if (a.seniority === null) return 1
    if (b.seniority === null) return -1
    return a.seniority - b.seniority
  })
  const gen2Map = new Map<number, BranchSection>()
  for (const m of gen2Members) {
    gen2Map.set(m.id, {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName ?? '',
      palette: BRANCH_PALETTE,
    })
  }

  // --- Cover (global) ---
  doc.addPage()
  renderCover(doc, allMembers.length, version)

  // --- Foreword ---
  const forewordPath = path.join(config.dir, 'data/foreword.md')
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
    ROOT_PALETTE,
  )

  // --- Family pages ---
  const dbFamilies = nucFamRepo.findAll()
  const familyMediaMap = new Map<number, MediaAsset[]>()
  for (const f of dbFamilies) {
    const assets = mediaRepo.findByFamily(f.id)
    if (assets.length > 0) familyMediaMap.set(f.id, assets)
  }
  const allNotes = familyNotesRepo.findAll()
  const notesByFamilyId = new Map<number, string[]>()
  for (const note of allNotes) {
    if (!notesByFamilyId.has(note.familyId)) notesByFamilyId.set(note.familyId, [])
    notesByFamilyId.get(note.familyId)!.push(note.content)
  }
  const allFamilies = buildNuclearFamilies(allMembers, allRels, memberMap, gen2Map, parentMap, rootSet, dbFamilies, familyMediaMap, notesByFamilyId)

  {
    // Group families by Gen-2 section (null = root)
    const familiesBySection = new Map<number | null, NuclearFamily[]>()
    for (const family of allFamilies) {
      const key = family.branch?.id ?? null
      if (!familiesBySection.has(key)) familiesBySection.set(key, [])
      familiesBySection.get(key)!.push(family)
    }

    // Sort families depth-first: follow each family's lineage before siblings
    const sortFamiliesDepthFirst = (families: NuclearFamily[]): NuclearFamily[] => {
      const familyByHeadId = new Map<number, NuclearFamily>()
      for (const family of families) {
        for (const head of family.heads) familyByHeadId.set(head.id, family)
      }

      const childFamiliesOf = new Map<NuclearFamily, NuclearFamily[]>()
      const hasParentFamily = new Set<NuclearFamily>()
      for (const family of families) {
        const kids: NuclearFamily[] = []
        for (const child of family.children) {
          const cf = familyByHeadId.get(child.id)
          if (cf && cf !== family) { kids.push(cf); hasParentFamily.add(cf) }
        }
        kids.sort((a, b) => {
          const ah = a.heads[0], bh = b.heads[0]
          const as_ = ah.seniority ?? Infinity, bs = bh.seniority ?? Infinity
          return as_ !== bs ? as_ - bs : ah.id - bh.id
        })
        childFamiliesOf.set(family, kids)
      }

      const roots = families
        .filter(f => !hasParentFamily.has(f))
        .sort((a, b) => {
          const ah = a.heads[0], bh = b.heads[0]
          const as_ = ah.seniority ?? Infinity, bs = bh.seniority ?? Infinity
          return as_ !== bs ? as_ - bs : ah.id - bh.id
        })

      const result: NuclearFamily[] = []
      const visited = new Set<NuclearFamily>()
      const dfs = (f: NuclearFamily) => {
        if (visited.has(f)) return
        visited.add(f); result.push(f)
        for (const cf of childFamiliesOf.get(f) ?? []) dfs(cf)
      }
      for (const root of roots) dfs(root)
      for (const f of families) { if (!visited.has(f)) result.push(f) }
      return result
    }
    for (const [key, families] of familiesBySection) {
      familiesBySection.set(key, sortFamiliesDepthFirst(families))
    }

    // First: root families (no section), sorted by generation
    const origenPalette = ROOT_PALETTE
    const rootFamilies = familiesBySection.get(null) ?? []
    for (const family of rootFamilies) {
      doc.addPage()
      renderFamilyPage(doc, family, origenPalette)
    }

    // Then each Gen-2 section
    let branchIndex = 1
    for (const section of gen2Map.values()) {
      const sectionFamilies = familiesBySection.get(section.id) ?? []
      if (sectionFamilies.length === 0) continue

      doc.addPage()
      renderBranchDivider(doc, section, new Set(sectionFamilies.flatMap(f => [...f.heads, ...f.children].map(m => m.id))).size, branchIndex++)


      for (const family of sectionFamilies) {
        doc.addPage()
        renderFamilyPage(doc, family)
      }
    }
  }

  // --- Por Identificar ---
  const allOrphans = orphansRepo.findAll()
  if (allOrphans.length > 0) {
    doc.addPage()
    renderOrphansPage(doc, allOrphans)
  }

  // --- Indexes ---
  renderIndexes(doc, allMembers)

  doc.end()

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  // Remove AcroForm and widget annotations that PDFKit adds by default,
  // which causes macOS Preview to show an unwanted "AutoFill" banner.
  const pdfBytes = fs.readFileSync(outputPath)
  const pdfDoc = await LibPDFDocument.load(pdfBytes)
  pdfDoc.catalog.delete(PDFName.of('AcroForm'))
  for (const page of pdfDoc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (!annots) continue
    const nonWidgets = annots.asArray().filter((ref) => {
      const annot = pdfDoc.context.lookupMaybe(ref, PDFDict)
      if (!annot) return true
      const subtype = annot.lookupMaybe(PDFName.of('Subtype'), PDFName)
      return subtype?.asString() !== 'Widget'
    })
    if (nonWidgets.length === 0) {
      page.node.delete(PDFName.of('Annots'))
    } else {
      page.node.set(PDFName.of('Annots'), pdfDoc.context.obj(nonWidgets))
    }
  }
  fs.writeFileSync(outputPath, await pdfDoc.save())

  return outputPath
}
