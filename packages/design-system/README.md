# `@linkpoint/design-system`

This package provides shared visual primitives, tokens, and theme definitions for Linkpoint Next, aligned with the **[Linkpoint Design Language](https://github.com/Kaleaon/linkpoint-design)** common reference frame.

- Theme JSON files in `themes/` are synchronized from `linkpoint-design/docs/` and conform to the app-neutral **Ktheme** schema.
- Community theme contributions live in `ktheme-pr/themes/community/` and follow the upstream contribution pipeline documented in `ktheme-pr/README.md`.
- Token mapping supports 24 Ktheme palette packs across four aesthetic families (Terminal & Neon, Console & Amber, Metal & Jewel, Daylight) and six interchangeable layout packs.

Do not edit synchronized JSON here without making the equivalent upstream design-source change in `linkpoint-design`. Components, accessibility behavior, and typed token adapters belong in `src/`.

The typed viewer adapter follows CleverFerret Design's revised black-field LCARS reference; this
intentionally differs from the unchanged imported Ktheme JSON. Shared split-frame geometry and
all-surface contrast correction live in `src/`. See `../../docs/DESIGN_LANGUAGE.md` for pinned
reference sources, adapter rules, and remaining native/typography validation.
