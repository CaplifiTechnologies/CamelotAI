// Council / Calemot — roles, prompts, proposal parsing (mirrors Boardroom index.html).

export interface CounselRole {
  id: string
  name: string
  charter?: string
  operator?: string
  kind?: string
  provider?: string
  model?: string
  color?: string
  persona?: string
}

export interface ProposalPlan {
  type?: string
  proposal_type?: string
  summary?: string
  title?: string
  body?: string
}

const PROPOSAL_RE = /```proposal\s*\n([\s\S]*?)```/i
const PRACTICAL_MATT_RE =
  /\b(urls?|links?|where do i|how do i get|api[_ -]?key|credentials?|pull up|open the|developers\.|console|step.?by.?step|paste into)\b/i

export function parseProposalBlock(text: string): { text: string; plan: ProposalPlan | null } {
  const m = String(text || '').match(PROPOSAL_RE)
  if (!m) return { text: String(text || ''), plan: null }
  let plan: ProposalPlan | null = null
  try {
    plan = JSON.parse(m[1].trim()) as ProposalPlan
  } catch {
    plan = null
  }
  return { text: String(text || '').replace(PROPOSAL_RE, '').trimEnd(), plan }
}

export function normalizeSummary(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function summariesSimilar(a: string, b: string): boolean {
  const na = normalizeSummary(a)
  const nb = normalizeSummary(b)
  if (!na || !nb) return false
  if (na.includes(nb) || nb.includes(na)) return true
  const wa = new Set(na.split(' '))
  const wb = new Set(nb.split(' '))
  let overlap = 0
  for (const w of wa) if (wb.has(w)) overlap++
  return overlap / Math.min(wa.size, wb.size) >= 0.6
}

export function transcriptHasRecoverySteps(messages: { content: string }[]): boolean {
  const text = messages.map((m) => m.content || '').join('\n')
  return (
    /\d+\.\s+[^\n]*https?:\/\//i.test(text) ||
    /https?:\/\/[^\s]*(cloudflare|developers\.facebook|dash\.cloudflare)/i.test(text)
  )
}

export function mattLastHumanMessage(messages: { seatKey: string; content: string }[]): string {
  const turns = messages.filter((m) => m.seatKey === 'matt')
  return turns.length ? String(turns[turns.length - 1].content || '') : ''
}

export function practicalMattOverride(messages: { seatKey: string; content: string }[]): string {
  const last = mattLastHumanMessage(messages)
  if (!last || !PRACTICAL_MATT_RE.test(last)) return ''
  return ` ACTIVE MATT REQUEST: Matt needs practical setup help ("${last.slice(0, 220).replace(/\n/g, ' ')}"). Reply with numbered steps and full https:// URLs from the project playbook. Do NOT answer with only a stall_flag, veto, or proposal block — practical help comes first in plain language.`
}

export function councilRoleSeatKeys(roles: CounselRole[]): string[] {
  const keys: string[] = []
  for (const r of roles) {
    if (r.operator === 'human' || r.kind === 'human') continue
    if (r.kind === 'ai_peer' || r.provider === 'anthropic' || r.provider === 'xai') {
      keys.push(r.id === 'claude' ? 'claude' : r.id === 'grok' ? 'grok' : r.id)
      continue
    }
    if (r.operator === 'odysseus') keys.push(`counsel:${r.id}`)
  }
  return keys
}

export function systemForCounselSeat(
  seatKey: string,
  role: CounselRole | undefined,
  opts: {
    counselProject?: string
    playbook?: string
    messages: { seatKey: string; content: string }[]
    synthesis?: boolean
  },
): string {
  const { counselProject, playbook, messages, synthesis } = opts
  const practical = practicalMattOverride(messages)
  const practicalRule =
    ' MATT PRACTICAL RULE: When Matt asks for URLs, links, where to click, API keys, or setup steps — answer with numbered steps and full https:// URLs first. Council proposals are secondary; never substitute a stall_flag for the practical answer.'
  const recoveryRule = transcriptHasRecoverySteps(messages)
    ? ' RECOVERY RULE: This thread already has numbered recovery steps with URLs. Do NOT propose another stall_flag for the same blocker — note tracking only in plain language; skip proposal blocks unless the blocker changed.'
    : ''
  const visibleReplyRule =
    ' VISIBLE REPLY RULE: Never send only a proposal block — always include a substantive visible reply first (steps, assessment, or answer) before any fenced proposal.'
  const proposalFence =
    ' When you recommend a gated Council action, end with one fenced proposal block (hidden from room): ```proposal\n{"type":"veto|stall_flag|commitment|override","summary":"one line","body":"detail"}\n```. Proposals queue at the deterministic gate — they do not execute until Matt approves. Skip proposals when Matt only asked for links or credentials or when recovery steps already exist.'

  if (synthesis || seatKey === 'odysseus-synthesis') {
    const topic = counselProject ? `Project: ${counselProject}. ` : ''
    let s = `You are Odysseus, Matt's helm agent at The Council. SYNTHESIS ROUND — other seats just spoke on Matt's behalf. ${topic}Your job: (1) summarize what each seat said that is actionable for Matt, (2) merge practical URLs/steps they gave into one clear numbered list, (3) state what you will remember for future chats. Do NOT propose stall_flags unless the blocker genuinely changed. Be substantive — never send only a proposal block.`
    if (playbook?.trim()) s += ` Project playbook:\n${playbook}`
    return s
  }

  const topic = counselProject ? `Project channel: ${counselProject}. ` : ''

  if (role?.kind === 'ai_peer' || role?.provider === 'anthropic' || role?.provider === 'xai') {
    let s = `You are ${role.name}, an AI peer at The Council (Calemot) — advisory, not a Council role seat. ${topic}Matt is the owner. Council roles (Revenue Partner, Finisher, Brake) run via Odysseus; human Peer is separate. Speak only as ${role.name}. Be concise. Never speak as Peer or as a Council role.`
    if (role.persona?.trim()) s += ` ${role.persona.trim()}`
    s += practicalRule + recoveryRule + visibleReplyRule + proposalFence
    if (playbook?.trim()) s += ` Project playbook:\n${playbook}`
    if (practical) s += practical
    return s
  }

  const charter = role?.charter ? `Charter ${role.charter}. ` : ''
  const name = role?.name ?? seatKey.replace(/^counsel:/, '')
  let s = `You are the ${name} seat at The Council (Calemot). Odysseus operates this seat locally — agents propose; the deterministic gate decides; you never commit anything costly or irreversible. ${charter}${topic}Matt is the owner. Speak only as ${name}. Be concise and substantive. Never speak as Peer — that seat is human-only.`
  if (role?.persona?.trim()) s += ` ${role.persona.trim()}`
  s += practicalRule + recoveryRule + visibleReplyRule + proposalFence
  if (playbook?.trim()) s += ` Project playbook:\n${playbook}`
  if (practical) s += practical
  return s
}

export function shouldSkipProposal(
  plan: ProposalPlan,
  messages: { seatKey: string; content: string }[],
  pending: { proposal_type: string; summary: string }[],
): string {
  const ptype = plan.type || plan.proposal_type
  const summary = plan.summary || plan.title || ''
  if (!ptype || !summary) return 'invalid'
  if (ptype === 'stall_flag') {
    if (practicalMattOverride(messages)) return 'practical_request'
    if (transcriptHasRecoverySteps(messages)) return 'recovery_already_given'
    if (pending.some((p) => p.proposal_type === ptype && summariesSimilar(p.summary, summary)))
      return 'duplicate_pending'
  }
  return ''
}