import { verify } from "jsonwebtoken";
import config from "../config/env";
import type { JwtPayload } from "../types/jwt";

export const verifyToken = (token: string): JwtPayload => {
	return verify(token, config.JWT_SECRET) as JwtPayload;
};
