export const GENESIS_EVENTS = {
  LEAD_CREATED: "lead.created",
  LEAD_QUALIFIED: "lead.qualified",
  APPROVAL_REQUESTED: "approval.requested",
  OPPORTUNITY_READY: "opportunity.ready",
  OPPORTUNITY_SENT: "opportunity.sent",
  BILDEN_OPPORTUNITY_ACCEPTED: "bilden.opportunity.accepted",
  BILDEN_ESTIMATE_CREATED: "bilden.estimate.created",
  BILDEN_CONTRACT_SIGNED: "bilden.contract.signed",
  BILDEN_PROJECT_COMPLETED: "bilden.project.completed",
  BILDEN_REVENUE_RECOGNIZED: "bilden.revenue.recognized",
} as const;

export type GenesisEventType =
  (typeof GENESIS_EVENTS)[keyof typeof GENESIS_EVENTS];

export type BildenOpportunityPayload = {
  genesisOpportunityId: string;
  lead: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  property: Record<string, unknown>;
  projectIntent: Record<string, unknown>;
  qualification: {
    overallScore: number;
    confidence: number;
    recommendation: string;
  };
  attribution: Record<string, unknown>;
  estimatedValue: number;
  currency: string;
};
