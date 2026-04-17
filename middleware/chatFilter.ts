import { Request, Response, NextFunction } from 'express';

const phoneRegex = /(0[789][01]\d{8})|(\+234[789][01]\d{8})/g;
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const triggerWords = /\b(whatsapp|call me|text me|my number|081|080|090|070)\b/i;

export interface FlaggedRequest extends Request {
  flagged?: boolean;
  flaggedReason?: string;
}

const chatFilter = (req: FlaggedRequest, res: Response, next: NextFunction) => {
  const { message } = req.body;
  if (!message) return next();

  if (phoneRegex.test(message) || emailRegex.test(message) || triggerWords.test(message)) {
    req.flagged = true;
    req.flaggedReason = 'Contact details detected';
  }
  next();
};

export default chatFilter;
