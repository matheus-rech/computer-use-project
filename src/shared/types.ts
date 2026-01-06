// ============================================================================
// Shared Types - Between Main and Renderer Processes
// ============================================================================

// ============================================================================
// Agent Types
// ============================================================================

export type AgentRole =
  | 'companion'    // Primary interface, orchestrates others
  | 'researcher'   // Web search, document analysis
  | 'coder'        // Code generation, execution, debugging
  | 'analyst'      // Data analysis, visualization
  | 'reporter'     // Daily summaries, email delivery
  | 'watcher'      // Background monitoring
  | 'guardian';    // Oversight, alignment enforcement

export interface Agent {
  id: string;
  role: AgentRole;
  provider: ProviderType;
  model: string;
  status: AgentStatus;
  capabilities: string[];
}

export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'error';

// ============================================================================
// Provider Types
// ============================================================================

export type ProviderType = 'claude' | 'gemini' | 'openai' | 'huggingface' | 'local';

export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  capabilities: ProviderCapability[];
}

export type ProviderCapability =
  | 'text'
  | 'vision'
  | 'computer_use'
  | 'code_execution'
  | 'function_calling'
  | 'streaming'
  | 'voice';

// ============================================================================
// Message Types
// ============================================================================

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: MessageContent[];
  timestamp: Date;
  agentId?: string;
  provider?: ProviderType;
}

export type MessageContent =
  | TextContent
  | ImageContent
  | ToolUseContent
  | ToolResultContent;

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    mediaType: string;
    data: string;
  };
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  toolUseId: string;
  content: string | MessageContent[];
  isError?: boolean;
}

// ============================================================================
// Tool Types
// ============================================================================

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  provider?: ProviderType;
}

export interface ToolAction {
  type: string;
  payload: Record<string, unknown>;
}

// ============================================================================
// Memory Types
// ============================================================================

export interface SharedMemory {
  working: WorkingMemory;
  conversation: ConversationBuffer;
  user: UserProfile;
  project: ProjectContext;
  contacts: ContactDatabase;
  deadlines: DeadlineDatabase;
  journal: JournalDatabase;
}

export interface WorkingMemory {
  currentTask?: Record<string, unknown>;
  activeFiles: string[];
  recentActions: ToolAction[];
  pendingDecisions: string[];
}

export interface ConversationBuffer {
  messages: Message[];
  summary?: string;
  keyFacts: string[];
}

export interface UserProfile {
  name?: string;
  title?: string;
  email?: string;
  location?: string;
  orcid?: string;
  preferences: Record<string, unknown>;
  patterns: string[];
  expertise: string[];
  technicalSkills?: Record<string, string[]>;
  languages?: string[];
}

export interface ProjectContext {
  name?: string;
  path?: string;
  type?: string;
  dependencies?: string[];
  recentFiles?: string[];
}

// ============================================================================
// Contact Database
// ============================================================================

export interface ContactDatabase {
  contacts: Contact[];
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  channels: ('email' | 'whatsapp' | 'slack')[];
  conversationStyle: 'formal' | 'casual' | 'technical' | 'friendly';
  sampleMessages: string[];
  relationship: 'work' | 'personal' | 'mentor' | 'student' | 'client';
  notes: string;
  lastContact?: Date;
}

// ============================================================================
// Deadline Database
// ============================================================================

export interface DeadlineDatabase {
  deadlines: Deadline[];
}

export interface Deadline {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
  createdAt: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  weeksOut: number;
  phase: DeadlinePhase;
  microtasks: Microtask[];
  completedMicrotasks: number;
  progressPercent: number;
  agentContributions: AgentContribution[];
  status: 'pending' | 'in_progress' | 'blocked' | 'done';
  tags: string[];
  linkedProject?: string;
}

export type DeadlinePhase =
  | 'planning'      // 14-10 weeks out
  | 'building'      // 9-6 weeks out
  | 'accelerating'  // 5-3 weeks out
  | 'focusing'      // 2-1 weeks out
  | 'taskforce';    // Deadline day

export interface Microtask {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes: number;
  assignee: 'user' | 'agent' | 'both';
  status: 'pending' | 'in_progress' | 'done';
  dueWeek: number;
  contributesTo: string;
  dependencies: string[];
  completedAt?: Date;
  result?: string;
}

export interface AgentContribution {
  type: 'research' | 'draft' | 'review' | 'organize' | 'remind' | 'implement';
  description: string;
  completedAt?: Date;
  result?: string;
  agent: AgentRole;
}

// ============================================================================
// Journal Database
// ============================================================================

export interface JournalDatabase {
  entries: JournalEntry[];
  checkInSchedule: CheckInTime[];
  prompts: string[];
  questionnaires: ValidatedQuestionnaire[];
  assessments: AssessmentResult[];
}

export type CheckInTime = 'morning' | 'evening' | 'random' | 'post_deadline';

export interface JournalEntry {
  id: string;
  timestamp: Date;
  content: string;
  mood?: number;
  energy?: number;
  trigger?: CheckInTime;
  tags: string[];
}

export interface ValidatedQuestionnaire {
  id: string;
  name: string;
  fullName: string;
  category: QuestionnaireCategory;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'random';
  questions: QuestionnaireQuestion[];
  scoringRanges: ScoringRange[];
}

export type QuestionnaireCategory =
  | 'depression'
  | 'anxiety'
  | 'adhd'
  | 'sleep'
  | 'burnout'
  | 'self_efficacy';

export interface QuestionnaireQuestion {
  id: number;
  text: string;
  textPt?: string;
  options: { value: number; label: string }[];
}

export interface ScoringRange {
  min: number;
  max: number;
  interpretation: string;
  severity: 'minimal' | 'mild' | 'moderate' | 'moderately_severe' | 'severe';
}

export interface AssessmentResult {
  id: string;
  questionnaire: string;
  date: Date;
  responses: number[];
  totalScore: number;
  interpretation: string;
  severity: string;
  trend?: 'improving' | 'stable' | 'declining';
}

// ============================================================================
// Voice Types
// ============================================================================

export type LiveVoiceProvider = 'gemini' | 'openai-realtime' | 'elevenlabs-conversational';
export type LegacySTTProvider = 'whisper' | 'deepgram';
export type LegacyTTSProvider = 'elevenlabs' | 'openai';

export interface VoiceConfig {
  liveProvider?: LiveVoiceProvider;
  sttProvider?: LegacySTTProvider;
  ttsProvider?: LegacyTTSProvider;
  voice: string;
  speed: number;
  language?: string;
  systemPrompt?: string;
  enableInterruption: boolean;
  enableVisualization?: boolean;
}

export type VoiceMode = 'live' | 'legacy' | 'disconnected';

export interface VoiceState {
  mode: VoiceMode;
  provider?: LiveVoiceProvider;
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isInterrupted: boolean;
  currentTranscript: string;
  inputLevel?: number;
  outputLevel?: number;
}

export interface VoiceTranscript {
  text: string;
  isFinal: boolean;
  role: 'user' | 'assistant';
}

// ============================================================================
// Session Types (Extended for unified isolation)
// ============================================================================

export interface Session {
  id: string;
  createdAt: Date;
  profile: IsolationProfileCompat;
  status: SessionStatus;
  containerId?: string;
  vmId?: string;
}

export type SessionStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export interface IsolationProfileCompat {
  name: string;
  network: 'full' | 'local' | 'none';
  clipboard?: boolean;
  gpu?: boolean;
  resources: {
    cpuCores: number;
    memoryGB: number;
    diskGB?: number;
  };
}
