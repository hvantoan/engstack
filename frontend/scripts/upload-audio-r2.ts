/**
 * scripts/upload-audio-r2.ts
 *
 * Upload toàn bộ `public/audio/` (MP3 + manifest.json) lên Cloudflare R2 qua
 * S3-compatible API. Chỉ upload file chưa có hoặc đổi kích thước — chạy lại
 * an toàn.
 *
 * Env bắt buộc (đọc từ root `.env` qua dotenv hoặc export tay):
 *   R2_ACCOUNT_ID        — Account ID trên Cloudflare dashboard
 *   R2_ACCESS_KEY_ID     — R2 API token Access Key
 *   R2_SECRET_ACCESS_KEY — R2 API token Secret
 *   R2_BUCKET            — tên bucket (vd `engstack-audio`)
 *
 * Usage: npm run upload:audio   (chạy từ frontend/)
 */

import fs from "node:fs"
import path from "node:path"

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

const ROOT = path.resolve(import.meta.dirname, "..", "..")
const AUDIO_DIR = path.join(ROOT, "frontend", "public", "audio")
const CONCURRENCY = 10

// Load env từ root `.env` rồi `frontend/.env` (sau ghi đè trước) — không cần
// dotenv. Không ghi đè biến đã export sẵn trong shell.
for (const file of [path.join(ROOT, ".env"), path.join(ROOT, "frontend", ".env")]) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m || line.trimStart().startsWith("#")) continue
    const value = m[2].replace(/^['"]|['"]$/g, "")
    process.env[m[1]] ??= value
  }
}

const required = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Thiếu env ${key}. Xem header của script này.`)
    process.exit(1)
  }
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})
const Bucket = process.env.R2_BUCKET!

async function existsSameSize(key: string, size: number): Promise<boolean> {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket, Key: key }))
    return res.ContentLength === size
  } catch {
    return false
  }
}

async function upload(name: string): Promise<"put" | "skip"> {
  const filePath = path.join(AUDIO_DIR, name)
  const size = fs.statSync(filePath).size
  if (await existsSameSize(name, size)) return "skip"
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: name,
      Body: fs.createReadStream(filePath),
      ContentType: name.endsWith(".json") ? "application/json" : "audio/mpeg",
      CacheControl: name.endsWith(".json")
        ? "public, max-age=300"
        : "public, max-age=31536000, immutable",
    }),
  )
  return "put"
}

async function main() {
  const files = fs
    .readdirSync(AUDIO_DIR)
    .filter((f) => fs.statSync(path.join(AUDIO_DIR, f)).isFile())
  console.log(`${files.length} file → r2://${Bucket}`)

  const queue = [...files]
  let put = 0
  let skip = 0
  let done = 0

  async function worker() {
    for (;;) {
      const name = queue.shift()
      if (!name) return
      try {
        if ((await upload(name)) === "put") put++
        else skip++
      } catch (err) {
        console.error(`FAIL ${name}: ${(err as Error).message}`)
      }
      done++
      if (done % 500 === 0) console.log(`[${done}/${files.length}] put=${put} skip=${skip}`)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`Xong: put=${put} skip=${skip} / ${files.length}`)
}

main()
