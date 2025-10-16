'use client';

import { createContext, useContext, ReactNode, useState } from 'react';
import { DiagramEngine } from '@biagram/diagram-engine';

export type DiagramTool = 'select' | 'move';

interface DiagramContextType {
  engine: DiagramEngine | null;
  setEngine: (engine: DiagramEngine | null) => void;
  selectedTool: DiagramTool;
  setSelectedTool: (tool: DiagramTool) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  showComments: boolean;
  setShowComments: (show: boolean) => void;
  selectedEntityId: string | null;
  setSelectedEntityId: (id: string | null) => void;
  highlightedRelationshipId: string | null;
  setHighlightedRelationshipId: (id: string | null) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const DiagramContext = createContext<DiagramContextType>({
  engine: null,
  setEngine: () => {},
  selectedTool: 'select',
  setSelectedTool: () => {},
  showGrid: true,
  setShowGrid: () => {},
  showComments: true,
  setShowComments: () => {},
  selectedEntityId: null,
  setSelectedEntityId: () => {},
  highlightedRelationshipId: null,
  setHighlightedRelationshipId: () => {},
});

export const useDiagramEngine = () => {
  const context = useContext(DiagramContext);
  if (!context) {
    throw new Error('useDiagramEngine must be used within a DiagramProvider');
  }
  return context;
};

interface DiagramProviderProps {
  children: ReactNode;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export const DiagramProvider = ({ children, onUndo, onRedo, canUndo, canRedo }: DiagramProviderProps) => {
  const [engine, setEngine] = useState<DiagramEngine | null>(null);
  const [selectedTool, setSelectedTool] = useState<DiagramTool>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [showComments, setShowComments] = useState(true);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [highlightedRelationshipId, setHighlightedRelationshipId] = useState<string | null>(null);

  return (
    <DiagramContext.Provider value={{
      engine,
      setEngine,
      selectedTool,
      setSelectedTool,
      showGrid,
      setShowGrid,
      showComments,
      setShowComments,
      selectedEntityId,
      setSelectedEntityId,
      highlightedRelationshipId,
      setHighlightedRelationshipId,
      ...(onUndo && { onUndo }),
      ...(onRedo && { onRedo }),
      ...(canUndo !== undefined && { canUndo }),
      ...(canRedo !== undefined && { canRedo }),
    }}>
      {children}
    </DiagramContext.Provider>
  );
};