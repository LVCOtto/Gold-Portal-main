import type { Request, Response, NextFunction } from "express";

/**
 * Route guard for all /api/comms/* endpoints.
 * Checks req.session.commsOperator, which is set after successful OTP verification.
 */
export function requireCommsAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.commsOperator) {
    return res.status(401).json({ error: "Comms portal authentication required" });
  }
  next();
}
