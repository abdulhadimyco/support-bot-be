import { Schema, Types, type Model } from "mongoose";
import { getChatConnection } from "../../lib/chat-database";

export interface IMessageMetadata {
	model?: string;
	provider?: string;
	elapsedMs?: number;
}

export interface IToolInvocation {
	toolCallId: string;
	toolName: string;
	input?: Record<string, unknown>;
	output?: unknown;
}

export interface IMessage {
	threadId: Types.ObjectId;
	role: "user" | "assistant";
	content: string;
	metadata: IMessageMetadata | null;
	toolInvocations?: IToolInvocation[];
	createdAt: Date;
	updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
	{
		threadId: {
			type: Schema.Types.ObjectId,
			ref: "Thread",
			required: true,
		},
		role: { type: String, enum: ["user", "assistant"], required: true },
		content: { type: String, required: true },
		metadata: { type: Schema.Types.Mixed, default: null },
		toolInvocations: { type: [Schema.Types.Mixed], default: undefined },
	},
	{ timestamps: true },
);

messageSchema.index({ threadId: 1, createdAt: 1 });

export const getMessageModel = (): Model<IMessage> =>
	getChatConnection().model<IMessage>("Message", messageSchema);
