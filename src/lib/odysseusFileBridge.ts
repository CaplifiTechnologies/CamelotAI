// Verified local file ops for Odysseus — Camelot fs-bridge executes; model only narrates on Ollama.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { listDirectory, readTextFile, writeTextFile } from '@/lib/fs-bridge'
import type { Turn } from '@/lib/providers/anthropic'

export type FileBridgeOutcome =
  | { handled: true; content: string }
  | { handled: false }

const DEFAULT_TEST_PATH = path.join(os.homedir(), 'CamelotAI', 'camelot-boardroom-test.md')

function expandPath(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '')
  if (trimmed.startsWith('~')) return path.join(os.homedir(), trimmed.slice(1).replace(/^\//, ''))
  return path.resolve(trimmed)
}

export function latestUserText(history: Turn[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content
  }
  return ''
}

function extractQuoted(text: string): string | null {
  const m = text.match(/["']([^"']{1,2000})["']/)
  return m?.[1] ?? null
}

function extractPath(text: string): string | null {
  const patterns = [
    /(?:at|to)\s+((?:~\/|\/Users\/)[^\s,;]+)/i,
    /((?:~\/|\/Users\/)[^\s,;]+\.md\b)/i,
    /((?:~\/|\/Users\/)[^\s,;]+)/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) return expandPath(m[1])
  }
  return null
}

function extractWriteContent(text: string, filePath: string): string {
  const explicit =
    text.match(/(?:with\s+)?content\s*:\s*([\s\S]+)$/i)?.[1]?.trim() ??
    text.match(/(?:saying|containing)\s+["']([^"']+)["']/i)?.[1]?.trim()
  if (explicit) return explicit

  const quoted = extractQuoted(text)
  if (quoted) return quoted

  const base = path.basename(filePath)
  return [
    `# ${base}`,
    '',
    `Camelot boardroom test write — ${new Date().toISOString()}`,
    '',
    'hello from odysseus (via Camelot verified fs-bridge)',
    '',
  ].join('\n')
}

function wantsWrite(text: string): boolean {
  const t = text.toLowerCase()
  return (
    /\b(write|create|save)\b/.test(t) &&
    (/\b(file|markdown|\.md)\b/.test(t) || /\bwrite me\b/.test(t) || /\bcan you write\b/.test(t))
  )
}

function wantsRead(text: string): boolean {
  return /\b(read|show|open|cat)\b.*\b(file|markdown|\.md)\b/i.test(text) || /\bread\s+(?:~\/|\/Users\/)/i.test(text)
}

function wantsList(text: string): boolean {
  return /\b(list|ls)\b.*\b(dir(?:ectory)?|folder|files)\b/i.test(text) || /\blist\s+(?:~\/|\/Users\/)/i.test(text)
}

export function tryFileBridge(userText: string): FileBridgeOutcome {
  const text = userText.trim()
  if (!text) return { handled: false }

  try {
    if (wantsWrite(text)) {
      const filePath = extractPath(text) ?? DEFAULT_TEST_PATH
      const content = extractWriteContent(text, filePath)
      const written = writeTextFile(filePath, content)
      const bytes = Buffer.byteLength(content, 'utf8')
      return {
        handled: true,
        content: [
          `Wrote **${written}** (${bytes} bytes) via Camelot verified local fs-bridge.`,
          '',
          '```markdown',
          content.length > 1200 ? `${content.slice(0, 1200)}\n…[truncated in chat]` : content,
          '```',
        ].join('\n'),
      }
    }

    if (wantsRead(text)) {
      const filePath = extractPath(text)
      if (!filePath) {
        return {
          handled: true,
          content: 'Need a path under allowed roots — e.g. `read ~/CamelotAI/camelot-boardroom-test.md`.',
        }
      }
      if (!fs.existsSync(filePath)) {
        return { handled: true, content: `File not found: **${filePath}**` }
      }
      let body = readTextFile(filePath)
      const truncated = body.length > 4000
      if (truncated) body = `${body.slice(0, 4000)}\n…[truncated]`
      return {
        handled: true,
        content: [`Read **${filePath}**${truncated ? ' (truncated)' : ''}:`, '', '```', body, '```'].join('\n'),
      }
    }

    if (wantsList(text)) {
      const dirPath = extractPath(text) ?? path.join(os.homedir(), 'CamelotAI')
      const entries = listDirectory(dirPath)
        .slice(0, 80)
        .map((e) => `${e.isDirectory ? '📁' : '📄'} ${e.name}`)
      return {
        handled: true,
        content: [`**${dirPath}**`, '', entries.join('\n') || '(empty)'].join('\n'),
      }
    }
  } catch (err) {
    return {
      handled: true,
      content: `Local file operation failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  return { handled: false }
}