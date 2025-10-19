import { z } from 'zod';

/**
 * Table Specification - 테이블 명세서 상세 정보
 *
 * ERD/DBML에서 파싱된 테이블 정보를 기반으로
 * 검색, 문서화, 내보내기를 위한 풍부한 메타데이터를 포함
 */

// ============================================================================
// Column Specification
// ============================================================================

export const ColumnSpecificationSchema = z.object({
  // 기본 정보
  name: z.string(),
  type: z.string(), // varchar(100), integer, timestamp, etc

  // 제약 조건
  nullable: z.boolean().default(true),
  primaryKey: z.boolean().default(false),
  unique: z.boolean().default(false),
  autoIncrement: z.boolean().default(false),

  // 기본값 및 설명
  defaultValue: z.string().optional(),
  description: z.string().optional(),

  // 추가 메타데이터 (향후 확장)
  example: z.string().optional(), // 예시 값
  format: z.string().optional(), // email, url, date, phone, etc
  enumValues: z.array(z.string()).optional(), // ENUM 타입일 경우

  // 외래 키 정보
  foreignKey: z.object({
    referencedTable: z.string(),
    referencedColumn: z.string(),
    onUpdate: z.string().optional(),
    onDelete: z.string().optional(),
  }).optional(),
});

export type ColumnSpecification = z.infer<typeof ColumnSpecificationSchema>;

// ============================================================================
// Index Specification
// ============================================================================

export const IndexSpecificationSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  type: z.enum(['btree', 'hash', 'gin', 'gist', 'unique', 'fulltext']).optional(),
  unique: z.boolean().default(false),
  description: z.string().optional(),
});

export type IndexSpecification = z.infer<typeof IndexSpecificationSchema>;

// ============================================================================
// Constraint Specification
// ============================================================================

export const ConstraintSpecificationSchema = z.object({
  type: z.enum(['primary_key', 'foreign_key', 'unique', 'check']),
  name: z.string().optional(),
  columns: z.array(z.string()),

  // Foreign key specific
  referencedTable: z.string().optional(),
  referencedColumns: z.array(z.string()).optional(),
  onUpdate: z.string().optional(),
  onDelete: z.string().optional(),

  // Check constraint specific
  expression: z.string().optional(),
});

export type ConstraintSpecification = z.infer<typeof ConstraintSpecificationSchema>;

// ============================================================================
// Relationship Information
// ============================================================================

export const RelationshipInfoSchema = z.object({
  incoming: z.array(z.object({
    fromTable: z.string(),
    fromColumn: z.string(),
    type: z.string(), // one-to-one, one-to-many, etc
  })),
  outgoing: z.array(z.object({
    toTable: z.string(),
    toColumn: z.string(),
    type: z.string(),
  })),
});

export type RelationshipInfo = z.infer<typeof RelationshipInfoSchema>;

// ============================================================================
// Table Statistics
// ============================================================================

export const TableStatisticsSchema = z.object({
  columnCount: z.number(),
  primaryKeyCount: z.number(),
  foreignKeyCount: z.number(),
  uniqueKeyCount: z.number(),
  indexCount: z.number(),
  relationshipCount: z.number(),
  incomingRelationships: z.number(),
  outgoingRelationships: z.number(),
});

export type TableStatistics = z.infer<typeof TableStatisticsSchema>;

// ============================================================================
// Table Specification (Main)
// ============================================================================

export const TableSpecificationSchema = z.object({
  // 기본 식별 정보
  id: z.string(),
  tableName: z.string(),
  schemaName: z.string().optional(),
  alias: z.string().optional(),

  // 설명 및 문서화
  description: z.string().optional(),
  note: z.string().optional(),

  // 컬럼 상세 정보
  columns: z.array(ColumnSpecificationSchema),

  // 제약 조건
  constraints: z.array(ConstraintSpecificationSchema),

  // 인덱스
  indexes: z.array(IndexSpecificationSchema),

  // 관계 정보
  relationships: RelationshipInfoSchema,

  // 통계 정보
  stats: TableStatisticsSchema,

  // 검색을 위한 메타정보
  searchableText: z.string(), // 전문 검색용 통합 텍스트
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),

  // 타임스탬프
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TableSpecification = z.infer<typeof TableSpecificationSchema>;

// ============================================================================
// Specification Summary (List View)
// ============================================================================

export const SpecificationSummarySchema = z.object({
  id: z.string(),
  tableName: z.string(),
  schemaName: z.string().optional(),
  description: z.string().optional(),

  // 요약 통계
  columnCount: z.number(),
  relationshipCount: z.number(),
  hasIndexes: z.boolean(),
  hasForeignKeys: z.boolean(),

  // 메타정보
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),

  updatedAt: z.date(),
});

export type SpecificationSummary = z.infer<typeof SpecificationSummarySchema>;

// ============================================================================
// Search Query & Results
// ============================================================================

/**
 * Search result categories for automatic classification
 */
export enum SearchCategory {
  EXACT_TABLE = 'exact_table',       // 테이블명 정확히 일치
  TABLE_PARTIAL = 'table_partial',   // 테이블명 부분 일치
  COLUMN_NAME = 'column_name',       // 컬럼명 매칭
  DESCRIPTION = 'description',       // 설명 매칭
  RELATED_TABLE = 'related_table',   // 관계 테이블 (FK 연결)
}

export const SearchFiltersSchema = z.object({
  tables: z.array(z.string()).optional(),
  schemas: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  hasRelationships: z.boolean().optional(),
  hasForeignKeys: z.boolean().optional(),
  hasIndexes: z.boolean().optional(),
});

export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

export const SearchQuerySchema = z.object({
  q: z.string(), // 검색 쿼리
  content: z.string().optional(), // DBML content (임시, 향후 diagramId로 대체)
  filters: SearchFiltersSchema.optional(),
  sortBy: z.enum(['relevance', 'name', 'updatedAt', 'columnCount']).default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchHighlightSchema = z.object({
  field: z.string(), // 매칭된 필드 (tableName, columnName, description, etc)
  text: z.string(), // 하이라이트된 텍스트 (HTML 태그 포함 가능)
  position: z.object({
    start: z.number(),
    end: z.number(),
  }).optional(),
});

export type SearchHighlight = z.infer<typeof SearchHighlightSchema>;

export const SearchResultSchema = z.object({
  id: z.string(),

  // 기본 정보
  tableName: z.string(),
  schemaName: z.string().optional(),
  description: z.string().optional(),

  // 매칭 정보
  matchScore: z.number(), // 매칭 점수 (내부 계산용)
  relevance: z.number(), // 0-100 정규화된 관련도 점수
  category: z.nativeEnum(SearchCategory), // 자동 분류된 카테고리
  matchedFields: z.array(z.string()), // 매칭된 필드들
  highlights: z.array(SearchHighlightSchema),
  matchContext: z.string().optional(), // 매칭된 컨텍스트 스니펫

  // 관련 테이블 정보
  relatedTables: z.array(z.object({
    tableName: z.string(),
    relationship: z.enum(['parent', 'child', 'sibling']),
    connectionPath: z.string(), // "via CUSTOMER_ID"
  })).optional(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  total: z.number(),
  query: z.string(),
  took: z.number(), // 검색 소요 시간 (ms)

  // 검색 제안 (오타 수정, 유사 검색어 등)
  suggestions: z.array(z.string()).optional(),

  // 필터링 정보
  facets: z.object({
    tables: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
    schemas: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
    tags: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
  }).optional(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ============================================================================
// Export Configuration
// ============================================================================

export const ExportFormatSchema = z.enum(['excel', 'pdf', 'markdown', 'json', 'html']);

export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const ExportConfigSchema = z.object({
  format: ExportFormatSchema,

  // 내보낼 테이블 선택
  tables: z.array(z.string()).optional(), // undefined면 전체

  // 포함할 섹션
  includeColumns: z.boolean().default(true),
  includeConstraints: z.boolean().default(true),
  includeIndexes: z.boolean().default(true),
  includeRelationships: z.boolean().default(true),
  includeStatistics: z.boolean().default(false),

  // 포맷별 옵션
  options: z.object({
    // Excel specific
    sheetPerTable: z.boolean().optional(),
    includeFormulas: z.boolean().optional(),

    // PDF specific
    pageSize: z.enum(['A4', 'Letter', 'Legal']).optional(),
    orientation: z.enum(['portrait', 'landscape']).optional(),

    // Markdown specific
    includeTableOfContents: z.boolean().optional(),
    codeBlockStyle: z.enum(['fenced', 'indented']).optional(),
  }).optional(),
});

export type ExportConfig = z.infer<typeof ExportConfigSchema>;

// ============================================================================
// Relationship Graph (관계 시각화용)
// ============================================================================

export const RelationshipGraphNodeSchema = z.object({
  id: z.string(),
  tableName: z.string(),
  type: z.enum(['current', 'incoming', 'outgoing', 'both']),
  depth: z.number(), // 현재 테이블로부터의 거리
  columnCount: z.number(),
});

export type RelationshipGraphNode = z.infer<typeof RelationshipGraphNodeSchema>;

export const RelationshipGraphEdgeSchema = z.object({
  id: z.string(),
  fromTable: z.string(),
  fromColumn: z.string(),
  toTable: z.string(),
  toColumn: z.string(),
  type: z.string(), // one-to-one, one-to-many, etc
  direction: z.enum(['incoming', 'outgoing']),
});

export type RelationshipGraphEdge = z.infer<typeof RelationshipGraphEdgeSchema>;

export const RelationshipGraphSchema = z.object({
  centerTable: z.string(),
  depth: z.number(),
  nodes: z.array(RelationshipGraphNodeSchema),
  edges: z.array(RelationshipGraphEdgeSchema),
});

export type RelationshipGraph = z.infer<typeof RelationshipGraphSchema>;
