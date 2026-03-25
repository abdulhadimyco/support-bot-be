import type { FastifyReply, FastifyRequest } from "fastify";
import { getUserModel, type IUser } from "../db/models";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";

declare module "fastify" {
	interface FastifyRequest {
		appUser:
			| (import("mongoose").Document<unknown, object, IUser> & IUser)
			| null;
	}
}

function extractJwtClaims(jwt: NonNullable<FastifyRequest["user"]>) {
	const externalId =
		(jwt["myco:userid"] as string) || (jwt.userid as string) || jwt.sub;
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
	const group = (jwt.group as string) || "non_admin";

	return { externalId, email, name, username, group };
}

export const userUpsert = async (
	request: FastifyRequest,
	_reply: FastifyReply,
) => {
	if (!request.user) {
		throw new UnauthorizedError("Token is missing or expired");
	}

	const { externalId, email, name, username, group } = extractJwtClaims(
		request.user,
	);
	// Uncomment this when product is in working state
	// if (group !== "admin") {
	// 	throw new ForbiddenError("Access restricted to admin users");
	// }

	const role = group 

	const User = getUserModel();

	request.appUser = await User.findOneAndUpdate(
		{ externalId },
		{ $set: { email, name, username, role } },
		{ upsert: true, new: true },
	);
};
