# UI revision 2

Based on the preserved first redesign source, descended from e64b2236cc8abad073e2f1091575190fdbad12e7.

Use the user-supplied Square screenshots/video as interaction references: one performance surface, spacious reports, chart-type controls and consistent panels. Keep the existing MarginFlow logo and deep green.

Add a reusable presentation-only chart component with Bars/Line/Area/Table views and accessible hover/focus/touch values. Consolidate the dashboard performance layout and use it for existing sales/GP data. Add visible sales period controls and modernise dialog transitions, headers/footers and filters. No backend, financial-input, schema, migration, permission or persistence changes. Chart selections are ephemeral UI state.

Preserve revision 1 and original source. Validate tests, safety gate, staging-mode build and synthetic browser interactions on desktop/mobile. No hosted deployment or customer credentials.
