import { request } from './api';

export const BANK_TARGET_ID = 'silver_bell_bank';
export type BankProductCode = 'seven' | 'thirty' | 'hundred';
export type BankAction = 'deposit' | 'withdraw' | 'term_open' | 'settle' | 'early_settle';
export type BankActionInput =
  | { action: 'deposit' | 'withdraw'; amount: number }
  | { action: 'term_open'; amount: number; productCode: BankProductCode }
  | { action: 'settle' | 'early_settle'; depositId: number };
export type BankDepositSummary = {
  id: number; product: string; principal: number; interest: number; due: number; status: string;
};
export type BankSummary = {
  pocket: number; demand: number; openCount: number; deposits: BankDepositSummary[];
};
export type BankProduct = {
  code: BankProductCode; name: string; days: number; basisPoints: number; minCopper: number;
};
export type BankOverview = {
  ok: true; target: { id: typeof BANK_TARGET_ID; name: string; locationRequired: true };
  summary: BankSummary; products: BankProduct[]; serverTime: string;
};
export type BankDeposit = {
  id: number; productCode: BankProductCode; productName: string;
  principalCopper: number; reservedInterestCopper: number; maturesMs: number;
  status: string; matured: boolean; availableActions: ('settle' | 'early_settle')[];
};
export type BankTransferQuote = {
  copper: number; direction: 'in' | 'out'; pocketBefore: number; pocketAfter: number;
  demandBefore: number; demandAfter: number;
};
export type BankTermQuote = {
  copper: number; interest: number; due: number; name: string; productCode: BankProductCode;
  demandBefore: number; demandAfter: number; id?: number;
};
export type BankSettlementQuote = {
  depositId: number; productCode: BankProductCode; principal: number; credit: number;
  interest: number; penalty: number; matured: boolean; due: number;
  demandBefore: number; demandAfter: number;
};
export type BankQuote = BankTransferQuote | BankTermQuote | BankSettlementQuote;
export type BankPreview = {
  ok: true; token: string; idempotencyKey: string; expiresAt: string;
  quote: BankQuote; serverTime: string;
};
export type BankConfirm = { ok: true; result: BankQuote; refresh: string[]; serverTime: string };

const path = `/places/${BANK_TARGET_ID}/bank`;
export const bankOverview = () => request<BankOverview>(path);
export const bankDeposit = async (id: number) =>
  (await request<{ ok: true; deposit: BankDeposit }>(`${path}/deposits/${id}`)).deposit;
export const previewBankAction = (input: BankActionInput) =>
  request<BankPreview>(`${path}/actions/preview`, { method: 'POST', body: JSON.stringify(input) });
export const confirmBankAction = (token: string, idempotencyKey: string) =>
  request<BankConfirm>(`${path}/actions/confirm`, { method: 'POST', body: JSON.stringify({ token, idempotencyKey }) });
