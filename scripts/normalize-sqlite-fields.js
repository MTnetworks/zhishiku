// Normalize JSON-string fields in SQLite to avoid double-encoding
// Usage: node scripts/normalize-sqlite-fields.js

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function tryParseTwice(val) {
  if (val === null || val === undefined) return null
  if (typeof val !== 'string') return val
  try {
    let v = JSON.parse(val)
    if (typeof v === 'string') {
      try { v = JSON.parse(v) } catch {}
    }
    return v
  } catch {
    return null
  }
}

function toJsonString(val, fallback) {
  try {
    const v = val === undefined ? fallback : val
    return JSON.stringify(v === undefined ? null : v)
  } catch (e) {
    return JSON.stringify(fallback === undefined ? null : fallback)
  }
}

async function run() {
  const docs = await prisma.document.findMany()
  let docFixed = 0
  for (const d of docs) {
    // tags
    let tagsVal = tryParseTwice(d.tags)
    if (Array.isArray(tagsVal)) {
      const norm = toJsonString(tagsVal, [])
      if (norm !== d.tags) {
        await prisma.document.update({ where: { id: d.id }, data: { tags: norm } })
        docFixed++
      }
    }
    // blocks
    let blocksVal = tryParseTwice(d.blocks)
    if (Array.isArray(blocksVal)) {
      const norm = toJsonString(blocksVal, [])
      if (norm !== d.blocks) {
        await prisma.document.update({ where: { id: d.id }, data: { blocks: norm } })
        docFixed++
      }
    }
    // code
    let codeVal = tryParseTwice(d.code)
    if (codeVal && typeof codeVal === 'object') {
      const norm = toJsonString(codeVal, {})
      if (norm !== d.code) {
        await prisma.document.update({ where: { id: d.id }, data: { code: norm } })
        docFixed++
      }
    }
  }

  const bookmarks = await prisma.bookmark.findMany()
  let bmFixed = 0
  for (const b of bookmarks) {
    let tagsVal = tryParseTwice(b.tags)
    if (Array.isArray(tagsVal)) {
      const norm = toJsonString(tagsVal, [])
      if (norm !== b.tags) {
        await prisma.bookmark.update({ where: { id: b.id }, data: { tags: norm } })
        bmFixed++
      }
    }
  }

  console.log(`Normalized documents: ${docFixed}, bookmarks: ${bmFixed}`)
}

run().finally(async () => {
  await prisma.$disconnect()
})