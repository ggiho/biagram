'use client';

import { useState } from 'react';
import { Download, FileCode, FileJson, Image } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { exportAsPNG, exportAsDBML, exportAsJSON, sanitizeFilename } from '@/lib/export';

export type ExportFormat = 'png' | 'dbml' | 'json';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  schema: any;
  diagramName?: string;
}

export function ExportDialog({
  open,
  onOpenChange,
  code,
  schema,
  diagramName = 'Untitled Diagram',
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const getCanvas = (): HTMLCanvasElement | null => {
    // Find the canvas element in the diagram-canvas component
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      console.error('❌ Canvas element not found');
      return null;
    }

    // Debug: Check canvas dimensions and content
    console.log('🎨 Canvas found:', {
      width: canvas.width,
      height: canvas.height,
      styleWidth: canvas.style.width,
      styleHeight: canvas.style.height,
      hasContext: !!canvas.getContext('2d'),
    });

    // Check if canvas has any drawn content
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hasContent = imageData.data.some((value, index) => {
        // Check alpha channel (every 4th value)
        if (index % 4 === 3) {
          return value > 0;
        }
        return false;
      });
      console.log('🎨 Canvas has content:', hasContent);

      if (!hasContent) {
        console.warn('⚠️ Canvas appears to be blank!');
      }
    }

    return canvas;
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const baseFilename = sanitizeFilename(diagramName);

      switch (format) {
        case 'png': {
          const canvas = getCanvas();
          if (!canvas) {
            throw new Error('Canvas element not found. Please ensure the diagram is visible.');
          }

          // Force a render before exporting to ensure canvas has content
          const engine = (window as any).__diagramEngine;
          if (engine && typeof engine.render === 'function') {
            console.log('🔄 Forcing engine render before export...');
            engine.render();
            // Give it a moment to complete rendering
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          await exportAsPNG(canvas, `${baseFilename}.png`);
          break;
        }
        case 'dbml':
          exportAsDBML(code, `${baseFilename}.dbml`);
          break;
        case 'json':
          exportAsJSON(schema, `${baseFilename}.json`);
          break;
        default:
          throw new Error(`Unknown format: ${format}`);
      }

      toast({
        title: 'Export Successful',
        description: `Diagram exported as ${format.toUpperCase()}`,
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Diagram</DialogTitle>
          <DialogDescription>
            Choose a format to export your diagram
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
          <div className="space-y-3">
            <div className="flex items-start space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-accent transition-colors">
              <RadioGroupItem value="png" id="format-png" className="mt-0.5" />
              <Label htmlFor="format-png" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2 mb-1">
                  <Image className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">PNG Image</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  High-quality raster image suitable for sharing and embedding
                </p>
              </Label>
            </div>

            <div className="flex items-start space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-accent transition-colors">
              <RadioGroupItem value="dbml" id="format-dbml" className="mt-0.5" />
              <Label htmlFor="format-dbml" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2 mb-1">
                  <FileCode className="h-4 w-4 text-green-500" />
                  <span className="font-medium">DBML Source</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Database markup language source code
                </p>
              </Label>
            </div>

            <div className="flex items-start space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-accent transition-colors">
              <RadioGroupItem value="json" id="format-json" className="mt-0.5" />
              <Label htmlFor="format-json" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2 mb-1">
                  <FileJson className="h-4 w-4 text-purple-500" />
                  <span className="font-medium">JSON Data</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Structured schema data in JSON format
                </p>
              </Label>
            </div>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
