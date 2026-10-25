# Site updates

For every user-facing feature, improvement, or fix, append a new entry to SITE_CHANGELOG in public/user-app.js before publication. The user explicitly requires all future changes to appear in the admin section «Что нового?».

Keep existing entries and increment versions with one decimal digit (1.8 → 1.9 → 2.0; 2.9 → 3.0). Each entry must have author (Руслан for software changes, as explicitly requested by the user; content history uses the actual saving user’s profile name), version, actual date in Europe/Moscow (YYYY-MM-DD), concise Russian title and description, type (feature / improvement / fix), and priority (important / normal / minor). Do not invent historical changes or dates. Distinct meaningful changes should receive distinct entries. Internal packaging or unpublished intermediate commits do not need separate entries.

Keep the section available to the owner and editor. Validate changelog search, dates and numeric version ordering when changing its behavior.

The separate admin section «Обновление контента» automatically records successful /api/content saves. Preserve this audit trail and private owner/editor access. Do not manually fabricate retrospective content edits.

Admin content edits are drafts until the user explicitly presses «Сохранить». Preserve save/discard navigation prompts and window.apsuaAdminDirty / window.apsuaAdminSaving reload guards; do not reintroduce auto-saving of content. Operational actions such as sending a push or moderating a submission retain their explicit action buttons.

# Future server integration

The server must be authoritative for excursion prices, available dates, remaining seats, transfer dates, and submission/processing of all excursion and transfer requests. Fetch these values from server APIs and send applications to the server; do not use client-generated availability or hardcoded prices as confirmed inventory. Preserve honest loading/error states and await server acknowledgement before confirming submission. This is a future integration requirement; do not claim live seat inventory exists until implemented.
