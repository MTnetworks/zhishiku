import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

async function main(){
  const prisma = new PrismaClient()
  try {
    console.log('Resetting database: deleting rows from all tables...')
    const access = await prisma.documentAccess.deleteMany({})
    const docs = await prisma.document.deleteMany({})
    const marks = await prisma.bookmark.deleteMany({})
    const cats = await prisma.category.deleteMany({})
    const users = await prisma.user.deleteMany({})
    console.log({ documentAccess: access.count, documents: docs.count, bookmarks: marks.count, categories: cats.count, users: users.count })
  } catch (e) {
    console.error('Database reset error:', e)
  }
  // 清理上传目录内容
  try {
    const uploadsDir = path.join(process.cwd(), 'server', 'uploads')
    if (fs.existsSync(uploadsDir)) {
      for (const name of fs.readdirSync(uploadsDir)) {
        const p = path.join(uploadsDir, name)
        fs.rmSync(p, { recursive: true, force: true })
      }
      console.log('Uploads directory cleared.')
    }
  } catch (e) {
    console.error('Uploads cleanup error:', e)
  }
}

main().then(() => {
  console.log('Reset done.')
  process.exit(0)
})