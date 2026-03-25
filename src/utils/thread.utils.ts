import type { IThread } from "../db/models/thread.model";
import type { IUser } from "../db/models/user.model";
import { ForbiddenError } from "../lib/errors";

export function assertThreadOwnership(
	thread: IThread & { _id: unknown },
	user: IUser & { _id: unknown },
): void {
	if (String(thread.userId) !== String(user._id)) {
		throw new ForbiddenError("Thread does not belong to you");
	}
}
