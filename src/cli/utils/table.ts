import chalk from 'chalk'
import type { Member, MediaAsset } from '../../core/types'
import type { NuclearFamilyRow } from '../../core/nuclearFamilies.repository'

type MemberField = 'city' | 'alive' | 'email' | 'phone' | 'instagram' | 'occupation' | 'seniority' | 'attended2023' | 'birthday' | 'notes' | 'generation'

const EXTRA_FIELD_CONFIG: Record<MemberField, { label: string; width: number; value: (m: Member) => string }> = {
  generation:   { label: 'Gen',          width:  5, value: m => m.generation !== null ? String(m.generation) : '-' },
  city:         { label: 'City',         width: 16, value: m => m.city ?? '-' },
  alive:        { label: 'Alive',        width:  6, value: m => m.isAlive ? 'Y' : 'N' },
  email:        { label: 'Email',        width: 28, value: m => m.email ?? '-' },
  phone:        { label: 'Phone',        width: 16, value: m => m.phone ?? '-' },
  instagram:    { label: 'Instagram',    width: 20, value: m => m.instagram ?? '-' },
  occupation:   { label: 'Occupation',   width: 20, value: m => m.occupation ?? '-' },
  seniority:    { label: 'Seniority',    width: 10, value: m => m.seniority !== null ? String(m.seniority) : '-' },
  attended2023: { label: 'Att.2023',     width: 10, value: m => m.attended2023 ? 'Y' : 'N' },
  birthday:     { label: 'Birthday',     width: 10, value: m => m.birthday ?? '-' },
  notes:        { label: 'Notes',        width: 30, value: m => m.notes ?? '-' },
}

export function membersTable(members: Member[], extraFields: string[] = []): string {
  const extras = extraFields
    .map(f => f as MemberField)
    .filter(f => f in EXTRA_FIELD_CONFIG)
    .map(f => EXTRA_FIELD_CONFIG[f])

  const header = chalk.cyan(
    `${'ID'.padEnd(6)}${'Name'.padEnd(30)}` +
    extras.map(f => `  ${f.label.padEnd(f.width)}`).join('')
  )
  const rows = members.map(m => {
    const name = `${m.firstName} ${m.lastName ?? ''}`.trim()
    return `${String(m.id).padEnd(6)}${name.padEnd(30)}` +
      extras.map(f => `  ${f.value(m).padEnd(f.width)}`).join('')
  })
  return [header, ...rows].join('\n')
}

export function memberDetail(m: Member): string {
  const lines = [
    `ID:            ${m.id}`,
    `Name:          ${m.firstName} ${m.lastName ?? ''}`,
    `City:          ${m.city ?? '-'}`,
    `Occupation:    ${m.occupation ?? '-'}`,
    `Phone:         ${m.phone ?? '-'}`,
    `Email:         ${m.email ?? '-'}`,
    `Instagram:     ${m.instagram ?? '-'}`,
    `Birthday:      ${m.birthday ?? '-'}`,
    `Seniority:     ${m.seniority ?? '-'}`,
    `Alive:         ${m.isAlive ? 'Yes' : 'No'}`,
    `Attended 2023: ${m.attended2023 ? 'Yes' : 'No'}`,
    `Notes:         ${m.notes ?? '-'}`,
  ]
  return lines.join('\n')
}

function memberName(m: Member): string {
  return `${m.firstName} ${m.lastName ?? ''}`.trim()
}

export interface MemberShowRelations {
  generation: number
  parents: Member[]
  spouses: Member[]
  children: Member[]
  siblings: Member[]
  nuclearFamilies: NuclearFamilyRow[]
  familyOfOrigin: NuclearFamilyRow[]
  media: MediaAsset[]
  familyMedia: { familyId: number; assets: MediaAsset[] }[]
}

export function memberShow(m: Member, rel: MemberShowRelations): string {
  const fmt = (label: string, value: string) =>
    `${chalk.cyan(label.padEnd(14))} ${value}`

  const nameList = (ms: Member[]) =>
    ms.length === 0 ? '-' : ms.map(x => `${memberName(x)} (${x.id})`).join('\n               ')

  const nameListOrdered = (ms: Member[]) =>
    ms.length === 0 ? '-' : ms.map(x => {
      const order = x.seniority !== null ? chalk.dim(` #${x.seniority}`) : ''
      return `${memberName(x)} (${x.id})${order}`
    }).join('\n               ')

  const allMembers = [...rel.parents, ...rel.spouses, ...rel.children, ...rel.siblings]
  const memberLookup = (id: number) => allMembers.find(x => x.id === id)

  const nucFamStr = (f: NuclearFamilyRow, selfId: number, coParents: Member[]) => {
    const otherId = f.parent1Id === selfId ? f.parent2Id : f.parent1Id
    const otherStr = otherId != null
      ? (() => { const o = coParents.find(s => s.id === otherId); return o ? `w/ ${memberName(o)} (${otherId})` : `w/ #${otherId}` })()
      : ''
    return `#${f.id}${otherStr ? ` ${otherStr}` : ''}`
  }

  const originFamStr = (f: NuclearFamilyRow) => {
    const p1 = memberLookup(f.parent1Id)
    const p2 = f.parent2Id != null ? memberLookup(f.parent2Id) : null
    const p1Str = p1 ? `${memberName(p1)} (${f.parent1Id})` : `#${f.parent1Id}`
    const p2Str = f.parent2Id != null ? (p2 ? `${memberName(p2)} (${f.parent2Id})` : `#${f.parent2Id}`) : null
    return `#${f.id} — ${p1Str}${p2Str ? ` & ${p2Str}` : ''}`
  }

  const mediaStr = (assets: MediaAsset[]) => {
    if (assets.length === 0) return '-'
    return assets.map(a => {
      const primary = a.isPrimary ? chalk.green(' [primary]') : ''
      const caption = a.caption ? chalk.dim(` "${a.caption}"`) : ''
      const type = a.mediaType ?? 'photo'
      return `#${a.id} ${type}${primary} ${a.filePath}${caption}`
    }).join('\n               ')
  }

  const lines = [
    chalk.bold(`${memberName(m)}  ${chalk.dim(`#${m.id}`)}`),
    '',
    fmt('Generation:', `${rel.generation}`),
    fmt('City:', m.city ?? '-'),
    fmt('Occupation:', m.occupation ?? '-'),
    fmt('Phone:', m.phone ?? '-'),
    fmt('Email:', m.email ?? '-'),
    fmt('Instagram:', m.instagram ?? '-'),
    fmt('Birthday:', m.birthday ?? '-'),
    fmt('Seniority:', m.seniority !== null ? String(m.seniority) : '-'),
    fmt('Alive:', m.isAlive ? 'Yes' : 'No'),
    fmt('Attended 2023:', m.attended2023 ? 'Yes' : 'No'),
    fmt('Notes:', m.notes ?? '-'),
    '',
    fmt('Parents:', nameList(rel.parents)),
    fmt('Spouse:', nameList(rel.spouses)),
    ...(rel.familyOfOrigin.length > 0 ? [
      fmt('Origin Family:', rel.familyOfOrigin.map(originFamStr).join('\n               ')),
    ] : []),
    ...(rel.nuclearFamilies.length > 0 ? [
      fmt('Own Family:', rel.nuclearFamilies.map(f => nucFamStr(f, m.id, rel.spouses)).join('\n               ')),
    ] : []),
    fmt('Children:', nameListOrdered(rel.children)),
    fmt('Siblings:', nameListOrdered(rel.siblings)),
    '',
    fmt('Media:', mediaStr(rel.media)),
    ...rel.familyMedia.map(({ familyId, assets }) =>
      fmt(`Family #${familyId}:`, mediaStr(assets))
    ),
  ]
  return lines.join('\n')
}
