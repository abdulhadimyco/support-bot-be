import type { FastifyReply, FastifyRequest } from "fastify";
import { getUserModel, type IUser } from "../db/models";
import { ForbiddenError } from "../lib/errors";

declare module "fastify" {
	interface FastifyRequest {
		appUser:
			| (import("mongoose").Document<unknown, object, IUser> & IUser)
			| null;
	}
}

export const userUpsert = async (
	request: FastifyRequest,
	_reply: FastifyReply,
) => {
	if (!request.user) {
		request.appUser = null;
		return;
	}

	const jwt = request.user;

	// Only admins allowed for now
	const groups = (jwt["cognito:groups"] as string[]) || [];
	if (!groups.includes("admin")) {
		throw new ForbiddenError("Access restricted to admin users");
	}

	const externalId =
		(jwt["myco:userid"] as string) || (jwt.userid as string) || jwt.sub;

	const User = getUserModel();

	// Find locally first — only create if not found
	let appUser = await User.findOne({ externalId });

	if (!appUser) {
		const email = jwt.email;
		const givenName = (jwt.given_name as string) || "";
		const familyName = (jwt.family_name as string) || "";
		const name =
			[givenName, familyName].filter(Boolean).join(" ") ||
			(jwt.preferred_username as string) ||
			email;
		const username =
			(jwt.username as string) ||
			(jwt.preferred_username as string) ||
			email;

		appUser = await User.create({
			externalId,
			email,
			name,
			username,
			role: "admin",
		});
	}

	request.appUser = appUser;
};
