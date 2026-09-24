import { MembershipRole } from '@prisma/client';
export interface AuthContext { userId: string; tenantId: string; membershipId: string; role: MembershipRole; permissions: string[]; }

export interface AccessTokenClaims {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: MembershipRole;
  permissions: string[];
}
