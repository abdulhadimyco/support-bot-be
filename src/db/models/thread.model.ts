import { Schema, Types, type Model } from "mongoose";
import { getChatConnection } from "../../lib/chat-database";

export interface IThread {
	userId: Types.ObjectId;
	title: string | null;
	status: "active" | "closed";
	createdAt: Date;
	updatedAt: Date;
}

const threadSchema = new Schema<IThread>(
	{
		userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
		title: { type: String, default: null },
		status: { type: String, enum: ["active", "closed"], default: "active" },
	},
	{ timestamps: true },
);

threadSchema.index({ userId: 1 });
threadSchema.index({ createdAt: -1 });
threadSchema.index({ status: 1, updatedAt: -1 });

let _model: Model<IThread> | null = null;

export const getThreadModel = (): Model<IThread> => {
	if (!_model)
		_model = getChatConnection().model<IThread>("Thread", threadSchema);
	return _model;
};
