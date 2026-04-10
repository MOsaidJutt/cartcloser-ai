import { AgentConfig } from "./system-prompt";

/**
 * Returns the fallback message if the user message hits a restricted topic,
 * or null if the message is allowed through.
 *
 * Matching is intentionally broad (word-level substring) so partial mentions
 * are caught. The system prompt already instructs the AI to refuse, but this
 * server-side guard ensures the AI call is skipped entirely — saving tokens and
 * preventing any chance of the model slipping through.
 */
export function checkRestrictedTopic(
  message: string,
  config: AgentConfig
): string | null {
  const topics = config.restrictedTopics ?? [];
  if (topics.length === 0) return null;

  const lower = message.toLowerCase();

  for (const topic of topics) {
    const topicWords = topic.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const matched = topicWords.length > 0 && topicWords.every((w) => lower.includes(w));
    if (matched) {
      return (
        config.fallbackMessage ||
        "For more help on that, please reach out to us directly via email."
      );
    }
  }

  return null;
}
