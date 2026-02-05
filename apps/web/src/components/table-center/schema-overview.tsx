'use client';

import { useMemo } from 'react';
import {
  Table,
  Columns,
  Link2,
  ListTree,
  Lock,
  Database,
  ArrowRight,
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

// 허브 테이블 (가장 많이 연결된 테이블)
function HubTables({
  specifications,
  onSelectTable,
}: {
  specifications: TableSpecification[];
  onSelectTable: (tableName: string) => void;
}) {
  const hubTables = useMemo(() => {
    return specifications
      .filter(spec => spec.stats.relationshipCount > 0)
      .sort((a, b) => b.stats.relationshipCount - a.stats.relationshipCount)
      .slice(0, 5);
  }, [specifications]);

  if (hubTables.length === 0) return null;

  return (
    <div className="p-4 rounded-xl border bg-card">
      <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
        <Link2 className="h-4 w-4" />
        Most Connected Tables
      </h3>
      <div className="space-y-2">
        {hubTables.map((spec, idx) => {
          const fullName = spec.schemaName
            ? `${spec.schemaName}.${spec.tableName}`
            : spec.tableName;
          const maxRelCount = hubTables[0]?.stats.relationshipCount || 1;
          const barWidth = (spec.stats.relationshipCount / maxRelCount) * 100;

          return (
            <button
              key={spec.id}
              onClick={() => onSelectTable(fullName)}
              className="w-full group"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{idx + 1}</span>
                  <span className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                    {spec.schemaName && (
                      <span className="text-muted-foreground font-normal">{spec.schemaName}.</span>
                    )}
                    {spec.tableName}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Link2 className="h-3 w-3" />
                  {spec.stats.relationshipCount}
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full transition-all group-hover:bg-primary"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </button>
          );
        })}
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
      tables: tablesWithPII.slice(0, 5).map(spec => ({
        ...spec,
        piiCount: spec.columns.filter(col => col.description?.startsWith('*')).length,
      })),
    };
  }, [specifications]);

  if (piiData.tableCount === 0) return null;

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
      <div className="space-y-1">
        {piiData.tables.map(spec => {
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
        {piiData.tableCount > 5 && (
          <div className="text-xs text-muted-foreground text-center pt-2">
            +{piiData.tableCount - 5} more tables
          </div>
        )}
      </div>
    </div>
  );
}

// 최근/큰 테이블
function LargestTables({
  specifications,
  onSelectTable,
}: {
  specifications: TableSpecification[];
  onSelectTable: (tableName: string) => void;
}) {
  const largestTables = useMemo(() => {
    return [...specifications]
      .sort((a, b) => b.stats.columnCount - a.stats.columnCount)
      .slice(0, 5);
  }, [specifications]);

  return (
    <div className="p-4 rounded-xl border bg-card">
      <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
        <Columns className="h-4 w-4" />
        Largest Tables
      </h3>
      <div className="space-y-2">
        {largestTables.map((spec, idx) => {
          const fullName = spec.schemaName
            ? `${spec.schemaName}.${spec.tableName}`
            : spec.tableName;
          const maxColCount = largestTables[0]?.stats.columnCount || 1;
          const barWidth = (spec.stats.columnCount / maxColCount) * 100;

          return (
            <button
              key={spec.id}
              onClick={() => onSelectTable(fullName)}
              className="w-full group"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{idx + 1}</span>
                  <span className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                    {spec.schemaName && (
                      <span className="text-muted-foreground font-normal">{spec.schemaName}.</span>
                    )}
                    {spec.tableName}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Columns className="h-3 w-3" />
                  {spec.stats.columnCount}
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500/60 rounded-full transition-all group-hover:bg-violet-500"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </button>
          );
        })}
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
    const avgColumnsPerTable = totalTables > 0 ? Math.round(totalColumns / totalTables) : 0;

    return {
      totalTables,
      totalColumns,
      totalRelationships,
      totalIndexes,
      totalPII,
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

        {/* 허브 테이블 */}
        <HubTables
          specifications={specifications}
          onSelectTable={onSelectTable}
        />

        {/* 가장 큰 테이블 */}
        <LargestTables
          specifications={specifications}
          onSelectTable={onSelectTable}
        />
      </div>
    </div>
  );
}
