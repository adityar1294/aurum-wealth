export type Role = 'admin' | 'rm' | 'client';

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive' | 'very_aggressive';

export type TaxSlab = '0%' | '5%' | '10%' | '15%' | '20%' | '25%' | '30%';

export type AssetType =
  | 'equity_india'
  | 'equity_global'
  | 'mutual_fund_india'
  | 'mutual_fund_global'
  | 'fd'
  | 'bond'
  | 'pms'
  | 'aif'
  | 'real_estate'
  | 'gold'
  | 'other';

export type TransactionType = 'buy' | 'sell' | 'dividend' | 'sip' | 'redemption';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type InteractionType =
  | 'call'
  | 'meeting'
  | 'email'
  | 'whatsapp'
  | 'review'
  | 'other';

export type DocumentCategory = 'KYC' | 'Agreement' | 'Report' | 'Tax' | 'Other';

export interface User {
  uid: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
  rmId?: string;
  clientId?: string;
}

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  pan: string;
  aadhaar: string;
  address: string;
}

export interface Client {
  id: string;
  rmId: string;
  personalInfo: PersonalInfo;
  riskProfile: RiskProfile;
  taxSlab: TaxSlab;
  financialGoals: string;
  investmentHorizon: string;
  notes: string;
  tags: string[];
  clientUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Holding {
  id: string;
  clientId: string;
  assetType: AssetType;
  name: string;
  symbol?: string;
  isin?: string;
  amfiCode?: string;
  exchange?: string;
  currency: string;
  units?: number;
  avgCostPrice?: number;
  currentPrice?: number;
  investedAmount?: number;
  currentValue?: number;
  maturityDate?: string;
  interestRate?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  holdingId: string;
  type: TransactionType;
  date: Date;
  units?: number;
  price?: number;
  amount: number;
  notes?: string;
}

export interface Interaction {
  id: string;
  clientId: string;
  rmId: string;
  type: InteractionType;
  subject: string;
  notes: string;
  date: Date;
  followUpDate?: Date;
  followUpNote?: string;
  createdAt: Date;
}

export interface Task {
  id: string;
  rmId: string;
  clientId?: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface Document {
  id: string;
  clientId: string;
  rmId: string;
  category: DocumentCategory;
  fileName: string;
  storagePath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
}

export interface PortfolioSummary {
  totalInvested: number;
  currentValue: number;
  absoluteReturn: number;
  absoluteReturnPct: number;
  xirr: number | null;
}

export interface AssetAllocation {
  assetType: AssetType;
  label: string;
  value: number;
  percentage: number;
}
