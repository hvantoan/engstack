/**
 * scripts/load-oxford3000.ts
 *
 * Sourcing and parsing pipeline for Oxford 3000 (CEFR A1-B2) wordlist.
 * Combines official Oxford University Press CEFR PDF data with authentic
 * Oxford Learner's Dictionary phonetic (IPA) and sense data.
 *
 * Usage:
 *   npx tsx scripts/load-oxford3000.ts
 */

import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"

interface CrawledSense {
  definition: string
  examples?: string[]
}

interface CrawledWord {
  word: string
  level: string
  pos: string
  us_phonetic?: string
  uk_phonetic?: string
  senses?: CrawledSense[]
}

export interface OxfordVocabItem {
  term: string
  meaning: string
  example: string
  exampleVi?: string
  ipa: string
  label: "word"
  level: "A1" | "A2" | "B1" | "B2"
  pos: string
  senseHint?: string
}

const PDF_URL =
  "https://www.oxfordlearnersdictionaries.com/external/pdf/wordlists/oxford-3000-5000/The_Oxford_3000_by_CEFR_level.pdf"
const CRAWLED_DATA_URL =
  "https://raw.githubusercontent.com/GnasPham1218/CrawlDataWordOxford/main/data1.json"

const POS_REGEX =
  /\s+((?:(?:n|v|adj|adv|prep|pron|conj|det|exclam|number|modal v|auxiliary v|infinitive marker)\.?|\/|,|\s|indefinite article|definite article)+)$/i

async function run() {
  console.log("==> Step 1: Downloading authentic Oxford lexicon dataset...")
  const dataRes = await fetch(CRAWLED_DATA_URL)
  if (!dataRes.ok) {
    throw new Error(`Failed to fetch crawled lexicon: ${dataRes.statusText}`)
  }
  const crawledList = (await dataRes.json()) as CrawledWord[]
  console.log(`    Loaded ${crawledList.length} lexicon entries.`)

  const crawledMap = new Map<string, CrawledWord>()
  for (const item of crawledList) {
    crawledMap.set(item.word.toLowerCase(), item)
  }

  console.log("==> Step 2: Downloading official Oxford 3000 CEFR PDF...")
  const tmpPdfPath = "/tmp/oxford3000_official.pdf"
  if (!fs.existsSync(tmpPdfPath)) {
    const pdfRes = await fetch(PDF_URL)
    if (!pdfRes.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfRes.statusText}`)
    }
    fs.writeFileSync(tmpPdfPath, Buffer.from(await pdfRes.arrayBuffer()))
    console.log(`    Saved official PDF to ${tmpPdfPath}`)
  } else {
    console.log(`    Reusing cached PDF at ${tmpPdfPath}`)
  }

  console.log("==> Step 3: Parsing PDF and merging multi-line column entries...")
  const rawText = execSync(`pdftotext "${tmpPdfPath}" -`, { encoding: "utf8" })
  const rawLines = rawText.split("\n").map((l) => l.trim()).filter(Boolean)

  const lines: string[] = []
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]
    if (
      line.startsWith("The Oxford") ||
      line.startsWith("© Oxford") ||
      /^\d+\s*\/\s*\d+$/.test(line)
    ) {
      continue
    }
    // Handle column-wrapped continuation lines (e.g. "light ... n.," followed by "adj.")
    if (lines.length > 0) {
      const prev = lines[lines.length - 1]
      if (
        prev.endsWith(",") ||
        prev.endsWith("/") ||
        /^(?:adj|adv|n|v|number|pron|prep)\.?$/i.test(line)
      ) {
        lines[lines.length - 1] = `${prev} ${line}`
        continue
      }
    }
    lines.push(line)
  }

  let currentLevel: "A1" | "A2" | "B1" | "B2" | "" = ""
  const levelBuckets: Record<"A1" | "A2" | "B1" | "B2", OxfordVocabItem[]> = {
    A1: [],
    A2: [],
    B1: [],
    B2: [],
  }

  let missingExampleCount = 0
  let matchedLexiconCount = 0

  for (const line of lines) {
    if (["A1", "A2", "B1", "B2"].includes(line)) {
      currentLevel = line as "A1" | "A2" | "B1" | "B2"
      continue
    }
    if (!currentLevel) continue

    const match = line.match(POS_REGEX)
    if (!match) continue
    const rawHeadword = line.slice(0, match.index).trim()
    const pos = match[1].trim()

    // Disambiguate parenthetical sense hint (e.g. "bank (money) n." or "like (similar) prep.")
    const parenMatch = rawHeadword.match(/^([^(]+)(?:\s*\(([^)]+)\))?$/)
    const headword = parenMatch ? parenMatch[1].trim() : rawHeadword
    const senseHint = parenMatch?.[2]?.trim()

    // Remove homograph digit markers from headword (e.g. can1 -> can)
    const cleanTerm = headword.replace(/\d+$/, "").trim()

    const lookupKey = cleanTerm.toLowerCase()
    const firstWordKey = cleanTerm.includes(",")
      ? cleanTerm.split(/,\s*/)[0].toLowerCase()
      : lookupKey
    const dictEntry =
      crawledMap.get(lookupKey) ||
      crawledMap.get(firstWordKey) ||
      crawledMap.get(headword.toLowerCase())
    const primarySense = dictEntry?.senses?.[0]

    if (dictEntry) matchedLexiconCount++

    const rawIpa = dictEntry?.uk_phonetic || dictEntry?.us_phonetic || ""
    const ipa = rawIpa.replace(/^\/|\/$/g, "")

    // Genuine authentic dictionary example, or empty string (no fabricated text)
    const authenticExample = primarySense?.examples?.[0] || ""
    if (!authenticExample) missingExampleCount++

    const definitionEn = primarySense?.definition || ""

    levelBuckets[currentLevel].push({
      term: cleanTerm,
      meaning: definitionEn, // English definition until Vietnamese translation pass
      example: authenticExample,
      exampleVi: undefined,
      ipa,
      label: "word",
      level: currentLevel,
      pos: dictEntry?.pos || pos,
      ...(senseHint ? { senseHint } : {}),
    })
  }

  const outDir = path.resolve(process.cwd(), "src/data/oxford")
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  let totalItems = 0
  for (const [lvl, items] of Object.entries(levelBuckets)) {
    const outFile = path.join(outDir, `oxford-${lvl.toLowerCase()}.json`)
    fs.writeFileSync(outFile, JSON.stringify(items, null, 2), "utf8")
    console.log(`    Generated: ${outFile} (${items.length} items)`)
    totalItems += items.length
  }

  console.log(`==> Finished! Generated ${totalItems} Oxford 3000 items in src/data/oxford/`)
  console.log(`    Matched authentic lexicon: ${matchedLexiconCount} / ${totalItems} (${((matchedLexiconCount / totalItems) * 100).toFixed(1)}%)`)
  console.log(`    Items with authentic examples: ${totalItems - missingExampleCount} / ${totalItems}`)
  if (missingExampleCount > 0) {
    console.log(`    Items awaiting example enrichment: ${missingExampleCount} (emitted as empty strings, zero fabricated text)`)
  }
}

run().catch((err) => {
  console.error("Execution failed:", err)
  process.exit(1)
})
