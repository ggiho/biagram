'use client';

import { Columns, Link2, Key, Fingerprint, ArrowRightLeft, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TableSpecification } from '@/types/table-center';
import type { ColumnSpecification } from '@biagram/shared';

interface TableDetailProps {
  spec: TableSpecification;
}

export function TableDetail({ spec }: TableDetailProps) {
  return (
    <div className="p-6 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{spec.tableName}</h2>
            {spec.schemaName && (
              <p className="text-sm text-muted-foreground mt-1">
                Schema: <span className="font-medium">{spec.schemaName}</span>
              </p>
            )}
          </div>
        </div>
        {spec.description && (
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            {spec.description}
          </p>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
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
                
                return (
                  <tr
                    key={column.name}
                    className={cn(
                      'hover:bg-muted/30 transition-colors',
                      isPK && 'bg-amber-50 dark:bg-amber-950/20',
                      isPII && 'bg-red-50 dark:bg-red-950/20',
                      isAudit && !isPK && !isPII && 'bg-muted/30 text-muted-foreground'
                    )}
                  >
                    <td className="p-3 font-mono text-sm truncate" title={column.name}>
                      <div className="flex items-center gap-1.5">
                        {isPII && <Lock className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                        <span className="truncate">{column.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground truncate" title={column.type}>
                      {column.type}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {column.primaryKey && <ConstraintBadge type="pk" />}
                        {column.foreignKey && <ConstraintBadge type="fk" />}
                        {column.unique && <ConstraintBadge type="unique" />}
                        {!column.nullable && <ConstraintBadge type="required" />}
                        {column.autoIncrement && <ConstraintBadge type="autoIncrement" />}
                      </div>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground" title={column.description || '-'}>
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
  unique: { label: 'UQ', className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  required: { label: 'NOT NULL', className: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  autoIncrement: { label: 'AUTO INCREMENT', className: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
} as const;

function ConstraintBadge({ type }: { type: keyof typeof CONSTRAINT_CONFIG }) {
  const config = CONSTRAINT_CONFIG[type];
  return (
    <span className={cn('inline-block px-1.5 py-0.5 text-[10px] font-medium rounded', config.className)}>
      {config.label}
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
