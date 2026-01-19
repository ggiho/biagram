'use client';

import { Lock, Download, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { TableSpecification } from '@/types/table-center';

interface PIIReportProps {
  specifications: TableSpecification[];
  onSelectTable: (tableName: string) => void;
}

export function PIIReport({ specifications, onSelectTable }: PIIReportProps) {
  const { toast } = useToast();

  // PII 데이터 집계
  const piiData = specifications.flatMap((spec) =>
    spec.columns
      .filter((col: any) => col.description?.startsWith('*'))
      .map((col: any) => {
        let schema = spec.schemaName;
        let pureTableName = spec.tableName;

        if (!schema && spec.tableName.includes('.')) {
          const parts = spec.tableName.split('.');
          schema = parts[0];
          pureTableName = parts.slice(1).join('.');
        }

        return {
          schema: schema || '-',
          table: pureTableName,
          fullTableName: spec.tableName,
          column: col.name,
          type: col.type,
          description: col.description?.substring(1).trim() || '',
        };
      })
  );

  const tablesWithPII = new Set(piiData.map((d) => d.fullTableName)).size;

  // CSV 내보내기
  const handleExport = () => {
    const headers = ['Schema', 'Table', 'Column', 'Type', 'Description'];
    const csvContent = [
      headers.join(','),
      ...piiData.map((row) =>
        [row.schema, row.table, row.column, row.type, row.description]
          .map((cell) => `"${cell}"`)
          .join(',')
      ),
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `PII_Report_${new Date().toISOString().split('T')[0]}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Exported Successfully',
      description: 'PII report downloaded as CSV',
    });
  };

  return (
    <div className="p-6 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Lock className="h-6 w-6 text-red-500" />
            PII Columns Report
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            All columns containing Personal Identifiable Information
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Summary Card */}
      <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-red-900 dark:text-red-100">Security Notice</h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              Found <span className="font-bold">{piiData.length}</span> PII columns across{' '}
              <span className="font-bold">{tablesWithPII}</span> tables
            </p>
          </div>
        </div>
      </div>

      {/* PII Table */}
      {piiData.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground w-[12%]">
                  Schema
                </th>
                <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground w-[20%]">
                  Table
                </th>
                <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground w-[20%]">
                  Column
                </th>
                <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground w-[13%]">
                  Type
                </th>
                <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground w-[35%]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {piiData.map((row, idx) => (
                <tr
                  key={`${row.fullTableName}-${row.column}-${idx}`}
                  className={cn(
                    'hover:bg-red-100/50 dark:hover:bg-red-900/20 transition-colors',
                    'bg-red-50/50 dark:bg-red-950/10'
                  )}
                >
                  <td className="p-3 text-sm text-muted-foreground">{row.schema}</td>
                  <td className="p-3 font-medium text-sm">
                    <button
                      onClick={() => onSelectTable(row.fullTableName)}
                      className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                    >
                      {row.table}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      <span className="font-mono text-sm">{row.column}</span>
                    </div>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{row.type}</td>
                  <td className="p-3 text-sm text-muted-foreground">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
            <Lock className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-lg font-medium">No PII Columns Found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your database schema doesn&apos;t contain any marked PII columns
          </p>
        </div>
      )}
    </div>
  );
}
