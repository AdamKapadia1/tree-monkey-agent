import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}
const client = new Proxy({}, { get(_, prop) { return getAnthropic()[prop]; } });

// Load CLAUDE.md as the system prompt
const SYSTEM_PROMPT = readFileSync(join(__dirname, '../CLAUDE.md'), 'utf-8');

/**
 * Run a single agent turn with tool support.
 * @param {Array} messages - conversation history
 * @param {Array} tools - tool definitions to make available
 * @param {Function} toolHandler - async fn(toolName, toolInput) => result string
 * @param {Object} opts - optional overrides (maxTokens, model)
 */
export async function runAgent(messages, tools = [], toolHandler = null, opts = {}) {
  const model = opts.model || 'claude-sonnet-4-6';
  const maxTokens = opts.maxTokens || 1024;
  const system = opts.systemOverride || SYSTEM_PROMPT;

  let currentMessages = [...messages];
  const accumulatedText = [];

  // Agentic loop — keep going until no more tool calls
  while (true) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools: tools.length > 0 ? tools : undefined,
      messages: currentMessages,
    });

    const textBlocks = response.content.filter(b => b.type === 'text');
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

    // Collect any text produced in this turn (may accompany a tool call)
    if (textBlocks.length > 0) {
      accumulatedText.push(...textBlocks.map(b => b.text));
    }

    // No tool calls — we're done; return everything accumulated so far
    if (toolUseBlocks.length === 0) {
      return {
        text: accumulatedText.join('\n\n'),
        messages: [
          ...currentMessages,
          { role: 'assistant', content: response.content },
        ],
      };
    }

    // Process each tool call
    const toolResults = [];
    for (const toolUse of toolUseBlocks) {
      let result = 'Tool not available';
      if (toolHandler) {
        try {
          result = await toolHandler(toolUse.name, toolUse.input);
        } catch (err) {
          result = `Tool error: ${err.message}`;
        }
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }

    // Append assistant turn + tool results and loop
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];
  }
}

/**
 * Simple one-shot completion (no tools, no loop).
 */
export async function complete(userMessage, systemOverride = null) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: systemOverride || SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content.find(b => b.type === 'text')?.text || '';
}

export { client };
