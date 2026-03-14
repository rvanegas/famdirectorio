/**
 * Infers parent-child and spouse relationships from the free-text "Relación" field.
 *
 * Patterns handled:
 *   "Hijo/Hija [de] {parent} [nieto/nieta/hijo/hija [de] {qualifier}]"
 *   "Esposo/Esposa/Cónyuge [de] {spouse} [hijo/hija [de] {qualifier}]"
 *
 * The optional qualifier (e.g. "nieto de Gonzalo") is used to disambiguate
 * when multiple members share the same first name.
 */

import type { NewRelationship } from '../db/schema'

interface ResolvableMember {
  id: number
  firstName: string
  generation: number | null
  relationText: string | null
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/\s+/g, ' ')
}

function buildNameMap(members: ResolvableMember[]): Map<string, ResolvableMember[]> {
  const map = new Map<string, ResolvableMember[]>()
  for (const m of members) {
    const key = norm(m.firstName)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(m)
  }
  return map
}

function resolveCandidate(
  rawName: string,
  rawQualifier: string | undefined,
  childGeneration: number | null,
  nameMap: Map<string, ResolvableMember[]>,
): ResolvableMember | null {
  let candidates = nameMap.get(norm(rawName)) ?? []
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  // Disambiguate: qualifier name appears somewhere in candidate's own relationText
  if (rawQualifier) {
    const q = norm(rawQualifier)
    const filtered = candidates.filter(
      (m) => m.relationText && norm(m.relationText).includes(q),
    )
    if (filtered.length === 1) return filtered[0]
    if (filtered.length > 0) candidates = filtered
  }

  // Disambiguate: parent's generation should be one less than child's
  if (childGeneration !== null) {
    const genFiltered = candidates.filter((m) => m.generation === childGeneration - 1)
    if (genFiltered.length === 1) return genFiltered[0]
    if (genFiltered.length > 0) candidates = genFiltered
  }

  return null // still ambiguous — skip
}

// hijo/hija [de] {parent} [ , nieto|nieta|hijo|hija [de] {qualifier} ]
const CHILD_RE =
  /(?:hijo|hija)\s+(?:de\s+)?(.+?)(?:,?\s+(?:nieto|nieta|hijo|hija)(?:\s+de?\s+|\s+)(.+))?$/i

// esposo|esposa|cónyuge [de] {spouse} [ , hijo|hija [de] {qualifier} ]
const SPOUSE_RE =
  /(?:esposo|esposa|c[oó]nyuge)\s+(?:de\s+)?(.+?)(?:,?\s+(?:hijo|hija)(?:\s+de?\s+|\s+)(.+))?$/i

export interface ResolveResult {
  relationships: NewRelationship[]
  unresolved: { memberId: number; text: string; reason: string }[]
}

export function resolveRelationships(
  members: ResolvableMember[],
  existingChildToIds: Set<number>,
  existingSpouseIds: Set<number>,
): ResolveResult {
  const nameMap = buildNameMap(members)
  const relationships: NewRelationship[] = []
  const unresolved: ResolveResult['unresolved'] = []

  const resolvedChildren = new Set(existingChildToIds)
  const resolvedSpouses = new Set(existingSpouseIds)

  for (const member of members) {
    if (!member.relationText) continue

    // Fix missing space in "deMaria", "deJaime", etc.
    const text = member.relationText.trim().replace(/\bde([A-ZÁÉÍÓÚÜÑ])/g, 'de $1')

    // --- Parent relationship ---
    if (!resolvedChildren.has(member.id)) {
      const m = CHILD_RE.exec(text)
      if (m) {
        const parentName = m[1].trim()
        const qualifier = m[2]?.trim()
        const parent = resolveCandidate(parentName, qualifier, member.generation, nameMap)
        if (parent && parent.id !== member.id) {
          relationships.push({
            fromMemberId: parent.id,
            toMemberId: member.id,
            type: 'child',
            notes: null,
          })
          resolvedChildren.add(member.id)
        } else {
          unresolved.push({
            memberId: member.id,
            text: member.relationText,
            reason: parent
              ? 'resolved to self'
              : `no match for "${parentName}"${qualifier ? ` (qualifier: "${qualifier}")` : ''}`,
          })
        }
      }
    }

    // --- Spouse relationship ---
    if (!resolvedSpouses.has(member.id)) {
      const m = SPOUSE_RE.exec(text)
      if (m) {
        const spouseName = m[1].trim()
        const qualifier = m[2]?.trim()
        const spouse = resolveCandidate(spouseName, qualifier, null, nameMap)
        if (spouse && spouse.id !== member.id && !resolvedSpouses.has(spouse.id)) {
          relationships.push({
            fromMemberId: member.id,
            toMemberId: spouse.id,
            type: 'spouse',
            notes: null,
          })
          resolvedSpouses.add(member.id)
          resolvedSpouses.add(spouse.id)
        } else if (!spouse) {
          unresolved.push({
            memberId: member.id,
            text: member.relationText,
            reason: `no match for spouse "${spouseName}"${qualifier ? ` (qualifier: "${qualifier}")` : ''}`,
          })
        }
      }
    }
  }

  return { relationships, unresolved }
}
