/**
 * Relationship Inferrer
 *
 * 물리적 FK가 없는 경우 컬럼명/타입 매칭을 통해
 * 논리적 관계를 추론하는 모듈
 */

import type { IntrospectedDatabase, IntrospectedTable, IntrospectedForeignKey } from './types';

export interface InferredRelationship {
  fromSchema: string;
  fromTable: string;
  fromColumn: string;
  toSchema: string;
  toTable: string;
  toColumn: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface InferRelationshipsResult {
  relationships: InferredRelationship[];
  stats: {
    totalInferred: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
  };
}

interface PKInfo {
  schema: string;
  table: string;
  column: string;
  type: string;
}

/**
 * 데이터베이스에서 관계를 추론
 */
export function inferRelationships(
  database: IntrospectedDatabase,
  options: {
    includeExistingFKs?: boolean; // 이미 FK가 있는 관계도 포함할지
    minConfidence?: 'high' | 'medium' | 'low'; // 최소 신뢰도
  } = {}
): InferRelationshipsResult {
  const { includeExistingFKs = false, minConfidence = 'low' } = options;

  // 1. 모든 PK 수집
  const pkMap = collectPrimaryKeys(database);

  // 2. 기존 FK 수집 (중복 방지용)
  const existingFKs = collectExistingForeignKeys(database);

  // 3. 관계 추론
  const relationships: InferredRelationship[] = [];

  for (const schema of database.schemas) {
    for (const table of schema.tables) {
      for (const column of table.columns) {
        // 자기 자신의 PK는 스킵
        if (table.primaryKeys.includes(column.name)) {
          continue;
        }

        // Audit 컬럼 스킵
        if (isAuditColumn(column.name)) {
          continue;
        }

        // 이미 FK로 정의된 컬럼은 스킵 (옵션에 따라)
        const fkKey = `${schema.name}.${table.name}.${column.name}`;
        if (!includeExistingFKs && existingFKs.has(fkKey)) {
          continue;
        }

        // PK 매칭 시도
        const matches = findPKMatches(column.name, column.type, pkMap, schema.name, table.name);

        for (const match of matches) {
          relationships.push({
            fromSchema: schema.name,
            fromTable: table.name,
            fromColumn: column.name,
            toSchema: match.pk.schema,
            toTable: match.pk.table,
            toColumn: match.pk.column,
            confidence: match.confidence,
            reason: match.reason,
          });
        }
      }
    }
  }

  // 4. 신뢰도 필터링
  const confidenceLevels = ['high', 'medium', 'low'] as const;
  const minIdx = confidenceLevels.indexOf(minConfidence);
  const filteredRelationships = relationships.filter((rel) => {
    const relIdx = confidenceLevels.indexOf(rel.confidence);
    return relIdx <= minIdx;
  });

  // 5. 통계 계산
  const stats = {
    totalInferred: filteredRelationships.length,
    highConfidence: filteredRelationships.filter((r) => r.confidence === 'high').length,
    mediumConfidence: filteredRelationships.filter((r) => r.confidence === 'medium').length,
    lowConfidence: filteredRelationships.filter((r) => r.confidence === 'low').length,
  };

  return { relationships: filteredRelationships, stats };
}

/**
 * Audit/공통 컬럼 패턴 (관계 추론에서 제외)
 */
const AUDIT_COLUMN_PATTERNS = [
  /^created_at$/i,
  /^created_by$/i,
  /^updated_at$/i,
  /^updated_by$/i,
  /^modified_at$/i,
  /^modified_by$/i,
  /^deleted_at$/i,
  /^deleted_by$/i,
  /^created_date$/i,
  /^updated_date$/i,
  /^reg_date$/i,
  /^mod_date$/i,
  /^insert_dt$/i,
  /^update_dt$/i,
];

/**
 * Audit 컬럼인지 확인
 */
function isAuditColumn(columnName: string): boolean {
  return AUDIT_COLUMN_PATTERNS.some((pattern) => pattern.test(columnName));
}

/**
 * 모든 테이블의 PK 정보 수집
 */
function collectPrimaryKeys(database: IntrospectedDatabase): Map<string, PKInfo[]> {
  const pkMap = new Map<string, PKInfo[]>();

  for (const schema of database.schemas) {
    for (const table of schema.tables) {
      for (const pkColumnName of table.primaryKeys) {
        const column = table.columns.find((c) => c.name === pkColumnName);
        if (!column) continue;

        const pkInfo: PKInfo = {
          schema: schema.name,
          table: table.name,
          column: column.name,
          type: normalizeType(column.type),
        };

        // 컬럼명으로 인덱싱
        const existing = pkMap.get(column.name) || [];
        existing.push(pkInfo);
        pkMap.set(column.name, existing);

        // {테이블명}_id 패턴으로도 인덱싱
        // 예: users 테이블의 id -> user_id 로도 매칭
        if (column.name === 'id') {
          const singularTable = singularize(table.name);
          const aliasName = `${singularTable}_id`;
          const existingAlias = pkMap.get(aliasName) || [];
          existingAlias.push(pkInfo);
          pkMap.set(aliasName, existingAlias);
        }
      }
    }
  }

  return pkMap;
}

/**
 * 기존 FK 수집
 */
function collectExistingForeignKeys(database: IntrospectedDatabase): Set<string> {
  const fkSet = new Set<string>();

  for (const schema of database.schemas) {
    for (const table of schema.tables) {
      for (const fk of table.foreignKeys) {
        const key = `${schema.name}.${table.name}.${fk.column}`;
        fkSet.add(key);
      }
    }
  }

  return fkSet;
}

/**
 * PK 매칭 찾기
 */
function findPKMatches(
  columnName: string,
  columnType: string,
  pkMap: Map<string, PKInfo[]>,
  currentSchema: string,
  currentTable: string
): { pk: PKInfo; confidence: 'high' | 'medium' | 'low'; reason: string }[] {
  const normalizedType = normalizeType(columnType);
  const matches: { pk: PKInfo; confidence: 'high' | 'medium' | 'low'; reason: string }[] = [];

  // 1. 정확한 컬럼명 매칭
  const exactMatches = pkMap.get(columnName);
  if (exactMatches) {
    for (const pk of exactMatches) {
      // 자기 자신 테이블 제외
      if (pk.schema === currentSchema && pk.table === currentTable) {
        continue;
      }

      // 타입 체크
      if (pk.type === normalizedType) {
        // {테이블명}_id 패턴 체크 (높은 신뢰도)
        const singularTable = singularize(pk.table);
        if (
          columnName === `${singularTable}_id` ||
          columnName === `${pk.table}_id` ||
          columnName === pk.column
        ) {
          matches.push({
            pk,
            confidence: 'high',
            reason: `컬럼명 '${columnName}'이 '${pk.table}.${pk.column}'와 정확히 매칭됨`,
          });
        } else {
          matches.push({
            pk,
            confidence: 'medium',
            reason: `컬럼명 '${columnName}'이 PK와 동일하고 타입도 일치 (${normalizedType})`,
          });
        }
      } else {
        // 타입 불일치 - 낮은 신뢰도
        matches.push({
          pk,
          confidence: 'low',
          reason: `컬럼명 '${columnName}'이 PK와 동일하나 타입 불일치 (${normalizedType} vs ${pk.type})`,
        });
      }
    }
  }

  // 2. {테이블명}_id 패턴 매칭
  // 예: user_id -> users.id 또는 users.user_id
  const idPattern = columnName.match(/^(.+)_id$/i);
  if (idPattern && idPattern[1] && !exactMatches) {
    const tableNameGuess = idPattern[1];
    
    // 해당 이름의 테이블 찾기
    for (const [, pkList] of pkMap) {
      for (const pk of pkList) {
        // 자기 자신 테이블 제외
        if (pk.schema === currentSchema && pk.table === currentTable) {
          continue;
        }

        const singularPkTable = singularize(pk.table);
        if (
          singularPkTable.toLowerCase() === tableNameGuess.toLowerCase() ||
          pk.table.toLowerCase() === tableNameGuess.toLowerCase()
        ) {
          // 타입 체크
          if (pk.type === normalizedType) {
            // 중복 체크
            const isDuplicate = matches.some(
              (m) => m.pk.schema === pk.schema && m.pk.table === pk.table && m.pk.column === pk.column
            );
            if (!isDuplicate) {
              matches.push({
                pk,
                confidence: 'high',
                reason: `'${columnName}' 패턴이 '${pk.table}' 테이블과 매칭됨`,
              });
            }
          }
        }
      }
    }
  }

  return matches;
}

/**
 * 타입 정규화 (비교를 위해)
 */
function normalizeType(type: string): string {
  // 소문자로 변환
  let normalized = type.toLowerCase();

  // 크기/정밀도 제거
  normalized = normalized.replace(/\([^)]*\)/g, '');

  // UNSIGNED 등 제거
  normalized = normalized.replace(/\s+unsigned/g, '');

  // 공백 정리
  normalized = normalized.trim();

  // 별칭 통일
  const typeAliases: Record<string, string> = {
    int: 'integer',
    int4: 'integer',
    int8: 'bigint',
    serial: 'integer',
    bigserial: 'bigint',
    bool: 'boolean',
    varchar: 'varchar',
    'character varying': 'varchar',
    char: 'char',
    character: 'char',
    text: 'text',
    uuid: 'uuid',
    binary: 'binary',
    varbinary: 'binary',
    blob: 'binary',
    bytea: 'binary',
  };

  return typeAliases[normalized] || normalized;
}

/**
 * 테이블명을 단수형으로 변환 (간단한 규칙)
 */
function singularize(tableName: string): string {
  const name = tableName.toLowerCase();

  // 일반적인 복수형 패턴
  if (name.endsWith('ies')) {
    return name.slice(0, -3) + 'y';
  }
  if (name.endsWith('es') && (name.endsWith('sses') || name.endsWith('xes') || name.endsWith('zes') || name.endsWith('ches') || name.endsWith('shes'))) {
    return name.slice(0, -2);
  }
  if (name.endsWith('s') && !name.endsWith('ss')) {
    return name.slice(0, -1);
  }

  return name;
}

/**
 * 추론된 관계를 IntrospectedForeignKey 형태로 변환
 */
export function convertToForeignKeys(relationships: InferredRelationship[]): Map<string, IntrospectedForeignKey[]> {
  const fksByTable = new Map<string, IntrospectedForeignKey[]>();

  for (const rel of relationships) {
    const tableKey = `${rel.fromSchema}.${rel.fromTable}`;
    const fk: IntrospectedForeignKey = {
      name: `fk_inferred_${rel.fromTable}_${rel.fromColumn}`,
      column: rel.fromColumn,
      referencedTable: rel.toTable,
      referencedColumn: rel.toColumn,
      referencedSchema: rel.toSchema,
    };

    const existing = fksByTable.get(tableKey) || [];
    existing.push(fk);
    fksByTable.set(tableKey, existing);
  }

  return fksByTable;
}

/**
 * 추론된 관계를 DBML Ref 문법으로 변환
 */
export function convertToDBMLRefs(relationships: InferredRelationship[]): string[] {
  return relationships.map((rel) => {
    const fromTable =
      rel.fromSchema !== 'public' && rel.fromSchema !== 'dbo'
        ? `${rel.fromSchema}.${rel.fromTable}`
        : rel.fromTable;

    const toTable =
      rel.toSchema !== 'public' && rel.toSchema !== 'dbo'
        ? `${rel.toSchema}.${rel.toTable}`
        : rel.toTable;

    return `Ref: ${fromTable}.${rel.fromColumn} > ${toTable}.${rel.toColumn} // inferred (${rel.confidence})`;
  });
}
