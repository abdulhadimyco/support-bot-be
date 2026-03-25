import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import config from "../config/env";

const minimax = createOpenAICompatible({
	name: "minimax",
	baseURL: "https://api.minimaxi.com/v1",
	apiKey: config.MINIMAX_API_KEY,
});

const anthropic = createAnthropic({
	apiKey: config.ANTHROPIC_API_KEY,
});

export type ModelRole = "primary" | "reasoning";

export function getModel(role: ModelRole) {
	switch (role) {
		case "primary":
			return minimax.chatModel(config.MINIMAX_MODEL);
		case "reasoning":
			return anthropic(config.ANTHROPIC_MODEL);
		default:
			throw new Error(`Unknown model role: ${role}`);
	}
}
