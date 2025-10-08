'use client';

interface DiagramCanvasProps {
  schema: any | null;
  className?: string;
}

export function DiagramCanvas({ schema, className }: DiagramCanvasProps) {
  return (
    <div className={`w-full h-full bg-white relative ${className || ''}`}>
      <canvas className="w-full h-full" style={{ display: 'block' }} />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center text-gray-500">
          <div className="text-lg mb-2">📊 Minimal Canvas</div>
          <p className="text-sm">Testing export functionality</p>
        </div>
      </div>
    </div>
  );
}