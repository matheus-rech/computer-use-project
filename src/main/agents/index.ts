// ============================================================================
// Agent Module Exports
// Multi-Agent System for Claude Workspace
// ============================================================================

// Base infrastructure
export { BaseAgent } from './BaseAgent';
export type { AgentTask, AgentResult, AgentConfig } from './BaseAgent';

// Specialized agents
export { CompanionAgent } from './CompanionAgent';
export { CoderAgent } from './CoderAgent';
export { ResearcherAgent } from './ResearcherAgent';
export { ReporterAgent } from './ReporterAgent';

// Orchestrator
export { AgentOrchestrator } from './AgentOrchestrator';
