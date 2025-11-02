'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, FileEdit, ArrowRight } from 'lucide-react';
import { refactorTableName, getRefactorSummary, type RefactorPreview } from '@/lib/dbml-refactor';

interface TableRenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTableName: string;
  dbmlCode: string;
  onRename: (newCode: string, newTableName: string) => void;
}

export function TableRenameDialog({
  open,
  onOpenChange,
  currentTableName,
  dbmlCode,
  onRename,
}: TableRenameDialogProps) {
  const [newTableName, setNewTableName] = useState('');
  const [changes, setChanges] = useState<RefactorPreview[]>([]);
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    if (open) {
      setNewTableName(currentTableName);
      setChanges([]);
    }
  }, [open, currentTableName]);

  // 실시간 변경사항 미리보기
  useEffect(() => {
    if (!newTableName || newTableName === currentTableName) {
      setChanges([]);
      setIsValid(true);
      return;
    }

    // 테이블 이름 유효성 검사
    const isValidName = /^[\w.]+$/.test(newTableName);
    setIsValid(isValidName);

    if (isValidName) {
      const result = refactorTableName(dbmlCode, currentTableName, newTableName);
      setChanges(result.changes);
    }
  }, [newTableName, currentTableName, dbmlCode]);

  const handleRename = () => {
    if (!isValid || !newTableName || newTableName === currentTableName) {
      return;
    }

    const result = refactorTableName(dbmlCode, currentTableName, newTableName);
    
    if (result.success) {
      onRename(result.newCode, newTableName);
      onOpenChange(false);
    }
  };

  const summary = getRefactorSummary(changes);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="h-5 w-5" />
            Rename Table
          </DialogTitle>
          <DialogDescription>
            테이블 이름을 변경하면 관련된 모든 참조가 자동으로 업데이트됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 현재 이름 → 새 이름 */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>Current Name</Label>
              <div className="mt-1 rounded-md border bg-muted/50 px-3 py-2 text-sm">
                {currentTableName}
              </div>
            </div>
            
            <ArrowRight className="h-4 w-4 text-muted-foreground mt-6" />
            
            <div className="flex-1">
              <Label htmlFor="new-name">New Name</Label>
              <Input
                id="new-name"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="Enter new table name"
                className={!isValid ? 'border-red-500' : ''}
                autoFocus
              />
              {!isValid && (
                <p className="text-xs text-red-500 mt-1">
                  유효한 테이블 이름을 입력하세요 (영문, 숫자, _, . 만 가능)
                </p>
              )}
            </div>
          </div>

          {/* 변경 요약 */}
          {changes.length > 0 && (
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {summary}
                  </p>
                  
                  {/* 변경사항 미리보기 */}
                  <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                    {changes.map((change, index) => (
                      <div
                        key={index}
                        className="rounded border bg-white dark:bg-gray-900 p-2 text-xs"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-muted-foreground">Line {change.lineNumber}</span>
                          <span className="rounded bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 text-blue-700 dark:text-blue-300">
                            {change.type}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="text-red-600 dark:text-red-400 line-through">
                            - {change.oldText.trim()}
                          </div>
                          <div className="text-green-600 dark:text-green-400">
                            + {change.newText.trim()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {changes.length === 0 && newTableName !== currentTableName && isValid && (
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-4">
              <p className="text-sm text-amber-900 dark:text-amber-100">
                ⚠️ 이 테이블을 참조하는 관계가 없습니다. 테이블 선언만 변경됩니다.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleRename}
            disabled={!isValid || !newTableName || newTableName === currentTableName}
          >
            Rename {changes.length > 0 && `(${changes.length} changes)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
