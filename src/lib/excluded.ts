import { prisma } from './prisma'

/**
 * Returns a set of user IDs that should be excluded from all statistics.
 * Matches: direct userId, email, tag, or groupId.
 */
export async function getExcludedUserIds(): Promise<Set<string>> {
  const [excluded, users] = await Promise.all([
    prisma.excludedAccount.findMany(),
    prisma.gcUser.findMany({ select: { id: true, email: true, tags: true, groups: true } }),
  ])

  const excludedIds = new Set<string>()

  // Direct userId exclusions
  for (const ex of excluded) {
    if (ex.userId) excludedIds.add(ex.userId)
  }

  // Email, tag, group exclusions — match against users
  const excludedEmails = new Set(excluded.filter((e) => e.email).map((e) => e.email!.toLowerCase()))
  const excludedTags = new Set(excluded.filter((e) => e.tag).map((e) => e.tag!))
  const excludedGroups = new Set(excluded.filter((e) => e.groupId).map((e) => e.groupId!))

  for (const user of users) {
    if (user.email && excludedEmails.has(user.email.toLowerCase())) {
      excludedIds.add(user.id)
    }
    if (user.tags.some((t) => excludedTags.has(t))) {
      excludedIds.add(user.id)
    }
    if (user.groups.some((g) => excludedGroups.has(g))) {
      excludedIds.add(user.id)
    }
  }

  return excludedIds
}
