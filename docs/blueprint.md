# GM Bot — Bot specification

**Archetype:** custom

A minimal Telegram bot that tracks daily 'Good Morning' interactions via an inline button. Users receive a friendly GM message on first tap per UTC day, with streak tracking and stats. Repeats within the same day show a non-intrusive callback confirmation to avoid spam.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Telegram users seeking lightweight daily interactions
- Individuals tracking personal streaks

## Success criteria

- Users can tap GM button and receive appropriate response
- Stats display accurate counts and streaks
- No chat spam from repeated button taps

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Show welcome message with GM button
- **GM** (button, actor: user, callback: gm:tap) — Trigger GM interaction flow
- **/stats** (command, actor: user, command: /stats) — Display user GM statistics
- **/help** (command, actor: user, command: /help) — Show command explanations

## Flows

### daily_gm_interaction
_Trigger:_ button:gm:tap

1. Check if user has GM'd today in UTC
2. If first GM: send greeting message and update stats
3. If repeat GM: show callback confirmation only

_Data touched:_ User, GM event, User stats

### stats_display
_Trigger:_ /stats

1. Retrieve user's GM count, streak, and last GM date
2. Format and send stats message

_Data touched:_ User stats

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram user identity and basic info
  - fields: telegram_id, first_name
- **GM event** _(retention: persistent)_ — Record of each GM interaction
  - fields: user_id, timestamp_utc
- **User stats** _(retention: persistent)_ — Aggregated GM statistics
  - fields: total_gm_count, last_gm_date_utc, current_streak_days

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure greeting message variants
- Adjust data retention policies
- Add group support if needed

## Permissions & privacy

- Store user telegram_id and first_name
- Track GM events and stats with UTC timestamps
- No third-party data sharing

## Edge cases

- User taps GM button multiple times in same UTC day
- User switches devices or re-adds the bot
- Streak calculation after long inactivity

## Required tests

- Verify /start shows GM button
- Confirm daily GM button tap behavior (first vs repeat)
- Validate /stats displays correct counts and streaks

## Assumptions

- Private chat only
- UTC day boundary for tracking
- Streak resets after >1 day gap
