'use client';

import { useMemo, useState } from 'react';
import {
  Table,
  Columns,
  Link2,
  ListTree,
  Lock,
  Database,
  LayoutGrid,
  AlertTriangle,
  Copy,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TableSpecification } from '@biagram/shared';
import type { ExtendedSummary } from '@/types/table-center';

interface SchemaOverviewProps {
  specifications: TableSpecification[];
  summaries: ExtendedSummary[];
  tablesBySchema: Map<string, ExtendedSummary[]>;
  onSelectTable: (tableName: string) => void;
  onToggleSchema: (schema: string) => void;
}

// 통계 카드 컴포넌트
function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  subValue?: string;
  colorClass: string;
}) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border bg-card">
      <div className={cn('flex h-12 w-12 items-center justify-center rounded-lg', colorClass)}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
        {subValue && <div className="text-xs text-muted-foreground mt-0.5">{subValue}</div>}
      </div>
    </div>
  );
}

// 스키마 분포 바
function SchemaDistribution({
  tablesBySchema,
  totalTables,
  onToggleSchema,
}: {
  tablesBySchema: Map<string, ExtendedSummary[]>;
  totalTables: number;
  onToggleSchema: (schema: string) => void;
}) {
  const sortedSchemas = Array.from(tablesBySchema.entries())
    .sort((a, b) => b[1].length - a[1].length);

  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
  ];

  return (
    <div className="p-4 rounded-xl border bg-card">
      <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
        <Database className="h-4 w-4" />
        Schema Distribution
      </h3>

      {/* 스택 바 */}
      <div className="h-4 rounded-full overflow-hidden flex mb-4">
        {sortedSchemas.map(([schema, tables], idx) => {
          const percentage = (tables.length / totalTables) * 100;
          return (
            <button
              key={schema}
              onClick={() => onToggleSchema(schema)}
              className={cn(
                colors[idx % colors.length],
                'hover:opacity-80 transition-opacity'
              )}
              style={{ width: `${percentage}%` }}
              title={`${schema}: ${tables.length} tables (${percentage.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* 범례 */}
      <div className="grid grid-cols-2 gap-2">
        {sortedSchemas.map(([schema, tables], idx) => (
          <button
            key={schema}
            onClick={() => onToggleSchema(schema)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
          >
            <div className={cn('h-3 w-3 rounded-sm', colors[idx % colors.length])} />
            <span className="text-sm font-medium truncate flex-1">{schema}</span>
            <span className="text-sm text-muted-foreground">{tables.length}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// 파티션 테이블 요약
function PartitionedTables({
  specifications,
  onSelectTable,
}: {
  specifications: TableSpecification[];
  onSelectTable: (tableName: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const partitionData = useMemo(() => {
    const tablesWithPartitions = specifications.filter(spec =>
      spec.partitions && spec.partitions.length > 0
    );

    const totalPartitions = tablesWithPartitions.reduce((acc, spec) =>
      acc + (spec.partitions?.length || 0), 0
    );

    // 파티션 메소드별 분류
    const methodCounts: Record<string, number> = {};
    tablesWithPartitions.forEach(spec => {
      spec.partitions?.forEach(p => {
        methodCounts[p.method] = (methodCounts[p.method] || 0) + 1;
      });
    });

    return {
      tableCount: tablesWithPartitions.length,
      totalPartitions,
      methodCounts,
      tables: tablesWithPartitions
        .sort((a, b) => (b.partitions?.length || 0) - (a.partitions?.length || 0)),
    };
  }, [specifications]);

  if (partitionData.tableCount === 0) return null;

  const displayTables = isExpanded ? partitionData.tables : partitionData.tables.slice(0, 5);
  const hasMore = partitionData.tableCount > 5;

  return (
    <div className="p-4 rounded-xl border bg-card border-violet-200 dark:border-violet-900/50">
      <h3 className="text-sm font-medium mb-4 flex items-center gap-2 text-violet-600 dark:text-violet-400">
        <LayoutGrid className="h-4 w-4" />
        Partitioned Tables
      </h3>
      <div className="flex gap-6 mb-4">
        <div>
          <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">
            {partitionData.tableCount}
          </div>
          <div className="text-xs text-muted-foreground">Tables</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">
            {partitionData.totalPartitions}
          </div>
          <div className="text-xs text-muted-foreground">Total Partitions</div>
        </div>
      </div>
      {/* 메소드별 분포 */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {Object.entries(partitionData.methodCounts).map(([method, count]) => (
          <span
            key={method}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
          >
            {method} <span className="font-medium">{count}</span>
          </span>
        ))}
      </div>
      <div className="space-y-1">
        {displayTables.map(spec => {
          const fullName = spec.schemaName
            ? `${spec.schemaName}.${spec.tableName}`
            : spec.tableName;
          return (
            <button
              key={spec.id}
              onClick={() => onSelectTable(fullName)}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors text-left"
            >
              <span className="text-sm truncate">
                {spec.schemaName && (
                  <span className="text-muted-foreground">{spec.schemaName}.</span>
                )}
                {spec.tableName}
              </span>
              <span className="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1">
                <LayoutGrid className="h-3 w-3" />
                {spec.partitions?.length}
              </span>
            </button>
          );
        })}
        {hasMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 text-center pt-2 flex items-center justify-center gap-1"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                +{partitionData.tableCount - 5} more tables
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// 인덱스 없는 테이블 경고
function TablesWithoutIndex({
  specifications,
  onSelectTable,
}: {
  specifications: TableSpecification[];
  onSelectTable: (tableName: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const tablesWithoutIndex = useMemo(() => {
    return specifications.filter(spec => spec.stats.indexCount === 0);
  }, [specifications]);

  const percentage = specifications.length > 0
    ? Math.round((tablesWithoutIndex.length / specifications.length) * 100)
    : 0;

  // 인덱스 없는 테이블이 5% 미만이면 표시 안함
  if (tablesWithoutIndex.length === 0 || percentage < 5) return null;

  const displayTables = isExpanded ? tablesWithoutIndex : tablesWithoutIndex.slice(0, 8);
  const hasMore = tablesWithoutIndex.length > 8;

  return (
    <div className="p-4 rounded-xl border bg-card border-orange-200 dark:border-orange-900/50">
      <h3 className="text-sm font-medium mb-4 flex items-center gap-2 text-orange-600 dark:text-orange-400">
        <AlertTriangle className="h-4 w-4" />
        Tables Without Indexes
      </h3>
      <div className="flex gap-6 mb-4">
        <div>
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {tablesWithoutIndex.length}
          </div>
          <div className="text-xs text-muted-foreground">Tables</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {percentage}%
          </div>
          <div className="text-xs text-muted-foreground">of total</div>
        </div>
      </div>
      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {displayTables.map(spec => {
          const fullName = spec.schemaName
            ? `${spec.schemaName}.${spec.tableName}`
            : spec.tableName;
          return (
            <button
              key={spec.id}
              onClick={() => onSelectTable(fullName)}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors text-left"
            >
              <span className="text-sm truncate">
                {spec.schemaName && (
                  <span className="text-muted-foreground">{spec.schemaName}.</span>
                )}
                {spec.tableName}
              </span>
              <span className="text-xs text-muted-foreground">
                {spec.stats.columnCount} columns
              </span>
            </button>
          );
        })}
        {hasMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 text-center pt-2 flex items-center justify-center gap-1"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                +{tablesWithoutIndex.length - 8} more tables
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// PII 요약
function PIISummary({
  specifications,
  onSelectTable,
}: {
  specifications: TableSpecification[];
  onSelectTable: (tableName: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const piiData = useMemo(() => {
    const tablesWithPII = specifications.filter(spec =>
      spec.columns.some(col => col.description?.startsWith('*'))
    );

    const totalPIIColumns = specifications.reduce((acc, spec) =>
      acc + spec.columns.filter(col => col.description?.startsWith('*')).length, 0
    );

    return {
      tableCount: tablesWithPII.length,
      columnCount: totalPIIColumns,
      tables: tablesWithPII.map(spec => ({
        ...spec,
        piiCount: spec.columns.filter(col => col.description?.startsWith('*')).length,
      })).sort((a, b) => b.piiCount - a.piiCount),
    };
  }, [specifications]);

  if (piiData.tableCount === 0) return null;

  const displayTables = isExpanded ? piiData.tables : piiData.tables.slice(0, 5);
  const hasMore = piiData.tableCount > 5;

  return (
    <div className="p-4 rounded-xl border bg-card border-red-200 dark:border-red-900/50">
      <h3 className="text-sm font-medium mb-4 flex items-center gap-2 text-red-600 dark:text-red-400">
        <Lock className="h-4 w-4" />
        PII Data Summary
      </h3>
      <div className="flex gap-6 mb-4">
        <div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{piiData.tableCount}</div>
          <div className="text-xs text-muted-foreground">Tables with PII</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{piiData.columnCount}</div>
          <div className="text-xs text-muted-foreground">PII Columns</div>
        </div>
      </div>
      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {displayTables.map(spec => {
          const fullName = spec.schemaName
            ? `${spec.schemaName}.${spec.tableName}`
            : spec.tableName;
          return (
            <button
              key={spec.id}
              onClick={() => onSelectTable(fullName)}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
            >
              <span className="text-sm truncate">
                {spec.schemaName && (
                  <span className="text-muted-foreground">{spec.schemaName}.</span>
                )}
                {spec.tableName}
              </span>
              <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <Lock className="h-3 w-3" />
                {spec.piiCount}
              </span>
            </button>
          );
        })}
        {hasMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-center pt-2 flex items-center justify-center gap-1"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                +{piiData.tableCount - 5} more tables
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// 중복/중첩 인덱스 탐지
function RedundantIndexes({
  specifications,
  onSelectTable,
}: {
  specifications: TableSpecification[];
  onSelectTable: (tableName: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const redundantData = useMemo(() => {
    const issues: Array<{
      tableName: string;
      schemaName: string | undefined;
      index1: string;
      index2: string;
      columns1: string[];
      columns2: string[];
      type: 'duplicate' | 'prefix';
    }> = [];

    specifications.forEach(spec => {
      const indexes = spec.indexes || [];

      for (let i = 0; i < indexes.length; i++) {
        for (let j = i + 1; j < indexes.length; j++) {
          const idx1 = indexes[i];
          const idx2 = indexes[j];
          if (!idx1 || !idx2) continue;

          const cols1 = idx1.columns;
          const cols2 = idx2.columns;

          // 완전 동일 (중복)
          if (cols1.length === cols2.length && cols1.every((c, k) => c === cols2[k])) {
            issues.push({
              tableName: spec.tableName,
              schemaName: spec.schemaName,
              index1: idx1.name,
              index2: idx2.name,
              columns1: cols1,
              columns2: cols2,
              type: 'duplicate',
            });
          }
          // 접두어 중첩 (하나가 다른 하나의 prefix)
          else if (cols1.length < cols2.length && cols1.every((c, k) => c === cols2[k])) {
            issues.push({
              tableName: spec.tableName,
              schemaName: spec.schemaName,
              index1: idx1.name,
              index2: idx2.name,
              columns1: cols1,
              columns2: cols2,
              type: 'prefix',
            });
          } else if (cols2.length < cols1.length && cols2.every((c, k) => c === cols1[k])) {
            issues.push({
              tableName: spec.tableName,
              schemaName: spec.schemaName,
              index1: idx2.name,
              index2: idx1.name,
              columns1: cols2,
              columns2: cols1,
              type: 'prefix',
            });
          }
        }
      }
    });

    return issues;
  }, [specifications]);

  if (redundantData.length === 0) return null;

  const displayItems = isExpanded ? redundantData : redundantData.slice(0, 5);
  const hasMore = redundantData.length > 5;

  return (
    <div className="p-4 rounded-xl border bg-card border-amber-200 dark:border-amber-900/50">
      <h3 className="text-sm font-medium mb-4 flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <Copy className="h-4 w-4" />
        Redundant Indexes
      </h3>
      <div className="flex gap-6 mb-4">
        <div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {redundantData.length}
          </div>
          <div className="text-xs text-muted-foreground">Issues found</div>
        </div>
        <div>
          <div className="text-sm text-amber-600 dark:text-amber-400 mt-1">
            {redundantData.filter(r => r.type === 'duplicate').length} duplicate,{' '}
            {redundantData.filter(r => r.type === 'prefix').length} prefix overlap
          </div>
        </div>
      </div>
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {displayItems.map((item, idx) => {
          const fullName = item.schemaName
            ? `${item.schemaName}.${item.tableName}`
            : item.tableName;
          return (
            <button
              key={`${fullName}-${item.index1}-${item.index2}-${idx}`}
              onClick={() => onSelectTable(fullName)}
              className="w-full p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">
                  {item.schemaName && (
                    <span className="text-muted-foreground">{item.schemaName}.</span>
                  )}
                  {item.tableName}
                </span>
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded",
                  item.type === 'duplicate'
                    ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                    : "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
                )}>
                  {item.type === 'duplicate' ? 'Duplicate' : 'Prefix'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                <span className="font-mono">{item.index1}</span>
                <span className="mx-1">→</span>
                <span className="font-mono">{item.index2}</span>
              </div>
            </button>
          );
        })}
        {hasMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-center pt-2 flex items-center justify-center gap-1"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                +{redundantData.length - 5} more issues
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function SchemaOverview({
  specifications,
  summaries,
  tablesBySchema,
  onSelectTable,
  onToggleSchema,
}: SchemaOverviewProps) {
  // 통계 계산
  const stats = useMemo(() => {
    const totalTables = specifications.length;
    const totalColumns = specifications.reduce((acc, spec) => acc + spec.stats.columnCount, 0);
    const totalRelationships = specifications.reduce((acc, spec) => acc + spec.stats.relationshipCount, 0);
    const totalIndexes = specifications.reduce((acc, spec) => acc + spec.stats.indexCount, 0);
    const totalPII = specifications.reduce((acc, spec) =>
      acc + spec.columns.filter(col => col.description?.startsWith('*')).length, 0
    );
    const totalPartitions = specifications.reduce((acc, spec) =>
      acc + (spec.partitions?.length || 0), 0
    );
    const partitionedTables = specifications.filter(spec => spec.partitions && spec.partitions.length > 0).length;
    const avgColumnsPerTable = totalTables > 0 ? Math.round(totalColumns / totalTables) : 0;

    return {
      totalTables,
      totalColumns,
      totalRelationships,
      totalIndexes,
      totalPII,
      totalPartitions,
      partitionedTables,
      avgColumnsPerTable,
      schemaCount: tablesBySchema.size,
    };
  }, [specifications, tablesBySchema]);

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-300">
      {/* 헤더 */}
      <div>
        <h2 className="text-xl font-semibold">Schema Overview</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {stats.schemaCount} schemas, {stats.totalTables} tables
        </p>
      </div>

      {/* 통계 카드 그리드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Table}
          label="Tables"
          value={stats.totalTables}
          subValue={`${stats.schemaCount} schemas`}
          colorClass="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
        />
        <StatCard
          icon={Columns}
          label="Columns"
          value={stats.totalColumns}
          subValue={`avg ${stats.avgColumnsPerTable} per table`}
          colorClass="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
        />
        <StatCard
          icon={Link2}
          label="Relationships"
          value={stats.totalRelationships}
          colorClass="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={ListTree}
          label="Indexes"
          value={stats.totalIndexes}
          colorClass="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
        />
      </div>

      {/* 2열 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 스키마 분포 */}
        <SchemaDistribution
          tablesBySchema={tablesBySchema}
          totalTables={stats.totalTables}
          onToggleSchema={onToggleSchema}
        />

        {/* PII 요약 */}
        <PIISummary
          specifications={specifications}
          onSelectTable={onSelectTable}
        />

        {/* 파티션 테이블 */}
        <PartitionedTables
          specifications={specifications}
          onSelectTable={onSelectTable}
        />

        {/* 인덱스 없는 테이블 */}
        <TablesWithoutIndex
          specifications={specifications}
          onSelectTable={onSelectTable}
        />

        {/* 중복 인덱스 */}
        <RedundantIndexes
          specifications={specifications}
          onSelectTable={onSelectTable}
        />
      </div>
    </div>
  );
}
