// Agent tool definitions + sandboxed execution on Matt's machine.

import { getAllowedRoots, listDirectory, readTextFile, writeTextFile } from '@/lib/fs-bridge'

export const TOOL_SYSTEM_APPEND = [
  '',
  'You have agent tools to work on files under allowed folders on this Mac:',
  'list_dir, read_file, write_file. Use them when Matt asks for file work.',
  'Always summarize what you read or wrote. Never exfiltrate secrets to unrelated paths.',
].join(' ')

export const MAX_TOOL_ROUNDS = 8

const MAX_READ_CHARS = 80_000
const MAX_WRITE_CHARS = 200_000

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'list_dir': {
        const dir = String(input.path ?? input.directory ?? '.')
        const entries = listDirectory(dir)
        return JSON.stringify({ path: dir, entries: entries.slice(0, 200) }, null, 2)
      }
      case 'read_file': {
        const filePath = String(input.path ?? input.file_path ?? '')
        if (!filePath) return JSON.stringify({ error: 'path is required' })
        let text = readTextFile(filePath)
        const truncated = text.length > MAX_READ_CHARS
        if (truncated) text = `${text.slice(0, MAX_READ_CHARS)}\n…[truncated]`
        return JSON.stringify({ path: filePath, truncated, content: text })
      }
      case 'write_file': {
        const filePath = String(input.path ?? input.file_path ?? '')
        const content = String(input.content ?? '')
        if (!filePath) return JSON.stringify({ error: 'path is required' })
        if (content.length > MAX_WRITE_CHARS) {
          return JSON.stringify({ error: `content exceeds ${MAX_WRITE_CHARS} chars` })
        }
        const written = writeTextFile(filePath, content)
        return JSON.stringify({ ok: true, path: written, bytes: content.length })
      }
      default:
        return JSON.stringify({ error: `unknown tool: ${name}` })
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) })
  }
}

export function allowedRootsForPrompt(): string {
  return getAllowedRoots().join(', ')
}

/** Anthropic Messages API tool defs */
export const anthropicToolDefs = [
  {
    name: 'list_dir',
    description: 'List files and folders in a directory under allowed roots.',
    input_schema: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: 'Absolute or ~ path' } },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file under allowed roots.',
    input_schema: {
      type: 'object' as const,
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write UTF-8 text to a file under allowed roots (creates parent dirs).',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
]

/** OpenAI-compatible tool defs (Grok) */
export const openAiToolDefs = anthropicToolDefs.map((t) => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}))