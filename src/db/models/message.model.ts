import { Schema, Types, type Model } from "mongoose";
import { getChatConnection } from "../../lib/chat-database";

export interface IMessageMetadata {
	model?: string;
	provider?: string;
	inputTokens?: number;
	outputTokens?: number;
	elapsedMs?: number;
}

export interface IMessage {
	threadId: Types.ObjectId;
	role: "user" | "assistant";
	content: unknown;
	metadata: IMessageMetadata | null;
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
		content: { type: Schema.Types.Mixed, required: true },
		metadata: { type: Schema.Types.Mixed, default: null },
	},
	{ timestamps: true },
);

messageSchema.index({ threadId: 1, createdAt: 1 });

let _model: Model<IMessage> | null = null;

export const getMessageModel = (): Model<IMessage> => {
	if (!_model)
		_model = getChatConnection().model<IMessage>("Message", messageSchema);
	return _model;
};
