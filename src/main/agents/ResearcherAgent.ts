import { BaseAgent, AgentTask, AgentResult, AgentConfig } from './BaseAgent';
import type { AgentRole } from '../../shared/types';

// ============================================================================
// Researcher Agent - Information Gathering Specialist
// ============================================================================

interface SearchResult {
  title: string;
  authors?: string[];
  year?: number;
  source: string;
  url?: string;
  abstract?: string;
  doi?: string;
  relevanceScore?: number;
}

export class ResearcherAgent extends BaseAgent {
  readonly role: AgentRole = 'researcher';

  readonly systemPrompt = `You are the Researcher agent - specialized in information gathering and synthesis.

Your responsibilities:
1. Search academic papers and documentation (especially PubMed, medical literature)
2. Fact-check claims and find sources
3. Summarize complex information
4. Create literature reviews and bibliographies
5. Support systematic review workflows

User Context (Dr. Matheus Rech):
- Expertise in systematic reviews and meta-analysis
- Uses PRISMA guidelines, GRADE methodology, Cochrane standards
- Research focus: ML in healthcare, neurosurgery outcomes, clinical prediction models
- Harvard PPCR training - high standards for evidence quality

Search Priorities:
1. Peer-reviewed articles first
2. Consider study design hierarchy (RCTs > cohort > case-control > case series)
3. Check publication date and relevance
4. Note conflicts of interest and funding sources

When searching medical literature:
- Use MeSH terms when appropriate
- Consider both sensitivity and specificity of searches
- Flag preprints vs peer-reviewed
- Note impact factor and journal quality

Always cite sources. Be thorough but efficient.`;

  readonly tools = [
    'search_pubmed',
    'search_papers',
    'search_web',
    'summarize_document',
    'create_bibliography',
    'fact_check',
    'extract_data',
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
    this.setStatus('thinking');
    await this.log(`Executing research task: ${task.type}`);

    try {
      let result: AgentResult;

      switch (task.type) {
        case 'search':
        case 'research':
          result = await this.conductResearch(task);
          break;

        case 'literature_review':
          result = await this.literatureReview(task);
          break;

        case 'summarize':
          result = await this.summarize(task);
          break;

        case 'fact_check':
          result = await this.factCheck(task);
          break;

        case 'extract_data':
          result = await this.extractData(task);
          break;

        case 'create_bibliography':
          result = await this.createBibliography(task);
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
  // Research
  // ==========================================================================

  private async conductResearch(task: AgentTask): Promise<AgentResult> {
    const { query, sources, maxResults, dateRange, studyTypes } = task.input as {
      query: string;
      sources?: string[];
      maxResults?: number;
      dateRange?: { from: string; to: string };
      studyTypes?: string[];
    };

    await this.log(`Researching: ${query}`);

    // Build search strategy
    const searchStrategy = this.buildSearchStrategy(query, {
      sources: sources || ['pubmed', 'scholar'],
      maxResults: maxResults || 20,
      dateRange,
      studyTypes,
    });

    // This would integrate with MCP tools for actual search
    return {
      success: true,
      output: {
        query,
        searchStrategy,
        status: 'search_ready',
        estimatedResults: 'pending',
      },
      nextSteps: [
        'Execute search via PubMed MCP',
        'Filter and rank results',
        'Summarize key findings',
      ],
    };
  }

  private buildSearchStrategy(
    query: string,
    options: { sources: string[]; maxResults: number; dateRange?: { from: string; to: string }; studyTypes?: string[] }
  ): object {
    // Build PubMed-style search with MeSH terms
    const meshTerms = this.suggestMeshTerms(query);
    const filters: string[] = [];

    if (options.dateRange) {
      filters.push(`${options.dateRange.from}:${options.dateRange.to}[dp]`);
    }

    if (options.studyTypes?.length) {
      const typeFilters = options.studyTypes.map((t) => `${t}[pt]`).join(' OR ');
      filters.push(`(${typeFilters})`);
    }

    return {
      query,
      meshTerms,
      pubmedQuery: this.buildPubMedQuery(query, meshTerms, filters),
      sources: options.sources,
      maxResults: options.maxResults,
      filters,
    };
  }

  private suggestMeshTerms(query: string): string[] {
    // Common medical MeSH mappings
    const meshMap: Record<string, string[]> = {
      'machine learning': ['Machine Learning', 'Artificial Intelligence', 'Deep Learning'],
      'meta-analysis': ['Meta-Analysis as Topic', 'Meta-Analysis'],
      'systematic review': ['Systematic Reviews as Topic', 'Review Literature as Topic'],
      'neurosurgery': ['Neurosurgical Procedures', 'Neurosurgery'],
      'stroke': ['Stroke', 'Cerebrovascular Disorders'],
      'mortality': ['Mortality', 'Survival Analysis'],
      'prediction': ['Prognosis', 'Risk Assessment'],
    };

    const terms: string[] = [];
    const queryLower = query.toLowerCase();

    for (const [keyword, mesh] of Object.entries(meshMap)) {
      if (queryLower.includes(keyword)) {
        terms.push(...mesh);
      }
    }

    return [...new Set(terms)];
  }

  private buildPubMedQuery(query: string, meshTerms: string[], filters: string[]): string {
    const parts: string[] = [];

    // Add free text search
    parts.push(`(${query}[tiab])`);

    // Add MeSH terms
    if (meshTerms.length > 0) {
      const meshPart = meshTerms.map((t) => `"${t}"[MeSH]`).join(' OR ');
      parts.push(`(${meshPart})`);
    }

    let pubmedQuery = parts.join(' OR ');

    // Add filters
    if (filters.length > 0) {
      pubmedQuery = `(${pubmedQuery}) AND ${filters.join(' AND ')}`;
    }

    return pubmedQuery;
  }

  // ==========================================================================
  // Literature Review
  // ==========================================================================

  private async literatureReview(task: AgentTask): Promise<AgentResult> {
    const { topic, scope, framework } = task.input as {
      topic: string;
      scope: 'scoping' | 'narrative' | 'systematic';
      framework?: string;
    };

    await this.log(`Starting ${scope} review: ${topic}`);

    const reviewFramework = this.getReviewFramework(scope, framework);

    return {
      success: true,
      output: {
        topic,
        scope,
        framework: reviewFramework,
        status: 'framework_ready',
      },
      nextSteps: [
        'Define inclusion/exclusion criteria',
        'Develop search strategy',
        'Search databases',
        'Screen titles and abstracts',
        scope === 'systematic' ? 'Assess risk of bias' : 'Synthesize findings',
      ],
    };
  }

  private getReviewFramework(
    scope: string,
    framework?: string
  ): { name: string; components: string[]; guidelines: string } {
    const frameworks: Record<string, { name: string; components: string[]; guidelines: string }> = {
      pico: {
        name: 'PICO',
        components: ['Population', 'Intervention', 'Comparison', 'Outcome'],
        guidelines: 'Standard for clinical questions',
      },
      spider: {
        name: 'SPIDER',
        components: ['Sample', 'Phenomenon of Interest', 'Design', 'Evaluation', 'Research type'],
        guidelines: 'Good for qualitative research',
      },
      prisma: {
        name: 'PRISMA',
        components: ['Identification', 'Screening', 'Eligibility', 'Inclusion'],
        guidelines: 'Required for systematic reviews',
      },
    };

    if (framework && frameworks[framework.toLowerCase()]) {
      return frameworks[framework.toLowerCase()];
    }

    // Default based on scope
    if (scope === 'systematic') {
      return frameworks.prisma;
    }
    return frameworks.pico;
  }

  // ==========================================================================
  // Summarization
  // ==========================================================================

  private async summarize(task: AgentTask): Promise<AgentResult> {
    const { content, type, maxLength } = task.input as {
      content: string | string[];
      type: 'abstract' | 'executive' | 'detailed';
      maxLength?: number;
    };

    await this.log(`Summarizing ${type} summary`);

    const targetLength = maxLength || this.getDefaultLength(type);

    return {
      success: true,
      output: {
        type,
        targetLength,
        contentLength: Array.isArray(content) ? content.join('').length : content.length,
        status: 'ready_to_summarize',
      },
      nextSteps: ['Generate summary respecting length constraints', 'Highlight key findings'],
    };
  }

  private getDefaultLength(type: string): number {
    const lengths: Record<string, number> = {
      abstract: 250,
      executive: 500,
      detailed: 1500,
    };
    return lengths[type] || 500;
  }

  // ==========================================================================
  // Fact Checking
  // ==========================================================================

  private async factCheck(task: AgentTask): Promise<AgentResult> {
    const { claim, context } = task.input as {
      claim: string;
      context?: string;
    };

    await this.log(`Fact-checking: ${claim.slice(0, 100)}...`);

    return {
      success: true,
      output: {
        claim,
        context,
        status: 'verification_pending',
        checkpoints: [
          'Search for primary sources',
          'Check claim against peer-reviewed literature',
          'Identify potential biases',
          'Rate confidence level',
        ],
      },
      nextSteps: ['Search for supporting/contradicting evidence', 'Assess source quality', 'Provide verdict with confidence'],
    };
  }

  // ==========================================================================
  // Data Extraction
  // ==========================================================================

  private async extractData(task: AgentTask): Promise<AgentResult> {
    const { documents, schema, extractionType } = task.input as {
      documents: string[];
      schema?: Record<string, string>;
      extractionType: 'systematic_review' | 'general';
    };

    await this.log(`Extracting data from ${documents.length} document(s)`);

    // Default schema for systematic review data extraction
    const defaultSchema = extractionType === 'systematic_review'
      ? {
          study_id: 'string',
          authors: 'string',
          year: 'number',
          study_design: 'string',
          population: 'string',
          intervention: 'string',
          comparison: 'string',
          outcome: 'string',
          sample_size: 'number',
          effect_size: 'number',
          confidence_interval: 'string',
          risk_of_bias: 'string',
        }
      : schema || {};

    return {
      success: true,
      output: {
        documentsCount: documents.length,
        schema: schema || defaultSchema,
        status: 'extraction_ready',
      },
      nextSteps: ['Parse documents', 'Extract according to schema', 'Validate extracted data'],
    };
  }

  // ==========================================================================
  // Bibliography
  // ==========================================================================

  private async createBibliography(task: AgentTask): Promise<AgentResult> {
    const { references, style } = task.input as {
      references: SearchResult[];
      style: 'vancouver' | 'apa' | 'harvard' | 'bibtex';
    };

    await this.log(`Creating ${style} bibliography for ${references.length} references`);

    return {
      success: true,
      output: {
        referenceCount: references.length,
        style,
        status: 'formatting_ready',
      },
      nextSteps: ['Format each reference', 'Sort according to style rules', 'Generate final bibliography'],
    };
  }
}
