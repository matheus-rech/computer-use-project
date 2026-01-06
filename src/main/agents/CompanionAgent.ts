import { BaseAgent, AgentTask, AgentResult, AgentConfig } from './BaseAgent';
import type { AgentRole, CheckInTime, ValidatedQuestionnaire } from '../../shared/types';

// ============================================================================
// Companion Agent - Main Orchestrator
// ============================================================================

type CompanionMode = 'normal' | 'deadline_taskforce' | 'check_in';

export class CompanionAgent extends BaseAgent {
  readonly role: AgentRole = 'companion';

  readonly systemPrompt = `You are the Companion agent - the main orchestrator and personal assistant for Dr. Matheus Rech.

Your responsibilities:
1. ORCHESTRATION: Analyze user requests and delegate to specialist agents
2. JOURNALING: Support emotional wellbeing, conduct check-ins, deliver questionnaires
3. SYNTHESIS: Combine results from multiple agents into coherent responses
4. COORDINATION: Manage Deadline Mode when deadlines are imminent

Specialist agents you can delegate to:
- CODER: Code execution, debugging, implementation
- RESEARCHER: Literature search, fact-checking, summarization (especially PubMed, meta-analysis)
- REPORTER: Email drafting, deadline management, progress reports

User Context:
- Medical doctor (M.D.) with research focus on ML in healthcare
- Harvard PPCR alumnus - familiar with clinical research methodology
- ADHD-aware: help manage cognitive load, use microtasks, clear structure
- Bilingual: Portuguese (casual), English (technical/academic)
- Expertise: Meta-analysis, systematic reviews, biostatistics, Python/R

When to delegate vs handle yourself:
- Handle: Casual conversation, emotional support, journaling, questionnaires
- Delegate CODER: Any coding task, debugging, file operations
- Delegate RESEARCHER: Searching papers, fact-checking, research summaries
- Delegate REPORTER: Email drafts, deadline tracking, status reports

Always maintain a supportive, understanding tone.`;

  readonly tools = [
    'delegate_to_agent',
    'initiate_check_in',
    'deliver_questionnaire',
    'activate_deadline_mode',
    'synthesize_results',
    'create_microtask',
  ];

  private mode: CompanionMode = 'normal';
  private agentPool: Map<AgentRole, BaseAgent> = new Map();
  private pendingDelegations: Map<string, { agent: AgentRole; task: AgentTask }> = new Map();

  constructor(config: AgentConfig) {
    super(config);
    this.initializeId();
  }

  // ==========================================================================
  // Agent Pool Management
  // ==========================================================================

  registerAgent(agent: BaseAgent): void {
    this.agentPool.set(agent.role, agent);
    this.log(`Registered agent: ${agent.role}`);
  }

  unregisterAgent(role: AgentRole): void {
    this.agentPool.delete(role);
  }

  getRegisteredAgents(): AgentRole[] {
    return Array.from(this.agentPool.keys());
  }

  // ==========================================================================
  // Task Execution
  // ==========================================================================

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.setStatus('thinking');
    await this.log(`Analyzing task: ${task.type} - ${JSON.stringify(task.input).slice(0, 100)}`);

    try {
      let result: AgentResult;

      // Route based on task type
      switch (task.type) {
        // Delegation targets
        case 'code':
        case 'debug':
        case 'implement':
        case 'review_code':
          result = await this.delegateToAgent('coder', task);
          break;

        case 'search':
        case 'research':
        case 'summarize':
        case 'literature_review':
        case 'fact_check':
          result = await this.delegateToAgent('researcher', task);
          break;

        case 'email':
        case 'deadline':
        case 'report':
        case 'digest':
          result = await this.delegateToAgent('reporter', task);
          break;

        // Self-handled tasks
        case 'check_in':
          result = await this.handleCheckIn(task);
          break;

        case 'questionnaire':
          result = await this.deliverQuestionnaire(task);
          break;

        case 'journal':
          result = await this.handleJournalEntry(task);
          break;

        case 'activate_deadline_mode':
          result = await this.activateDeadlineMode(task);
          break;

        default:
          result = await this.handleDirectly(task);
      }

      result.duration = Date.now() - startTime;
      this.recordTask(task, result);
      return result;

    } finally {
      this.setStatus('idle');
    }
  }

  // ==========================================================================
  // Delegation
  // ==========================================================================

  private async delegateToAgent(role: AgentRole, task: AgentTask): Promise<AgentResult> {
    const agent = this.agentPool.get(role);

    if (!agent) {
      await this.log(`Agent ${role} not available, handling directly`, 'warn');
      return this.handleDirectly(task);
    }

    if (!agent.isAvailable()) {
      await this.log(`Agent ${role} is busy, queueing task`);
      this.pendingDelegations.set(task.id, { agent: role, task });
      return {
        success: true,
        output: { queued: true, agent: role },
        nextSteps: [`Task queued for ${role} agent`],
      };
    }

    await this.log(`Delegating to ${role}: ${task.type}`);
    this.emit('delegation', { from: this.role, to: role, task });

    const delegatedTask: AgentTask = {
      ...task,
      delegatedBy: this.role,
    };

    return agent.execute(delegatedTask);
  }

  async synthesizeResults(results: { agent: AgentRole; result: AgentResult }[]): Promise<AgentResult> {
    const successful = results.filter((r) => r.result.success);
    const failed = results.filter((r) => !r.result.success);

    const combinedOutput = {
      results: successful.map((r) => ({
        agent: r.agent,
        output: r.result.output,
      })),
      errors: failed.map((r) => ({
        agent: r.agent,
        error: r.result.error,
      })),
    };

    const allArtifacts = results.flatMap((r) => r.result.artifacts || []);
    const allNextSteps = results.flatMap((r) => r.result.nextSteps || []);

    return {
      success: failed.length === 0,
      output: combinedOutput,
      artifacts: allArtifacts,
      nextSteps: allNextSteps,
      error: failed.length > 0 ? `${failed.length} agent(s) failed` : undefined,
    };
  }

  // ==========================================================================
  // Check-In System
  // ==========================================================================

  private async handleCheckIn(task: AgentTask): Promise<AgentResult> {
    const trigger = (task.input.trigger as CheckInTime) || 'random';

    const prompts: Record<CheckInTime, string[]> = {
      morning: [
        'Bom dia! Como você está se sentindo hoje?',
        'Good morning! Any thoughts occupying your mind this morning?',
        'Começando o dia - qual é a prioridade hoje?',
      ],
      evening: [
        'Como foi seu dia?',
        'Algo que você gostaria de registrar antes de encerrar?',
        'Any wins or challenges from today worth noting?',
      ],
      random: [
        'Só passando para ver como você está...',
        'Quick check - everything okay?',
        'Pausa para respirar - como está o nível de energia?',
      ],
      post_deadline: [
        'Deadline entregue! Como você está se sentindo?',
        'Parabéns pela entrega! Quer desabafar sobre como foi o processo?',
        'You made it! Time to decompress - how are you feeling?',
      ],
    };

    const selectedPrompt = prompts[trigger][Math.floor(Math.random() * prompts[trigger].length)];

    // Record check-in attempt in journal
    const checkInEntry = {
      id: `checkin-${Date.now()}`,
      timestamp: new Date(),
      content: `Check-in initiated (${trigger})`,
      trigger,
      tags: ['check-in', trigger],
    };
    this.memory.journal.entries.push(checkInEntry);

    return {
      success: true,
      output: {
        prompt: selectedPrompt,
        trigger,
        checkInId: checkInEntry.id,
      },
    };
  }

  // ==========================================================================
  // Questionnaire Delivery
  // ==========================================================================

  private async deliverQuestionnaire(task: AgentTask): Promise<AgentResult> {
    const questionnaireId = task.input.questionnaire as string;
    const questionnaire = this.memory.journal.questionnaires.find(
      (q) => q.id === questionnaireId || q.name === questionnaireId
    );

    if (!questionnaire) {
      const available = this.memory.journal.questionnaires.map((q) => q.name).join(', ');
      return {
        success: false,
        output: null,
        error: `Questionnaire "${questionnaireId}" not found. Available: ${available}`,
      };
    }

    await this.log(`Delivering questionnaire: ${questionnaire.fullName}`);

    return {
      success: true,
      output: {
        questionnaire,
        instructions: this.getQuestionnaireInstructions(questionnaire),
      },
    };
  }

  private getQuestionnaireInstructions(q: ValidatedQuestionnaire): string {
    const categoryInstructions: Record<string, string> = {
      depression: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
      anxiety: 'Over the last 2 weeks, how often have you been bothered by the following problems?',
      adhd: 'Please answer the questions below, rating yourself on each of the criteria.',
      sleep: 'The following questions relate to your usual sleep habits during the past month only.',
      burnout: 'Please read each statement carefully and decide how often you feel that way.',
      self_efficacy: 'Please respond to each item by marking one response per item.',
    };

    return categoryInstructions[q.category] || 'Please answer each question honestly.';
  }

  // ==========================================================================
  // Journal Entry
  // ==========================================================================

  private async handleJournalEntry(task: AgentTask): Promise<AgentResult> {
    const { content, mood, energy, tags } = task.input as {
      content: string;
      mood?: number;
      energy?: number;
      tags?: string[];
    };

    const entry = {
      id: `journal-${Date.now()}`,
      timestamp: new Date(),
      content,
      mood,
      energy,
      tags: tags || [],
    };

    this.memory.journal.entries.push(entry);

    // Add key facts if mood/energy are notable
    if (mood && mood <= 3) {
      this.addKeyFact(`Low mood reported on ${new Date().toLocaleDateString()}`);
    }
    if (energy && energy <= 3) {
      this.addKeyFact(`Low energy reported on ${new Date().toLocaleDateString()}`);
    }

    return {
      success: true,
      output: {
        entry,
        message: 'Journal entry saved. Thank you for sharing.',
      },
    };
  }

  // ==========================================================================
  // Deadline Mode
  // ==========================================================================

  private async activateDeadlineMode(task: AgentTask): Promise<AgentResult> {
    const deadlineId = task.input.deadlineId as string;
    const deadline = this.memory.deadlines.deadlines.find((d) => d.id === deadlineId);

    if (!deadline) {
      return {
        success: false,
        output: null,
        error: `Deadline ${deadlineId} not found`,
      };
    }

    this.mode = 'deadline_taskforce';
    this.emit('deadline-mode', { active: true, deadline });

    await this.log(`DEADLINE MODE ACTIVATED for: ${deadline.title}`);

    // Notify all registered agents
    for (const [role] of this.agentPool) {
      this.emit('deadline-mode', { active: true, deadline, notifiedAgent: role });
    }

    return {
      success: true,
      output: {
        mode: 'deadline_taskforce',
        deadline,
        message: `All agents now focusing on: ${deadline.title}`,
      },
    };
  }

  deactivateDeadlineMode(): void {
    this.mode = 'normal';
    this.emit('deadline-mode', { active: false });
    this.log('Deadline mode deactivated');
  }

  getMode(): CompanionMode {
    return this.mode;
  }

  // ==========================================================================
  // Direct Handling (Fallback)
  // ==========================================================================

  private async handleDirectly(task: AgentTask): Promise<AgentResult> {
    await this.log(`Handling directly: ${task.type}`);

    // For now, return a placeholder - this would integrate with Claude API
    return {
      success: true,
      output: {
        handled: 'directly',
        task: task.type,
        message: 'Task processed by Companion agent',
      },
    };
  }
}
