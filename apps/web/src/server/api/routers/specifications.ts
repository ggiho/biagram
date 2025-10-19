import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { DBMLParser } from '@biagram/dbml-parser';
import {
  generateSpecifications,
  generateSpecificationSummary,
  findSpecification,
  sortSpecifications,
  filterSpecifications,
  normalizeText,
  tokenize,
  findMatchPositions,
} from '@biagram/spec-generator';
import {
  SearchQuerySchema,
  ExportConfigSchema,
  SearchCategory,
  type TableSpecification,
  type SearchResult,
  type SearchResponse,
} from '@biagram/shared';

import { createTRPCRouter, publicProcedure } from '@/server/api/trpc';

/**
 * Specification Router
 *
 * 테이블 명세서 생성, 조회, 검색, 내보내기 API
 */

// ============================================================================
// Search Helper Functions
// ============================================================================

/**
 * Determine search category based on match type and score
 */
function determineSearchCategory(
  spec: TableSpecification,
  normalizedQuery: string,
  matchedFields: string[]
): SearchCategory {
  const normalizedTableName = normalizeText(spec.tableName);

  // 정확한 테이블명 매칭
  if (normalizedTableName === normalizedQuery) {
    return SearchCategory.EXACT_TABLE;
  }

  // 테이블명 부분 매칭
  if (normalizedTableName.includes(normalizedQuery)) {
    return SearchCategory.TABLE_PARTIAL;
  }

  // 컬럼명 매칭
  const hasColumnMatch = matchedFields.some(field => field.startsWith('column:'));
  if (hasColumnMatch) {
    return SearchCategory.COLUMN_NAME;
  }

  // 설명 매칭
  const hasDescriptionMatch = matchedFields.includes('description') ||
                               matchedFields.some(field => field.startsWith('columnDesc:'));
  if (hasDescriptionMatch) {
    return SearchCategory.DESCRIPTION;
  }

  // 기본값은 관련 테이블
  return SearchCategory.RELATED_TABLE;
}

/**
 * Calculate relevance score (0-100) based on match score and category
 */
function calculateRelevance(matchScore: number, category: SearchCategory): number {
  // 카테고리별 가중치
  const categoryWeight = {
    [SearchCategory.EXACT_TABLE]: 1.0,
    [SearchCategory.TABLE_PARTIAL]: 0.8,
    [SearchCategory.COLUMN_NAME]: 0.6,
    [SearchCategory.DESCRIPTION]: 0.4,
    [SearchCategory.RELATED_TABLE]: 0.3,
  };

  // 정규화 (최대 점수는 약 200점으로 가정)
  const normalizedScore = Math.min(matchScore / 200, 1.0);
  const weight = categoryWeight[category];

  return Math.round(normalizedScore * weight * 100);
}

/**
 * Extract match context snippet
 */
function extractMatchContext(
  spec: TableSpecification,
  normalizedQuery: string,
  matchedFields: string[]
): string {
  // 테이블명 매칭
  if (matchedFields.includes('tableName')) {
    return `Table: ${spec.tableName}`;
  }

  // 설명 매칭
  if (matchedFields.includes('description') && spec.description) {
    const desc = spec.description;
    const index = normalizeText(desc).indexOf(normalizedQuery);
    if (index !== -1) {
      const start = Math.max(0, index - 20);
      const end = Math.min(desc.length, index + normalizedQuery.length + 20);
      return `...${desc.substring(start, end)}...`;
    }
    return desc.substring(0, 60) + (desc.length > 60 ? '...' : '');
  }

  // 컬럼명 매칭
  const columnMatch = matchedFields.find(f => f.startsWith('column:'));
  if (columnMatch) {
    const columnName = columnMatch.split(':')[1];
    return `Column: ${columnName}`;
  }

  return `${spec.stats.columnCount} columns`;
}

/**
 * Find related tables based on foreign key relationships
 */
function findRelatedTables(
  spec: TableSpecification,
  allSpecs: TableSpecification[]
): Array<{ tableName: string; relationship: 'parent' | 'child' | 'sibling'; connectionPath: string }> {
  const related: Array<{ tableName: string; relationship: 'parent' | 'child' | 'sibling'; connectionPath: string }> = [];

  // 부모 테이블 찾기 (outgoing relationships)
  spec.relationships.outgoing.forEach(rel => {
    related.push({
      tableName: rel.toTable,
      relationship: 'parent',
      connectionPath: `via ${rel.toColumn}`,
    });
  });

  // 자식 테이블 찾기 (incoming relationships)
  spec.relationships.incoming.forEach(rel => {
    related.push({
      tableName: rel.fromTable,
      relationship: 'child',
      connectionPath: `via ${rel.fromColumn}`,
    });
  });

  return related.slice(0, 5); // 최대 5개만
}

export const specificationRouter = createTRPCRouter({
  /**
   * 1. DBML에서 명세서 생성
   */
  generate: publicProcedure
    .input(
      z.object({
        content: z.string(), // DBML content
      })
    )
    .mutation(async ({ input }) => {
      try {
        console.log('🔧 Generating specifications from DBML...');

        // 1. Parse DBML
        const parseResult = DBMLParser.parse(input.content);

        if (!parseResult.success || !parseResult.schema) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Failed to parse DBML',
            cause: parseResult.errors,
          });
        }

        const schema = parseResult.schema as {
          tables: any[];
          relationships: any[];
          enums?: any[];
        };

        // 2. Generate specifications
        const specifications = generateSpecifications(
          schema.tables,
          schema.relationships
        );

        console.log(
          `✅ Generated ${specifications.length} table specifications`
        );

        return {
          success: true,
          specifications,
          summary: specifications.map(generateSpecificationSummary),
        };
      } catch (error) {
        console.error('❌ Specification generation error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate specifications',
          cause: error,
        });
      }
    }),

  /**
   * 2. 명세서 목록 조회
   */
  list: publicProcedure
    .input(
      z.object({
        content: z.string(), // DBML content (임시로 직접 받음, 향후 diagramId로 변경)
        sortBy: z
          .enum(['name', 'columnCount', 'relationshipCount', 'updatedAt'])
          .optional(),
        sortOrder: z.enum(['asc', 'desc']).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        console.log('🔍 specifications.list called with sortBy:', input.sortBy, 'sortOrder:', input.sortOrder);
        console.log('📄 Content length:', input.content?.length || 0);

        // Parse and generate specs
        const parseResult = DBMLParser.parse(input.content);
        console.log('✅ Parse result:', parseResult.success);

        if (!parseResult.success || !parseResult.schema) {
          console.log('❌ Parse failed or no schema');
          return { success: false, summaries: [] };
        }

        const schema = parseResult.schema as {
          tables: any[];
          relationships: any[];
        };

        let specifications = generateSpecifications(
          schema.tables,
          schema.relationships
        );

        // Sort if requested
        if (input.sortBy) {
          specifications = sortSpecifications(
            specifications,
            input.sortBy,
            input.sortOrder || 'asc'
          );
        }

        const summaries = specifications.map(generateSpecificationSummary);

        console.log(`✅ Generated ${summaries.length} summaries`);

        return {
          success: true,
          summaries,
        };
      } catch (error) {
        console.error('❌ List specifications error:', error);
        return { success: false, summaries: [] };
      }
    }),

  /**
   * 3. 특정 테이블 명세서 조회
   */
  getByTable: publicProcedure
    .input(
      z.object({
        content: z.string(), // DBML content
        tableName: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        // Parse and generate specs
        const parseResult = DBMLParser.parse(input.content);
        if (!parseResult.success || !parseResult.schema) {
          return { success: false, specification: null };
        }

        const schema = parseResult.schema as {
          tables: any[];
          relationships: any[];
        };

        const specifications = generateSpecifications(
          schema.tables,
          schema.relationships
        );

        // Find specific table
        const specification = findSpecification(
          specifications,
          input.tableName
        );

        if (!specification) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Table '${input.tableName}' not found`,
          });
        }

        return {
          success: true,
          specification,
        };
      } catch (error) {
        console.error('❌ Get specification error:', error);
        throw error;
      }
    }),

  /**
   * 4. 검색 (전문 검색 구현)
   */
  search: publicProcedure
    .input(SearchQuerySchema)
    .query(async ({ input }): Promise<SearchResponse> => {
      try {
        const startTime = Date.now();

        console.log('🔍 Search query:', input.q);

        // DBML 파싱이 필요하면 content를 받아야 함
        // 현재는 간단히 구현하고, 나중에 DB에서 조회하도록 개선
        if (!input.content) {
          return {
            results: [],
            total: 0,
            query: input.q,
            took: Date.now() - startTime,
          };
        }

        // 1. DBML 파싱 및 명세서 생성
        const parseResult = DBMLParser.parse(input.content);
        if (!parseResult.success || !parseResult.schema) {
          return {
            results: [],
            total: 0,
            query: input.q,
            took: Date.now() - startTime,
          };
        }

        const schema = parseResult.schema as {
          tables: any[];
          relationships: any[];
        };

        const specifications = generateSpecifications(
          schema.tables,
          schema.relationships
        );

        // 2. 검색어 정규화 및 토큰화
        const normalizedQuery = normalizeText(input.q);
        const queryTokens = tokenize(input.q, 1); // 최소 길이 1

        // 3. 검색 수행 (개선된 알고리즘)
        const results: SearchResult[] = [];

        for (const spec of specifications) {
          // searchableText에서 검색
          const normalizedText = normalizeText(spec.searchableText);
          const normalizedTableName = normalizeText(spec.tableName);

          let matchScore = 0;
          const matchedFields: string[] = [];
          const highlights: Array<{ field: string; text: string }> = [];

          // 1. 정확한 테이블명 매칭 (최고 가중치)
          if (normalizedTableName === normalizedQuery) {
            matchScore += 100;
            matchedFields.push('tableName');
            highlights.push({
              field: 'tableName',
              text: spec.tableName,
            });
          }
          // 2. 테이블명 시작 매칭
          else if (normalizedTableName.startsWith(normalizedQuery)) {
            matchScore += 80;
            matchedFields.push('tableName');
            highlights.push({
              field: 'tableName',
              text: spec.tableName,
            });
          }
          // 3. 테이블명 포함 매칭
          else if (normalizedTableName.includes(normalizedQuery)) {
            matchScore += 50;
            matchedFields.push('tableName');
            highlights.push({
              field: 'tableName',
              text: spec.tableName,
            });
          }

          // 4. 설명 매칭
          if (spec.description && normalizeText(spec.description).includes(normalizedQuery)) {
            matchScore += 30;
            matchedFields.push('description');
            highlights.push({
              field: 'description',
              text: spec.description,
            });
          }

          // 5. 컬럼명 매칭
          for (const column of spec.columns) {
            const normalizedColumnName = normalizeText(column.name);

            // 정확한 컬럼명 매칭
            if (normalizedColumnName === normalizedQuery) {
              matchScore += 40;
              matchedFields.push(`column:${column.name}`);
              highlights.push({
                field: 'column',
                text: column.name,
              });
            }
            // 컬럼명 포함 매칭
            else if (normalizedColumnName.includes(normalizedQuery)) {
              matchScore += 20;
              matchedFields.push(`column:${column.name}`);
              highlights.push({
                field: 'column',
                text: column.name,
              });
            }

            // 컬럼 설명 매칭
            if (column.description && normalizeText(column.description).includes(normalizedQuery)) {
              matchScore += 15;
              matchedFields.push(`columnDesc:${column.name}`);
            }
          }

          // 6. 토큰 매칭 (보너스 점수)
          for (const token of queryTokens) {
            if (normalizedText.includes(token) && !matchedFields.includes('tableName')) {
              matchScore += 5;
            }
          }

          // 7. 보너스 점수
          // - 많은 FK 관계를 가진 인기 테이블
          if (spec.stats.foreignKeyCount > 3) {
            matchScore += 10;
          }
          // - 최근 업데이트된 테이블
          const daysSinceUpdate = (Date.now() - spec.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceUpdate < 7) {
            matchScore += 5;
          }

          // 매칭되면 결과에 추가
          if (matchScore > 0) {
            // 카테고리 자동 분류
            const category = determineSearchCategory(spec, normalizedQuery, matchedFields);

            // Relevance 점수 계산 (0-100)
            const relevance = calculateRelevance(matchScore, category);

            // 매칭 컨텍스트 추출
            const matchContext = extractMatchContext(spec, normalizedQuery, matchedFields);

            // 관련 테이블 찾기
            const relatedTables = findRelatedTables(spec, specifications);

            results.push({
              id: spec.id,
              tableName: spec.tableName,
              schemaName: spec.schemaName,
              description: spec.description,
              matchScore,
              relevance,
              category,
              matchedFields,
              highlights,
              matchContext,
              relatedTables,
            });
          }
        }

        // 4. 관련도 점수 순으로 정렬 (relevance 우선, matchScore 보조)
        results.sort((a, b) => {
          if (b.relevance !== a.relevance) {
            return b.relevance - a.relevance;
          }
          return b.matchScore - a.matchScore;
        });

        // 5. 페이지네이션 적용 (나중에 구현)
        const took = Date.now() - startTime;

        // 카테고리별 결과 카운트
        const categoryCount = results.reduce((acc, result) => {
          acc[result.category] = (acc[result.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        console.log(`✅ Search completed: ${results.length} results in ${took}ms`);
        console.log(`📊 Category breakdown:`, categoryCount);
        if (results.length > 0 && results[0]) {
          console.log(`🎯 Top result: ${results[0].tableName} (${results[0].category}, relevance: ${results[0].relevance}%)`);
        }

        return {
          results,
          total: results.length,
          query: input.q,
          took,
        };
      } catch (error) {
        console.error('❌ Search error:', error);
        return {
          results: [],
          total: 0,
          query: input.q,
          took: 0,
        };
      }
    }),

  /**
   * 5. 내보내기
   */
  export: publicProcedure
    .input(ExportConfigSchema)
    .mutation(async ({ input }) => {
      try {
        console.log(`📤 Exporting to ${input.format}...`);

        // TODO: 실제 export 구현
        // Excel, PDF, Markdown, JSON 포맷 지원

        throw new TRPCError({
          code: 'NOT_IMPLEMENTED',
          message: 'Export functionality coming soon',
        });
      } catch (error) {
        console.error('❌ Export error:', error);
        throw error;
      }
    }),

  /**
   * 6. 관계 그래프 조회
   */
  getRelationshipGraph: publicProcedure
    .input(
      z.object({
        content: z.string(), // DBML content
        tableName: z.string(),
        depth: z.number().min(1).max(5).default(2),
      })
    )
    .query(async ({ input }) => {
      try {
        // Parse DBML
        const parseResult = DBMLParser.parse(input.content);
        if (!parseResult.success || !parseResult.schema) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Failed to parse DBML',
          });
        }

        const schema = parseResult.schema as {
          tables: any[];
          relationships: any[];
        };

        // TODO: 실제 관계 그래프 빌드 로직 구현
        // buildRelationshipGraph 함수 사용

        return {
          success: true,
          graph: {
            centerTable: input.tableName,
            depth: input.depth,
            nodes: [],
            edges: [],
          },
        };
      } catch (error) {
        console.error('❌ Get relationship graph error:', error);
        throw error;
      }
    }),
});
