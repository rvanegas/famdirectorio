import type { RawCsvRow } from './csv.parser'
import type { NewMember, NewRelationship } from '../db/schema'

const REL_TYPE_MAP: Record<string, NewRelationship['type']> = {
  esposa: 'spouse',
  esposo: 'spouse',
  hija: 'child',
  hijo: 'child',
  // hermana/hermano intentionally omitted — siblings are inferred from shared parent
}

function normalizeBool(value: string): number {
  const v = value.trim().toLowerCase()
  return v === 'si' || v === 'sí' ? 1 : 0
}

export interface MappedRow {
  member: NewMember
  relationship: NewRelationship | null
}

export function mapRow(row: RawCsvRow): MappedRow {
  const id = parseInt(row.Id, 10)
  const refId = row.Ref ? parseInt(row.Ref, 10) : null
  const relLabel = row.Rel?.trim().toLowerCase() ?? ''

  // Sanitize email — remove stray quotes/apostrophes
  const email = row.Email.replace(/['"]/g, '').toLowerCase() || null

  const member: NewMember = {
    id,
    firstName: row.Nombre.trim(),
    lastName: row.Apellidos.trim() || null,
    relationText: row.Relación.trim() || null,
    generation: row.Generación ? parseInt(row.Generación, 10) : null,
    email,
    phone: row.Número || null,
    city: row.Sede || null,
    occupation: row.Ocupación || null,
    attended2023: normalizeBool(row['Asistió 2023']),
    isAlive: normalizeBool(row.Vive),
    photoPath: null,
    notes: null,
  }

  let relationship: NewRelationship | null = null
  if (refId !== null && relLabel && REL_TYPE_MAP[relLabel]) {
    relationship = {
      fromMemberId: refId,
      toMemberId: id,
      type: REL_TYPE_MAP[relLabel],
      notes: null,
    }
  }

  return { member, relationship }
}

export function mapRows(rows: RawCsvRow[]): MappedRow[] {
  return rows.map(mapRow)
}
