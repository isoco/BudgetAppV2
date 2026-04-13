import { Request } from 'express';

export interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

export type TransactionType = 'income' | 'expense' | 'transfer';
export type CategoryType = 'income' | 'expense' | 'both';
export type BillingCycle = 'weekly' | 'monthly' | 'yearly';

export interface User {
  id: string;
  email: string;
  name: string;
  currency: string;
  avatar_url: string | null;
  created_at: Date;
}

export interface Transaction {
  id: string;
  user_id: string;
  category_id: string | null;
  amount: string;
  type: TransactionType;
  date: string;
  note: string | null;
  merchant: string | null;
  is_recurring: boolean;
  recurring_id: string | null;
  created_at: Date;
  // joined
  category_name?: string;
  category_icon?: string;
  category_color?: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  amount: string;
  month: number;
  year: number;
  // computed
  spent?: string;
  remaining?: string;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  target_amount: string;
  current_amount: string;
  deadline: string | null;
  is_completed: boolean;
}
