/**
 * Canvas hooks for DiagramCanvas component
 *
 * These hooks extract specific concerns from the DiagramCanvas component
 * to improve maintainability and testability.
 */

export { useRelationshipRouting } from './useRelationshipRouting';
export type { ExtendedRelationshipRenderData } from './useRelationshipRouting';
export { useTableLayout } from './useTableLayout';
export type { ExtendedTableStyle } from './useTableLayout';
export { useCanvasInteraction } from './useCanvasInteraction';
export { useCanvasSelection } from './useCanvasSelection';
