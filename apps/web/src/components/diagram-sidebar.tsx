'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Table, Link, Database } from 'lucide-react';
import type { DatabaseSchema } from '@biagram/shared';
import { useDiagramEngine } from '@/contexts/diagram-context';

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
  const diagramContext = useDiagramEngine();
  const { selectedEntityId, setSelectedEntityId, highlightedRelationshipId, setHighlightedRelationshipId } = diagramContext || {
    selectedEntityId: null,
    setSelectedEntityId: () => {},
    highlightedRelationshipId: null,
    setHighlightedRelationshipId: () => {}
  };

  const [expandedSections, setExpandedSections] = useState<{
    tables: boolean;
    relationships: boolean;
    enums: boolean;
  }>({
    tables: true,
    relationships: true,
    enums: true,
  });

  // Refs for table elements to enable scrolling
  const tableRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Scroll to selected table in sidebar
  useEffect(() => {
    if (selectedEntityId && tableRefs.current.has(selectedEntityId)) {
      const element = tableRefs.current.get(selectedEntityId);
      element?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
      console.log('📜 Sidebar: Scrolled to table', selectedEntityId);
    }
  }, [selectedEntityId]);

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

  // Check if viewing table detail
  const isTableSelected = selectedEntityId && !selectedEntityId.startsWith('rel:');

  // Render detailed table view
  if (isTableSelected) {
    const selectedTable = schema.tables.find(t => t.name === selectedEntityId);
    if (!selectedTable) {
      // Table not found, clear selection
      return renderSchemaOverview();
    }

    const relatedRelationships = schema.relationships.filter(
      rel => rel.fromTable === selectedEntityId || rel.toTable === selectedEntityId
    );

    return (
      <div className="h-full w-full border-l bg-background flex flex-col">
        <div className="border-b p-4">
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 h-auto p-1"
            onClick={() => setSelectedEntityId(null)}
          >
            ← Back to Overview
          </Button>
          <h3 className="text-sm font-medium">Table Details</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Table Info */}
          <div className="border-b p-4">
            <div className="flex items-center gap-2 mb-2">
              <Table className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-sm">{selectedTable.name}</h4>
            </div>
            {(selectedTable as any).note && (
              <p className="text-xs text-muted-foreground mb-2">
                {(selectedTable as any).note}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {selectedTable.columns.length} columns
            </p>
          </div>

          {/* All Columns */}
          <div className="border-b">
            <div className="p-3 bg-muted/50">
              <h5 className="text-xs font-medium uppercase text-muted-foreground">Columns</h5>
            </div>
            <div className="divide-y">
              {selectedTable.columns.map((column) => {
                const typeName = typeof column.type === 'string' ? column.type : (column.type as any)?.name;
                const isPK = (column as any).primaryKey || (column as any).isPrimaryKey || false;
                const isFK = (column as any).references || (column as any).isForeignKey || false;
                const isNotNull = (column as any).isNotNull || false;
                const isUnique = (column as any).isUnique || false;
                const columnNote = (column as any).note;

                return (
                  <div key={column.name} className="px-4 py-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-sm">{column.name}</span>
                      {columnNote && (
                        <span className="text-xs text-muted-foreground/70">
                          {columnNote}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 items-center mt-1">
                      <span className="text-xs text-muted-foreground">{typeName}</span>
                      {isPK && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">PK</span>}
                      {isFK && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">FK</span>}
                      {isNotNull && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">NOT NULL</span>}
                      {isUnique && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">UNIQUE</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Related Relationships */}
          <div>
            <div className="p-3 bg-muted/50">
              <h5 className="text-xs font-medium uppercase text-muted-foreground">
                Relationships ({relatedRelationships.length})
              </h5>
            </div>
            {relatedRelationships.length > 0 ? (
              <div className="divide-y">
                {relatedRelationships.map((rel, index) => {
                  const isOutgoing = rel.fromTable === selectedEntityId;
                  const otherTable = isOutgoing ? rel.toTable : rel.fromTable;
                  const relationshipId = rel.id || `rel-${index}`;

                  const isHighlighted = highlightedRelationshipId === relationshipId;

                  return (
                    <div
                      key={index}
                      className={`px-4 py-2 hover:bg-muted/50 cursor-pointer transition-colors ${
                        isHighlighted ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                      }`}
                      onClick={() => {
                        console.log('🔗 Relationship clicked from sidebar:', relationshipId);
                        setHighlightedRelationshipId(isHighlighted ? null : relationshipId);
                      }}
                    >
                      <div className={`text-xs font-medium ${isHighlighted ? 'text-primary' : ''}`}>
                        {isOutgoing ? '→' : '←'} {otherTable}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {rel.fromTable}.{rel.fromColumn} → {rel.toTable}.{rel.toColumn}
                      </div>
                      <div className="text-xs text-muted-foreground">{rel.type}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-3 text-xs text-muted-foreground">
                No relationships
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render schema overview (default)
  return renderSchemaOverview();

  function renderSchemaOverview() {
    if (!schema) return null;

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
              {schema.tables.map((table) => {
                const isSelected = selectedEntityId === table.name;
                return (
                  <div
                    key={table.name}
                    ref={(el) => {
                      if (el) {
                        tableRefs.current.set(table.name, el);
                      } else {
                        tableRefs.current.delete(table.name);
                      }
                    }}
                    className={`px-4 py-2 border-l-2 ${
                      isSelected
                        ? 'border-l-primary bg-primary/10'
                        : 'border-l-transparent hover:border-l-primary hover:bg-muted/50'
                    }`}
                  >
                    <div className={`font-medium text-sm ${isSelected ? 'text-primary' : ''}`}>
                      {table.name}
                    </div>
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
                );
              })}
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
              {schema.relationships.map((rel, index) => {
                const relationshipId = rel.id || `rel-${index}`;
                const isHighlighted = highlightedRelationshipId === relationshipId;

                return (
                  <div
                    key={index}
                    className={`px-4 py-2 border-l-2 cursor-pointer transition-colors ${
                      isHighlighted
                        ? 'bg-primary/10 border-l-primary'
                        : 'border-l-transparent hover:border-l-primary hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      console.log('🔗 Relationship clicked from overview:', relationshipId);
                      setHighlightedRelationshipId(isHighlighted ? null : relationshipId);
                    }}
                  >
                    <div className={`text-xs font-medium ${isHighlighted ? 'text-primary' : ''}`}>
                      {rel.fromTable}.{rel.fromColumn} → {rel.toTable}.{rel.toColumn}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {rel.type}
                    </div>
                  </div>
                );
              })}
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
}