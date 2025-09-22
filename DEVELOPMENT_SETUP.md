# Development Environment Setup

## Node.js Version Management

This project requires Node.js v22.19.0 for proper compatibility with native modules like better-sqlite3.

### Initial Setup

1. **Install the correct Node.js version:**
   ```bash
   nvm use 22.19.0
   ```

2. **Install dependencies:**
   ```bash
   yarn install
   ```

3. **If you encounter better-sqlite3 compilation errors:**
   ```bash
   npm rebuild better-sqlite3
   ```

### Common Issues

#### better-sqlite3 Node.js Version Mismatch

**Error:** `The module 'better-sqlite3.node' was compiled against a different Node.js version`

**Solution:**
1. Ensure you're using the correct Node.js version: `nvm use 22.19.0`
2. Rebuild the native module: `npm rebuild better-sqlite3`
3. Restart the development server

#### Unhandled Promise Rejections

The warnings about unhandled promise rejections are related to settings initialization and can be safely ignored during development. <mcreference link="https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode" index="0">0</mcreference>

### Development Commands

- **Start development server:** `yarn electron:serve`
- **Build for production:** `yarn build:vite`
- **Run tests:** `yarn test:unit`

### Environment Verification

After setup, verify your environment:
```bash
node --version  # Should output v22.19.0
yarn electron:serve  # Should start without better-sqlite3 errors
```