import type { NextFunction, Request, Response } from "express";

export function requireEngineerAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.engineerOperator) {
    return res.status(401).json({ error: "Engineer portal authentication required" });
  }
  return next();
}
