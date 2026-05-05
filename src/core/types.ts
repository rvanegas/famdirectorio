// Domain interfaces — the abstraction boundary between db layer and consumers (CLI, PDF, future web)

export interface Member {
  id: number
  firstName: string
  lastName: string | null
  email: string | null
  phone: string | null
  city: string | null
  occupation: string | null
  attended2023: boolean
  isAlive: boolean
  earlyDeath: boolean | null
  isRoot: boolean
  seniority: number | null
  generation: number | null
  instagram: string | null
  birthday: string | null
  photoPath: string | null
  notes: string | null
  descVerifiedAt: string | null
  requestedAt: string | null
}

export interface Relationship {
  id: number
  fromMemberId: number
  toMemberId: number
  type: 'child' | 'spouse'
  notes: string | null
}

export interface MediaAsset {
  id: number
  memberId: number | null
  familyId: number | null
  filePath: string
  mediaType: 'photo' | 'document' | 'video' | null
  caption: string | null
  isPrimary: boolean
}

export interface Orphan {
  id: number
  firstName: string
  lastName: string | null
  birthday: string | null
}

export interface MemberWithMedia extends Member {
  primaryPhoto: string | null
  allMedia: MediaAsset[]
}
