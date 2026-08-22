# Examples

English | [中文](README.zh.md)

Recipes for driving a Volcengine cloud phone from DeepSeek Harness. Each recipe is a prompt you paste into your Harness chat — the agent picks the tools itself. Configure the plugin first (see the [Quick start](../README.md#quick-start)).

Contents:

- [1. App regression walkthrough](#1-app-regression-walkthrough)
- [2. App store competitive scan](#2-app-store-competitive-scan)
- [3. Cross-app data handoff](#3-cross-app-data-handoff)
- [4. Headless script](#4-headless-script)
- [Tips](#tips)

---

## 1. App regression walkthrough

Drive a multi-step flow end to end and keep a recording as evidence. Good for smoke-testing a build before release.

**Requires:** TOS bucket, endpoint, and region configured (recording needs them).

**Prompt:**

```
Run a regression pass on the cloud phone and record it:

1. Open the app "MyShop".
2. Sign up with a fresh phone number, using 000000 as the SMS code.
3. Add the first item on the home page to the cart.
4. Go to the cart and start checkout, but stop before paying.

Start the task with screen recording enabled. Poll the status until the run
finishes, then report: which step failed if any, what the final screen showed,
and the recording location.
```

**What the agent does:** calls `mobile_use_start_task` with `screen_record: true` and a descriptive `run_name`, polls `mobile_use_get_status`, then reads `mobile_use_get_result`.

**Variations**

- Raise the step budget for long flows: set *Max steps* to 200–300 in settings.
- Repeat with different data by asking for several runs, each with its own `run_name`.

---

## 2. App store competitive scan

Extract ranking or pricing data that is only visible inside a mobile app.

**Prompt:**

```
On the cloud phone, open the app store, search for "habit tracker", and report
the top 5 results: app name, developer, rating, and whether it shows ads or
in-app purchases. Return the data as a markdown table.
```

**What the agent does:** one `mobile_use_start_task`, then polls and reports. No TOS needed since nothing is recorded.

**Variations**

- Track changes over time by scheduling the same prompt daily and diffing results.
- Add `Also open the top result and summarise its screenshots gallery.` to go one level deeper.

---

## 3. Cross-app data handoff

Verify that data survives a trip between two apps — the kind of flow that is painful to script and easy to describe.

**Prompt:**

```
On the cloud phone:

1. Open Notes and create a note titled "handoff-check" with the body "42".
2. Copy the note body.
3. Open the browser, go to example.com, and paste the copied text into the
   search box without submitting.
4. Report whether the pasted text is exactly "42".

If any step cannot be completed, stop and tell me which one and why.
```

**What the agent does:** a single run covers both apps; Mobile Use handles the app switch internally. The explicit "stop and tell me" instruction keeps failures diagnosable instead of silently retried.

**Variations**

- Swap in your own apps: share sheet targets, clipboard-based flows, deep links.
- Add `Take note of the exact wording of any permission dialog you hit.` to catch first-run permission prompts.

---

## 4. Headless script

`headless-run.mjs` calls the same three Mobile Use operations directly, without Harness or a model. Use it to confirm credentials, Product Id, and PodId are right before debugging anything at the agent layer.

```sh
VOLC_ACCESSKEY=your-access-key \
VOLC_SECRETKEY=your-secret-key \
OS_AGENT_PRODUCT_ID=your-product-id \
OS_AGENT_POD_ID=your-pod-id \
node headless-run.mjs "Open Settings and report the Android version"
```

Optional environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `OS_AGENT_MAX_STEPS` | `100` | Step budget for the run (1–500) |
| `OS_AGENT_TIMEOUT` | `120` | Run timeout in seconds (1–86,400) |
| `OS_AGENT_SYSTEM_PROMPT` | *(empty)* | Extra instruction passed to Mobile Use |
| `OS_AGENT_POLL_INTERVAL` | `5` | Seconds between status polls |
| `OS_AGENT_POLL_LIMIT` | `60` | Maximum number of polls before giving up |

The script prints the `RunId`, one line per poll, and the final result payload. It exits non-zero on API errors, so it also works as a CI smoke check.

---

## Tips

- **Be explicit about stopping.** Tell the agent what *not* to do (`stop before paying`) — cloud phones will happily complete a purchase.
- **Name your runs.** Passing `run_name` makes runs easy to find later in the Volcengine console.
- **Continue a session.** Pass the previous `thread_id` when a follow-up task should keep the earlier context.
- **Budget steps realistically.** The default 100 steps suits short flows; long regressions need more, and a too-small budget looks like a mysterious early stop.
- **Never put credentials in a prompt.** The plugin resolves them from the credential store; the system prompt already tells the model not to invent them.
