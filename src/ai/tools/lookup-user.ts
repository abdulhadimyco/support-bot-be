import { z } from "zod";
import type { ToolExecutionOptions } from "ai";
import { getUserByEmail } from "./get-user-by-email";
import { getUserByPhone } from "./get-user-by-phone";

const parameters = z.object({
	email: z.string().optional().describe("Customer email"),
	phone: z.string().optional().describe("Customer phone number"),
});

async function execute(
	params: z.infer<typeof parameters>,
	opts: ToolExecutionOptions,
) {
	if (params.email) return getUserByEmail.execute({ email: params.email }, opts);
	if (params.phone) return getUserByPhone.execute({ phone: params.phone }, opts);
	return { error: "Provide email or phone." };
}

export const lookupUser = {
	description: "Look up a customer by email or phone number.",
	parameters,
	execute,
};
