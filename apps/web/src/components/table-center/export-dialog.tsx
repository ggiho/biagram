'use client';

import { useState, useMemo } from 'react';
import { Download, FileSpreadsheet, FileText, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { TableSpecification } from '@biagram/shared';
import type { ExtendedSummary } from '@/types/table-center';

interface ExportDialogProps {
  specifications: TableSpecification[];
  tablesBySchema: Map<string, ExtendedSummary[]>;
}

type ExportFormat = 'csv' | 'xlsx';
type ExportScope = 'all' | 'schema';

export function ExportDialog({ specifications, tablesBySchema }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [scope, setScope] = useState<ExportScope>('all');
  const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const schemas = useMemo(() => Array.from(tablesBySchema.keys()), [tablesBySchema]);

  const toggleSchema = (schema: string) => {
    setSelectedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schema)) {
        next.delete(schema);
      } else {
        next.add(schema);
      }
      return next;
    });
  };

  const selectAllSchemas = () => {
    setSelectedSchemas(new Set(schemas));
  };

  const deselectAllSchemas = () => {
    setSelectedSchemas(new Set());
  };

  // 내보낼 테이블 필터링
  const getExportSpecs = () => {
    if (scope === 'all') return specifications;

    return specifications.filter((spec) => {
      const schema = spec.schemaName || 'No Schema';
      return selectedSchemas.has(schema);
    });
  };

  // 테이블 데이터 생성
  const generateTableData = (specs: TableSpecification[]) => {
    return specs.map((spec) => ({
      Schema: spec.schemaName || '-',
      Table: spec.tableName,
      Description: spec.description || '',
      Columns: spec.stats.columnCount,
      Relationships: spec.stats.relationshipCount,
      Indexes: spec.stats.indexCount,
      'Foreign Keys': spec.stats.foreignKeyCount,
      'PII Columns': spec.columns.filter((col) => col.description?.startsWith('*')).length,
      Partitions: spec.partitions?.length || 0,
    }));
  };

  // 컬럼 데이터 생성
  const generateColumnData = (specs: TableSpecification[]) => {
    return specs.flatMap((spec) =>
      spec.columns.map((col) => ({
        Schema: spec.schemaName || '-',
        Table: spec.tableName,
        Column: col.name,
        Type: col.type,
        'Primary Key': col.primaryKey ? 'Yes' : '',
        'Foreign Key': col.foreignKey ? 'Yes' : '',
        'Not Null': !col.nullable ? 'Yes' : '',
        Unique: col.unique ? 'Yes' : '',
        Default: col.defaultValue || '',
        PII: col.description?.startsWith('*') ? 'Yes' : '',
        Description: col.description?.startsWith('*')
          ? col.description.substring(1).trim()
          : col.description || '',
      }))
    );
  };

  // 인덱스 데이터 생성
  const generateIndexData = (specs: TableSpecification[]) => {
    return specs.flatMap((spec) =>
      (spec.indexes || []).map((idx) => ({
        Schema: spec.schemaName || '-',
        Table: spec.tableName,
        'Index Name': idx.name,
        Columns: idx.columns.join(', '),
        Unique: idx.unique ? 'Yes' : '',
        Type: idx.type || '',
      }))
    );
  };

  // 관계 데이터 생성
  const generateRelationshipData = (specs: TableSpecification[]) => {
    const relationships: Array<{
      Schema: string;
      'From Table': string;
      'From Column': string;
      'To Table': string;
      'To Column': string;
      Type: string;
    }> = [];

    specs.forEach((spec) => {
      // foreignKey가 있는 컬럼에서 관계 추출
      spec.columns.forEach((col) => {
        if (col.foreignKey) {
          relationships.push({
            Schema: spec.schemaName || '-',
            'From Table': spec.tableName,
            'From Column': col.name,
            'To Table': col.foreignKey.referencedTable,
            'To Column': col.foreignKey.referencedColumn,
            Type: `${col.foreignKey.onDelete || ''} / ${col.foreignKey.onUpdate || ''}`.trim() || '-',
          });
        }
      });
    });

    return relationships;
  };

  // CSV 내보내기
  const exportCSV = (data: Record<string, unknown>[], filename: string) => {
    if (data.length === 0) return;

    const firstRow = data[0];
    if (!firstRow) return;
    const headers = Object.keys(firstRow);
    const csvContent = [
      headers.join(','),
      ...data.map((row) =>
        headers
          .map((h) => {
            const cell = String(row[h] ?? '');
            // 쉼표, 줄바꿈, 따옴표가 있으면 이스케이프
            if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
              return `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
          })
          .join(',')
      ),
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // XLSX 내보내기
  const exportXLSX = (
    sheets: { name: string; data: Record<string, unknown>[] }[],
    filename: string
  ) => {
    const wb = XLSX.utils.book_new();

    sheets.forEach(({ name, data }) => {
      if (data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);

        // 컬럼 너비 자동 조정
        const firstRow = data[0];
        if (firstRow) {
          const colWidths = Object.keys(firstRow).map((key) => {
            const maxLen = Math.max(
              key.length,
              ...data.map((row) => String(row[key] ?? '').length)
            );
            return { wch: Math.min(maxLen + 2, 50) };
          });
          ws['!cols'] = colWidths;
        }

        XLSX.utils.book_append_sheet(wb, ws, name);
      }
    });

    XLSX.writeFile(wb, filename);
  };

  const handleExport = () => {
    const specs = getExportSpecs();

    if (specs.length === 0) {
      toast({
        title: 'No Data',
        description: 'No tables to export. Please select at least one schema.',
        variant: 'destructive',
      });
      return;
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const scopeStr = scope === 'all' ? 'All' : `${selectedSchemas.size}_Schemas`;

    const tableData = generateTableData(specs);
    const columnData = generateColumnData(specs);
    const indexData = generateIndexData(specs);
    const relationshipData = generateRelationshipData(specs);

    if (format === 'csv') {
      // CSV는 테이블 요약만 내보내기
      exportCSV(tableData, `Tables_${scopeStr}_${dateStr}.csv`);
      toast({
        title: 'Exported Successfully',
        description: `${specs.length} tables exported as CSV`,
      });
    } else {
      // XLSX는 여러 시트로 내보내기
      exportXLSX(
        [
          { name: 'Tables', data: tableData },
          { name: 'Columns', data: columnData },
          { name: 'Indexes', data: indexData },
          { name: 'Relationships', data: relationshipData },
        ],
        `Schema_Export_${scopeStr}_${dateStr}.xlsx`
      );
      toast({
        title: 'Exported Successfully',
        description: `${specs.length} tables exported as XLSX with 4 sheets`,
      });
    }

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Export Schema Data</DialogTitle>
          <DialogDescription>
            Export table specifications to CSV or Excel format
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Format</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormat('xlsx')}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-all',
                  format === 'xlsx'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <FileSpreadsheet className={cn(
                  'h-5 w-5',
                  format === 'xlsx' ? 'text-primary' : 'text-muted-foreground'
                )} />
                <div className="text-left">
                  <div className="font-medium text-sm">Excel (.xlsx)</div>
                  <div className="text-xs text-muted-foreground">Multiple sheets</div>
                </div>
              </button>
              <button
                onClick={() => setFormat('csv')}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-all',
                  format === 'csv'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <FileText className={cn(
                  'h-5 w-5',
                  format === 'csv' ? 'text-primary' : 'text-muted-foreground'
                )} />
                <div className="text-left">
                  <div className="font-medium text-sm">CSV</div>
                  <div className="text-xs text-muted-foreground">Tables summary</div>
                </div>
              </button>
            </div>
          </div>

          {/* Scope Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Scope</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setScope('all')}
                className={cn(
                  'p-3 rounded-lg border text-center transition-all',
                  scope === 'all'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div className="font-medium text-sm">All Tables</div>
                <div className="text-xs text-muted-foreground">{specifications.length} tables</div>
              </button>
              <button
                onClick={() => setScope('schema')}
                className={cn(
                  'p-3 rounded-lg border text-center transition-all',
                  scope === 'schema'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div className="font-medium text-sm">By Schema</div>
                <div className="text-xs text-muted-foreground">{schemas.length} schemas</div>
              </button>
            </div>
          </div>

          {/* Schema Selection (when scope is 'schema') */}
          {scope === 'schema' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Select Schemas</label>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllSchemas}
                    className="text-xs text-primary hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-xs text-muted-foreground">|</span>
                  <button
                    onClick={deselectAllSchemas}
                    className="text-xs text-primary hover:underline"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto border rounded-lg p-2 space-y-1">
                {schemas.map((schema) => {
                  const tables = tablesBySchema.get(schema) || [];
                  const isSelected = selectedSchemas.has(schema);
                  return (
                    <button
                      key={schema}
                      onClick={() => toggleSchema(schema)}
                      className={cn(
                        'w-full flex items-center justify-between p-2 rounded-md transition-colors text-left',
                        isSelected
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'h-4 w-4 rounded border flex items-center justify-center',
                          isSelected
                            ? 'bg-primary border-primary'
                            : 'border-muted-foreground'
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <span className="text-sm font-medium">{schema}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{tables.length} tables</span>
                    </button>
                  );
                })}
              </div>
              {selectedSchemas.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedSchemas.size} schema(s) selected, {
                    specifications.filter((s) => selectedSchemas.has(s.schemaName || 'No Schema')).length
                  } tables
                </p>
              )}
            </div>
          )}

          {/* Export Info */}
          {format === 'xlsx' && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <strong>Excel export includes:</strong>
              </p>
              <ul className="text-xs text-muted-foreground mt-1 ml-4 list-disc">
                <li>Tables - Summary of all tables</li>
                <li>Columns - All columns with types and constraints</li>
                <li>Indexes - All indexes with columns</li>
                <li>Relationships - Foreign key relationships</li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export {format.toUpperCase()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
