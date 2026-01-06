import { BaseAgent, AgentTask, AgentResult, AgentConfig } from './BaseAgent';
import type {
  AgentRole,
  Contact,
  Deadline,
  Microtask,
  DeadlinePhase,
  AgentContribution,
} from '../../shared/types';

// ============================================================================
// Reporter Agent - Communication & Deadline Specialist
// ============================================================================

export class ReporterAgent extends BaseAgent {
  readonly role: AgentRole = 'reporter';

  readonly systemPrompt = `You are the Reporter agent - specialized in communication and deadline management.

Your responsibilities:
1. Draft emails adapted to each contact's conversation style
2. Track deadlines with 14-week advance planning
3. Decompose big deadlines into microtasks (15-30 min each)
4. Generate progress reports and digests
5. Help manage cognitive load for user with ADHD

User Context (Dr. Matheus Rech):
- ADHD-aware: needs clear structure, microtasks, regular reminders
- Bilingual: Portuguese (casual/local), English (academic/international)
- Communication contexts: Academic (Harvard, journals), Clinical (colleagues), Personal

For emails:
- Use ContactDB to match the recipient's preferred style
- Reference past messages to maintain consistency
- Be concise but complete
- Portuguese for Brazilian contacts, English for international

For deadlines:
- Start planning 14 weeks out
- Create microtasks that both user AND agents can work on
- Escalate reminders as deadline approaches (weekly → daily → continuous)
- Activate Deadline Mode when due date arrives

Reminder Schedule by Phase:
- Planning (14-10 weeks): Weekly digest
- Building (9-6 weeks): Twice weekly
- Accelerating (5-3 weeks): Daily
- Focusing (2-1 weeks): Twice daily
- Taskforce (deadline day): Continuous`;

  readonly tools = [
    'draft_email',
    'summarize_emails',
    'create_deadline',
    'update_microtask',
    'generate_digest',
    'check_deadlines',
    'send_reminder',
  ];

  constructor(config: AgentConfig) {
    super(config);
    this.initializeId();
  }

  // ==========================================================================
  // Task Execution
  // ==========================================================================

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.setStatus('executing');
    await this.log(`Executing reporter task: ${task.type}`);

    try {
      let result: AgentResult;

      switch (task.type) {
        case 'email':
          result = await this.handleEmail(task);
          break;

        case 'deadline':
          result = await this.handleDeadline(task);
          break;

        case 'report':
        case 'digest':
          result = await this.generateReport(task);
          break;

        case 'reminder':
          result = await this.sendReminder(task);
          break;

        default:
          result = {
            success: false,
            output: null,
            error: `Unknown task type: ${task.type}`,
          };
      }

      result.duration = Date.now() - startTime;
      this.recordTask(task, result);
      return result;

    } finally {
      this.setStatus('idle');
    }
  }

  // ==========================================================================
  // Email Handling
  // ==========================================================================

  private async handleEmail(task: AgentTask): Promise<AgentResult> {
    const { action, to, subject, context, replyTo, language } = task.input as {
      action: 'draft' | 'reply' | 'summarize';
      to?: string;
      subject?: string;
      context?: string;
      replyTo?: string;
      language?: 'pt' | 'en';
    };

    switch (action) {
      case 'draft':
        return this.draftEmail({ to: to!, subject: subject!, context: context!, language });
      case 'reply':
        return this.draftReply({ replyTo: replyTo!, context: context!, language });
      case 'summarize':
        return this.summarizeEmails(task);
      default:
        return { success: false, output: null, error: `Unknown email action: ${action}` };
    }
  }

  private async draftEmail(params: {
    to: string;
    subject: string;
    context: string;
    language?: 'pt' | 'en';
  }): Promise<AgentResult> {
    // Look up contact for style adaptation
    const contact = this.findContact(params.to);
    const style = contact?.conversationStyle || 'friendly';
    const relationship = contact?.relationship || 'work';

    // Determine language
    const lang = params.language || this.inferLanguage(contact, params.to);

    await this.log(`Drafting ${lang} email to ${params.to} (${style} style)`);

    // Build draft structure
    const draftStructure = {
      to: params.to,
      subject: params.subject,
      style,
      relationship,
      language: lang,
      context: params.context,
      sampleMessages: contact?.sampleMessages || [],
    };

    return {
      success: true,
      output: {
        draftStructure,
        template: this.getEmailTemplate(style, lang),
        status: 'ready_to_generate',
      },
      nextSteps: [
        'Generate email body using Claude API',
        'Review for tone alignment',
        'Present draft to user',
      ],
    };
  }

  private async draftReply(params: {
    replyTo: string;
    context: string;
    language?: 'pt' | 'en';
  }): Promise<AgentResult> {
    await this.log(`Drafting reply to: ${params.replyTo.slice(0, 50)}...`);

    return {
      success: true,
      output: {
        replyTo: params.replyTo,
        context: params.context,
        language: params.language || 'en',
        status: 'ready_to_generate',
      },
      nextSteps: ['Analyze original message', 'Generate contextual reply', 'Match sender style'],
    };
  }

  private async summarizeEmails(task: AgentTask): Promise<AgentResult> {
    const { emails, timeframe } = task.input as {
      emails?: string[];
      timeframe?: string;
    };

    await this.log(`Summarizing ${emails?.length || 'recent'} emails`);

    return {
      success: true,
      output: {
        emailCount: emails?.length || 0,
        timeframe: timeframe || 'today',
        status: 'ready_to_summarize',
      },
      nextSteps: ['Parse email content', 'Extract action items', 'Generate digest'],
    };
  }

  private findContact(identifier: string): Contact | undefined {
    const lowerIdentifier = identifier.toLowerCase();
    return this.memory.contacts.contacts.find(
      (c) =>
        c.email.toLowerCase() === lowerIdentifier ||
        c.name.toLowerCase().includes(lowerIdentifier)
    );
  }

  private inferLanguage(contact: Contact | undefined, recipient: string): 'pt' | 'en' {
    // Brazilian domains/patterns → Portuguese
    if (recipient.endsWith('.br') || recipient.includes('brasil') || recipient.includes('brazil')) {
      return 'pt';
    }

    // Check contact's sample messages
    if (contact?.sampleMessages?.length) {
      const hasPortuguese = contact.sampleMessages.some(
        (m) => /[ãõáéíóúâêôç]/i.test(m)
      );
      if (hasPortuguese) return 'pt';
    }

    return 'en';
  }

  private getEmailTemplate(style: string, lang: 'pt' | 'en'): object {
    const templates = {
      formal: {
        en: { greeting: 'Dear', closing: 'Best regards' },
        pt: { greeting: 'Prezado(a)', closing: 'Atenciosamente' },
      },
      casual: {
        en: { greeting: 'Hi', closing: 'Best' },
        pt: { greeting: 'Oi', closing: 'Abraço' },
      },
      technical: {
        en: { greeting: 'Hello', closing: 'Regards' },
        pt: { greeting: 'Olá', closing: 'Att.' },
      },
      friendly: {
        en: { greeting: 'Hey', closing: 'Cheers' },
        pt: { greeting: 'E aí', closing: 'Abs' },
      },
    };

    return templates[style as keyof typeof templates]?.[lang] || templates.friendly[lang];
  }

  // ==========================================================================
  // Deadline Management
  // ==========================================================================

  private async handleDeadline(task: AgentTask): Promise<AgentResult> {
    const { action, ...params } = task.input as { action: string; [key: string]: unknown };

    switch (action) {
      case 'create':
        return this.createDeadline(params as { title: string; dueDate: string; description: string });
      case 'update':
        return this.updateDeadline(params as { id: string; updates: Partial<Deadline> });
      case 'complete_microtask':
        return this.completeMicrotask(params as { deadlineId: string; microtaskId: string; result?: string });
      case 'check':
        return this.checkUpcomingDeadlines();
      case 'decompose':
        return this.decomposeFurther(params as { deadlineId: string });
      default:
        return { success: false, output: null, error: `Unknown deadline action: ${action}` };
    }
  }

  private async createDeadline(params: {
    title: string;
    dueDate: string;
    description: string;
  }): Promise<AgentResult> {
    const dueDate = new Date(params.dueDate);
    const weeksOut = this.calculateWeeksOut(dueDate);

    await this.log(`Creating deadline: ${params.title} (${weeksOut} weeks out)`);

    // Auto-decompose into microtasks
    const microtasks = this.decomposeMicrotasks({
      title: params.title,
      description: params.description,
      weeksOut,
    });

    // Plan agent contributions
    const agentContributions = this.planAgentContributions(params);

    const deadline: Deadline = {
      id: `deadline-${Date.now()}`,
      title: params.title,
      description: params.description,
      dueDate,
      createdAt: new Date(),
      priority: this.determinePriority(weeksOut),
      weeksOut,
      phase: this.determinePhase(weeksOut),
      microtasks,
      completedMicrotasks: 0,
      progressPercent: 0,
      agentContributions,
      status: 'pending',
      tags: [],
    };

    this.memory.deadlines.deadlines.push(deadline);

    return {
      success: true,
      output: { deadline },
      nextSteps: [
        `First microtask: ${microtasks[0]?.title || 'Define scope'}`,
        `Reminder set for ${this.getNextReminderDate(deadline.phase)}`,
      ],
    };
  }

  private calculateWeeksOut(dueDate: Date): number {
    const now = new Date();
    const diffMs = dueDate.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 7));
  }

  private determinePhase(weeksOut: number): DeadlinePhase {
    if (weeksOut >= 10) return 'planning';
    if (weeksOut >= 6) return 'building';
    if (weeksOut >= 3) return 'accelerating';
    if (weeksOut >= 1) return 'focusing';
    return 'taskforce';
  }

  private determinePriority(weeksOut: number): 'low' | 'medium' | 'high' | 'critical' {
    if (weeksOut <= 1) return 'critical';
    if (weeksOut <= 3) return 'high';
    if (weeksOut <= 6) return 'medium';
    return 'low';
  }

  private decomposeMicrotasks(params: {
    title: string;
    description: string;
    weeksOut: number;
  }): Microtask[] {
    const microtasks: Microtask[] = [];
    const baseId = Date.now();

    // Generic decomposition by phase
    const phases = [
      { name: 'Planning', week: params.weeksOut, tasks: ['Define scope', 'Research similar work', 'Create outline'] },
      { name: 'Building', week: Math.max(params.weeksOut - 4, 1), tasks: ['Draft main content', 'Gather data', 'Build structure'] },
      { name: 'Refining', week: Math.max(params.weeksOut - 2, 1), tasks: ['Review draft', 'Fill gaps', 'Polish'] },
      { name: 'Finalizing', week: 1, tasks: ['Final review', 'Format check', 'Submit'] },
    ];

    let taskIndex = 0;
    for (const phase of phases) {
      if (phase.week > 0 && phase.week <= params.weeksOut) {
        for (const taskTitle of phase.tasks) {
          microtasks.push({
            id: `mt-${baseId}-${taskIndex++}`,
            title: taskTitle,
            description: `${phase.name}: ${taskTitle} for ${params.title}`,
            estimatedMinutes: 30,
            assignee: this.determineAssignee(taskTitle),
            status: 'pending',
            dueWeek: phase.week,
            contributesTo: phase.name,
            dependencies: [],
          });
        }
      }
    }

    return microtasks;
  }

  private determineAssignee(taskTitle: string): 'user' | 'agent' | 'both' {
    const agentTasks = ['research', 'search', 'draft', 'format', 'gather data'];
    const userTasks = ['define', 'review', 'decide', 'approve', 'submit'];

    const lower = taskTitle.toLowerCase();

    if (agentTasks.some((t) => lower.includes(t))) return 'agent';
    if (userTasks.some((t) => lower.includes(t))) return 'user';
    return 'both';
  }

  private planAgentContributions(_params: { title: string; description: string }): AgentContribution[] {
    return [
      { type: 'research', description: 'Background research', agent: 'researcher' },
      { type: 'draft', description: 'Initial draft preparation', agent: 'reporter' },
      { type: 'review', description: 'Code/analysis review', agent: 'coder' },
      { type: 'organize', description: 'Structure and formatting', agent: 'reporter' },
      { type: 'remind', description: 'Progress reminders', agent: 'companion' },
    ];
  }

  private getNextReminderDate(phase: DeadlinePhase): string {
    const now = new Date();
    const daysToAdd: Record<DeadlinePhase, number> = {
      planning: 7,
      building: 3,
      accelerating: 1,
      focusing: 0.5,
      taskforce: 0,
    };

    const nextDate = new Date(now.getTime() + daysToAdd[phase] * 24 * 60 * 60 * 1000);
    return nextDate.toLocaleDateString();
  }

  private async updateDeadline(params: { id: string; updates: Partial<Deadline> }): Promise<AgentResult> {
    const index = this.memory.deadlines.deadlines.findIndex((d) => d.id === params.id);
    if (index === -1) {
      return { success: false, output: null, error: 'Deadline not found' };
    }

    const deadline = this.memory.deadlines.deadlines[index];
    this.memory.deadlines.deadlines[index] = { ...deadline, ...params.updates };

    return { success: true, output: { deadline: this.memory.deadlines.deadlines[index] } };
  }

  private async completeMicrotask(params: {
    deadlineId: string;
    microtaskId: string;
    result?: string;
  }): Promise<AgentResult> {
    const deadline = this.memory.deadlines.deadlines.find((d) => d.id === params.deadlineId);
    if (!deadline) {
      return { success: false, output: null, error: 'Deadline not found' };
    }

    const microtask = deadline.microtasks.find((m) => m.id === params.microtaskId);
    if (!microtask) {
      return { success: false, output: null, error: 'Microtask not found' };
    }

    microtask.status = 'done';
    microtask.completedAt = new Date();
    if (params.result) microtask.result = params.result;

    deadline.completedMicrotasks++;
    deadline.progressPercent = Math.round((deadline.completedMicrotasks / deadline.microtasks.length) * 100);

    // Update status if all done
    if (deadline.progressPercent === 100) {
      deadline.status = 'done';
    } else if (deadline.status === 'pending') {
      deadline.status = 'in_progress';
    }

    await this.log(`Microtask completed: ${microtask.title} (${deadline.progressPercent}%)`);

    return {
      success: true,
      output: {
        deadline,
        completedMicrotask: microtask,
        progressPercent: deadline.progressPercent,
      },
    };
  }

  private async checkUpcomingDeadlines(): Promise<AgentResult> {
    const deadlines = this.memory.deadlines.deadlines
      .filter((d) => d.status !== 'done')
      .map((d) => ({
        ...d,
        weeksOut: this.calculateWeeksOut(d.dueDate),
        phase: this.determinePhase(this.calculateWeeksOut(d.dueDate)),
      }))
      .sort((a, b) => a.weeksOut - b.weeksOut);

    const urgent = deadlines.filter((d) => d.phase === 'taskforce' || d.phase === 'focusing');
    const upcoming = deadlines.filter((d) => d.phase === 'accelerating' || d.phase === 'building');

    return {
      success: true,
      output: {
        total: deadlines.length,
        urgent: urgent.length,
        urgentDeadlines: urgent,
        upcomingDeadlines: upcoming,
        allDeadlines: deadlines,
      },
    };
  }

  private async decomposeFurther(params: { deadlineId: string }): Promise<AgentResult> {
    const deadline = this.memory.deadlines.deadlines.find((d) => d.id === params.deadlineId);
    if (!deadline) {
      return { success: false, output: null, error: 'Deadline not found' };
    }

    await this.log(`Further decomposing: ${deadline.title}`);

    return {
      success: true,
      output: {
        deadline,
        currentMicrotasks: deadline.microtasks.length,
        status: 'ready_for_decomposition',
      },
      nextSteps: ['Analyze remaining work', 'Create additional 15-30 min microtasks'],
    };
  }

  // ==========================================================================
  // Reports & Digests
  // ==========================================================================

  private async generateReport(task: AgentTask): Promise<AgentResult> {
    const { type, deadlineId } = task.input as {
      type: 'daily' | 'weekly' | 'deadline';
      deadlineId?: string;
    };

    switch (type) {
      case 'daily':
        return this.generateDailyDigest();
      case 'weekly':
        return this.generateWeeklyReport();
      case 'deadline':
        return this.generateDeadlineReport(deadlineId!);
      default:
        return { success: false, output: null, error: `Unknown report type: ${type}` };
    }
  }

  private async generateDailyDigest(): Promise<AgentResult> {
    const deadlines = this.memory.deadlines.deadlines.filter((d) => d.status !== 'done');

    const todaysMicrotasks = deadlines.flatMap((d) =>
      d.microtasks.filter((m) => m.status === 'pending' && m.dueWeek <= 1)
    );

    const urgentDeadlines = deadlines.filter((d) => {
      const weeksOut = this.calculateWeeksOut(d.dueDate);
      return weeksOut <= 2;
    });

    await this.log('Generating daily digest');

    return {
      success: true,
      output: {
        date: new Date().toLocaleDateString(),
        summary: {
          totalDeadlines: deadlines.length,
          urgentCount: urgentDeadlines.length,
          todaysTasks: todaysMicrotasks.length,
        },
        todaysTasks: todaysMicrotasks.slice(0, 5),
        urgentDeadlines: urgentDeadlines.slice(0, 3),
      },
    };
  }

  private async generateWeeklyReport(): Promise<AgentResult> {
    const deadlines = this.memory.deadlines.deadlines;
    const completedThisWeek = deadlines.filter(
      (d) => d.status === 'done' && d.dueDate > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    const microtasksCompleted = deadlines.reduce(
      (sum, d) => sum + d.completedMicrotasks,
      0
    );

    await this.log('Generating weekly report');

    return {
      success: true,
      output: {
        weekEnding: new Date().toLocaleDateString(),
        completedDeadlines: completedThisWeek.length,
        microtasksCompleted,
        overallProgress: this.calculateOverallProgress(),
      },
    };
  }

  private async generateDeadlineReport(deadlineId: string): Promise<AgentResult> {
    const deadline = this.memory.deadlines.deadlines.find((d) => d.id === deadlineId);
    if (!deadline) {
      return { success: false, output: null, error: 'Deadline not found' };
    }

    return {
      success: true,
      output: {
        deadline,
        progress: {
          percent: deadline.progressPercent,
          completedTasks: deadline.completedMicrotasks,
          totalTasks: deadline.microtasks.length,
          remainingTasks: deadline.microtasks.filter((m) => m.status !== 'done'),
        },
        timeline: {
          created: deadline.createdAt,
          due: deadline.dueDate,
          weeksRemaining: this.calculateWeeksOut(deadline.dueDate),
          phase: this.determinePhase(this.calculateWeeksOut(deadline.dueDate)),
        },
      },
    };
  }

  private calculateOverallProgress(): number {
    const deadlines = this.memory.deadlines.deadlines.filter((d) => d.status !== 'done');
    if (deadlines.length === 0) return 100;

    const totalProgress = deadlines.reduce((sum, d) => sum + d.progressPercent, 0);
    return Math.round(totalProgress / deadlines.length);
  }

  // ==========================================================================
  // Reminders
  // ==========================================================================

  private async sendReminder(task: AgentTask): Promise<AgentResult> {
    const { deadlineId, type } = task.input as {
      deadlineId: string;
      type: 'gentle' | 'urgent' | 'final';
    };

    const deadline = this.memory.deadlines.deadlines.find((d) => d.id === deadlineId);
    if (!deadline) {
      return { success: false, output: null, error: 'Deadline not found' };
    }

    const reminderMessages = {
      gentle: `Reminder: "${deadline.title}" - ${deadline.progressPercent}% complete`,
      urgent: `⚠️ "${deadline.title}" needs attention! Due in ${this.calculateWeeksOut(deadline.dueDate)} week(s)`,
      final: `🚨 FINAL: "${deadline.title}" is due TODAY!`,
    };

    await this.log(`Sending ${type} reminder for: ${deadline.title}`);

    return {
      success: true,
      output: {
        message: reminderMessages[type],
        deadline: deadline.title,
        progress: deadline.progressPercent,
        nextTasks: deadline.microtasks.filter((m) => m.status === 'pending').slice(0, 3),
      },
    };
  }
}
