import { Schema, type Model } from "mongoose";
import { getChatConnection } from "../../lib/chat-database";

export interface IUser {
	externalId: string;
	email: string;
	name: string;
	username: string;
	role: "agent" | "admin" | "customer";
	createdAt: Date;
	updatedAt: Date;
}

const userSchema = new Schema<IUser>(
	{
		externalId: { type: String, required: true, unique: true },
		email: { type: String, required: true, unique: true },
		name: { type: String, required: true },
		username: { type: String, required: true },
		role: {
			type: String,
			enum: ["agent", "admin", "customer"],
			default: "customer",
		},
	},
	{ timestamps: true },
);

let _model: Model<IUser> | null = null;

export const getUserModel = (): Model<IUser> => {
	if (!_model) _model = getChatConnection().model<IUser>("User", userSchema);
	return _model;
};
