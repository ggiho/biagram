'use client';

import { Columns, Link2, Key, Fingerprint, ArrowRightLeft, Lock, ListTree } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TableSpecification } from '@/types/table-center';
import type { ColumnSpecification } from '@biagram/shared';

interface TableDetailProps {
  spec: TableSpecification;
  onSelectTable?: (tableName: string) => void;
}

export function TableDetail({ spec, onSelectTable }: TableDetailProps) {
  return (
    <div className="p-6 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold">
          {spec.schemaName && (
            <>
              <span className="text-muted-foreground font-normal">{spec.schemaName}</span>
              <span className="text-muted-foreground/50 font-normal">.</span>
            </>
          )}
          {spec.tableName}
        </h2>
        {spec.description && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {spec.description}
          </p>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard
          icon={<Columns className="h-4 w-4" />}
          label="Columns"
          value={spec.stats.columnCount}
          colorClass="text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30"
        />
        <StatCard
          icon={<Link2 className="h-4 w-4" />}
          label="Relations"
          value={spec.stats.relationshipCount}
          colorClass="text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30"
        />
        <StatCard
          icon={<Key className="h-4 w-4" />}
          label="Primary Keys"
          value={spec.stats.primaryKeyCount}
          colorClass="text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30"
        />
        <StatCard
          icon={<Fingerprint className="h-4 w-4" />}
          label="Foreign Keys"
          value={spec.stats.foreignKeyCount}
          colorClass="text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30"
        />
        <StatCard
          icon={<ListTree className="h-4 w-4" />}
          label="Indexes"
          value={spec.indexes?.length ?? 0}
          colorClass="text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/30"
        />
      </div>

      {/* Columns Table */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Columns className="h-4 w-4 text-muted-foreground" />
          Columns
        </h3>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full table-fixed">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground w-[28%]">
                  Name
                </th>
                <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground w-[15%]">
                  Type
                </th>
                <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground w-[22%]">
                  Constraints
                </th>
                <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground w-[35%]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {spec.columns.map((column: ColumnSpecification) => {
                const isPII = column.description?.startsWith('*');
                const isPK = column.primaryKey;
                const isAudit = ['created_by', 'created_at', 'updated_by', 'updated_at'].includes(column.name);
                
                const isFK = !!column.foreignKey;
                const referencedTable = column.foreignKey?.referencedTable;
                
                const handleRowClick = () => {
                  if (isFK && referencedTable && onSelectTable) {
                    onSelectTable(referencedTable);
                  }
                };
                
                // FK 행일 때는 전체 row에 이동 툴팁만 표시
                const fkTooltip = isFK && referencedTable ? `→ ${referencedTable} 로 이동` : undefined;
                
                return (
                  <tr
                    key={column.name}
                    className={cn(
                      'hover:bg-muted/30 transition-colors',
                      isPK && 'bg-amber-50 dark:bg-amber-950/20',
                      isPII && 'bg-red-50 dark:bg-red-950/20',
                      isAudit && !isPK && !isPII && 'bg-muted/30 text-muted-foreground',
                      isFK && onSelectTable && 'cursor-pointer hover:bg-green-50 dark:hover:bg-green-950/20'
                    )}
                    onClick={handleRowClick}
                    title={fkTooltip}
                  >
                    <td className="p-3 font-mono text-sm truncate" title={fkTooltip || column.name}>
                      <div className="flex items-center gap-1.5">
                        {isPII && <Lock className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                        <span className="truncate">{column.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground truncate" title={fkTooltip || column.type}>
                      {column.type}
                    </td>
                    <td className="p-3" title={fkTooltip}>
                      <div className="flex flex-wrap gap-1">
                        {column.primaryKey && <ConstraintBadge type="pk" />}
                        {isFK && <ConstraintBadge type="fk" />}
                        {column.unique && <ConstraintBadge type="unique" number={column.uniqueIndexNumber} />}
                        {!column.nullable && <ConstraintBadge type="required" />}
                        {column.autoIncrement && <ConstraintBadge type="autoIncrement" />}
                      </div>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground" title={fkTooltip || column.description || '-'}>
                      <div className="line-clamp-2">
                        {isPII ? column.description?.substring(1).trim() || '-' : column.description || '-'}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indexes */}
      {spec.indexes && spec.indexes.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <ListTree className="h-4 w-4 text-muted-foreground" />
            Indexes
          </h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium text-muted-foreground">NAME</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">COLUMNS</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">TYPE</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {spec.indexes.map((idx, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-mono text-xs">{idx.name}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {idx.columns.map((col, j) => (
                          <span
                            key={j}
                            className="inline-block px-2 py-0.5 text-xs font-medium bg-muted rounded"
                          >
                            {col}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      {idx.unique ? (
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                          UNIQUE
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground">
                          INDEX
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Relationships */}
      {(spec.relationships.incoming.length > 0 || spec.relationships.outgoing.length > 0) && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            Relationships
          </h3>

          {spec.relationships.incoming.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Incoming ({spec.relationships.incoming.length})
              </h4>
              <div className="space-y-2">
                {spec.relationships.incoming.map(
                  (rel: { fromTable: string; fromColumn: string; type: string }, idx: number) => (
                    <RelationshipCard
                      key={idx}
                      from={rel.fromTable}
                      to={spec.tableName}
                      column={rel.fromColumn}
                      type="incoming"
                    />
                  )
                )}
              </div>
            </div>
          )}

          {spec.relationships.outgoing.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Outgoing ({spec.relationships.outgoing.length})
              </h4>
              <div className="space-y-2">
                {spec.relationships.outgoing.map(
                  (rel: { toTable: string; toColumn: string; type: string }, idx: number) => (
                    <RelationshipCard
                      key={idx}
                      from={spec.tableName}
                      to={rel.toTable}
                      column={rel.toColumn}
                      type="outgoing"
                    />
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Sub-components
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  colorClass: string;
}

function StatCard({ icon, label, value, colorClass }: StatCardProps) {
  return (
    <div className="p-4 border rounded-lg bg-card">
      <div className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg mb-2', colorClass)}>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

const CONSTRAINT_CONFIG = {
  pk: { label: 'PK', className: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  fk: { label: 'FK', className: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
  unique: { label: 'UK', className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  required: { label: 'NOT NULL', className: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' },
  autoIncrement: { label: 'AUTO INCREMENT', className: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
} as const;

function ConstraintBadge({ type, number }: { type: keyof typeof CONSTRAINT_CONFIG; number?: number }) {
  const config = CONSTRAINT_CONFIG[type];
  // UK일 때 번호가 있으면 UK1, UK2 등으로 표시
  const label = type === 'unique' && number ? `${config.label}${number}` : config.label;
  return (
    <span className={cn('inline-block px-1.5 py-0.5 text-[10px] font-medium rounded', config.className)}>
      {label}
    </span>
  );
}

interface RelationshipCardProps {
  from: string;
  to: string;
  column: string;
  type: 'incoming' | 'outgoing';
}

function RelationshipCard({ from, to, column, type }: RelationshipCardProps) {
  return (
    <div className="p-3 border rounded-lg text-sm flex items-center gap-2 bg-card hover:bg-muted/30 transition-colors">
      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{from}</span>
      <span className={cn('text-muted-foreground', type === 'incoming' ? 'rotate-180' : '')}>→</span>
      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{to}</span>
      <span className="text-muted-foreground text-xs ml-auto">({column})</span>
    </div>
  );
}
