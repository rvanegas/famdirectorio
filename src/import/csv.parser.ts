import fs from 'fs'
import Papa from 'papaparse'

export interface RawCsvRow {
  Id: string
  Ref: string
  Rel: string
  Nombre: string
  Apellidos: string
  Relación: string
  Generación: string
  Email: string
  Número: string
  Sede: string
  Ocupación: string
  'Asistió 2023': string
  Vive: string
}

export function parseCsv(filePath: string): RawCsvRow[] {
  const content = fs.readFileSync(filePath, 'utf8')

  const result = Papa.parse<RawCsvRow>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  })

  if (result.errors.length > 0) {
    const serious = result.errors.filter((e) => e.type !== 'Delimiter')
    if (serious.length > 0) {
      console.warn('CSV parse warnings:', serious)
    }
  }

  // Filter out rows where Id is empty or non-numeric (continuation rows)
  return result.data.filter((row) => row.Id && /^\d+$/.test(row.Id.trim()))
}
