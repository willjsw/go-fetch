---
doc_type: Non-interference Verification (DI-4)
product: GoFetch
task: GF-13 (Task Master #8) — 비간섭 검증 (위젯 off 시 호스트 비블로킹)
date: 2026-06-09
status: design-guaranteed + harness-provided
related: docs/HOOK_SPEC_VERIFIED.md §6
---

# GoFetch — 비간섭(Non-interference) 검증 (DI-4)

> **요구사항 DI-4:** GoFetch 위젯이 꺼져 있어도 Claude Code 세션이 **절대 블로킹되면 안 된다.** "모니터는 호스트를 방해하면 안 된다."

DI-4는 두 측면에서 보장된다. (A)는 GoFetch가 통제하는 부분으로 **코드 테스트로 즉시 검증**되고, (B)는 Claude Code의 hook 실행기 동작으로 **공식 문서로 검증**되며 **실증 하네스**로 재확인할 수 있다.

---

## A. GoFetch 측 보장 (코드로 검증됨)

GoFetch 로컬 서버는 **읽기 전용**이며 차단 결정을 절대 반환하지 않는다.

- `POST /event` 성공 시 **`200 OK` + 빈 본문**을 반환한다. HTTP hook은 차단하려면 *"a 2xx response with a JSON body containing the appropriate decision fields"* 가 필요한데(HOOK_SPEC_VERIFIED §6), GoFetch는 **본문이 비어 있으므로** `Stop`·`PreToolUse` 같은 **차단 가능(blockable) 이벤트조차 막을 수 없다.**
- 잘못된 페이로드는 `400`(non-blocking error)을 반환한다.

**검증 (단위 테스트, `cargo test`):**
- `server::tests::event_response_has_no_blocking_decision` — `Stop` 이벤트에 `200` + **빈 본문** 어서션.
- `server::tests::malformed_payload_returns_bad_request` — 잘못된 JSON → `400`.
- 서버는 별도 스레드(`tauri::async_runtime`)에서 동작하며, 바인딩 실패·서버 에러를 **로깅만 하고 전파하지 않는다**(`server::run`).

---

## B. Claude Code 측 보장 (공식 문서 검증 + 실증 하네스)

GoFetch 위젯/서버가 **꺼져 있거나(연결 거부) · 느리거나(타임아웃) · 5xx**를 반환해도 Claude Code 턴은 멈추지 않는다.

**공식 문서 근거** (HOOK_SPEC_VERIFIED §6, `code.claude.com/docs/en/hooks`):
- *"Non-2xx status: non-blocking error, execution continues"*
- *"Connection failure or timeout: non-blocking error, execution continues"*
- *"HTTP status codes alone cannot block actions."*
- GoFetch가 구독하는 이벤트 다수(`Notification`, `StopFailure`, `PostToolUse`)는 **차단 불가(Cannot block)** 군이며, 차단 가능 이벤트(`Stop`, `PreToolUse`)도 위 (A)에 의해 GoFetch가 막을 수 없다.
- 추가로 hook은 짧은 `timeout: 5`로 등록되어(HOOK_SPEC_VERIFIED §4) 성공 경로 대기도 최소화된다.

**실증 하네스:** `scripts/verify-noninterference.sh`
- 격리된 임시 프로젝트에 다음 시나리오의 project-local hook을 등록하고 `claude -p` 턴 시간을 측정해 **임계 시간 내 정상(exit 0) 완료**를 확인한다. 실제 `~/.claude/settings.json`은 건드리지 않는다.
  - **down** — 리스너 없는 포트(연결 거부)
  - **slow** — hook 타임아웃을 초과해 sleep 하는 mock
  - **err5xx** — 500 반환 mock
  - **baseline** — hook 없음 (대조군)
- 요구사항: `claude` CLI, `python3`(slow/5xx mock). 실행: `bash scripts/verify-noninterference.sh`

> ⚠️ 실행 전 GoFetch 앱을 **종료**해 실제 hook이 동시에 발화하지 않도록 한다.

### 실증 결과 (개발자 머신에서 기입)

| 시나리오 | 턴 완료 시간 | exit | 판정 |
|---|---|---|---|
| baseline (hook 없음) | _기입_ | _기입_ | |
| down (연결 거부) | _기입_ | _기입_ | |
| slow (타임아웃) | _기입_ | _기입_ | |
| err5xx (500) | _기입_ | _기입_ | |

> 헤드리스 CI/리뷰 환경에서는 `claude` 대화 실행이 부적합하므로 (A) 코드 테스트 + (B) 공식 문서 근거로 DI-4를 보증하고, 위 표는 GUI/CLI 머신에서 하네스로 채운다.

---

## 결론

- **GoFetch는 어떤 응답으로도 호스트를 막을 수 없다**(읽기 전용, 빈 200 본문) — 코드로 검증.
- **GoFetch가 꺼져 있거나 비정상이어도 Claude Code는 진행된다** — 공식 문서로 검증 + 하네스로 재확인 가능.
- 따라서 **DI-4 충족.**
