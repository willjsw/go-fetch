# Sub-agent Hook Probe (GF-114 / SUB-1)

> **목적:** Sprint 3 애니메이션 모드의 **Layer 2(서브에이전트 트리 — "더 작은 Fetchy")** 구현 가능 여부를 **데이터로** 판정한다. 핵심 질문: *Claude Code가 서브에이전트 hook 페이로드에 부모 세션과 자식을 구분할 식별자(`agent_id`)를 실제로 실어 보내는가?*
>
> 추측으로 필드를 채워 Layer 2를 구현하지 않는다(CLAUDE.md / 콘텐츠 정책). 이 문서는 **실측 절차 + 판정 기준 + 결과 기록 템플릿**이며, 실제 수치는 아래 §4를 런타임에 채워 확정한다.

## 0. 배경 (왜 필요한가)

- 서브에이전트는 **부모 세션과 동일한 `session_id`를 공유**한다(공식 문서, 2026-06-10 확인). 현재 `SessionManager`는 `session_id` 단일 키 `HashMap`이라, 서브에이전트 이벤트가 들어오면 **부모 세션을 덮어쓴다** → 자식을 별도 노드로 분리 불가.
- 자식을 분리하려면 부모와 다른 식별자가 필요하다. 공식 hooks 문서는 `agent_id`를 "서브에이전트 호출 내부에서만 존재"한다고 기술하나, `SubagentStart`/`SubagentStop`의 **전체 JSON 예시가 문서에 없어** 페이로드 동봉 여부는 `[확인 불가]` 상태다. → **실측으로 확인해야 한다.**

## 1. GF-114에서 추가한 계측(instrumentation)

| 변경 | 파일 | 내용 |
|---|---|---|
| 이벤트 구독 | `src-tauri/src/hook_installer.rs` | `TOOL_AND_LIFECYCLE_EVENTS`에 `SubagentStart`/`SubagentStop` 추가(matcher 없음, Stop 계열과 동일). **SE-3 병합 보존** 경로 그대로 — GoFetch 항목만 추가/정리. |
| 페이로드 필드 | `src-tauri/src/server.rs` | `HookEvent`에 `agent_id: Option<String>` 추가. `#[serde(flatten)] extra: HashMap`로 **알려지지 않은 모든 raw 필드를 포착**(스키마 추측 없이 실제 동봉 필드 확인). |
| raw 덤프 | `src-tauri/src/server.rs` | `hook_event_name`이 `Subagent*`이거나 `agent_id`가 있으면 stderr에 `[gofetch][probe] subagent payload: ...` 로그(이벤트명·session_id·agent_id·agent_type·extra 키). 드물게 발생 → 비용 작음, DI-4 비차단 유지. |

> **상태 머신 불변:** `map_event_to_state`는 `SubagentStart`/`SubagentStop`을 매핑하지 않으므로(→ `Ignored`) **세션 상태/알림에 영향 없음**. 순수 관찰(읽기 전용). 서브에이전트 컨텍스트의 `PreToolUse`/`PostToolUse`는 기존대로 부모 세션을 갱신한다(알려진 한계, Layer 2에서 분리 예정).

## 2. 실측 절차 (런타임 — 개발자 수행)

1. **GoFetch 실행(로그 가시화):** `npm run tauri dev` 로 실행해 stderr를 터미널에서 본다. (릴리스 빌드면 Console.app에서 `gofetch` 필터.)
2. **hook 등록 확인:** 앱 시작 시 자동 등록된다. `~/.claude/settings.json`에 `SubagentStart`/`SubagentStop` 그룹이 `http://127.0.0.1:<PORT>/event` 핸들러로 들어갔는지 확인.
3. **서브에이전트 유발:** 임의 프로젝트에서 Claude Code 세션을 열고 **서브에이전트를 스폰하는 작업**을 시킨다(예: Task/Agent 도구를 쓰는 프롬프트, 또는 `/agents`로 정의된 subagent 호출).
4. **로그 캡처:** GoFetch stderr에서 `[gofetch][probe] subagent payload:` 라인을 수집한다. 다음 이벤트가 보여야 한다: `SubagentStart` → (서브에이전트 컨텍스트의 `PreToolUse`/`PostToolUse`, `agent_id` 포함 기대) → `SubagentStop`.

## 3. 판정 기준 (Layer 2 GO / NO-GO)

| 관측 | 판정 | 후속 |
|---|---|---|
| `SubagentStart`/`SubagentStop` **또는** 서브에이전트 컨텍스트 도구 이벤트에 **`agent_id` 동봉됨** | **GO** | Layer 2 구현: 메인 `sessions`와 **분리된 `subagents` 맵**에 `(session_id, agent_id)`로 자식 라우팅. 기존 5상태 엔진·정렬·알림 경로 **불변**(자식은 비알림 표시 전용). `tree.js`의 `buildForest`가 자식을 부모 아래에 부착. |
| `agent_id` **없음**(이벤트는 오나 식별자 부재) | **NO-GO(현 데이터)** | Layer 1 유지. Claude Code가 부모/자식 식별자를 노출할 때까지 보류. 대안으로 `transcript_path`의 `.../{sessionId}/subagents/agent-{agentId}.jsonl` 경로 파싱 가능성(읽기 전용)만 별도 조사. |
| `SubagentStart/Stop` 자체가 **수신 안 됨** | **재조사** | 이벤트명/버전 차이 가능. `claude --version` 및 공식 hooks 문서 이벤트 목록 재확인. |

## 4. 실측 결과 (런타임에 기록 — 현재 PENDING)

> ⚠️ 이 절은 **아직 채워지지 않았다.** GoFetch 실행 + 실제 서브에이전트 세션이 필요한 런타임 단계로, §2 절차 수행 후 아래 표를 채우고 §3 기준으로 판정을 확정한다.

| hook_event_name | agent_id 동봉 | agent_type | session_id(부모와 동일?) | extra 키(예상 외 필드) |
|---|---|---|---|---|
| `SubagentStart` | _( ?)_ | | | |
| `PreToolUse`(서브에이전트) | _( ?)_ | | | |
| `SubagentStop` | _( ?)_ | | | |

**판정:** _(GO / NO-GO / 재조사 — 미정)_

**근거 요약:** _(실측 후 1~2줄)_

## 5. 제약 준수 메모

- **SE-3:** 신규 이벤트 등록은 기존 병합 보존 로직 재사용(GoFetch 핸들러만 추가/정리). 사용자 hook 미훼손.
- **DI-4:** 프로브는 로그 전용. `/event`는 여전히 빈 바디 200 반환 → 세션 비차단.
- **읽기 전용 / PC-1·PC-2:** 세션에 명령 미전송, 페이로드는 로컬 stderr에만. 외부 전송 없음. (실측 로그에 경로/요약이 포함될 수 있으므로 공유 시 마스킹 권장.)
