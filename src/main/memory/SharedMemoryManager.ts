import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type {
  SharedMemory,
  WorkingMemory,
  ConversationBuffer,
  UserProfile,
  ProjectContext,
  ContactDatabase,
  Contact,
  DeadlineDatabase,
  Deadline,
  Microtask,
  DeadlinePhase,
  JournalDatabase,
  JournalEntry,
  ValidatedQuestionnaire,
  AssessmentResult,
  Message,
  ToolAction,
} from '../../shared/types';

// ============================================================================
// Shared Memory Manager - Centralized memory system for multi-agent access
// ============================================================================

export interface SharedMemoryConfig {
  dataDir: string;
  userProfilePath?: string;
  autoSaveInterval?: number;
}

export class SharedMemoryManager extends EventEmitter {
  private memory: SharedMemory;
  private config: SharedMemoryConfig;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private isDirty = false;

  constructor(config: SharedMemoryConfig) {
    super();
    this.config = config;
    this.memory = this.initializeMemory();
    this.loadPersistedData();
    this.startAutoSave();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  private initializeMemory(): SharedMemory {
    return {
      working: {
        currentTask: undefined,
        activeFiles: [],
        recentActions: [],
        pendingDecisions: [],
      },
      conversation: {
        messages: [],
        summary: undefined,
        keyFacts: [],
      },
      user: {
        preferences: {},
        patterns: [],
        expertise: [],
      },
      project: {},
      contacts: { contacts: [] },
      deadlines: { deadlines: [] },
      journal: {
        entries: [],
        checkInSchedule: ['morning', 'evening'],
        prompts: [],
        questionnaires: [],
        assessments: [],
      },
    };
  }

  private loadPersistedData(): void {
    // Load user profile from seed config if available
    if (this.config.userProfilePath && fs.existsSync(this.config.userProfilePath)) {
      try {
        const profileData = JSON.parse(fs.readFileSync(this.config.userProfilePath, 'utf-8'));
        this.memory.user = this.parseUserProfile(profileData);
        this.emit('user-profile-loaded', this.memory.user);
      } catch (error) {
        console.error('Failed to load user profile:', error);
      }
    }

    // Load contacts
    const contactsPath = path.join(this.config.dataDir, 'contacts.json');
    if (fs.existsSync(contactsPath)) {
      try {
        this.memory.contacts = JSON.parse(fs.readFileSync(contactsPath, 'utf-8'));
        this.emit('contacts-loaded', this.memory.contacts.contacts.length);
      } catch (error) {
        console.error('Failed to load contacts:', error);
      }
    }

    // Load deadlines
    const deadlinesPath = path.join(this.config.dataDir, 'deadlines.json');
    if (fs.existsSync(deadlinesPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(deadlinesPath, 'utf-8'));
        this.memory.deadlines = this.parseDeadlines(data);
        this.emit('deadlines-loaded', this.memory.deadlines.deadlines.length);
      } catch (error) {
        console.error('Failed to load deadlines:', error);
      }
    }

    // Load journal
    const journalPath = path.join(this.config.dataDir, 'journal.json');
    if (fs.existsSync(journalPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
        this.memory.journal = this.parseJournal(data);
        this.emit('journal-loaded', this.memory.journal.entries.length);
      } catch (error) {
        console.error('Failed to load journal:', error);
      }
    }

    // Load questionnaires (these are static, from config)
    const questionnairesPath = path.join(this.config.dataDir, 'questionnaires.json');
    if (fs.existsSync(questionnairesPath)) {
      try {
        this.memory.journal.questionnaires = JSON.parse(fs.readFileSync(questionnairesPath, 'utf-8'));
      } catch (error) {
        console.error('Failed to load questionnaires:', error);
      }
    }
  }

  private parseUserProfile(data: Record<string, unknown>): UserProfile {
    const user = (data.user as Record<string, unknown>) || {};
    return {
      name: user.name as string,
      title: user.title as string,
      email: user.email as string,
      location: user.location as string,
      orcid: user.orcid as string,
      preferences: (data.preferences as Record<string, unknown>) || {},
      patterns: (data.patterns as string[]) || [],
      expertise: (data.expertise as string[]) || [],
      technicalSkills: data.technicalSkills as Record<string, string[]>,
      languages: data.languages as string[],
    };
  }

  private parseDeadlines(data: DeadlineDatabase): DeadlineDatabase {
    return {
      deadlines: data.deadlines.map((d) => ({
        ...d,
        dueDate: new Date(d.dueDate),
        createdAt: new Date(d.createdAt),
        microtasks: d.microtasks.map((m) => ({
          ...m,
          completedAt: m.completedAt ? new Date(m.completedAt) : undefined,
        })),
        agentContributions: d.agentContributions.map((c) => ({
          ...c,
          completedAt: c.completedAt ? new Date(c.completedAt) : undefined,
        })),
      })),
    };
  }

  private parseJournal(data: JournalDatabase): JournalDatabase {
    return {
      ...data,
      entries: data.entries.map((e) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      })),
      assessments: data.assessments.map((a) => ({
        ...a,
        date: new Date(a.date),
      })),
    };
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private startAutoSave(): void {
    const interval = this.config.autoSaveInterval || 60000; // Default 1 minute
    this.autoSaveTimer = setInterval(() => {
      if (this.isDirty) {
        this.saveAll();
        this.isDirty = false;
      }
    }, interval);
  }

  private markDirty(): void {
    this.isDirty = true;
  }

  saveAll(): void {
    this.ensureDataDir();

    // Save contacts
    fs.writeFileSync(
      path.join(this.config.dataDir, 'contacts.json'),
      JSON.stringify(this.memory.contacts, null, 2)
    );

    // Save deadlines
    fs.writeFileSync(
      path.join(this.config.dataDir, 'deadlines.json'),
      JSON.stringify(this.memory.deadlines, null, 2)
    );

    // Save journal
    fs.writeFileSync(
      path.join(this.config.dataDir, 'journal.json'),
      JSON.stringify(this.memory.journal, null, 2)
    );

    this.emit('saved');
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.config.dataDir)) {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
    }
  }

  // ==========================================================================
  // Full Memory Access (for agents)
  // ==========================================================================

  getMemory(): SharedMemory {
    return this.memory;
  }

  // ==========================================================================
  // Working Memory
  // ==========================================================================

  setCurrentTask(task: Record<string, unknown>): void {
    this.memory.working.currentTask = task;
    this.markDirty();
  }

  clearCurrentTask(): void {
    this.memory.working.currentTask = undefined;
  }

  addActiveFile(filePath: string): void {
    if (!this.memory.working.activeFiles.includes(filePath)) {
      this.memory.working.activeFiles.push(filePath);
    }
  }

  removeActiveFile(filePath: string): void {
    this.memory.working.activeFiles = this.memory.working.activeFiles.filter((f) => f !== filePath);
  }

  recordAction(action: ToolAction): void {
    this.memory.working.recentActions.push(action);
    // Keep only last 50 actions
    if (this.memory.working.recentActions.length > 50) {
      this.memory.working.recentActions = this.memory.working.recentActions.slice(-50);
    }
  }

  // ==========================================================================
  // Conversation Buffer
  // ==========================================================================

  addMessage(message: Message): void {
    this.memory.conversation.messages.push(message);
    this.markDirty();
  }

  getMessages(): Message[] {
    return this.memory.conversation.messages;
  }

  addKeyFact(fact: string): void {
    if (!this.memory.conversation.keyFacts.includes(fact)) {
      this.memory.conversation.keyFacts.push(fact);
      this.markDirty();
    }
  }

  setSummary(summary: string): void {
    this.memory.conversation.summary = summary;
    this.markDirty();
  }

  // ==========================================================================
  // Contact Database
  // ==========================================================================

  addContact(contact: Omit<Contact, 'id'>): Contact {
    const newContact: Contact = {
      ...contact,
      id: `contact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    this.memory.contacts.contacts.push(newContact);
    this.markDirty();
    this.emit('contact-added', newContact);
    return newContact;
  }

  updateContact(id: string, updates: Partial<Contact>): Contact | null {
    const index = this.memory.contacts.contacts.findIndex((c) => c.id === id);
    if (index === -1) return null;

    this.memory.contacts.contacts[index] = {
      ...this.memory.contacts.contacts[index],
      ...updates,
    };
    this.markDirty();
    return this.memory.contacts.contacts[index];
  }

  removeContact(id: string): boolean {
    const initialLength = this.memory.contacts.contacts.length;
    this.memory.contacts.contacts = this.memory.contacts.contacts.filter((c) => c.id !== id);
    if (this.memory.contacts.contacts.length !== initialLength) {
      this.markDirty();
      return true;
    }
    return false;
  }

  getContact(id: string): Contact | undefined {
    return this.memory.contacts.contacts.find((c) => c.id === id);
  }

  getContactByEmail(email: string): Contact | undefined {
    return this.memory.contacts.contacts.find((c) => c.email.toLowerCase() === email.toLowerCase());
  }

  getAllContacts(): Contact[] {
    return this.memory.contacts.contacts;
  }

  searchContacts(query: string): Contact[] {
    const q = query.toLowerCase();
    return this.memory.contacts.contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.notes.toLowerCase().includes(q)
    );
  }

  // ==========================================================================
  // Deadline Database
  // ==========================================================================

  addDeadline(deadline: Omit<Deadline, 'id' | 'createdAt' | 'weeksOut' | 'phase' | 'completedMicrotasks' | 'progressPercent'>): Deadline {
    const now = new Date();
    const weeksOut = Math.ceil((new Date(deadline.dueDate).getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));

    const newDeadline: Deadline = {
      ...deadline,
      id: `deadline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now,
      weeksOut,
      phase: this.calculatePhase(weeksOut),
      completedMicrotasks: 0,
      progressPercent: 0,
    };

    this.memory.deadlines.deadlines.push(newDeadline);
    this.markDirty();
    this.emit('deadline-added', newDeadline);
    return newDeadline;
  }

  private calculatePhase(weeksOut: number): DeadlinePhase {
    if (weeksOut >= 10) return 'planning';
    if (weeksOut >= 6) return 'building';
    if (weeksOut >= 3) return 'accelerating';
    if (weeksOut >= 1) return 'focusing';
    return 'taskforce';
  }

  updateDeadline(id: string, updates: Partial<Deadline>): Deadline | null {
    const index = this.memory.deadlines.deadlines.findIndex((d) => d.id === id);
    if (index === -1) return null;

    this.memory.deadlines.deadlines[index] = {
      ...this.memory.deadlines.deadlines[index],
      ...updates,
    };
    this.markDirty();
    return this.memory.deadlines.deadlines[index];
  }

  addMicrotask(deadlineId: string, microtask: Omit<Microtask, 'id'>): Microtask | null {
    const deadline = this.memory.deadlines.deadlines.find((d) => d.id === deadlineId);
    if (!deadline) return null;

    const newMicrotask: Microtask = {
      ...microtask,
      id: `microtask-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };

    deadline.microtasks.push(newMicrotask);
    this.updateDeadlineProgress(deadline);
    this.markDirty();
    return newMicrotask;
  }

  completeMicrotask(deadlineId: string, microtaskId: string, result?: string): boolean {
    const deadline = this.memory.deadlines.deadlines.find((d) => d.id === deadlineId);
    if (!deadline) return false;

    const microtask = deadline.microtasks.find((m) => m.id === microtaskId);
    if (!microtask) return false;

    microtask.status = 'done';
    microtask.completedAt = new Date();
    if (result) microtask.result = result;

    this.updateDeadlineProgress(deadline);
    this.markDirty();
    this.emit('microtask-completed', { deadline, microtask });
    return true;
  }

  private updateDeadlineProgress(deadline: Deadline): void {
    const completed = deadline.microtasks.filter((m) => m.status === 'done').length;
    deadline.completedMicrotasks = completed;
    deadline.progressPercent = deadline.microtasks.length > 0
      ? Math.round((completed / deadline.microtasks.length) * 100)
      : 0;

    // Update phase based on current time
    const now = new Date();
    const weeksOut = Math.ceil((deadline.dueDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
    deadline.weeksOut = weeksOut;
    deadline.phase = this.calculatePhase(weeksOut);
  }

  getDeadline(id: string): Deadline | undefined {
    return this.memory.deadlines.deadlines.find((d) => d.id === id);
  }

  getAllDeadlines(): Deadline[] {
    return this.memory.deadlines.deadlines;
  }

  getActiveDeadlines(): Deadline[] {
    return this.memory.deadlines.deadlines.filter((d) => d.status !== 'done');
  }

  getUpcomingDeadlines(days: number = 7): Deadline[] {
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.memory.deadlines.deadlines.filter(
      (d) => d.status !== 'done' && d.dueDate <= cutoff
    ).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  getDeadlinesInPhase(phase: DeadlinePhase): Deadline[] {
    return this.memory.deadlines.deadlines.filter((d) => d.phase === phase && d.status !== 'done');
  }

  // ==========================================================================
  // Journal Database
  // ==========================================================================

  addJournalEntry(entry: Omit<JournalEntry, 'id' | 'timestamp'>): JournalEntry {
    const newEntry: JournalEntry = {
      ...entry,
      id: `journal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date(),
    };

    this.memory.journal.entries.push(newEntry);
    this.markDirty();
    this.emit('journal-entry-added', newEntry);
    return newEntry;
  }

  getJournalEntries(options?: { limit?: number; from?: Date; to?: Date; tags?: string[] }): JournalEntry[] {
    let entries = [...this.memory.journal.entries];

    if (options?.from) {
      entries = entries.filter((e) => e.timestamp >= options.from!);
    }
    if (options?.to) {
      entries = entries.filter((e) => e.timestamp <= options.to!);
    }
    if (options?.tags?.length) {
      entries = entries.filter((e) => options.tags!.some((t) => e.tags.includes(t)));
    }

    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options?.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  getMoodTrend(days: number = 14): { date: Date; mood: number }[] {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.memory.journal.entries
      .filter((e) => e.timestamp >= cutoff && e.mood !== undefined)
      .map((e) => ({ date: e.timestamp, mood: e.mood! }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  getEnergyTrend(days: number = 14): { date: Date; energy: number }[] {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.memory.journal.entries
      .filter((e) => e.timestamp >= cutoff && e.energy !== undefined)
      .map((e) => ({ date: e.timestamp, energy: e.energy! }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  // ==========================================================================
  // Questionnaires & Assessments
  // ==========================================================================

  getQuestionnaire(id: string): ValidatedQuestionnaire | undefined {
    return this.memory.journal.questionnaires.find((q) => q.id === id || q.name === id);
  }

  getAllQuestionnaires(): ValidatedQuestionnaire[] {
    return this.memory.journal.questionnaires;
  }

  recordAssessment(assessment: Omit<AssessmentResult, 'id' | 'date'>): AssessmentResult {
    const questionnaire = this.getQuestionnaire(assessment.questionnaire);
    const previousAssessments = this.getAssessmentHistory(assessment.questionnaire, 3);

    // Calculate trend
    let trend: 'improving' | 'stable' | 'declining' | undefined;
    if (previousAssessments.length >= 2) {
      const avgPrevious = previousAssessments.reduce((sum, a) => sum + a.totalScore, 0) / previousAssessments.length;
      const diff = assessment.totalScore - avgPrevious;
      if (diff < -2) trend = 'improving';
      else if (diff > 2) trend = 'declining';
      else trend = 'stable';
    }

    const newAssessment: AssessmentResult = {
      ...assessment,
      id: `assessment-${Date.now()}`,
      date: new Date(),
      trend,
    };

    this.memory.journal.assessments.push(newAssessment);
    this.markDirty();
    this.emit('assessment-recorded', newAssessment);
    return newAssessment;
  }

  getAssessmentHistory(questionnaireId: string, limit?: number): AssessmentResult[] {
    let assessments = this.memory.journal.assessments
      .filter((a) => a.questionnaire === questionnaireId)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    if (limit) {
      assessments = assessments.slice(0, limit);
    }

    return assessments;
  }

  getLatestAssessment(questionnaireId: string): AssessmentResult | undefined {
    return this.memory.journal.assessments
      .filter((a) => a.questionnaire === questionnaireId)
      .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  }

  // ==========================================================================
  // User Profile
  // ==========================================================================

  getUserProfile(): UserProfile {
    return this.memory.user;
  }

  updateUserProfile(updates: Partial<UserProfile>): UserProfile {
    this.memory.user = { ...this.memory.user, ...updates };
    this.markDirty();
    return this.memory.user;
  }

  // ==========================================================================
  // Project Context
  // ==========================================================================

  setProjectContext(context: ProjectContext): void {
    this.memory.project = context;
  }

  getProjectContext(): ProjectContext {
    return this.memory.project;
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  dispose(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    if (this.isDirty) {
      this.saveAll();
    }
  }
}
