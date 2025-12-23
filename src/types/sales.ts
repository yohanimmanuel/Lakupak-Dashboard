export interface FavoriteProduct {
  productId: string;
  productDbId?: number; // Database ID for GraphQL mutations
  name: string;
  productType: string;
  brand?: string;
  images?: string[];
  sellingPrice?: string;
}

export interface FieldReport {
  id: string;
  date: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  activities?: {
    visits: number;
    customersMet: number;
    productsDemonstrated: number;
    salesMade: number;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesTarget {
  id: string;
  period: string;
  goal: number;
  achieved: number;
  unitsSold: number;
  createdAt: string;
  updatedAt: string;
}

export interface SalesAgent {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'Sales Manager' | 'Sales Rep' | 'Sales Support' | 'Lead Gen' | 'Account Manager';
  status: 'active' | 'inactive';
  avatar?: string;
  territory?: string;
  bio?: string;
  sex?: string;
  teamId?: string;
  teamName?: string;
  userId?: number;
  favoriteProducts?: FavoriteProduct[];
  fieldReports?: FieldReport[];
  salesTargets?: SalesTarget[];
  createdAt: string;
  updatedAt: string;
}

export interface SalesTeam {
  id: string;
  name: string;
  memberIds: string[];
  members: SalesAgent[];
  userId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SalesAgentConnection {
  nodes: SalesAgent[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface SalesTeamConnection {
  nodes: SalesTeam[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface CreateSalesAgentInput {
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  avatar?: string;
  territory?: string;
  teamId?: string;
  fieldReports?: Array<{
    date: string;
    location?: string;
    startTime?: string;
    endTime?: string;
    activities?: {
      visits: number;
      customersMet: number;
      productsDemonstrated: number;
      salesMade: number;
    };
    notes?: string;
  }>;
  salesTargets?: Array<{
    period: string;
    goal: number;
    achieved?: number;
    unitsSold?: number;
  }>;
  favoriteProductIds?: number[];
}

export interface UpdateSalesAgentInput {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  status?: string;
  avatar?: string;
  territory?: string;
  teamId?: string;
  fieldReports?: Array<{
    id?: string;
    date: string;
    location?: string;
    startTime?: string;
    endTime?: string;
    activities?: {
      visits: number;
      customersMet: number;
      productsDemonstrated: number;
      salesMade: number;
    };
    notes?: string;
  }>;
  salesTargets?: Array<{
    id?: string;
    period: string;
    goal: number;
    achieved?: number;
    unitsSold?: number;
  }>;
  favoriteProductIds?: number[];
}

export interface CreateSalesTeamInput {
  name: string;
  memberIds: string[];
}

export interface UpdateSalesTeamInput {
  id: string;
  name?: string;
  memberIds?: string[];
}

export interface DeleteSalesAgentResult {
  success: boolean;
  deleted?: SalesAgent;
}

export interface DeleteSalesTeamResult {
  success: boolean;
  deleted?: SalesTeam;
}
