import chalk from 'chalk'
import type { Member } from '../../core/types'

export function membersTable(members: Member[]): string {
  const header = chalk.cyan(
    `${'ID'.padEnd(6)}${'Name'.padEnd(30)}${'City'.padEnd(16)}Alive`
  )
  const rows = members.map(m => {
    const name = `${m.firstName} ${m.lastName ?? ''}`.trim()
    return `${String(m.id).padEnd(6)}${name.padEnd(30)}${(m.city ?? '-').padEnd(16)}${m.isAlive ? 'Y' : 'N'}`
  })
  return [header, ...rows].join('\n')
}

export function memberDetail(m: Member): string {
  const lines = [
    `ID:            ${m.id}`,
    `Name:          ${m.firstName} ${m.lastName ?? ''}`,
    `City:          ${m.city ?? '-'}`,
    `Occupation:    ${m.occupation ?? '-'}`,
    `Email:         ${m.email ?? '-'}`,
    `Phone:         ${m.phone ?? '-'}`,
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

  const lines = [
    chalk.bold(`${memberName(m)}  ${chalk.dim(`#${m.id}`)}`),
    '',
    fmt('Generation:', `${rel.generation}`),
    fmt('City:', m.city ?? '-'),
    fmt('Occupation:', m.occupation ?? '-'),
    fmt('Email:', m.email ?? '-'),
    fmt('Phone:', m.phone ?? '-'),
    fmt('Alive:', m.isAlive ? 'Yes' : 'No'),
    fmt('Attended 2023:', m.attended2023 ? 'Yes' : 'No'),
    fmt('Notes:', m.notes ?? '-'),
    '',
    fmt('Parents:', nameList(rel.parents)),
    fmt('Spouse(s):', nameList(rel.spouses)),
    fmt('Children:', nameList(rel.children)),
    fmt('Siblings:', nameList(rel.siblings)),
  ]
  return lines.join('\n')
}
