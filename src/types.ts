export type UserRole = "admin" | "engineer";

export type ServiceStatus =
  | "Received"
  | "Assigned"
  | "Diagnosing"
  | "Waiting Parts"
  | "Repaired"
  | "Delivered"
  | "Cancelled"
  | "Request Reassign"
  | "Returned";

export type User = {
  id: string;
  name: string;
  role: UserRole;
  pin: string;
  password?: string;
  email?: string;
  photo?: string;
  isActive?: boolean;
};

export type RepairHistory = {
  id: string;
  at: string;
  by: string;
  status: ServiceStatus;
  note: string;
};

export type ServiceJob = {
  id: string;
  ticketNo: string;
  customerName: string;
  mobileNumber: string;
  productName: string;
  productSerialNo: string;
  problem: string;
  photoDataUrl?: string;
  status: ServiceStatus;
  assignedEngineerId: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  repairNote: string;
  partsUsed?: { name: string; price: number }[];
  history: RepairHistory[];
  estimatedCost?: string;
  repairCost?: number;
};

export type InventoryItem = {
  id: string;
  name: string;
  price: number;
  stock: number;
  updatedAt: string;
  verified?: boolean;
};

export type AppData = {
  storeLogo?: string;
  jobs: ServiceJob[];
  inventory: InventoryItem[];
  users: User[];
  googleClientId?: string;
  googleApiKey?: string;
  lastGoogleBackupDate?: string;
  upiId?: string;
  upiName?: string;
};
