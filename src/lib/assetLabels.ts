import { AssetType } from './types';

export const ASSET_LABELS: Record<AssetType, string> = {
  equity_india: 'Indian Equity',
  equity_global: 'Global Equity',
  mutual_fund_india: 'Indian Mutual Fund',
  mutual_fund_global: 'Global Mutual Fund',
  fd: 'Fixed Deposit',
  bond: 'Bond',
  pms: 'PMS',
  aif: 'AIF',
  real_estate: 'Real Estate',
  gold: 'Gold',
  other: 'Other',
};

export const ASSET_COLORS: Record<AssetType, string> = {
  equity_india: '#3B82F6',
  equity_global: '#8B5CF6',
  mutual_fund_india: '#10B981',
  mutual_fund_global: '#06B6D4',
  fd: '#F59E0B',
  bond: '#EF4444',
  pms: '#EC4899',
  aif: '#F97316',
  real_estate: '#84CC16',
  gold: '#EAB308',
  other: '#6B7280',
};
