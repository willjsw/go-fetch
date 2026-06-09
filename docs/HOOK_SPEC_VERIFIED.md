---
doc_type: Hook Spec Verification (검증 결과)
product: GoFetch
task: GF-1 (Task Master #1) — Claude Code Hook 스펙 검증 및 문서화
verified_on: 2026-06-09
claude_code_version_tested: 2.1.169 (로컬 `claude --version`)
primary_source: https://code.claude.com/docs/en/hooks (Hooks reference) · https://code.claude.com/docs/en/hooks-guide (Hooks guide)
status: verified
supersedes_assumptions_in: GoFetch_PRD.md §4, docs/AI_SPEC.md §2 · §4
---

# GoFetch — Claude Code Hook 스펙 검증 결과 (HOOK_SPEC_VERIFIED)

> **목적.** PRD `§4`·AI_SPEC `§2/§4`의 hook 가정은 작성 시점(2026-06-09)에 **미검증(개념 예시)** 으로 명시돼 있었다 (CLAUDE.md "검증되지 않은 정보" 참조). 본 문서는 그 가정을 **현행 공식 문서로 검증**한 결과와, hook 관련 코드(Task 3·4·6·8) 착수 전 반드시 반영해야 할 **정정 사항**을 확정한다.
>
> 본 문서의 모든 사실 주장은 `code.claude.com` 공식 문서에서 인용 가능한 근거를 가진다. 근거를 찾지 못한 항목은 `[미확인]`으로 표기한다.

## 0. 검증 방법 (재현 가능)

1. **공식 문서 직접 fetch** — `https://code.claude.com/docs/en/hooks`(reference) 및 `/hooks-guide`(guide) 전문을 받아 원문 인용 추출.
2. **다중 에이전트 적대적 교차검증** — 8개 핵심 가정을 독립 에이전트가 "반박 우선(default refuted)" 원칙으로 재검증.
3. **이중 확인** — 1과 2의 결과가 일치하는 항목만 `검증됨`으로 확정. 불일치/근거 부재는 `미확인`.
4. 로컬 Claude Code 버전: **2.1.169** (`claude --version`).

> ⚠️ **버전 드리프트 주의.** Hook 시스템은 버전마다 빠르게 변한다. 본 문서는 2026-06-09 / v2.1.169 기준이다. 새 이벤트·필드 추가 가능성이 있으므로, 파서는 **미지의 이벤트/필드를 무시하고 graceful 하게 동작**해야 한다 (§5.4).

---

## 1. 가정 검증 결과 요약 (Verdict Table)

| # | PRD/AI_SPEC 가정 | 판정 | 근거 한 줄 |
|---|---|---|---|
| A1 | `StopFailure` 이벤트가 실존하며 에러 시 발생 | ✅ **검증됨** | reference 이벤트 표에 `StopFailure` 명시 ("When the turn ends due to an API error") |
| A2 | `"type": "http"` hook으로 URL에 이벤트 JSON을 POST | ✅ **검증됨** | 5개 hook 타입 중 `http` 존재. `http://localhost:8080/...` 예시 공식 수록 |
| A3 | hook에 `"async": true`로 백그라운드(non-blocking) 실행 | ⛔ **반박됨** | `async`/`asyncRewake`는 **command hook 전용**. HTTP hook 필드에 없음 |
| A4 | `Notification`이 `permission_prompt`/`idle_prompt`로 구분 | ✅ **검증됨** | guide matcher 표에 두 값 + 설명 명시 |
| A5 | 에러 타입 `rate_limit`/`overloaded`/`billing_error` 존재 | ✅ **검증됨** | `StopFailure` matcher(error type) 10종에 셋 다 포함 |
| A6 | 페이로드에 `session_id`/`cwd`/`transcript_path`/`tool_name`/`tool_input` | 🟡 **부분 검증** | 공통 4종 항상 존재. `tool_name`/`tool_input`은 **도구 이벤트에만** 존재 |
| A7 | hook은 기본 non-blocking → 위젯 off여도 세션 안 멈춤 (DI-4) | ✅ **검증됨** | HTTP "Connection failure or timeout: non-blocking error, execution continues" |
| A8 | `Stop`이 매 정상 턴 종료에 발생하며 "완료(Done)"의 신뢰 신호 | ⛔ **반박됨** | "Stop hooks fire whenever Claude finishes responding, **not only at task completion**" |

> **결론:** 핵심 아키텍처(HTTP hook → localhost 로컬 서버 → 상태 머신)는 **그대로 유효**하다. 단, **A3·A8 두 가정은 코드 착수 전 정정 필수**다(아래 §3·§4).

---

## 2. 검증된 Hook 이벤트 카탈로그

현행 reference가 정의하는 **이벤트 30종**(원문 순서):

```
SessionStart, Setup, UserPromptSubmit, UserPromptExpansion, PreToolUse,
PermissionRequest, PermissionDenied, PostToolUse, PostToolUseFailure, PostToolBatch,
Notification, MessageDisplay, SubagentStart, SubagentStop, TaskCreated, TaskCompleted,
Stop, StopFailure, TeammateIdle, InstructionsLoaded, ConfigChange, CwdChanged,
FileChanged, WorktreeCreate, WorktreeRemove, PreCompact, PostCompact,
Elicitation, ElicitationResult, SessionEnd
```

> PRD/AI_SPEC 작성 시점의 추정 이벤트명(`Notification`, `Stop`, `StopFailure`, `PreToolUse`, `PostToolUse`)은 **모두 실존**한다. (참고: 2026-01 이전 문서에는 9개 안팎만 있었으나 현행 v2.1.x는 30종으로 확장됨.)

### 2.1 GoFetch가 사용하는 이벤트 (검증된 발생 시점)

| 이벤트 | 공식 발생 시점 (원문) | GoFetch 용도 |
|---|---|---|
| `Notification` (matcher `permission_prompt`) | "Claude needs you to approve a tool use" | **Waiting(권한 대기)** — 최우선 (ST-2) |
| `Notification` (matcher `idle_prompt`) | "Claude is done and waiting for your next prompt" | **Waiting(다음 입력 대기) ≒ Done** (§3 참조) |
| `StopFailure` | "When the turn ends due to an API error. Output and exit code are ignored" | **Error** |
| `Stop` | "When Claude finishes responding" (**매 응답 종료**, 작업 완료 아님) | **턴 종료** 신호 (디바운스 필요) |
| `PreToolUse` / `PostToolUse` | "Before a tool call executes" / "After a tool call succeeds" | **Working** |
| `UserPromptSubmit` *(신규 권장)* | 사용자가 프롬프트 제출 시 | Waiting/Done → 활성 상태 **리셋** 신호 |

---

## 3. 정정된 상태 매핑 (핵심 디리스크 산출물)

### 3.1 ⛔ `Stop` ≠ 완료 (A8) — 가장 중요한 정정

- **원문:** *"`Stop` hooks fire whenever Claude finishes responding, **not only at task completion**. They do not fire on user interrupts. API errors fire StopFailure instead."* (hooks-guide)
- **PRD 오류:** PRD `§4.1`·상태표는 `Stop → Done(긴 작업이 정상 종료)`로 매핑. 실제로 `Stop`은 **모든 응답 턴 종료마다** 발생하므로, 매 `Stop`을 "완료!" 알림으로 쓰면 **알림 폭주**가 발생한다 (NT-1/NT-4 위배).
- **정정 매핑:**
  - **"Done(완료)" 알림은 `Stop` 단독으로 발화하지 않는다.** 대신:
    - (권장) **`Notification[idle_prompt]`** = "Claude is done and waiting for your next prompt" 를 "작업을 마치고 당신을 기다리는" 신뢰 신호로 사용.
    - 또는 **디바운스된 `Stop`**: 직전에 `Working`(도구 호출) 활동이 있었던 세션이 `Stop`으로 전환될 때만, 그리고 짧은 시간 내 연속 `Stop`은 1회로 합쳐 알림.
  - `UserPromptSubmit` 수신 시 해당 세션의 Waiting/Done 상태를 해제(활성 복귀)한다.

### 3.2 검증된 5상태 신호 매핑 (구현 기준)

| GoFetch 상태 | 우선순위 | 1차 신호(검증됨) | 비고 |
|---|---|---|---|
| Waiting (권한) | 1 | `Notification` + matcher `permission_prompt` | 정밀 신호. 즉시 알림 |
| Waiting (입력) | 1 | `Notification` + matcher `idle_prompt` | "끝나고 너를 기다림" = 사실상 완료/대기 경계 |
| Error | 2 | `StopFailure` (+ `error_type`) | 비차단 이벤트. 알림 |
| Done | 3 | **디바운스된 `Stop`** 또는 `idle_prompt` | `Stop` 단독 금지 (§3.1) |
| Working | 4 | `PreToolUse` / `PostToolUse` | `tool_name`/`tool_input`로 요약 |
| Idle | 5 | 위젯 타이머 (`Stop`/`idle_prompt` 후 무이벤트) | PRD대로 유효 |

---

## 4. 검증된 settings.json Hook 블록 (SE-3 / Task 6 기준)

### 4.1 ⛔ AI_SPEC `§4.1` 예시의 오류 2가지

1. **중첩 구조 누락.** 실제 구조는 `이벤트 → [ { matcher, hooks: [ {handler} ] } ]` 의 **2단 중첩**이다. AI_SPEC의 `"Notification": [{ "type":"http", ... }]` 처럼 handler를 직접 넣는 형태는 **무효**.
2. **`"async": true` 무효 (A3).** `async`는 command hook 전용. HTTP hook에 넣으면 무시되거나 검증 오류를 일으킬 수 있으므로 **넣지 않는다**. 비차단은 §6대로 **기본 보장**되며, 추가로 `timeout`을 짧게 설정해 성공 경로 지연만 줄인다.

### 4.2 검증된 GoFetch 등록 블록 (개념안, 구현 시 포트/matcher 확정)

```jsonc
// ~/.claude/settings.json — GoFetch가 병합 주입할 블록 (검증된 구조)
{
  "hooks": {
    "Notification": [
      { "matcher": "permission_prompt", "hooks": [{ "type": "http", "url": "http://localhost:<PORT>/event", "timeout": 5 }] },
      { "matcher": "idle_prompt",       "hooks": [{ "type": "http", "url": "http://localhost:<PORT>/event", "timeout": 5 }] }
    ],
    "StopFailure": [
      { "hooks": [{ "type": "http", "url": "http://localhost:<PORT>/event", "timeout": 5 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "http", "url": "http://localhost:<PORT>/event", "timeout": 5 }] }
    ],
    "PreToolUse": [
      { "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:<PORT>/event", "timeout": 5 }] }
    ],
    "PostToolUse": [
      { "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:<PORT>/event", "timeout": 5 }] }
    ]
  }
}
```

- **검증된 핸들러 필드 (http):** `type`(필수, `"http"`), `url`(필수), `headers`(선택, `$VAR` 보간), `allowedEnvVars`(선택), `timeout`(선택, 기본 600초), `if`/`statusMessage`(선택).
- **matcher 의미(검증됨):** `PreToolUse`/`PostToolUse`/`PostToolUseFailure`/`PermissionRequest`/`PermissionDenied`는 **도구명** 패턴(`Bash`, `Edit|Write`, `mcp__.*`); `Notification`은 **알림 타입**(`permission_prompt` 등). `Stop`/`StopFailure`는 matcher 그룹의 `matcher` 생략 가능.
- **병합 보존(SE-3):** 동일 핸들러는 공식적으로 **command 문자열/args 또는 URL 기준 자동 dedup**되지만, GoFetch는 자체 식별자(예: 전용 URL 경로 `/event`)로 자기 항목만 안전하게 추가/제거해야 한다.

---

## 5. 검증된 페이로드 스키마 (Task 3·4 파서 기준)

### 5.1 공통 입력 필드 (모든 이벤트, stdin/HTTP body JSON)

| 필드 | 설명(원문 근거) |
|---|---|
| `session_id` | "Current session identifier" — 세션 식별 (DI-3) |
| `transcript_path` | "Path to conversation JSON" — 심화 맥락 (DI-5) |
| `cwd` | "Current working directory when the hook is invoked" — 프로젝트 라벨 (DI-3) |
| `permission_mode` | `default`/`plan`/`acceptEdits`/`auto`/`dontAsk`/`bypassPermissions` (일부 이벤트만) |
| `effort` | `{ level: low|medium|high|xhigh|max }` |
| `hook_event_name` | "Name of the event that fired" — **이벤트 식별 필드명** |
| `agent_id` / `agent_type` | 서브에이전트 내부에서만 |

> 🟡 **정정 (A6):** AI_SPEC `§4.2` 내부 모델의 `"event"` 필드는 실제로 **`hook_event_name`**, `"matcher"`는 페이로드에 **없다**(설정에서 필터링용). Notification은 `notification_type`, StopFailure는 `error_type`로 구분.

### 5.2 이벤트별 추가 필드 (검증됨)

| 이벤트 | 추가 필드 |
|---|---|
| `PreToolUse` | `tool_name`, `tool_input` |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_output` |
| `PostToolUseFailure` | `tool_name`, `tool_input`, `error` |
| `Notification` | `notification_type`, `message` |
| `Stop` / `SubagentStop` | (응답 종료; 추가 필드 최소) |
| `StopFailure` | `error_type`(10종), `error_message` |

> `tool_name`/`tool_input`은 **도구 이벤트에만** 존재한다. 파서는 `hook_event_name`로 분기하고, 이벤트별 필드를 **모두 optional**로 두어 미존재 시 crash 하지 않아야 한다.

---

## 6. 비간섭(Non-blocking) 보장 — DI-4 (Task 8 기준)

검증된 HTTP hook 실패 처리(원문):

- *"Non-2xx status: non-blocking error, execution continues"*
- *"Connection failure or timeout: non-blocking error, execution continues"*
- *"Unlike command hooks, HTTP hooks cannot signal a blocking error through status codes alone. To block ... return a 2xx response with a JSON body containing the appropriate decision fields."*

**의미:**
- **GoFetch 위젯/서버가 꺼져 있거나(연결 거부)·느리거나(타임아웃)·5xx를 반환해도** Claude Code 세션은 **멈추지 않는다.** → DI-4 **기본 충족.**
- GoFetch 서버는 **차단 결정(`hookSpecificOutput`)을 절대 반환하지 않으므로**(읽기 전용) 어떤 응답을 해도 세션 흐름에 영향 없음.
- 추가로 `timeout`을 짧게(예: 5초) 설정해 **성공 경로의 hook 대기 시간**까지 최소화 권장(기본 600초).
- 또한 GoFetch가 구독하는 이벤트(`Notification`, `StopFailure`, `PostToolUse` 등)는 대부분 **차단 불가(Cannot block)** 군에 속해, 잘못 구현해도 세션을 막을 여지가 구조적으로 적다.

> ⚠️ `Stop`/`PreToolUse`는 **차단 가능(Blockable)** 이벤트다. GoFetch 서버는 이들에 대해서도 **반드시 비차단 응답(200 + 빈/무결정 본문)** 만 반환해 읽기 전용 불변식을 지킨다.

---

## 7. 버전 의존성 (PRD §6.3)

- 로컬 검증 버전: **v2.1.169**.
- 확인된 버전 노트: *"Command hooks run without a controlling terminal (v2.1.139+)"* — command hook은 `/dev/tty` 직접 출력 불가, JSON `terminalSequence` 사용. (GoFetch는 HTTP hook 사용이라 직접 영향 적음.)
- `[미확인]` hooks 시스템 및 개별 이벤트(`http` 타입, 30종 이벤트)의 **최초 도입 버전**은 공식 문서에 명시되지 않음 → **최소 지원 버전을 v2.1.169로 잠정 선언**하고, 배포 전 폭넓은 버전 매트릭스 점검 권장(PRD §6.3의 (a)안).

---

## 8. PRD/AI_SPEC 반영 필요 사항 (후속 태스크 입력)

| 정정 ID | 대상 | 내용 | 영향 태스크 |
|---|---|---|---|
| FIX-1 | PRD §4.1 / AI_SPEC §2.1 상태표 | `Stop → Done` 매핑을 `idle_prompt`/디바운스 `Stop` 기반으로 교체 | Task 4(상태머신), Task 7(알림) |
| FIX-2 | AI_SPEC §4.1 예시 | hook 블록을 **2단 중첩 구조**로, **`async` 제거** + `timeout` 추가 | Task 6(등록) |
| FIX-3 | AI_SPEC §4.2 내부 모델 | `event`→`hook_event_name`, `matcher` 제거, `notification_type`/`error_type` 추가 | Task 3(파서), Task 4 |
| FIX-4 | 신규 권장 | `UserPromptSubmit` 구독해 Waiting/Done 상태 해제 | Task 4 |
| FIX-5 | PRD §6.3 | 최소 지원 버전 v2.1.169 잠정 선언 | 배포 |

> 위 정정은 PRD/AI_SPEC ID 정합성을 위해 **본 검증 문서를 단일 진실원천(source of truth)** 으로 삼는다. 원문 PRD/AI_SPEC의 "검증 필요" 경고 블록은 본 문서로 해소된 것으로 간주한다.

---

## 부록 A. 인용 출처

- Hooks reference — https://code.claude.com/docs/en/hooks (이벤트 30종, 5개 hook 타입, 필드 표, 페이로드 스키마, 차단/비차단 표, HTTP 실패 처리)
- Hooks guide — https://code.claude.com/docs/en/hooks-guide (Notification matcher 표, `Stop` 시맨틱, HTTP hook 예시, 타임아웃)
- 로컬 CLI — `claude --version` → `2.1.169 (Claude Code)`

*검증 수행: 2026-06-09 · 공식 문서 직접 fetch + 다중 에이전트 적대적 교차검증 이중 확인.*
