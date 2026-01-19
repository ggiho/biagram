'use client';

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
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

/**
 * Accessible list item component with keyboard navigation
 */
interface AccessibleListItemProps {
  children: React.ReactNode;
  isSelected?: boolean;
  isHighlighted?: boolean;
  onClick: () => void;
  className?: string;
  ariaLabel?: string;
}

function AccessibleListItem({
  children,
  isSelected = false,
  isHighlighted = false,
  onClick,
  className = '',
  ariaLabel,
}: AccessibleListItemProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    },
    [onClick]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${className}`}
    >
      {children}
    </div>
  );
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
  
  // Focus management for keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

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

  // Keyboard navigation handler for list
  const handleListKeyDown = useCallback((
    e: KeyboardEvent<HTMLDivElement>,
    items: string[],
    onSelect: (item: string) => void
  ) => {
    if (items.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + items.length) % items.length);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(items.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          const item = items[focusedIndex];
          if (item) onSelect(item);
        }
        break;
    }
  }, [focusedIndex]);

  if (!schema) {
    return (
      <div className="h-full w-full border-l bg-background">
        <div className="border-b p-4">
          <h3 className="text-sm font-medium">Schema Overview</h3>
        </div>
        <div className="p-4 text-center text-muted-foreground">
          <Database className="mx-auto h-8 w-8 mb-2" aria-hidden="true" />
          <p className="text-sm">No schema loaded</p>
        </div>
      </div>
    );
  }

  // Check if viewing table or relationship detail
  const isTableSelected = selectedEntityId && !selectedEntityId.startsWith('rel:');
  const isRelationshipSelected = selectedEntityId && selectedEntityId.startsWith('rel:');

  // Render detailed relationship view
  if (isRelationshipSelected) {
    const relationshipId = selectedEntityId.replace('rel:', '');
    const selectedRel = schema.relationships.find(r => r.id === relationshipId);
    
    if (!selectedRel) {
      return renderSchemaOverview();
    }

    return (
      <div className="h-full w-full border-l bg-background flex flex-col">
        <div className="border-b p-4">
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 h-auto p-1"
            onClick={() => {
              setSelectedEntityId(null);
              setHighlightedRelationshipId(null);
            }}
          >
            ← Back to Overview
          </Button>
          <h3 className="text-sm font-medium">Relationship Details</h3>
        </div>

        <div className="flex-1 overflow-y-auto" role="region" aria-label="Relationship details">
          {/* Relationship Info */}
          <div className="border-b p-4">
            <div className="flex items-center gap-2 mb-3">
              <Link className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="font-semibold text-sm">
                {selectedRel.fromTable} → {selectedRel.toTable}
              </span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div><span className="font-medium">Type:</span> {selectedRel.type || 'one-to-many'}</div>
            </div>
          </div>

          {/* From Table */}
          <div className="border-b p-4">
            <h5 className="text-xs font-medium uppercase text-muted-foreground mb-2">From</h5>
            <AccessibleListItem
              onClick={() => setSelectedEntityId(selectedRel.fromTable)}
              className="p-2 rounded bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
              ariaLabel={`Go to table ${selectedRel.fromTable}`}
            >
              <div className="font-medium text-sm">{selectedRel.fromTable}</div>
              <div className="text-xs text-muted-foreground">
                Column: <span className="font-mono">{selectedRel.fromColumn}</span>
              </div>
            </AccessibleListItem>
          </div>

          {/* To Table */}
          <div className="border-b p-4">
            <h5 className="text-xs font-medium uppercase text-muted-foreground mb-2">To</h5>
            <AccessibleListItem
              onClick={() => setSelectedEntityId(selectedRel.toTable)}
              className="p-2 rounded bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
              ariaLabel={`Go to table ${selectedRel.toTable}`}
            >
              <div className="font-medium text-sm">{selectedRel.toTable}</div>
              <div className="text-xs text-muted-foreground">
                Column: <span className="font-mono">{selectedRel.toColumn}</span>
              </div>
            </AccessibleListItem>
          </div>
        </div>
      </div>
    );
  }

  // Render detailed table view
  if (isTableSelected) {
    // 테이블 찾기 - 스키마.테이블명 또는 테이블명으로 매칭
    const selectedTable = schema.tables.find(t => {
      const tableSchema = (t as any).schema;
      const fullName = tableSchema ? `${tableSchema}.${t.name}` : t.name;
      return t.name === selectedEntityId || fullName === selectedEntityId;
    });
    if (!selectedTable) {
      // Table not found, clear selection
      return renderSchemaOverview();
    }

    // 테이블명 매칭 헬퍼 함수 (스키마명 포함/미포함 둘 다 처리)
    const matchesTable = (relationTableName: string, selectedName: string) => {
      if (relationTableName === selectedName) return true;
      // 스키마.테이블명 형식에서 테이블명만 비교
      if (relationTableName.includes('.')) {
        const tableName = relationTableName.split('.').pop();
        if (tableName === selectedName) return true;
      }
      // selectedName이 스키마.테이블명 형식인 경우
      if (selectedName.includes('.')) {
        const tableName = selectedName.split('.').pop();
        if (tableName === relationTableName || relationTableName.endsWith(`.${tableName}`)) return true;
      }
      return false;
    };

    const relatedRelationships = schema.relationships.filter(
      rel => matchesTable(rel.fromTable, selectedEntityId!) || matchesTable(rel.toTable, selectedEntityId!)
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

        <div className="flex-1 overflow-y-auto" role="region" aria-label="Table details">
          {/* Table Info */}
          <div className="border-b p-4">
            <div className="flex items-center gap-2 mb-2">
              <Table className="h-4 w-4 text-primary" aria-hidden="true" />
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
            <div className="divide-y" role="list" aria-label="Table columns">
              {selectedTable.columns.map((column) => {
                const typeName = typeof column.type === 'string' ? column.type : (column.type as any)?.name;
                const isPK = (column as any).primaryKey || (column as any).isPrimaryKey || false;
                const isFK = (column as any).references || (column as any).isForeignKey || false;
                const isNotNull = (column as any).isNotNull || false;
                const isUnique = (column as any).isUnique || false;
                const columnNote = (column as any).note;

                return (
                  <div key={column.name} className="px-4 py-2" role="listitem">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-sm">{column.name}</span>
                      {columnNote && (
                        <span className="text-xs text-muted-foreground/70">
                          {columnNote}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 items-center mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{typeName}</span>
                      {isPK && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded" aria-label="Primary Key">PK</span>}
                      {isFK && <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded" aria-label="Foreign Key">FK</span>}
                      {isNotNull && <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 px-1.5 py-0.5 rounded">NOT NULL</span>}
                      {isUnique && <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded">UNIQUE</span>}
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
              <div className="divide-y" role="list" aria-label="Related relationships">
                {relatedRelationships.map((rel, index) => {
                  const isOutgoing = rel.fromTable === selectedEntityId;
                  const otherTable = isOutgoing ? rel.toTable : rel.fromTable;
                  const relationshipId = rel.id || `rel-${index}`;

                  const isHighlighted = highlightedRelationshipId === relationshipId;

                  return (
                    <AccessibleListItem
                      key={index}
                      isHighlighted={isHighlighted}
                      onClick={() => {
                        console.log('🔗 Relationship clicked from sidebar:', relationshipId);
                        setHighlightedRelationshipId(isHighlighted ? null : relationshipId);
                      }}
                      className={`px-4 py-2 hover:bg-muted/50 cursor-pointer transition-colors ${
                        isHighlighted ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                      }`}
                      ariaLabel={`${isOutgoing ? 'Outgoing' : 'Incoming'} relationship to ${otherTable}`}
                    >
                      <div className={`text-xs font-medium ${isHighlighted ? 'text-primary' : ''}`}>
                        {isOutgoing ? '→' : '←'} {otherTable}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {rel.fromTable}.{rel.fromColumn} → {rel.toTable}.{rel.toColumn}
                      </div>
                      <div className="text-xs text-muted-foreground">{rel.type}</div>
                    </AccessibleListItem>
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

        <div className="flex-1 overflow-y-auto" role="navigation" aria-label="Schema navigation">
          {/* Tables Section */}
          <div className="border-b">
          <Button
            variant="ghost"
            className="w-full justify-start p-4 h-auto"
            onClick={() => toggleSection('tables')}
            aria-expanded={expandedSections.tables}
            aria-controls="tables-list"
          >
            {expandedSections.tables ? (
              <ChevronDown className="h-4 w-4 mr-2" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            <Table className="h-4 w-4 mr-2" aria-hidden="true" />
            <span className="text-sm font-medium">Tables ({schema.tables.length})</span>
          </Button>

          {expandedSections.tables && (
            <div id="tables-list" className="pb-2 max-h-[40vh] overflow-y-auto" role="list" aria-label="Tables">
              {schema.tables.map((table, index) => {
                // 스키마.테이블 형식으로 표시
                const tableSchema = (table as any).schema;
                const displayName = tableSchema ? `${tableSchema}.${table.name}` : table.name;
                const isSelected = selectedEntityId === table.name || selectedEntityId === displayName;
                return (
                  <AccessibleListItem
                    key={displayName}
                    isSelected={isSelected}
                    onClick={() => {
                      console.log('📋 Table clicked from sidebar:', table.name);
                      setSelectedEntityId(isSelected ? null : table.name);
                    }}
                    className={`px-4 py-2 border-l-2 cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-l-primary bg-primary/10'
                        : 'border-l-transparent hover:border-l-primary hover:bg-muted/50'
                    }`}
                    ariaLabel={`Table ${displayName}, ${table.columns.length} columns`}
                  >
                    <div
                      ref={(el) => {
                        if (el) {
                          tableRefs.current.set(table.name, el);
                        } else {
                          tableRefs.current.delete(table.name);
                        }
                      }}
                    >
                      <div className={`font-medium text-sm ${isSelected ? 'text-primary' : ''}`}>
                        {displayName}
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
                  </AccessibleListItem>
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
            aria-expanded={expandedSections.relationships}
            aria-controls="relationships-list"
          >
            {expandedSections.relationships ? (
              <ChevronDown className="h-4 w-4 mr-2" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            <Link className="h-4 w-4 mr-2" aria-hidden="true" />
            <span className="text-sm font-medium">Relationships ({schema.relationships.length})</span>
          </Button>

          {expandedSections.relationships && (
            <div id="relationships-list" className="pb-2 max-h-[40vh] overflow-y-auto" role="list" aria-label="Relationships">
              {schema.relationships.map((rel, index) => {
                const relationshipId = rel.id || `rel-${index}`;
                const isHighlighted = highlightedRelationshipId === relationshipId;

                return (
                  <AccessibleListItem
                    key={index}
                    isHighlighted={isHighlighted}
                    onClick={() => {
                      console.log('🔗 Relationship clicked from overview:', relationshipId);
                      setHighlightedRelationshipId(isHighlighted ? null : relationshipId);
                      setSelectedEntityId(isHighlighted ? null : `rel:${relationshipId}`);
                    }}
                    className={`px-4 py-2 border-l-2 cursor-pointer transition-colors ${
                      isHighlighted
                        ? 'bg-primary/10 border-l-primary'
                        : 'border-l-transparent hover:border-l-primary hover:bg-muted/50'
                    }`}
                    ariaLabel={`Relationship from ${rel.fromTable}.${rel.fromColumn} to ${rel.toTable}.${rel.toColumn}`}
                  >
                    <div className={`text-xs font-medium ${isHighlighted ? 'text-primary' : ''}`}>
                      {rel.fromTable}.{rel.fromColumn} → {rel.toTable}.{rel.toColumn}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {rel.type}
                    </div>
                  </AccessibleListItem>
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
              aria-expanded={expandedSections.enums}
              aria-controls="enums-list"
            >
              {expandedSections.enums ? (
                <ChevronDown className="h-4 w-4 mr-2" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              <Database className="h-4 w-4 mr-2" aria-hidden="true" />
              <span className="text-sm font-medium">Enums ({schema.enums.length})</span>
            </Button>

            {expandedSections.enums && (
              <div id="enums-list" className="pb-2" role="list" aria-label="Enums">
                {schema.enums.map((enumDef) => (
                  <div 
                    key={enumDef.name} 
                    className="px-4 py-2 border-l-2 border-l-transparent hover:border-l-primary hover:bg-muted/50 transition-colors"
                    role="listitem"
                  >
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
