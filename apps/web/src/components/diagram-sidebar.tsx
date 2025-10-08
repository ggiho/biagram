'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Table, Link, Database } from 'lucide-react';
import type { DatabaseSchema } from '@biagram/shared';

import { Button } from '@/components/ui/button';

// Simplified schema type that matches tRPC parseDBML response
interface SimplifiedSchema {
  tables: Array<{
    id?: string;
    name: string;
    columns: Array<{
      name: string;
      type: string;
      isPrimaryKey?: boolean;
      isForeignKey?: boolean;
      isNotNull?: boolean;
      isUnique?: boolean;
    }>;
  }>;
  relationships: Array<{
    id?: string;
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    type: string;
  }>;
  enums?: Array<{
    name: string;
    values: string[];
  }>;
}

interface DiagramSidebarProps {
  schema: DatabaseSchema | SimplifiedSchema | null;
}

export function DiagramSidebar({ schema }: DiagramSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<{
    tables: boolean;
    relationships: boolean;
    enums: boolean;
  }>({
    tables: true,
    relationships: true,
    enums: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  if (!schema) {
    return (
      <div className="h-full w-full border-l bg-background">
        <div className="border-b p-4">
          <h3 className="text-sm font-medium">Schema Overview</h3>
        </div>
        <div className="p-4 text-center text-muted-foreground">
          <Database className="mx-auto h-8 w-8 mb-2" />
          <p className="text-sm">No schema loaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full border-l bg-background">
      <div className="border-b p-4">
        <h3 className="text-sm font-medium">Schema Overview</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {schema.tables.length} tables, {schema.relationships.length} relationships
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Tables Section */}
        <div className="border-b">
          <Button
            variant="ghost"
            className="w-full justify-start p-4 h-auto"
            onClick={() => toggleSection('tables')}
          >
            {expandedSections.tables ? (
              <ChevronDown className="h-4 w-4 mr-2" />
            ) : (
              <ChevronRight className="h-4 w-4 mr-2" />
            )}
            <Table className="h-4 w-4 mr-2" />
            <span className="text-sm font-medium">Tables ({schema.tables.length})</span>
          </Button>

          {expandedSections.tables && (
            <div className="pb-2">
              {schema.tables.map((table) => (
                <div key={table.name} className="px-4 py-2 border-l-2 border-l-transparent hover:border-l-primary hover:bg-muted/50">
                  <div className="font-medium text-sm">{table.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {table.columns.length} columns
                  </div>
                  <div className="mt-1">
                    {table.columns.slice(0, 3).map((column) => {
                      // Handle both DatabaseSchema format and SimplifiedSchema format
                      const typeName = typeof column.type === 'string' ? column.type : column.type?.name;
                      const isPK = (column as any).primaryKey || (column as any).isPrimaryKey || false;
                      const isFK = (column as any).references || (column as any).isForeignKey || false;

                      return (
                        <div key={column.name} className="text-xs text-muted-foreground">
                          • {column.name}: {typeName}
                          {isPK && ' (PK)'}
                          {isFK && ' (FK)'}
                        </div>
                      );
                    })}
                    {table.columns.length > 3 && (
                      <div className="text-xs text-muted-foreground">
                        ... {table.columns.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Relationships Section */}
        <div className="border-b">
          <Button
            variant="ghost"
            className="w-full justify-start p-4 h-auto"
            onClick={() => toggleSection('relationships')}
          >
            {expandedSections.relationships ? (
              <ChevronDown className="h-4 w-4 mr-2" />
            ) : (
              <ChevronRight className="h-4 w-4 mr-2" />
            )}
            <Link className="h-4 w-4 mr-2" />
            <span className="text-sm font-medium">Relationships ({schema.relationships.length})</span>
          </Button>

          {expandedSections.relationships && (
            <div className="pb-2">
              {schema.relationships.map((rel, index) => (
                <div key={index} className="px-4 py-2 border-l-2 border-l-transparent hover:border-l-primary hover:bg-muted/50">
                  <div className="text-xs font-medium">
                    {rel.fromTable}.{rel.fromColumn} → {rel.toTable}.{rel.toColumn}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {rel.type}
                  </div>
                </div>
              ))}
              {schema.relationships.length === 0 && (
                <div className="px-4 py-2 text-xs text-muted-foreground">
                  No relationships defined
                </div>
              )}
            </div>
          )}
        </div>

        {/* Enums Section */}
        {schema.enums && schema.enums.length > 0 && (
          <div className="border-b">
            <Button
              variant="ghost"
              className="w-full justify-start p-4 h-auto"
              onClick={() => toggleSection('enums')}
            >
              {expandedSections.enums ? (
                <ChevronDown className="h-4 w-4 mr-2" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-2" />
              )}
              <Database className="h-4 w-4 mr-2" />
              <span className="text-sm font-medium">Enums ({schema.enums.length})</span>
            </Button>

            {expandedSections.enums && (
              <div className="pb-2">
                {schema.enums.map((enumDef) => (
                  <div key={enumDef.name} className="px-4 py-2 border-l-2 border-l-transparent hover:border-l-primary hover:bg-muted/50">
                    <div className="font-medium text-sm">{enumDef.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {enumDef.values.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}