import Table from 'cli-table3'
import type { Member } from '../../core/types'
import type { Branch } from '../../core/types'

export function membersTable(members: Member[]): string {
  const table = new Table({
    head: ['ID', 'Name', 'Gen', 'City', 'Branch', 'Alive'],
    colWidths: [6, 30, 5, 16, 8, 7],
    style: { head: ['cyan'] },
  })

  for (const m of members) {
    table.push([
      m.id,
      `${m.firstName} ${m.lastName ?? ''}`.trim(),
      m.generation ?? '-',
      m.city ?? '-',
      m.branchId ?? '-',
      m.isAlive ? 'Y' : 'N',
    ])
  }

  return table.toString()
}

export function branchesTable(branches: Branch[]): string {
  const table = new Table({
    head: ['ID', 'Branch Name', 'Founder ID'],
    colWidths: [6, 40, 12],
    style: { head: ['cyan'] },
  })

  for (const b of branches) {
    table.push([b.id, b.name, b.founderMemberId ?? '-'])
  }

  return table.toString()
}

export function memberDetail(m: Member): string {
  const lines = [
    `ID:         ${m.id}`,
    `Name:       ${m.firstName} ${m.lastName ?? ''}`,
    `Generation: ${m.generation ?? '-'}`,
    `City:       ${m.city ?? '-'}`,
    `Occupation: ${m.occupation ?? '-'}`,
    `Email:      ${m.email ?? '-'}`,
    `Phone:      ${m.phone ?? '-'}`,
    `Branch ID:  ${m.branchId ?? '-'}`,
    `Alive:      ${m.isAlive ? 'Yes' : 'No'}`,
    `Attended 2023: ${m.attended2023 ? 'Yes' : 'No'}`,
    `Notes:      ${m.notes ?? '-'}`,
    `Relation:   ${m.relationText ?? '-'}`,
  ]
  return lines.join('\n')
}
