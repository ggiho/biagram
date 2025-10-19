import type { Table, Relationship, RelationshipInfo } from '@biagram/shared';

/**
 * Relationship Analyzer
 *
 * 테이블 간의 관계를 분석하여 incoming/outgoing 관계 정보를 생성합니다.
 */

export interface RelationshipAnalysis {
  incoming: Array<{
    fromTable: string;
    fromColumn: string;
    type: string;
  }>;
  outgoing: Array<{
    toTable: string;
    toColumn: string;
    type: string;
  }>;
  incomingCount: number;
  outgoingCount: number;
  totalCount: number;
}

/**
 * 특정 테이블의 관계 정보 분석
 */
export function analyzeTableRelationships(
  tableName: string,
  allRelationships: Relationship[]
): RelationshipInfo {
  const incoming: RelationshipInfo['incoming'] = [];
  const outgoing: RelationshipInfo['outgoing'] = [];

  for (const rel of allRelationships) {
    // Incoming: 다른 테이블이 현재 테이블을 참조
    if (rel.toTable === tableName) {
      incoming.push({
        fromTable: rel.fromTable,
        fromColumn: rel.fromColumn,
        type: rel.type,
      });
    }

    // Outgoing: 현재 테이블이 다른 테이블을 참조
    if (rel.fromTable === tableName) {
      outgoing.push({
        toTable: rel.toTable,
        toColumn: rel.toColumn,
        type: rel.type,
      });
    }
  }

  return {
    incoming,
    outgoing,
  };
}

/**
 * 관계 통계 계산
 */
export function calculateRelationshipStats(
  relationships: RelationshipInfo
): {
  incomingCount: number;
  outgoingCount: number;
  totalCount: number;
} {
  const incomingCount = relationships.incoming.length;
  const outgoingCount = relationships.outgoing.length;
  const totalCount = incomingCount + outgoingCount;

  return {
    incomingCount,
    outgoingCount,
    totalCount,
  };
}

/**
 * 관계 그래프 빌드 (특정 깊이까지)
 */
export function buildRelationshipGraph(
  startTable: string,
  allTables: Table[],
  allRelationships: Relationship[],
  maxDepth = 2
): {
  tables: Set<string>;
  relationships: Relationship[];
} {
  const visitedTables = new Set<string>();
  const relevantRelationships: Relationship[] = [];
  const queue: Array<{ table: string; depth: number }> = [
    { table: startTable, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visitedTables.has(current.table)) continue;

    visitedTables.add(current.table);

    // 현재 깊이가 maxDepth를 초과하면 더 이상 탐색하지 않음
    if (current.depth >= maxDepth) continue;

    // 현재 테이블과 연결된 관계 찾기
    for (const rel of allRelationships) {
      if (rel.fromTable === current.table) {
        relevantRelationships.push(rel);
        queue.push({ table: rel.toTable, depth: current.depth + 1 });
      }
      if (rel.toTable === current.table) {
        relevantRelationships.push(rel);
        queue.push({ table: rel.fromTable, depth: current.depth + 1 });
      }
    }
  }

  return {
    tables: visitedTables,
    relationships: Array.from(new Set(relevantRelationships)),
  };
}

/**
 * 순환 참조 감지
 */
export function detectCircularReferences(
  relationships: Relationship[]
): Array<{
  cycle: string[];
  severity: 'warning' | 'error';
}> {
  const cycles: Array<{ cycle: string[]; severity: 'warning' | 'error' }> = [];

  // 그래프 구축
  const graph = new Map<string, string[]>();
  for (const rel of relationships) {
    if (!graph.has(rel.fromTable)) {
      graph.set(rel.fromTable, []);
    }
    graph.get(rel.fromTable)!.push(rel.toTable);
  }

  // DFS로 순환 감지
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        // 순환 감지!
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart);
        cycles.push({
          cycle,
          severity: cycle.length === 1 ? 'error' : 'warning', // 자기 참조는 error
        });
      }
    }

    path.pop();
    recStack.delete(node);
    return false;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * 관계 유형 추론 (외래 키 정보가 없는 경우)
 */
export function inferRelationshipType(
  fromTable: Table,
  toTable: Table,
  fromColumn: string,
  toColumn: string
): 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many' {
  // fromColumn이 unique이고 toColumn이 primary key면 one-to-one
  const fromCol = fromTable.columns.find((c) => c.name === fromColumn);
  const toCol = toTable.columns.find((c) => c.name === toColumn);

  if (fromCol?.unique && toCol?.primaryKey) {
    return 'one-to-one';
  }

  // toColumn이 primary key면 기본적으로 many-to-one
  if (toCol?.primaryKey) {
    return 'many-to-one';
  }

  // 기본값
  return 'one-to-many';
}
