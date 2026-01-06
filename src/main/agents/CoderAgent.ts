import { BaseAgent, AgentTask, AgentResult, AgentConfig } from './BaseAgent';
import type { AgentRole } from '../../shared/types';
import type { IIsolationManager, ExecuteResult } from '../isolation/IsolationManager';

// ============================================================================
// Coder Agent - Code Execution Specialist
// ============================================================================

export class CoderAgent extends BaseAgent {
  readonly role: AgentRole = 'coder';

  readonly systemPrompt = `You are the Coder agent - specialized in code execution and implementation.

Your responsibilities:
1. Execute code in the isolated environment (Docker or VM)
2. Debug issues and suggest fixes
3. Implement features based on specifications
4. Code review and optimization

User Context (Dr. Matheus Rech):
- Primary languages: Python (scikit-learn, pandas, TensorFlow), R (meta, metafor, ggplot2)
- Also uses: MATLAB, SQL, Stan for Bayesian methods
- Focus areas: ML models for healthcare, meta-analysis pipelines, medical image analysis
- Tools: Uses Jupyter notebooks, R Markdown, Gradio for deployments

Technical Preferences:
- Prefer clear, documented code with type hints
- Use virtual environments and proper dependency management
- Follow PEP 8 for Python, tidyverse style for R
- Include error handling and logging

You have access to an isolated environment via the IsolationManager. You can:
- Run shell commands
- Read/write files
- Execute scripts in Python, R, MATLAB, or any installed language

Always explain your approach before executing. Be careful with destructive operations.`;

  readonly tools = [
    'execute_command',
    'read_file',
    'write_file',
    'list_files',
    'run_tests',
    'install_package',
    'create_environment',
  ];

  // Isolation Manager reference (supports both Docker and VM)
  private isolationManager: IIsolationManager | null = null;

  constructor(config: AgentConfig) {
    super(config);
    this.initializeId();
  }

  setIsolationManager(manager: IIsolationManager): void {
    this.isolationManager = manager;
  }

  // ==========================================================================
  // Task Execution
  // ==========================================================================

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.setStatus('executing');
    await this.log(`Executing coding task: ${task.type}`);

    try {
      let result: AgentResult;

      switch (task.type) {
        case 'code':
        case 'implement':
          result = await this.implementCode(task);
          break;

        case 'debug':
          result = await this.debugCode(task);
          break;

        case 'review_code':
          result = await this.reviewCode(task);
          break;

        case 'run_script':
          result = await this.runScript(task);
          break;

        case 'install_package':
          result = await this.installPackage(task);
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
  // Code Implementation
  // ==========================================================================

  private async implementCode(task: AgentTask): Promise<AgentResult> {
    const { specification, language, filePath } = task.input as {
      specification: string;
      language?: string;
      filePath?: string;
    };

    await this.log(`Implementing: ${specification.slice(0, 100)}...`);

    // Determine language from file extension or explicit parameter
    const lang = language || this.detectLanguage(filePath || '');

    // For now, return a structured response - real implementation would use Claude API
    return {
      success: true,
      output: {
        language: lang,
        specification,
        status: 'ready_for_implementation',
        suggestedApproach: this.suggestApproach(specification, lang),
      },
      nextSteps: [
        'Generate code based on specification',
        'Write to file if path provided',
        'Run tests if available',
      ],
    };
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      py: 'python',
      r: 'r',
      R: 'r',
      m: 'matlab',
      sql: 'sql',
      stan: 'stan',
      js: 'javascript',
      ts: 'typescript',
      sh: 'bash',
    };
    return langMap[ext || ''] || 'python';
  }

  private suggestApproach(spec: string, lang: string): string[] {
    const approaches: string[] = [];

    if (spec.toLowerCase().includes('meta-analysis')) {
      approaches.push('Use metafor package for effect size calculations');
      approaches.push('Implement forest plot with ggplot2');
    }

    if (spec.toLowerCase().includes('machine learning') || spec.toLowerCase().includes('ml')) {
      approaches.push('Start with train/test split and cross-validation');
      approaches.push('Consider SHAP/LIME for model interpretability');
    }

    if (lang === 'python') {
      approaches.push('Use type hints and docstrings');
      approaches.push('Consider pytest for testing');
    }

    if (lang === 'r') {
      approaches.push('Follow tidyverse conventions');
      approaches.push('Use roxygen2 for documentation');
    }

    return approaches.length > 0 ? approaches : ['Implement step by step with clear documentation'];
  }

  // ==========================================================================
  // Debugging
  // ==========================================================================

  private async debugCode(task: AgentTask): Promise<AgentResult> {
    const { error, stackTrace } = task.input as {
      code?: string;
      error: string;
      filePath?: string;
      stackTrace?: string;
    };

    await this.log(`Debugging error: ${error.slice(0, 100)}...`);

    // Analyze error type
    const analysis = this.analyzeError(error, stackTrace);

    return {
      success: true,
      output: {
        errorType: analysis.type,
        possibleCauses: analysis.causes,
        suggestedFixes: analysis.fixes,
        needsMoreContext: analysis.needsContext,
      },
      nextSteps: analysis.nextSteps,
    };
  }

  private analyzeError(
    error: string,
    stackTrace?: string
  ): { type: string; causes: string[]; fixes: string[]; nextSteps: string[]; needsContext: boolean } {
    const errorLower = error.toLowerCase();

    // Common error patterns
    if (errorLower.includes('modulenotfounderror') || errorLower.includes('import')) {
      return {
        type: 'ImportError',
        causes: ['Package not installed', 'Wrong environment activated', 'Typo in import name'],
        fixes: ['pip install <package>', 'Check virtual environment', 'Verify package name'],
        nextSteps: ['List installed packages', 'Check Python path'],
        needsContext: false,
      };
    }

    if (errorLower.includes('typeerror')) {
      return {
        type: 'TypeError',
        causes: ['Wrong argument type', 'Missing argument', 'Incompatible operation'],
        fixes: ['Check function signature', 'Add type conversion', 'Verify data types'],
        nextSteps: ['Print variable types', 'Check function documentation'],
        needsContext: true,
      };
    }

    if (errorLower.includes('keyerror') || errorLower.includes('indexerror')) {
      return {
        type: 'AccessError',
        causes: ['Missing key in dictionary', 'Index out of range', 'Column not found'],
        fixes: ['Check available keys/columns', 'Validate data structure', 'Use .get() for dicts'],
        nextSteps: ['Print data structure', 'Check data shape'],
        needsContext: true,
      };
    }

    return {
      type: 'UnknownError',
      causes: ['Need more context to analyze'],
      fixes: ['Provide full error message and code'],
      nextSteps: ['Share relevant code snippet', 'Include full stack trace'],
      needsContext: true,
    };
  }

  // ==========================================================================
  // Code Review
  // ==========================================================================

  private async reviewCode(task: AgentTask): Promise<AgentResult> {
    const { filePath, focusAreas } = task.input as {
      code?: string;
      filePath?: string;
      focusAreas?: string[];
    };

    await this.log(`Reviewing code: ${filePath || 'inline'}`);

    // Review categories
    const reviewAreas = focusAreas || ['correctness', 'style', 'performance', 'security'];

    return {
      success: true,
      output: {
        reviewAreas,
        status: 'review_ready',
        checklist: this.getReviewChecklist(reviewAreas),
      },
      nextSteps: ['Analyze code against checklist', 'Provide specific recommendations'],
    };
  }

  private getReviewChecklist(areas: string[]): Record<string, string[]> {
    const checklists: Record<string, string[]> = {
      correctness: [
        'Logic is correct for intended purpose',
        'Edge cases are handled',
        'Error handling is appropriate',
      ],
      style: [
        'Follows language conventions',
        'Consistent naming',
        'Adequate documentation',
      ],
      performance: [
        'No unnecessary loops',
        'Efficient data structures',
        'Resource cleanup',
      ],
      security: [
        'Input validation',
        'No hardcoded secrets',
        'Safe file operations',
      ],
    };

    return Object.fromEntries(
      areas.filter((a) => checklists[a]).map((a) => [a, checklists[a]])
    );
  }

  // ==========================================================================
  // Script Execution
  // ==========================================================================

  private async runScript(task: AgentTask): Promise<AgentResult> {
    const { script, language, args } = task.input as {
      script: string;
      language: string;
      args?: string[];
    };

    if (!this.isolationManager) {
      return {
        success: false,
        output: null,
        error: 'Isolation Manager not configured',
      };
    }

    const command = this.buildRunCommand(script, language, args);
    await this.log(`Running: ${command}`);

    try {
      const result: ExecuteResult = await this.isolationManager.execute(command);

      return {
        success: result.exitCode === 0,
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
        error: result.exitCode !== 0 ? result.stderr : undefined,
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: `Execution failed: ${(error as Error).message}`,
      };
    }
  }

  private buildRunCommand(script: string, language: string, args?: string[]): string {
    const argStr = args?.join(' ') || '';
    const commands: Record<string, string> = {
      python: `python3 ${script} ${argStr}`,
      r: `Rscript ${script} ${argStr}`,
      matlab: `matlab -batch "run('${script}')"`,
      bash: `bash ${script} ${argStr}`,
      node: `node ${script} ${argStr}`,
    };
    return commands[language] || `${language} ${script} ${argStr}`;
  }

  // ==========================================================================
  // Package Installation
  // ==========================================================================

  private async installPackage(task: AgentTask): Promise<AgentResult> {
    const { package: pkg, language, environment } = task.input as {
      package: string;
      language: string;
      environment?: string;
    };

    if (!this.isolationManager) {
      return {
        success: false,
        output: null,
        error: 'Isolation Manager not configured',
      };
    }

    const command = this.buildInstallCommand(pkg, language, environment);
    await this.log(`Installing: ${pkg} (${language})`);

    try {
      const result: ExecuteResult = await this.isolationManager.execute(command);

      return {
        success: result.exitCode === 0,
        output: {
          package: pkg,
          language,
          installed: result.exitCode === 0,
          output: result.stdout,
        },
        error: result.exitCode !== 0 ? result.stderr : undefined,
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: `Installation failed: ${(error as Error).message}`,
      };
    }
  }

  private buildInstallCommand(pkg: string, language: string, env?: string): string {
    const envPrefix = env ? `source ${env}/bin/activate && ` : '';

    const commands: Record<string, string> = {
      python: `${envPrefix}pip install ${pkg}`,
      r: `Rscript -e "install.packages('${pkg}', repos='https://cran.r-project.org')"`,
      node: `npm install ${pkg}`,
    };

    return commands[language] || `echo "Unknown language: ${language}"`;
  }
}
