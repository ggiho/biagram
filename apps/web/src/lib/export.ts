/**
 * Export utility functions for diagram export functionality
 */

/**
 * Export canvas as PNG image
 */
export async function exportAsPNG(
  canvas: HTMLCanvasElement,
  filename: string = 'diagram.png'
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create image blob'));
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve();
      }, 'image/png', 1.0);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Export DBML source code
 */
export function exportAsDBML(
  code: string,
  filename: string = 'schema.dbml'
): void {
  const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export schema as JSON
 */
export function exportAsJSON(
  schema: any,
  filename: string = 'schema.json'
): void {
  const json = JSON.stringify(schema, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export DDL SQL script
 */
export function exportAsDDL(
  ddl: string,
  filename: string = 'schema.sql'
): void {
  const blob = new Blob([ddl], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Get sanitized filename from diagram name
 */
export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
