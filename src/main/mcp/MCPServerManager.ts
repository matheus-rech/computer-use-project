import { EventEmitter } from 'events';
import * as fs from 'fs';
import type { AgentRole } from '../../shared/types';

// ============================================================================
// MCP Server Manager
// Manages Model Context Protocol servers for the multi-agent system
// ============================================================================

export interface MCPServer {
  name: string;
  url: string;
  enabled: boolean;
  authenticated?: boolean;
  description?: string;
  categories?: string[];
  agentRoles?: AgentRole[];
}

export interface MCPConfig {
  mcpServers?: Record<string, MCPServer>;
  [key: string]: unknown;
}

export interface MCPServerManagerConfig {
  configPath: string;
  maxRetries?: number;
  retryDelayMs?: number;
  connectionTimeoutMs?: number;
}

type MCPServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ServerState {
  server: MCPServer;
  status: MCPServerStatus;
  lastError?: string;
  lastConnected?: Date;
}

export class MCPServerManager extends EventEmitter {
  private servers: Map<string, ServerState> = new Map();
  private configPath: string;
  private maxRetries: number;
  private retryDelayMs: number;
  private connectionTimeoutMs: number;

  constructor(config: MCPServerManagerConfig) {
    super();
    this.configPath = config.configPath;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
    this.connectionTimeoutMs = config.connectionTimeoutMs ?? 5000;
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  async initialize(config: MCPConfig): Promise<void> {
    const servers = config.mcpServers || config;

    for (const [id, server] of Object.entries(servers)) {
      if (typeof server === 'object' && server !== null && 'url' in server) {
        this.servers.set(id, {
          server: server as MCPServer,
          status: 'disconnected',
        });

        if ((server as MCPServer).enabled) {
          this.emit('server-enabled', { serverId: id });
        }
      }
    }

    console.log(`[MCPServerManager] Initialized with ${this.servers.size} servers`);
  }

  // ==========================================================================
  // Server Management
  // ==========================================================================

  getAllServers(): MCPServer[] {
    return Array.from(this.servers.values()).map(s => s.server);
  }

  getAllEnabledServers(): MCPServer[] {
    return Array.from(this.servers.values())
      .filter(s => s.server.enabled)
      .map(s => s.server);
  }

  getServer(serverId: string): MCPServer | undefined {
    return this.servers.get(serverId)?.server;
  }

  getServerStatus(serverId: string): MCPServerStatus | undefined {
    return this.servers.get(serverId)?.status;
  }

  enableServer(serverId: string): void {
    const state = this.servers.get(serverId);
    if (state) {
      state.server.enabled = true;
      this.emit('server-enabled', { serverId });
      this.emit('server-status-change', { serverId, status: state.status });
    }
  }

  disableServer(serverId: string): void {
    const state = this.servers.get(serverId);
    if (state) {
      state.server.enabled = false;
      this.emit('server-disabled', { serverId });
    }
  }

  // ==========================================================================
  // Connection Testing
  // ==========================================================================

  async testConnection(serverId: string): Promise<boolean> {
    const state = this.servers.get(serverId);
    if (!state) {
      return false;
    }

    state.status = 'connecting';
    this.emit('server-status-change', { serverId, status: 'connecting' });

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.connectionTimeoutMs);

        const response = await fetch(state.server.url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Accept: 'text/event-stream, application/json',
          },
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          state.status = 'connected';
          state.lastConnected = new Date();
          state.lastError = undefined;
          this.emit('server-status-change', { serverId, status: 'connected' });
          return true;
        }
      } catch (error) {
        state.lastError = (error as Error).message;

        if (attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    state.status = 'error';
    this.emit('server-status-change', { serverId, status: 'error', error: state.lastError });
    return false;
  }

  async testAllConnections(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    const tests = Array.from(this.servers.keys()).map(async (serverId) => {
      results[serverId] = await this.testConnection(serverId);
    });

    await Promise.all(tests);
    return results;
  }

  // ==========================================================================
  // API Integration
  // ==========================================================================

  /**
   * Get MCP servers formatted for the Anthropic API
   * Optionally filter by agent role
   */
  getMCPServersForAPI(options?: { agentRole?: AgentRole }): Array<{ type: 'url'; url: string; name: string }> {
    const enabledServers = this.getAllEnabledServers();

    let filteredServers = enabledServers;

    // Filter by agent role if specified
    if (options?.agentRole) {
      filteredServers = enabledServers.filter(server => {
        // If server has specific agent roles, check if the role matches
        if (server.agentRoles && server.agentRoles.length > 0) {
          return server.agentRoles.includes(options.agentRole!);
        }
        // If no specific roles defined, server is available to all agents
        return true;
      });
    }

    return filteredServers.map(server => ({
      type: 'url' as const,
      url: server.url,
      name: server.name,
    }));
  }

  /**
   * Get servers by category
   */
  getServersByCategory(category: string): MCPServer[] {
    return this.getAllEnabledServers().filter(
      server => server.categories?.includes(category)
    );
  }

  // ==========================================================================
  // Configuration Persistence
  // ==========================================================================

  async saveConfig(): Promise<void> {
    const config: Record<string, MCPServer> = {};

    for (const [id, state] of this.servers) {
      config[id] = state.server;
    }

    await fs.promises.writeFile(
      this.configPath,
      JSON.stringify({ mcpServers: config }, null, 2),
      'utf-8'
    );
  }

  async reloadConfig(): Promise<void> {
    try {
      const data = await fs.promises.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(data) as MCPConfig;

      // Clear existing servers
      this.servers.clear();

      // Re-initialize
      await this.initialize(config);
    } catch (error) {
      console.error('[MCPServerManager] Failed to reload config:', error);
      throw error;
    }
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  dispose(): void {
    this.servers.clear();
    this.removeAllListeners();
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
