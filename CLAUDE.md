# Biagram - Claude AI Assistant Guide

Biagram는 DBML(Database Markup Language) 기반의 모던 데이터베이스
다이어그램 도구입니다.

## 📋 프로젝트 개요

### 기술 스택

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: tRPC, Next.js Route Handlers, Node.js 22
- **Database**: Drizzle ORM, PostgreSQL
- **Canvas**: Custom Canvas-based rendering engine
- **Editor**: Monaco Editor (DBML syntax)
- **Package Manager**: pnpm (workspace)

### 모노레포 구조

```
biagram/
├── apps/
│   └── web/                 # Next.js 메인 애플리케이션
├── packages/
│   ├── shared/              # 공유 타입 & 스키마
│   ├── dbml-parser/         # DBML 파싱 엔진
│   └── diagram-engine/      # Canvas 렌더링 엔진
├── tools/
│   └── eslint-config/       # 공유 ESLint 설정
└── scripts/                 # 개발 스크립트
```

## 🚀 개발 명령어

### 기본 개발 워크플로우

```bash
# 개발 서버 시작 (전체)
pnpm dev

# 웹 앱만 실행
pnpm dev --filter web
PORT=3000 pnpm dev --filter web
3000번 포트가 사용 중이라면 3001, 3002 올라가지 말고 3000번 서버를 kill하고 3000번만 사용

# 빌드
pnpm build

# 린트 & 타입체크
pnpm lint
pnpm type-check

# 테스트
pnpm test
```

### 패키지별 작업

```bash
# 특정 패키지에 의존성 추가
pnpm add <package> --filter=web
pnpm add <package> --filter=@biagram/shared
pnpm add <package> --filter=@biagram/diagram-engine

# 작업공간 루트에 의존성 추가
pnpm add <package> -w
```

## 🏗️ 아키텍처 가이드

### 핵심 컴포넌트

#### 1. DiagramEngine (`packages/diagram-engine/`)

- **Canvas 기반 렌더링** 시스템
- **ViewportManager**: 줌, 팬, 뷰포트 관리
- **InteractionManager**: 마우스/터치 이벤트 처리
- **CanvasRenderer**: 고성능 테이블/관계 렌더링

#### 2. Web App (`apps/web/`)

- **DiagramCanvas**: 메인 캔버스 컴포넌트
- **DiagramToolbar**: 줌, 도구 선택 UI
- **DiagramSidebar**: 스키마 개요 표시
- **CodeEditor**: Monaco 기반 DBML 편집기

#### 3. 데이터 플로우

```
DBML Code → tRPC parseDBML → TableRenderData → DiagramEngine → Canvas
```

### 주요 타입 정의

#### `TableRenderData` (diagram-engine)

```typescript
interface TableRenderData {
  id: string;
  name: string;
  bounds: Rectangle2D; // { x, y, width, height }
  columns: ColumnRenderData[];
  style: TableStyle;
  isSelected: boolean;
  isHovered: boolean;
}
```

#### `DatabaseSchema` (shared)

```typescript
interface DatabaseSchema {
  id: string;
  name: string;
  tables: Table[];
  relationships: Relationship[];
  enums: Enum[];
}
```

## 🔧 개발 가이드라인

### 코딩 컨벤션

- **TypeScript** 필수 사용
- **ESLint + Prettier** 설정 준수
- **React Hooks** 패턴 사용
- **tRPC** 타입 안전 API 통신

## 📋 개발 규칙

### 필수 규칙 (MUST)

#### 1. 파일 조작 전 읽기

```typescript
// ❌ 잘못된 방법
await Write({ file_path: './file.ts', content: newContent });

// ✅ 올바른 방법
const currentContent = await Read({ file_path: './file.ts' });
await Edit({ file_path: './file.ts', old_string: '...', new_string: '...' });
```

#### 2. 절대 경로 사용

```bash
# ❌ 상대 경로 사용 금지
./components/diagram-canvas.tsx

# ✅ 절대 경로 사용
/Users/giho/Projects/dbdiagram-clone/apps/web/src/components/diagram-canvas.tsx
```

#### 3. 기존 파일 우선 편집

- **NEVER** 새 파일 생성 (명시적 요청 시만 예외)
- **ALWAYS** 기존 파일 편집 우선
- **NEVER** 자동 커밋 (명시적 요청 시만)

#### 4. 프레임워크 패턴 준수

```typescript
// 기존 import 스타일 확인 후 사용
import { useState } from 'react'; // 기존 패턴 따르기
import type { ComponentProps } from './types'; // 타입 import 분리
```

### 권장 규칙 (SHOULD)

#### 1. 컴포넌트 구조

```typescript
'use client';  // Next.js App Router 컴포넌트

import { useState, useEffect, useCallback } from 'react';
import type { Props } from './types';

export function ComponentName({ prop }: Props) {
  // 1. State 선언
  const [state, setState] = useState<Type>(initialValue);

  // 2. Hooks
  useEffect(() => {
    // 사이드 이펙트
  }, [dependencies]);

  // 3. Event handlers
  const handleClick = useCallback(() => {
    // 이벤트 처리
  }, [dependencies]);

  // 4. Early returns
  if (loading) return <LoadingSpinner />;

  // 5. JSX 반환
  return (
    <div className="component-styles">
      {/* 내용 */}
    </div>
  );
}
```

#### 2. 에러 처리 패턴

```typescript
try {
  const result = await apiCall();
  console.log('✅ Success:', result);
  return result;
} catch (error) {
  console.error('❌ Error:', error);
  throw error;
}
```

#### 3. 로깅 컨벤션

```typescript
// 디버깅용 이모지 로그 패턴
console.log('🚀 Component: useEffect triggered');
console.log('✅ Success: Operation completed');
console.log('❌ Error: Problem description');
console.log('🔧 Debug: Variable values', { variable });
console.log('🎨 Render: Canvas drawing started');
console.log('📊 Data: Schema parsed', { tables, relationships });
```

### 금지 규칙 (MUST NOT)

#### 1. 코드 스타일

```typescript
// ❌ 금지: 불필요한 주석 추가
// This function handles click events
const handleClick = () => {
  /* */
};

// ❌ 금지: console.log 남발
console.log('debug1', 'debug2', 'debug3');

// ❌ 금지: any 타입 사용
const data: any = fetchData();
```

#### 2. 파일 구조

```bash
# ❌ 금지: 불필요한 문서 파일 생성
README_COMPONENT.md
DOCUMENTATION.md

# ❌ 금지: 임시 파일 방치
temp.ts
backup.tsx.old
```

#### 3. 보안

```typescript
// ❌ 금지: 민감 정보 로깅
console.log('API Key:', process.env.SECRET_KEY);

// ❌ 금지: 하드코딩된 설정
const DATABASE_URL = 'postgresql://user:pass@localhost/db';
```

### 프로젝트별 규칙

#### Biagram 특화 규칙

1. **Canvas 렌더링 최적화**

```typescript
// 필수: 렌더링 전 성능 체크
const startTime = performance.now();
renderCanvas();
console.log(`🎨 Render time: ${performance.now() - startTime}ms`);
```

2. **tRPC API 에러 처리**

```typescript
// 필수: 안전한 응답 반환
return {
  success: false,
  error: 'User-friendly error message',
  schema: null, // fallback 값 제공
};
```

3. **DBML 파싱 안전성**

```typescript
// 필수: 파싱 실패 시 빈 스키마 반환
if (!input.content?.trim()) {
  return {
    tables: [],
    relationships: [],
    enums: [],
    success: true,
    schema: { tables: [], relationships: [], enums: [] },
  };
}
```

4. **컴포넌트 Props 타입 안전성**

```typescript
// 필수: 호환성을 위한 Union 타입 사용
interface Props {
  schema: DatabaseSchema | SimplifiedSchema | null;
}

// 필수: 타입 가드 사용
const typeName =
  typeof column.type === 'string' ? column.type : column.type?.name;
```

### 테스트 규칙

#### 1. 실행 확인

```bash
# 필수: 변경 후 린트 및 타입체크 실행
pnpm lint
pnpm type-check

# 권장: 개발 서버 정상 동작 확인
PORT=3000 pnpm dev --filter web
```

#### 2. 브라우저 테스트

```typescript
// 필수: 콘솔 로그로 실행 경로 확인
console.log('🚀 DiagramCanvas useEffect triggered');
console.log('🔨 Creating DiagramEngine...');
console.log('📊 Schema received:', schema?.tables?.length);
```

### 워크플로우 규칙

#### 기능 개발 순서

1. **타입 정의** (`packages/shared/src/types/`)
2. **API 구현** (`apps/web/src/server/api/routers/`)
3. **UI 컴포넌트** (`apps/web/src/components/`)
4. **스타일링** (Tailwind CSS + shadcn/ui)
5. **테스트 & 디버깅**

#### 버그 수정 순서

1. **로그 확인** (브라우저 콘솔 + 서버 로그)
2. **재현 테스트**
3. **최소 변경 수정**
4. **회귀 테스트**

### 컴포넌트 패턴

```typescript
// React 컴포넌트 템플릿
'use client';

import { useState, useEffect } from 'react';
import type { ComponentProps } from './types';

export function ComponentName({ prop }: ComponentProps) {
  const [state, setState] = useState<Type>(initialValue);

  useEffect(() => {
    // 사이드 이펙트
  }, [dependencies]);

  return (
    <div className="component-styles">
      {/* JSX */}
    </div>
  );
}
```

### tRPC API 패턴

```typescript
// Router 정의 (apps/web/src/server/api/routers/)
export const apiRouter = createTRPCRouter({
  endpoint: publicProcedure.input(InputSchema).mutation(async ({ input }) => {
    // API 로직
    return { success: true, data: result };
  }),
});

// 클라이언트 사용
const { mutateAsync } = trpc.api.endpoint.useMutation();
const result = await mutateAsync(inputData);
```

## 🐛 디버깅 가이드

### 일반적인 문제들

#### 1. Canvas 렌더링 이슈

```bash
# 브라우저 개발자 도구에서 확인할 로그들
🚀 DiagramCanvas useEffect triggered
🔨 Creating DiagramEngine...
🔧 DiagramEngine.updateData called
🖼️ CanvasRenderer.render() called
```

#### 2. tRPC 연결 문제

```bash
# 서버 로그에서 확인
🟢 SERVER: parseDBML function called!
✅ AUTO-PARSE: Enabled with working tRPC
```

#### 3. 스키마 타입 불일치

- `DiagramSidebar`는 `DatabaseSchema` 또는 `SimplifiedSchema` 지원
- tRPC 응답 형식과 컴포넌트 기대 형식 확인

### 로그 패턴

```typescript
// 디버깅용 콘솔 로그 패턴
console.log('🚀 Component: Action description');
console.log('✅ Success: Operation completed');
console.log('❌ Error: Problem description');
console.log('🔧 Debug: Variable values', { variable });
```

## 📁 중요 파일 위치

### 설정 파일

- `package.json` - 루트 워크스페이스 설정
- `turbo.json` - Turborepo 빌드 설정
- `tsconfig.json` - TypeScript 설정
- `.eslintrc.js` - ESLint 설정

### 핵심 소스 파일

- `apps/web/src/components/diagram-canvas.tsx` - 메인 캔버스
- `apps/web/src/components/diagram-editor.tsx` - 에디터 레이아웃
- `apps/web/src/server/api/routers/diagrams.ts` - DBML 파싱 API
- `packages/diagram-engine/src/index.ts` - 다이어그램 엔진
- `packages/diagram-engine/src/renderers/canvas-renderer.ts` - 렌더러

### 스타일링

- `apps/web/src/app/globals.css` - 전역 스타일
- `apps/web/tailwind.config.js` - Tailwind 설정
- `apps/web/src/components/ui/` - shadcn/ui 컴포넌트

## 🔄 개발 워크플로우

### 새 기능 개발

1. **기능 설계**: 요구사항 분석 및 아키텍처 설계
2. **타입 정의**: `packages/shared/src/types/` 에서 타입 정의
3. **API 구현**: tRPC 라우터 및 스키마 작성
4. **UI 개발**: React 컴포넌트 및 스타일링
5. **테스트**: 단위/통합 테스트 작성
6. **문서화**: 코드 주석 및 README 업데이트

### 버그 수정

1. **재현**: 문제 상황 재현 및 로그 확인
2. **디버깅**: 개발자 도구 및 서버 로그 분석
3. **원인 분석**: 데이터 플로우 및 상태 관리 검토
4. **수정**: 최소한의 변경으로 문제 해결
5. **테스트**: 수정 사항 검증 및 회귀 테스트

### 성능 최적화

1. **측정**: 브라우저 Performance 탭 사용
2. **분석**: 렌더링 병목점 식별
3. **최적화**: 메모이제이션, 가상화, 지연 로딩 적용
4. **검증**: 성능 개선 효과 측정

## 🎯 프로젝트 목표

Biagram는 다음을 목표로 합니다:

- **직관적인 DBML 에디팅** 경험
- **실시간 협업** 기능
- **고성능 Canvas 렌더링**
- **타입 안전한** 전체 스택
- **확장 가능한** 아키텍처

## 📚 추가 리소스

- [DBML 문법](https://dbml.dbdiagram.io/docs/)
- [Next.js 문서](https://nextjs.org/docs)
- [tRPC 문서](https://trpc.io/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com/)

## 🧠 AI 어시스턴트 고도화 규칙

### 컨텍스트 보존 규칙

#### 1. 세션 상태 추적

```typescript
// 필수: 중요한 상태 변경 시 명시적 로깅
console.log('🔄 Context Update: DiagramEngine created');
console.log('📊 State: Tables loaded, count:', tables.length);
console.log('🎯 Current Tool:', selectedTool);
```

#### 2. 문제 재현 경로 문서화

```markdown
# 문제 재현 단계

1. 브라우저에서 http://localhost:3000 접속
2. DBML 코드 입력 → 파싱 확인
3. 다이어그램 캔버스 렌더링 확인
4. 도구바 버튼 클릭 → 기능 동작 확인
```

#### 3. 의존성 체인 추적

```typescript
// 필수: 컴포넌트 간 데이터 흐름 명시
DBML → tRPC parseDBML → SimplifiedSchema → DiagramCanvas → CanvasRenderer
```

### 예측적 디버깅 규칙

#### 1. 공통 오류 패턴 사전 검증

```bash
# 필수: 변경 전 확인 체크리스트
pnpm type-check  # 타입 오류 사전 발견
pnpm lint       # 코딩 컨벤션 준수
curl http://localhost:3000/api/trpc/diagrams.parseDBML  # API 연결 확인
```

#### 2. 크로스 브라우저 호환성

```typescript
// 필수: 브라우저별 이벤트 처리 차이 고려
const handleWheel = (e: WheelEvent) => {
  e.preventDefault(); // Safari 호환성
  // Chrome: e.deltaY, Firefox: e.detail 차이 고려
};
```

### 성능 모니터링 규칙

#### 1. 렌더링 성능 추적

```typescript
// 필수: 캔버스 렌더링 성능 측정
const startTime = performance.now();
engine.render();
const renderTime = performance.now() - startTime;
if (renderTime > 16) {
  // 60fps 기준
  console.warn('⚠️ Slow render:', renderTime.toFixed(2), 'ms');
}
```

#### 2. 메모리 사용량 모니터링

```typescript
// 권장: 대용량 다이어그램 처리 시
const heapUsed = (performance as any).memory?.usedJSHeapSize;
if (heapUsed > 100 * 1024 * 1024) {
  // 100MB 초과
  console.warn(
    '🚨 High memory usage:',
    (heapUsed / 1024 / 1024).toFixed(1),
    'MB'
  );
}
```

### 사용자 경험 개선 규칙

#### 1. 진행 상황 피드백

```typescript
// 필수: 긴 작업에 대한 사용자 피드백
const parseDBML = async (content: string) => {
  console.log('🔄 Parsing DBML...');
  setLoadingState('parsing');
  // 작업 수행
  console.log('✅ DBML parsed successfully');
  setLoadingState('idle');
};
```

#### 2. 오류 복구 가이드 제공

```typescript
// 필수: 사용자 친화적 오류 메시지
catch (error) {
  console.error('❌ Canvas Error:', error);
  // 복구 방법 제시
  showErrorMessage('캔버스 초기화 실패. 페이지를 새로고침하거나 브라우저를 다시 시작해보세요.');
}
```

### 협업 효율성 규칙

#### 1. 변경 사항 영향도 평가

```markdown
# 변경 영향도 체크리스트

- [ ] TypeScript 타입 호환성
- [ ] React 컴포넌트 props 인터페이스
- [ ] tRPC API 스키마 변경
- [ ] Canvas 렌더링 로직 변경
- [ ] 사용자 인터렉션 플로우 변경
```

#### 2. 코드 리뷰 자동화

```typescript
// 필수: 변경 전 자체 검증
const validateChange = () => {
  // 1. 기존 테스트 통과 확인
  // 2. 새로운 기능 동작 확인
  // 3. 성능 회귀 없음 확인
  // 4. 사용자 워크플로우 영향 없음 확인
};
```

### 기술 부채 관리 규칙

#### 1. TODO 주석 체계화

```typescript
// TODO-HIGH: 성능 크리티컬 이슈 (1주 내 수정)
// TODO-MED: 기능 개선 사항 (1개월 내 수정)
// TODO-LOW: 코드 정리 (다음 리팩터링 시 수정)
// FIXME: 알려진 버그 (즉시 수정 필요)
```

#### 2. 의존성 업데이트 전략

```bash
# 필수: 의존성 변경 시 영향도 평가
pnpm audit                    # 보안 취약점 확인
pnpm outdated                # 업데이트 가능한 패키지 확인
pnpm why @package/name       # 의존성 트리 분석
```

### 보안 강화 규칙

#### 1. 입력 데이터 검증

```typescript
// 필수: DBML 입력 검증
const validateDBML = (content: string): boolean => {
  if (!content?.trim()) return false;
  if (content.length > 10000) return false; // DoS 방지
  // SQL injection 패턴 검사
  const dangerousPatterns = /DROP|DELETE|INSERT|UPDATE|EXEC/gi;
  return !dangerousPatterns.test(content);
};
```

#### 2. XSS 방지

```typescript
// 필수: 사용자 입력 표시 시 이스케이프
const sanitizeTableName = (name: string): string => {
  return name.replace(/[<>\"'&]/g, char => {
    const entityMap = {
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '&': '&amp;',
    };
    return entityMap[char] || char;
  });
};
```

## 🚀 AI 효율성 극대화 가이드

### 1. 상황 인식 능력 향상

- **현재 작업 컨텍스트** 항상 유지
- **이전 오류 패턴** 기억 및 회피
- **사용자 선호도** 학습 및 적용

### 2. 예측적 문제 해결

- **잠재적 충돌** 사전 감지
- **호환성 이슈** 미리 확인
- **성능 병목** 예방적 최적화

### 3. 효율적 소통 패턴

- **문제 정의** → **해결 방안** → **검증 방법** → **실행**
- **변경 사항** 명확한 설명과 이유 제시
- **오류 발생 시** 원인 분석과 해결책 동시 제공

---

이 가이드는 Claude AI가 Biagram 프로젝트를 효율적으로 이해하고 기여할 수
있도록 작성되었습니다.

