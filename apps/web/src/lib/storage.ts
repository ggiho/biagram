/**
 * LocalStorage utility for persisting editor state
 */

const STORAGE_KEY = 'biagram_editor_draft';
const MAX_AGE_DAYS = 7;

export interface EditorDraft {
  code: string;
  history: string[];
  historyIndex: number;
  tablePositions?: Record<string, { x: number; y: number }>;
  timestamp: number;
}

/**
 * Save editor state to localStorage
 */
export function saveDraft(draft: Omit<EditorDraft, 'timestamp'>): void {
  try {
    const data: EditorDraft = {
      ...draft,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log('💾 Draft saved to localStorage');
  } catch (error) {
    console.error('❌ Failed to save draft:', error);
    // Handle quota exceeded error gracefully
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('⚠️ LocalStorage quota exceeded, clearing old data');
      clearDraft();
    }
  }
}

/**
 * Load editor state from localStorage
 */
export function loadDraft(): EditorDraft | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const draft: EditorDraft = JSON.parse(stored);

    // Check if draft is too old
    const ageInDays = (Date.now() - draft.timestamp) / (1000 * 60 * 60 * 24);
    if (ageInDays > MAX_AGE_DAYS) {
      console.log('🗑️ Draft expired, clearing');
      clearDraft();
      return null;
    }

    console.log('📂 Draft loaded from localStorage');
    return draft;
  } catch (error) {
    console.error('❌ Failed to load draft:', error);
    return null;
  }
}

/**
 * Clear draft from localStorage
 */
export function clearDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('🗑️ Draft cleared from localStorage');
  } catch (error) {
    console.error('❌ Failed to clear draft:', error);
  }
}

/**
 * Check if draft exists
 */
export function hasDraft(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}
