import chalk from 'chalk'
import type { Member } from '../../core/types'

type MemberField = 'city' | 'alive' | 'email' | 'phone' | 'instagram' | 'occupation' | 'seniority' | 'attended2023' | 'birthday' | 'notes'

const EXTRA_FIELD_CONFIG: Record<MemberField, { label: string; width: number; value: (m: Member) => string }> = {
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
    fmt('Spouse(s):', nameList(rel.spouses)),
    fmt('Children:', nameListOrdered(rel.children)),
    fmt('Siblings:', nameListOrdered(rel.siblings)),
  ]
  return lines.join('\n')
}
