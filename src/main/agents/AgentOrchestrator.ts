import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { IIsolationManager } from '../isolation/IsolationManager';
import { SharedMemoryManager, SharedMemoryConfig } from '../memory/SharedMemoryManager';
import { MCPServerManager, MCPConfig } from '../mcp/MCPServerManager';
import { CompanionAgent } from './CompanionAgent';
import { CoderAgent } from './CoderAgent';
import { ResearcherAgent } from './ResearcherAgent';

// Local type definitions to avoid SDK export inconsistencies
interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}
import { ReporterAgent } from './ReporterAgent';
import { BaseAgent, AgentTask, AgentResult, AgentConfig } from './BaseAgent';
import type {
  Session,
  Message,
  ProviderType,
  AgentRole,
  ToolAction,
} from '../../shared/types';

// ============================================================================
// Agent Orchestrator - Unified Multi-Agent Implementation
// Supports both Docker and VM backends via IIsolationManager
// ============================================================================

interface OrchestratorConfig {
  isolationManager: IIsolationManager;
  session: Session;
  apiKeys: Record<string, string>;
  dataDir?: string;
  userProfilePath?: string;
  mcpConfigPath?: string;
}

/**
 * AgentOrchestrator manages the multi-agent system.
 * Unified implementation supporting both Docker containers and macOS VMs.
 */
export class AgentOrchestrator {
  private isolationManager: IIsolationManager;
  private session: Session;
  private apiKeys: Record<string, string>;
  private currentProvider: ProviderType = 'claude';
  private anthropic: Anthropic | null = null;
  private memoryManager: SharedMemoryManager;
  private currentTask: AbortController | null = null;
  private conversationHistory: Message[] = [];

  // Multi-agent system
  private agents: Map<AgentRole, BaseAgent> = new Map();
  private companionAgent: CompanionAgent | null = null;
  private activeAgent: AgentRole = 'companion';
  private isDeadlineMode = false;

  // MCP integration
  private mcpManager: MCPServerManager | null = null;

  constructor(config: OrchestratorConfig) {
    this.isolationManager = config.isolationManager;
    this.session = config.session;
    this.apiKeys = config.apiKeys;

    // Initialize SharedMemoryManager with persistence
    const dataDir = config.dataDir || path.join(app.getPath('userData'), 'workspace-data');
    const memoryConfig: SharedMemoryConfig = {
      dataDir,
      userProfilePath: config.userProfilePath,
      autoSaveInterval: 60000,
    };
    this.memoryManager = new SharedMemoryManager(memoryConfig);

    // Initialize Claude client if API key available
    if (this.apiKeys.claude) {
      this.anthropic = new Anthropic({
        apiKey: this.apiKeys.claude,
      });
    }

    // Initialize multi-agent system
    this.initializeAgents();
    this.setupEventListeners();

    // Initialize MCP servers
    this.initializeMCP(config.mcpConfigPath);
  }

  // ==========================================================================
  // MCP Initialization
  // ==========================================================================

  private async initializeMCP(configPath?: string): Promise<void> {
    const mcpConfigFile = configPath || path.join(app.getAppPath(), 'config', 'mcp-servers.json');

    try {
      if (!fs.existsSync(mcpConfigFile)) {
        console.log('[AgentOrchestrator] MCP config not found, skipping MCP initialization');
        return;
      }

      const mcpConfigData = fs.readFileSync(mcpConfigFile, 'utf-8');
      const mcpConfig: MCPConfig = JSON.parse(mcpConfigData);

      this.mcpManager = new MCPServerManager({
        configPath: mcpConfigFile,
        maxRetries: 3,
        retryDelayMs: 1000,
        connectionTimeoutMs: 5000,
      });

      await this.mcpManager.initialize(mcpConfig);

      // Setup MCP event listeners
      this.mcpManager.on('server-status-change', (event) => {
        console.log(`[MCP] ${event.serverId}: ${event.status}`);
      });

      this.mcpManager.on('server-enabled', (event) => {
        console.log(`[MCP] Server enabled: ${event.serverId}`);
      });

      this.mcpManager.on('server-disabled', (event) => {
        console.log(`[MCP] Server disabled: ${event.serverId}`);
      });

      console.log(`[AgentOrchestrator] MCP initialized with ${this.mcpManager.getAllEnabledServers().length} servers`);
    } catch (error) {
      console.error('[AgentOrchestrator] Failed to initialize MCP:', error);
    }
  }

  // ==========================================================================
  // Agent Initialization
  // ==========================================================================

  private initializeAgents(): void {
    const agentConfig: AgentConfig = {
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      apiKey: this.apiKeys.claude || '',
      memory: this.memoryManager.getMemory(),
    };

    // Create specialized agents
    const coder = new CoderAgent(agentConfig);
    coder.setIsolationManager(this.isolationManager);
    this.agents.set('coder', coder);

    const researcher = new ResearcherAgent(agentConfig);
    this.agents.set('researcher', researcher);

    const reporter = new ReporterAgent(agentConfig);
    this.agents.set('reporter', reporter);

    // Create and configure Companion (main orchestrator)
    this.companionAgent = new CompanionAgent(agentConfig);
    this.agents.set('companion', this.companionAgent);

    // Register specialist agents with Companion
    this.companionAgent.registerAgent(coder);
    this.companionAgent.registerAgent(researcher);
    this.companionAgent.registerAgent(reporter);

    console.log(`[AgentOrchestrator] Initialized ${this.agents.size} agents`);
  }

  private setupEventListeners(): void {
    // Listen to agent events
    for (const [role, agent] of this.agents) {
      agent.on('status-change', (event) => {
        console.log(`[${role}] Status: ${event.status}`);
      });

      agent.on('log', (event) => {
        console.log(`[${event.role}] ${event.message}`);
      });

      agent.on('delegation', (event) => {
        console.log(`[Delegation] ${event.from} → ${event.to}: ${event.task.type}`);
      });
    }

    // Listen to Companion's deadline mode
    if (this.companionAgent) {
      this.companionAgent.on('deadline-mode', (event) => {
        this.isDeadlineMode = event.active;
        if (event.active) {
          console.log(`[DEADLINE MODE] Activated for: ${event.deadline?.title}`);
        } else {
          console.log('[DEADLINE MODE] Deactivated');
        }
      });
    }

    // Listen to memory events
    this.memoryManager.on('deadline-added', (deadline) => {
      console.log(`[Memory] New deadline: ${deadline.title}`);
    });

    this.memoryManager.on('journal-entry-added', () => {
      console.log(`[Memory] Journal entry recorded`);
    });
  }

  // ==========================================================================
  // Message Handling - Routes to appropriate agent
  // ==========================================================================

  async sendMessage(content: string, attachments?: string[]): Promise<Message> {
    if (!this.anthropic) {
      throw new Error('Claude API key not configured');
    }

    this.currentTask = new AbortController();

    try {
      // Create user message
      const userMessage: Message = {
        id: this.generateId(),
        role: 'user',
        content: [{ type: 'text', text: content }],
        timestamp: new Date(),
      };

      // Handle attachments (images, files)
      if (attachments?.length) {
        for (const _attachment of attachments) {
          // TODO: Process attachments (read file, encode image, etc.)
        }
      }

      this.conversationHistory.push(userMessage);
      this.memoryManager.addMessage(userMessage);

      // Analyze intent and route to appropriate agent
      const intent = this.analyzeIntent(content);
      const targetAgent = this.routeToAgent(intent);

      console.log(`[Orchestrator] Routing to ${targetAgent} for intent: ${intent.type}`);

      // Create task for agent
      const task: AgentTask = {
        id: this.generateId(),
        type: intent.type,
        input: {
          content,
          attachments,
          ...intent.params,
        },
        priority: this.isDeadlineMode ? 'critical' : 'normal',
      };

      // Execute via appropriate agent
      let result: AgentResult;
      if (targetAgent === 'companion' && this.companionAgent) {
        // Companion handles orchestration and may delegate
        result = await this.companionAgent.execute(task);
      } else {
        // Direct execution by specialist agent
        const agent = this.agents.get(targetAgent);
        if (agent) {
          result = await agent.execute(task);
        } else {
          throw new Error(`Agent ${targetAgent} not found`);
        }
      }

      // For Phase 2, still use Claude API for natural language response
      // The agent result provides structured data that influences the response
      const assistantMessage = await this.generateResponse(content, result, targetAgent);

      this.conversationHistory.push(assistantMessage);
      this.memoryManager.addMessage(assistantMessage);

      return assistantMessage;
    } finally {
      this.currentTask = null;
    }
  }

  // ==========================================================================
  // Intent Analysis & Routing
  // ==========================================================================

  private analyzeIntent(content: string): { type: string; params: Record<string, unknown> } {
    const contentLower = content.toLowerCase();

    // Coding intents
    if (contentLower.match(/\b(code|debug|implement|fix|create|write|script|function|class|module)\b/)) {
      return { type: 'code', params: { specification: content } };
    }

    // Research intents
    if (contentLower.match(/\b(search|find|research|paper|article|literature|pubmed|review)\b/)) {
      return { type: 'research', params: { query: content } };
    }

    // Email/communication intents
    if (contentLower.match(/\b(email|write to|message|contact|send|draft)\b/)) {
      return { type: 'email', params: { content } };
    }

    // Deadline intents
    if (contentLower.match(/\b(deadline|due|submit|delivery|milestone)\b/)) {
      return { type: 'deadline', params: { content } };
    }

    // Journal/check-in intents
    if (contentLower.match(/\b(feeling|mood|journal|check[- ]?in|how am i|energy)\b/)) {
      return { type: 'journal', params: { content } };
    }

    // Questionnaire intents
    if (contentLower.match(/\b(phq|gad|asrs|questionnaire|assessment|screening)\b/)) {
      const match = content.match(/\b(phq-?9|gad-?7|asrs-?6?|gse|mbi)/i);
      return { type: 'questionnaire', params: { questionnaire: match?.[0] || 'phq-9' } };
    }

    // Digest/summary intents
    if (contentLower.match(/\b(digest|summary|status|what('s| is) happening|update)\b/)) {
      return { type: 'digest', params: {} };
    }

    // Default to general conversation
    return { type: 'conversation', params: {} };
  }

  private routeToAgent(intent: { type: string; params: Record<string, unknown> }): AgentRole {
    const routingMap: Record<string, AgentRole> = {
      code: 'coder',
      debug: 'coder',
      implement: 'coder',
      research: 'researcher',
      literature_review: 'researcher',
      summarize: 'researcher',
      email: 'reporter',
      deadline: 'reporter',
      digest: 'reporter',
      journal: 'companion',
      check_in: 'companion',
      questionnaire: 'companion',
      conversation: 'companion',
    };

    return routingMap[intent.type] || 'companion';
  }

  // ==========================================================================
  // Response Generation with Claude API
  // ==========================================================================

  private async generateResponse(
    _userContent: string,
    agentResult: AgentResult,
    sourceAgent: AgentRole
  ): Promise<Message> {
    // Build messages for API
    const apiMessages = this.conversationHistory.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content.map((c) => {
        if (c.type === 'text') return { type: 'text' as const, text: c.text };
        return { type: 'text' as const, text: '' };
      }),
    }));

    // Add agent context to system prompt
    const systemPrompt = this.buildSystemPrompt(agentResult, sourceAgent);

    // Get MCP servers for this agent
    const mcpServers = this.mcpManager
      ? this.mcpManager.getMCPServersForAPI({ agentRole: sourceAgent })
      : [];

    // Call Claude API with tools and MCP servers (non-streaming)
    const response = await this.anthropic!.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: apiMessages,
      tools: this.getTools(),
      stream: false, // Explicitly non-streaming
      ...(mcpServers.length > 0 ? { mcp_servers: mcpServers } : {}),
    } as Anthropic.MessageCreateParamsNonStreaming);

    // Process response and handle tool use
    return await this.processResponse(response);
  }

  private async processResponse(response: Anthropic.Message): Promise<Message> {
    const messageContent: Message['content'] = [];
    let hasToolUse = false;

    for (const block of response.content) {
      if (block.type === 'text') {
        messageContent.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        hasToolUse = true;
        const toolBlock = block as unknown as ToolUseBlock;
        messageContent.push({
          type: 'tool_use',
          id: toolBlock.id,
          name: toolBlock.name,
          input: toolBlock.input as Record<string, unknown>,
        });

        // Execute tool
        const result = await this.executeTool(toolBlock.name, toolBlock.input as Record<string, unknown>);

        messageContent.push({
          type: 'tool_result',
          toolUseId: toolBlock.id,
          content: result.content,
          isError: result.isError,
        });
      }
    }

    // Handle tool use continuation (check if response ended due to tool use)
    if (hasToolUse && response.stop_reason !== 'end_turn') {
      const toolResultMessage: Message = {
        id: this.generateId(),
        role: 'assistant',
        content: messageContent,
        timestamp: new Date(),
        provider: this.currentProvider,
      };

      this.conversationHistory.push(toolResultMessage);
    }

    return {
      id: this.generateId(),
      role: 'assistant',
      content: messageContent,
      timestamp: new Date(),
      provider: this.currentProvider,
    };
  }

  // ==========================================================================
  // Tool Execution
  // ==========================================================================

  private async executeTool(
    name: string,
    input: Record<string, unknown>
  ): Promise<{ content: string; isError: boolean }> {
    try {
      const action: ToolAction = {
        type: name,
        payload: input,
      };

      this.memoryManager.recordAction(action);

      switch (name) {
        case 'bash':
          return await this.executeBashTool(input);

        case 'str_replace_editor':
          return await this.executeEditorTool(input);

        case 'read_file':
          return await this.executeReadFile(input);

        case 'write_file':
          return await this.executeWriteFile(input);

        case 'list_files':
          return await this.executeListFiles(input);

        // Phase 2 memory tools
        case 'add_contact':
          return this.executeAddContact(input);

        case 'add_deadline':
          return this.executeAddDeadline(input);

        case 'add_journal_entry':
          return this.executeAddJournalEntry(input);

        case 'get_questionnaire':
          return this.executeGetQuestionnaire(input);

        case 'record_assessment':
          return this.executeRecordAssessment(input);

        default:
          return {
            content: `Unknown tool: ${name}`,
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: `Tool execution error: ${(error as Error).message}`,
        isError: true,
      };
    }
  }

  // Isolation-based tools (works with both Docker and VM)
  private async executeBashTool(
    input: Record<string, unknown>
  ): Promise<{ content: string; isError: boolean }> {
    const command = input.command as string;
    const cwd = input.cwd as string | undefined;

    const result = await this.isolationManager.execute(command, { cwd });
    const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : '');

    return {
      content: output || '(no output)',
      isError: result.exitCode !== 0,
    };
  }

  private async executeEditorTool(
    input: Record<string, unknown>
  ): Promise<{ content: string; isError: boolean }> {
    const command = input.command as string;
    const filePath = input.path as string;

    switch (command) {
      case 'view': {
        const content = await this.isolationManager.readFile(filePath);
        return { content: content.toString('utf-8'), isError: false };
      }

      case 'create': {
        const fileText = input.file_text as string;
        await this.isolationManager.writeFile(filePath, Buffer.from(fileText, 'utf-8'));
        return { content: `Created ${filePath}`, isError: false };
      }

      case 'str_replace': {
        const oldStr = input.old_str as string;
        const newStr = input.new_str as string;

        const current = await this.isolationManager.readFile(filePath);
        const currentText = current.toString('utf-8');

        if (!currentText.includes(oldStr)) {
          return { content: `String not found in ${filePath}`, isError: true };
        }

        const updated = currentText.replace(oldStr, newStr);
        await this.isolationManager.writeFile(filePath, Buffer.from(updated, 'utf-8'));

        return { content: `Updated ${filePath}`, isError: false };
      }

      case 'insert': {
        const insertLine = input.insert_line as number;
        const newText = input.new_str as string;

        const current = await this.isolationManager.readFile(filePath);
        const lines = current.toString('utf-8').split('\n');
        lines.splice(insertLine, 0, newText);

        await this.isolationManager.writeFile(filePath, Buffer.from(lines.join('\n'), 'utf-8'));

        return { content: `Inserted at line ${insertLine} in ${filePath}`, isError: false };
      }

      default:
        return { content: `Unknown editor command: ${command}`, isError: true };
    }
  }

  private async executeReadFile(
    input: Record<string, unknown>
  ): Promise<{ content: string; isError: boolean }> {
    const filePath = input.path as string;
    const content = await this.isolationManager.readFile(filePath);
    return { content: content.toString('utf-8'), isError: false };
  }

  private async executeWriteFile(
    input: Record<string, unknown>
  ): Promise<{ content: string; isError: boolean }> {
    const filePath = input.path as string;
    const content = input.content as string;
    await this.isolationManager.writeFile(filePath, Buffer.from(content, 'utf-8'));
    return { content: `Wrote ${filePath}`, isError: false };
  }

  private async executeListFiles(
    input: Record<string, unknown>
  ): Promise<{ content: string; isError: boolean }> {
    const filePath = input.path as string;
    const files = await this.isolationManager.listFiles(filePath);
    // FileInfo[] contains objects, extract names for output
    const fileNames = files.map(f => f.isDirectory ? `${f.name}/` : f.name);
    return { content: fileNames.join('\n'), isError: false };
  }

  // Phase 2 memory tools
  private executeAddContact(input: Record<string, unknown>): { content: string; isError: boolean } {
    const contact = this.memoryManager.addContact(input as Parameters<typeof this.memoryManager.addContact>[0]);
    return { content: `Added contact: ${contact.name} (${contact.id})`, isError: false };
  }

  private executeAddDeadline(input: Record<string, unknown>): { content: string; isError: boolean } {
    const deadline = this.memoryManager.addDeadline(input as Parameters<typeof this.memoryManager.addDeadline>[0]);
    return {
      content: `Created deadline: ${deadline.title} (${deadline.weeksOut} weeks out, ${deadline.phase} phase)`,
      isError: false,
    };
  }

  private executeAddJournalEntry(input: Record<string, unknown>): { content: string; isError: boolean } {
    const entry = this.memoryManager.addJournalEntry(input as Parameters<typeof this.memoryManager.addJournalEntry>[0]);
    return { content: `Journal entry recorded (${entry.id})`, isError: false };
  }

  private executeGetQuestionnaire(input: Record<string, unknown>): { content: string; isError: boolean } {
    const questionnaire = this.memoryManager.getQuestionnaire(input.id as string);
    if (!questionnaire) {
      return { content: `Questionnaire not found: ${input.id}`, isError: true };
    }
    return { content: JSON.stringify(questionnaire, null, 2), isError: false };
  }

  private executeRecordAssessment(input: Record<string, unknown>): { content: string; isError: boolean } {
    const assessment = this.memoryManager.recordAssessment(input as Parameters<typeof this.memoryManager.recordAssessment>[0]);
    return {
      content: `Assessment recorded: ${assessment.questionnaire} - Score: ${assessment.totalScore} (${assessment.interpretation})`,
      isError: false,
    };
  }

  // ==========================================================================
  // Tools Definition
  // ==========================================================================

  private getTools(): Tool[] {
    return [
      // Isolation tools (Docker or VM)
      {
        name: 'bash',
        description: 'Execute a bash command in the isolated environment (Docker container or VM)',
        input_schema: {
          type: 'object' as const,
          properties: {
            command: { type: 'string', description: 'The command to execute' },
            cwd: { type: 'string', description: 'Working directory (optional)' },
          },
          required: ['command'],
        },
      },
      {
        name: 'str_replace_editor',
        description: 'View, create, or edit files using string replacement',
        input_schema: {
          type: 'object' as const,
          properties: {
            command: {
              type: 'string',
              enum: ['view', 'create', 'str_replace', 'insert'],
              description: 'The editor command',
            },
            path: { type: 'string', description: 'File path' },
            file_text: { type: 'string', description: 'File content for create command' },
            old_str: { type: 'string', description: 'String to replace' },
            new_str: { type: 'string', description: 'Replacement string' },
            insert_line: { type: 'number', description: 'Line number for insert' },
          },
          required: ['command', 'path'],
        },
      },
      {
        name: 'read_file',
        description: 'Read a file from the isolated environment',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: { type: 'string', description: 'File path' },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file in the isolated environment',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: { type: 'string', description: 'File path' },
            content: { type: 'string', description: 'File content' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'list_files',
        description: 'List files in a directory',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: { type: 'string', description: 'Directory path' },
          },
          required: ['path'],
        },
      },
      // Phase 2 memory tools
      {
        name: 'add_contact',
        description: 'Add a contact to the database',
        input_schema: {
          type: 'object' as const,
          properties: {
            name: { type: 'string', description: 'Contact name' },
            email: { type: 'string', description: 'Email address' },
            channels: {
              type: 'array',
              items: { type: 'string', enum: ['email', 'whatsapp', 'slack'] },
              description: 'Communication channels',
            },
            conversationStyle: {
              type: 'string',
              enum: ['formal', 'casual', 'technical', 'friendly'],
              description: 'Preferred communication style',
            },
            relationship: {
              type: 'string',
              enum: ['work', 'personal', 'mentor', 'student', 'client'],
              description: 'Relationship type',
            },
            notes: { type: 'string', description: 'Additional notes' },
          },
          required: ['name', 'email', 'channels', 'conversationStyle', 'relationship'],
        },
      },
      {
        name: 'add_deadline',
        description: 'Create a deadline with microtask tracking',
        input_schema: {
          type: 'object' as const,
          properties: {
            title: { type: 'string', description: 'Deadline title' },
            description: { type: 'string', description: 'Deadline description' },
            dueDate: { type: 'string', description: 'Due date (ISO format)' },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Priority level',
            },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
          },
          required: ['title', 'description', 'dueDate', 'priority'],
        },
      },
      {
        name: 'add_journal_entry',
        description: 'Add a journal entry',
        input_schema: {
          type: 'object' as const,
          properties: {
            content: { type: 'string', description: 'Journal content' },
            mood: { type: 'number', description: 'Mood score (1-10)' },
            energy: { type: 'number', description: 'Energy level (1-10)' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
          },
          required: ['content'],
        },
      },
      {
        name: 'get_questionnaire',
        description: 'Get a validated questionnaire (PHQ-9, GAD-7, ASRS, etc.)',
        input_schema: {
          type: 'object' as const,
          properties: {
            id: { type: 'string', description: 'Questionnaire ID (phq-9, gad-7, asrs-6, gse, mbi-gs)' },
          },
          required: ['id'],
        },
      },
      {
        name: 'record_assessment',
        description: 'Record a questionnaire assessment result',
        input_schema: {
          type: 'object' as const,
          properties: {
            questionnaire: { type: 'string', description: 'Questionnaire ID' },
            responses: {
              type: 'array',
              items: { type: 'number' },
              description: 'Response values for each question',
            },
            totalScore: { type: 'number', description: 'Total score' },
            interpretation: { type: 'string', description: 'Score interpretation' },
            severity: { type: 'string', description: 'Severity level' },
          },
          required: ['questionnaire', 'responses', 'totalScore', 'interpretation', 'severity'],
        },
      },
    ];
  }

  // ==========================================================================
  // System Prompt
  // ==========================================================================

  private buildSystemPrompt(agentResult?: AgentResult, sourceAgent?: AgentRole): string {
    const userProfile = this.memoryManager.getUserProfile();
    const upcomingDeadlines = this.memoryManager.getUpcomingDeadlines(7);
    const keyFacts = this.memoryManager.getMemory().conversation.keyFacts;
    // Use backend type synchronously from the manager property
    const isolationType = this.isolationManager.backend;

    let prompt = `You are Claude Workspace, a personal AI assistant for ${userProfile.name || 'the user'}.
You have access to an isolated ${isolationType === 'docker' ? 'Docker container' : 'macOS VM'} and a multi-agent system.

${userProfile.title ? `User's title: ${userProfile.title}` : ''}
${userProfile.expertise?.length ? `Expertise: ${userProfile.expertise.slice(0, 5).join(', ')}` : ''}
${userProfile.languages?.length ? `Languages: ${userProfile.languages.join(', ')}` : ''}

Current session profile: ${this.session.profile.name}
Network access: ${this.session.profile.network}
Isolation type: ${isolationType}
${this.isDeadlineMode ? '\n🚨 DEADLINE MODE ACTIVE - Focus on urgent tasks!' : ''}

${upcomingDeadlines.length > 0 ? `\nUpcoming deadlines (next 7 days):
${upcomingDeadlines.map((d) => `- ${d.title} (${d.phase} phase, ${d.progressPercent}% complete)`).join('\n')}` : ''}

${keyFacts.length > 0 ? `\nKey facts from conversation:
${keyFacts.slice(-5).map((f) => `- ${f}`).join('\n')}` : ''}

Guidelines:
- Be proactive and execute tasks when clearly requested
- For research tasks, consider using PubMed and academic sources
- Be ADHD-aware: break tasks into small chunks, provide clear structure
- Support bilingual communication (English/Portuguese)
- For destructive operations, confirm before executing
`;

    // Add agent-specific context
    if (agentResult && sourceAgent) {
      prompt += `\n[Agent ${sourceAgent} completed task with ${agentResult.success ? 'success' : 'failure'}]
${agentResult.nextSteps?.length ? `Suggested next steps: ${agentResult.nextSteps.join(', ')}` : ''}`;
    }

    return prompt;
  }

  // ==========================================================================
  // Agent & Memory Access
  // ==========================================================================

  getAgent(role: AgentRole): BaseAgent | undefined {
    return this.agents.get(role);
  }

  getActiveAgent(): AgentRole {
    return this.activeAgent;
  }

  setActiveAgent(role: AgentRole): void {
    if (this.agents.has(role)) {
      this.activeAgent = role;
    }
  }

  getMemoryManager(): SharedMemoryManager {
    return this.memoryManager;
  }

  getRegisteredAgents(): AgentRole[] {
    return Array.from(this.agents.keys());
  }

  // ==========================================================================
  // Provider Switching
  // ==========================================================================

  async switchProvider(provider: ProviderType, _model: string): Promise<void> {
    if (provider !== 'claude') {
      throw new Error('Only Claude provider is currently supported');
    }
    this.currentProvider = provider;
  }

  // ==========================================================================
  // Task Management
  // ==========================================================================

  async cancelCurrentTask(): Promise<void> {
    if (this.currentTask) {
      this.currentTask.abort();
      this.currentTask = null;
    }
  }

  async shutdown(): Promise<void> {
    await this.cancelCurrentTask();
    this.memoryManager.dispose();
    if (this.mcpManager) {
      this.mcpManager.dispose();
    }
  }

  // ==========================================================================
  // MCP Access
  // ==========================================================================

  getMCPManager(): MCPServerManager | null {
    return this.mcpManager;
  }

  getMCPServersForAgent(role: AgentRole): Array<{ type: 'url'; url: string; name: string }> {
    if (!this.mcpManager) return [];
    return this.mcpManager.getMCPServersForAPI({ agentRole: role });
  }

  async testMCPConnection(serverId: string): Promise<boolean> {
    if (!this.mcpManager) return false;
    return this.mcpManager.testConnection(serverId);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
