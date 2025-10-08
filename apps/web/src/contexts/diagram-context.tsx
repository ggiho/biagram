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
  onUndo: undefined,
  onRedo: undefined,
  canUndo: false,
  canRedo: false,
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

  return (
    <DiagramContext.Provider value={{
      engine,
      setEngine,
      selectedTool,
      setSelectedTool,
      showGrid,
      setShowGrid,
      onUndo,
      onRedo,
      canUndo,
      canRedo,
    }}>
      {children}
    </DiagramContext.Provider>
  );
};