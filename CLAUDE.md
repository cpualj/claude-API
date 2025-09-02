# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Minimal UI Kit v7.2.0 - a React-based admin dashboard and template application built with Vite, Material-UI, and multiple authentication providers.

## Development Commands

### Starting Development
```bash
yarn dev
```
The dev server runs on port 3030 by default.

### Building for Production
```bash
yarn build
```

### Code Quality Commands
```bash
# Linting
yarn lint          # Check for linting errors
yarn lint:fix      # Auto-fix linting errors

# Formatting
yarn fm:check      # Check formatting
yarn fm:fix        # Auto-fix formatting

# Fix both linting and formatting
yarn fix:all
```

## Architecture Overview

### Core Structure
- **src/app.jsx**: Main application wrapper with authentication providers, theme, i18n, and global providers
- **src/main.jsx**: Entry point using React Router v7 with browser router
- **src/routes/**: Routing configuration using React Router v7
- **src/auth/**: Multi-provider authentication system (JWT, Firebase, Auth0, Amplify, Supabase)
- **src/theme/**: Material-UI theme configuration with RTL support and color presets
- **src/components/**: Reusable UI components organized by functionality
- **src/sections/**: Page-specific components and business logic
- **src/layouts/**: Different layout templates (dashboard, auth, main)

### Key Technologies
- **React 19.1.0** with Vite
- **Material-UI v7** for UI components
- **React Router v7** for routing
- **React Hook Form** with Zod for form validation
- **Framer Motion** for animations
- **i18next** for internationalization
- **Multiple Auth Providers**: JWT (default), Firebase, Auth0, Amplify, Supabase

### Authentication System
The app supports multiple authentication methods configured in `src/global-config.js`:
- Default method: JWT
- Auth provider is dynamically selected based on `CONFIG.auth.method`
- Each auth provider has its own context and implementation in `src/auth/context/`

### Import Organization
The project uses ESLint with perfectionist plugin for strict import ordering:
1. Style and side-effect imports
2. Type imports
3. Built-in and external libraries
4. MUI imports
5. Internal routes, hooks, utils
6. Components and sections
7. Auth-related imports

### Path Aliases
- `src/` is configured as an alias for absolute imports

### Mock Data
The app uses mock API data from `https://api-dev-minimal-[version].vercel.app` by default. Local mock data is available in `src/_mock/`.

## Important Patterns

### Component Structure
- Components are organized with barrel exports (index.js files)
- Heavy use of Material-UI's sx prop for styling
- Custom hooks for component logic (e.g., useTable, useCarousel)

### State Management
- Context API for global state (auth, settings, checkout)
- SWR for data fetching
- Local component state with React hooks

### Form Handling
- React Hook Form with custom field components in `src/components/hook-form/`
- Zod for schema validation
- Reusable form field components (RHFTextField, RHFSelect, etc.)

## Environment Variables
Key environment variables (create .env file if needed):
- `VITE_SERVER_URL`: API server URL
- `VITE_ASSETS_DIR`: Assets directory path
- `VITE_MAPBOX_API_KEY`: For map components
- Authentication provider-specific keys (Firebase, Auth0, Amplify, Supabase)

## Development Notes
- Node.js >= 20 required
- **Yarn is the REQUIRED package manager** (DO NOT use npm)
- ESLint runs automatically during development via vite-plugin-checker
- The project includes extensive UI components and examples
- Test framework: Vitest with unit tests for worker, backend, and frontend components

## Package Management
**IMPORTANT: This project uses Yarn exclusively. Do not use npm.**

### Installing Dependencies
```bash
yarn install
```

### Adding New Dependencies
```bash
yarn add <package-name>
yarn add -D <package-name>  # for dev dependencies
```

### Running Tests
```bash
yarn test              # Run tests in watch mode
yarn test:run          # Run tests once
yarn test:coverage     # Run tests with coverage report
yarn test:ui           # Run tests with UI
```

## Claude API Wrapper Project
This project includes a Claude API wrapper system with:
- Universal CLI wrapper for multiple CLI tools
- Claude SDK wrapper for API integration
- Admin interface for managing CLI tools
- WebSocket support for real-time communication
- Multi-account load balancing support

## Playwright MCP Best Practices for Large Pages
When working with n8n or other complex web interfaces that return large DOM snapshots:

### ✅ BEST: Use evaluate() method
```javascript
// Returns minimal data, avoids token limits
await page.evaluate(() => {
  // Direct DOM manipulation or simple data extraction
  return 'simple result';
});
```

### ❌ AVOID: snapshot() and complex click operations  
```javascript
// These can return 25000+ tokens and cause failures
await page.snapshot();
await page.click(...); // on complex pages
```

### 🎯 Debugging Strategy for Complex Workflows
- Use evaluate() to extract specific error messages from DOM
- Focus on getting exact error text rather than full page snapshots
- For n8n workflows: extract log messages and error details directly from error panels