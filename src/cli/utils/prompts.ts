import { input, confirm, select } from '@inquirer/prompts'
import type { Member } from '../../core/types'

type MemberInput = Omit<Member, 'id' | 'photoPath' | 'generation'>

// Allows typing ASCII escape sequences for Spanish diacritics:
//   a' → á  e' → é  i' → í  o' → ó  u' → ú  n~ → ñ  u" → ü  (uppercase too)
function decodeSpanish(text: string): string {
  return text
    .replace(/a'/g, 'á').replace(/A'/g, 'Á')
    .replace(/e'/g, 'é').replace(/E'/g, 'É')
    .replace(/i'/g, 'í').replace(/I'/g, 'Í')
    .replace(/o'/g, 'ó').replace(/O'/g, 'Ó')
    .replace(/u'/g, 'ú').replace(/U'/g, 'Ú')
    .replace(/n~/g, 'ñ').replace(/N~/g, 'Ñ')
    .replace(/u"/g, 'ü').replace(/U"/g, 'Ü')
}

function spanishInput(message: string, defaultValue?: string, opts: object = {}) {
  return input({ message, default: defaultValue, transformer: decodeSpanish, ...opts }).then(decodeSpanish)
}

export async function promptMember(defaults: Partial<MemberInput> = {}): Promise<MemberInput> {
  const firstName = await spanishInput('First name:', defaults.firstName, { required: true })
  const lastName = await spanishInput('Last name(s):', defaults.lastName ?? '')
  const city = await spanishInput('City:', defaults.city ?? '')
  const phone = await input({ message: 'Phone:', default: defaults.phone ?? '' })
  const email = await input({ message: 'Email:', default: defaults.email ?? '' })
  const instagram = await input({
    message: 'Instagram:',
    default: defaults.instagram ?? '',
    validate: (v) => {
      if (!v) return true
      return v.startsWith('@') || 'Must start with @'
    },
  })
  const birthday = await input({
    message: 'Birthday (MM-DD, leave blank for none):',
    default: defaults.birthday ?? '',
    validate: (v) => {
      if (!v) return true
      return /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v) || 'Enter MM-DD (e.g. 03-27)'
    },
  })
  const occupation = await spanishInput('Occupation:', defaults.occupation ?? '')
  const notes = await spanishInput('Notes:', defaults.notes ?? '')
  const seniorityStr = await input({ message: 'Seniority (birth order, 1=oldest; leave blank for none):', default: defaults.seniority?.toString() ?? '' })
  const isAlive = await confirm({ message: 'Currently alive?', default: defaults.isAlive ?? true })
  const attended2023 = await confirm({ message: 'Attended 2023 reunion?', default: defaults.attended2023 ?? false })
  const verifyNow = await confirm({ message: 'Mark desc as verified today?', default: false })
  const descVerifiedAt = verifyNow
    ? new Date().toISOString().slice(0, 10)
    : (defaults.descVerifiedAt ?? null)
  const setRequestedToday = await confirm({ message: 'Mark as requested today?', default: false })
  const requestedAt = setRequestedToday
    ? new Date().toISOString().slice(0, 10)
    : (defaults.requestedAt ?? null)

  return {
    firstName,
    lastName: lastName || null,
    city: city || null,
    email: email || null,
    phone: phone || null,
    occupation: occupation || null,
    instagram: instagram || null,
    birthday: birthday || null,
    notes: notes || null,
    seniority: seniorityStr ? parseInt(seniorityStr, 10) : null,
    isAlive,
    attended2023,
    isRoot: defaults.isRoot ?? false,
    descVerifiedAt,
    requestedAt,
  }
}
