// Onboarding constants — recommended local models and assistant system prompt.

export const ONBOARDING_STORAGE_KEY = 'camelot.onboarding.v1'

export interface RecommendedModel {
  id: string
  label: string
  description: string
  size: string
  default?: boolean
}

export const RECOMMENDED_MODELS: RecommendedModel[] = [
  {
    id: 'qwen2.5:7b',
    label: 'Qwen 2.5 7B',
    description: 'Default free seat — vote tallies, summaries, side-thread merges.',
    size: '~4.7 GB',
    default: true,
  },
  {
    id: 'llama3.2:3b',
    label: 'Llama 3.2 3B',
    description: 'Smaller and faster — fine for light boardroom work.',
    size: '~2 GB',
  },
  {
    id: 'mistral:7b',
    label: 'Mistral 7B',
    description: 'Solid general assistant if you prefer Mistral.',
    size: '~4.1 GB',
  },
]

export const ONBOARDING_ASSISTANT_SYSTEM = `You are the Camelot setup guide — a friendly local assistant helping someone configure their AI boardroom safely.

Rules:
- Never ask the user to paste API keys into chat, email, or plain text files.
- Recommend macOS Keychain (Camelot saves keys there) or the Grok CLI login for Grok.
- Explain that Local Only mode works with zero API keys using Ollama only.
- Explain that Claude Pro / Grok app subscriptions are NOT the same as API billing in Camelot.
- Each paid reply shows token counts and an estimated dollar cost in the UI.
- Keep answers short (2–4 sentences), plain English, no jargon.
- If asked where to get keys: Anthropic console for Claude, x.ai for Grok — always from the official site.
- Warn: never commit keys to git, never share screenshots of keys.`