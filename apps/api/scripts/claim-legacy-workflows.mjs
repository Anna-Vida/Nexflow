#!/usr/bin/env node
// One-time development script to assign unowned workflows and executions
// to a real account before ownerId is made mandatory.
//
// Run: npm run auth:claim-legacy -- user@example.com
// Prints only: "Claimed N legacy workflows."

import { PrismaService } from '../src/database/prisma.service.js'

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Usage: npm run auth:claim-legacy -- user@example.com')
    process.exit(1)
  }

  const prisma = new PrismaService()

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      console.error(`User ${email} not found.`)
      process.exit(1)
    }

    const claimed = await prisma.workflow.updateMany({
      where: { ownerId: '00000000-0000-4000-8000-000000000001' },
      data: { ownerId: user.id },
    })

    await prisma.execution.updateMany({
      where: { ownerId: '00000000-0000-4000-8000-000000000001' },
      data: { ownerId: user.id },
    })

    console.log(`Claimed ${claimed.count} legacy workflows.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
