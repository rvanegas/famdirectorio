import { input, confirm, select } from '@inquirer/prompts'
import type { Member } from '../../core/types'

type MemberInput = Omit<Member, 'id' | 'photoPath'>

export async function promptMember(defaults: Partial<MemberInput> = {}): Promise<MemberInput> {
  const firstName = await input({
    message: 'First name:',
    default: defaults.firstName,
    required: true,
  })

  const lastName = await input({
    message: 'Last name(s):',
    default: defaults.lastName ?? '',
  })

  const city = await input({ message: 'City:', default: defaults.city ?? '' })
  const email = await input({ message: 'Email:', default: defaults.email ?? '' })
  const phone = await input({ message: 'Phone:', default: defaults.phone ?? '' })
  const occupation = await input({ message: 'Occupation:', default: defaults.occupation ?? '' })
  const relationText = await input({ message: 'Relation (free text):', default: defaults.relationText ?? '' })
  const notes = await input({ message: 'Notes:', default: defaults.notes ?? '' })
  const isAlive = await confirm({ message: 'Currently alive?', default: defaults.isAlive ?? true })
  const attended2023 = await confirm({ message: 'Attended 2023 reunion?', default: defaults.attended2023 ?? false })

  return {
    firstName,
    lastName: lastName || null,
    city: city || null,
    email: email || null,
    phone: phone || null,
    occupation: occupation || null,
    relationText: relationText || null,
    notes: notes || null,
    isAlive,
    attended2023,
    isRoot: defaults.isRoot ?? false,
  }
}
