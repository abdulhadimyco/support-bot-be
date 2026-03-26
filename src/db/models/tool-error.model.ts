import { Schema, Types, type Model } from "mongoose";
import { getChatConnection } from "../../lib/chat-database";

export interface IToolError {
	threadId: Types.ObjectId | null;
	toolName: string;
	errorCode: string;
	errorMessage: string;
	params: Record<string, unknown> | null;
	createdAt: Date;
}

const toolErrorSchema = new Schema<IToolError>(
	{
		threadId: { type: Schema.Types.ObjectId, ref: "Thread", default: null },
		toolName: { type: String, required: true },
		errorCode: { type: String, required: true },
		errorMessage: { type: String, required: true },
		params: { type: Schema.Types.Mixed, default: null },
	},
	{ timestamps: { createdAt: true, updatedAt: false } },
);

toolErrorSchema.index({ createdAt: -1 });
toolErrorSchema.index({ toolName: 1, createdAt: -1 });
toolErrorSchema.index({ errorCode: 1, createdAt: -1 });

export const getToolErrorModel = (): Model<IToolError> =>
	getChatConnection().model<IToolError>("ToolError", toolErrorSchema);
