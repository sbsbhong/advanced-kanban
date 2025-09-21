# Advanced Kanban

Advanced Kanban is a quadrant-based board built with Next.js, React, and TypeScript. Cells support four-directional drag-and-drop, row and column resizing, and card management while keeping the layout responsive and accessible.

## Features

- Column and row resizing with minimum dimensions (`MIN_COL_PX = 140`, `MIN_ROW_PX = 80`).
- Quadrant drop targets (top, bottom, left, right) using `@hello-pangea/dnd` with visual feedback.
- Inline cell title editing, cell deletion with automatic span redistribution, and dynamic column removal.
- Per-cell card lists with add/remove actions and scrollable bodies.
- Runtime self-check badges ensuring layout invariants (column width sum, row fraction sum, span totals, and non-empty columns).
- Responsive 90vh board height with ResizeObserver updates and keyboard-accessible controls.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to interact with the board.

## Scripts

- `npm run dev` – start the development server with Turbopack.
- `npm run build` – create a production build.
- `npm run start` – run the production server.
- `npm run lint` – run ESLint with strict TypeScript settings.

## Tech Stack

- Next.js 15 (App Router) with React 19 and TypeScript in strict mode.
- `@hello-pangea/dnd` for drag-and-drop interactions.
- Tailwind CSS v4 utility classes for styling.
