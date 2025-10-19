/**
 * @biagram/spec-generator
 *
 * DBML 스키마를 기반으로 테이블 명세서를 자동 생성하는 패키지
 */

// Main generator
export {
  generateTableSpecification,
  generateSpecifications,
  generateSpecificationSummary,
  generateSummaries,
  findSpecification,
  sortSpecifications,
  filterSpecifications,
  type GeneratorOptions,
} from './generator.js';

// Relationship analyzer
export {
  analyzeTableRelationships,
  calculateRelationshipStats,
  buildRelationshipGraph,
  detectCircularReferences,
  inferRelationshipType,
  type RelationshipAnalysis,
} from './relationship-analyzer.js';

// Search text builder
export {
  buildSearchText,
  buildColumnSearchText,
  normalizeText,
  tokenize,
  findMatchPositions,
  extractContext,
  highlightText,
  fuzzyMatch,
  type SearchTextOptions,
} from './search-text-builder.js';
