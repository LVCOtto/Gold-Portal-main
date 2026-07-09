import type { Request, Response, NextFunction } from "express";

export function requireCallbacksAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.callbacksOperator) {
    return res.status(401).json({ error: "Callbacks portal authentication required" });
  }
  next();
}