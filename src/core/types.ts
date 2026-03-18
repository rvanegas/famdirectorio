// Domain interfaces — the abstraction boundary between db layer and consumers (CLI, PDF, future web)

export interface Member {
  id: number
  firstName: string
  lastName: string | null
  relationText: string | null
  generation: number | null
  email: string | null
  phone: string | null
  city: string | null
  occupation: string | null
  attended2023: boolean
  isAlive: boolean
  photoPath: string | null
  notes: string | null
}

export interface Relationship {
  id: number
  fromMemberId: number
  toMemberId: number
  type: 'child' | 'spouse' | 'sibling'
  notes: string | null
}

export interface MediaAsset {
  id: number
  memberId: number
  filePath: string
  mediaType: 'photo' | 'document' | 'video' | null
  caption: string | null
  isPrimary: boolean
}

export interface MemberWithMedia extends Member {
  primaryPhoto: string | null
  allMedia: MediaAsset[]
}
