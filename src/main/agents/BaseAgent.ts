import { EventEmitter } from 'events';
import type { AgentRole, AgentStatus, SharedMemory } from '../../shared/types';

// ============================================================================
// Agent Task & Result Types
// ============================================================================

export interface AgentTask {
  id: string;
  type: string;
  input: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  deadline?: Date;
  delegatedBy?: AgentRole;
}

export interface AgentResult {
  success: boolean;
  output: unknown;
  artifacts?: string[];
  nextSteps?: string[];
  error?: string;
  duration?: number;
}

export interface AgentConfig {
  provider: string;
  model: string;
  apiKey: string;
  memory: SharedMemory;
}

// ============================================================================
// Agent Events
// ============================================================================

export interface AgentEvents {
  'status-change': { agent: string; role: AgentRole; status: AgentStatus };
  'log': { agent: string; role: AgentRole; message: string; timestamp: Date };
  'task-start': { agent: string; task: AgentTask };
  'task-complete': { agent: string; task: AgentTask; result: AgentResult };
  'delegation': { from: AgentRole; to: AgentRole; task: AgentTask };
}

// ============================================================================
// Base Agent Abstract Class
// ============================================================================

export abstract class BaseAgent extends EventEmitter {
  readonly id: string;
  abstract readonly role: AgentRole;
  abstract readonly systemPrompt: string;
  abstract readonly tools: string[];

  protected status: AgentStatus = 'idle';
  protected memory: SharedMemory;
  protected config: AgentConfig;
  protected taskHistory: { task: AgentTask; result: AgentResult; timestamp: Date }[] = [];

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.memory = config.memory;
    // ID will be set after role is available (in subclass constructor)
    this.id = '';
  }

  protected initializeId(): void {
    (this as { id: string }).id = `${this.role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // ==========================================================================
  // Status Management
  // ==========================================================================

  getStatus(): AgentStatus {
    return this.status;
  }

  setStatus(status: AgentStatus): void {
    const previousStatus = this.status;
    this.status = status;
    this.emit('status-change', {
      agent: this.id,
      role: this.role,
      status,
      previousStatus,
    });
  }

  isAvailable(): boolean {
    return this.status === 'idle';
  }

  // ==========================================================================
  // Task Execution (Abstract)
  // ==========================================================================

  abstract execute(task: AgentTask): Promise<AgentResult>;

  // ==========================================================================
  // Memory Operations
  // ==========================================================================

  protected async saveToMemory(key: string, value: unknown): Promise<void> {
    if (!this.memory.working.currentTask) {
      this.memory.working.currentTask = {};
    }
    this.memory.working.currentTask[key] = value;
  }

  protected async readFromMemory(key: string): Promise<unknown> {
    return this.memory.working.currentTask?.[key];
  }

  protected getKeyFacts(): string[] {
    return this.memory.conversation.keyFacts;
  }

  protected addKeyFact(fact: string): void {
    if (!this.memory.conversation.keyFacts.includes(fact)) {
      this.memory.conversation.keyFacts.push(fact);
    }
  }

  // ==========================================================================
  // Logging
  // ==========================================================================

  protected async log(message: string, level: 'info' | 'warn' | 'error' = 'info'): Promise<void> {
    this.emit('log', {
      agent: this.id,
      role: this.role,
      message,
      level,
      timestamp: new Date(),
    });
  }

  // ==========================================================================
  // Task History
  // ==========================================================================

  protected recordTask(task: AgentTask, result: AgentResult): void {
    this.taskHistory.push({
      task,
      result,
      timestamp: new Date(),
    });

    // Keep only last 50 tasks
    if (this.taskHistory.length > 50) {
      this.taskHistory = this.taskHistory.slice(-50);
    }
  }

  getTaskHistory(): { task: AgentTask; result: AgentResult; timestamp: Date }[] {
    return [...this.taskHistory];
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  protected generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
