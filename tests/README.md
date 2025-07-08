# Tests

This directory contains all test files for the Heimdall Discord bot.

## Test Files

### `zipline-service.test.ts`

Comprehensive test suite for the ZiplineService class, testing:

- Constructor validation
- Token and URL validation
- Network connectivity tests
- Initialization patterns
- Error handling
- State management
- Concurrency scenarios

# Tests

This directory contains all test files for the Heimdall Discord bot using **Vitest**.

## Test Files

### `zipline-service.test.ts`

Comprehensive test suite for the ZiplineService class, testing:

- Constructor validation
- Token and URL validation
- Network connectivity tests
- Initialization patterns
- Error handling
- State management
- Concurrency scenarios

## Running Tests

### Interactive Test Runner (Recommended)

```bash
# Interactive mode - choose what to run
npm run test

# Watch mode - automatically re-run tests on file changes
npm run test:watch

# UI mode - web-based test interface (requires @vitest/ui)
npm run test:ui
```

### Specific Test Commands

```bash
# Run all tests once
npm run test:run

# Run only Zipline service tests
npm run test:zipline

# Watch Zipline service tests specifically
npm run test:zipline:watch
```

### Vitest CLI Features

When you run `npm run test` or `npm run test:watch`, you get an interactive CLI with options:

- **Press `f` to filter by filename**
- **Press `t` to filter by test name pattern**
- **Press `p` to filter by file path pattern**
- **Press `c` to clear filters**
- **Press `r` to re-run all tests**
- **Press `u` to update snapshots**
- **Press `q` to quit**

### Advanced Usage

```bash
# Run tests with specific pattern
npx vitest "zipline"

# Run tests in a specific file
npx vitest tests/zipline-service.test.ts

# Run with coverage
npx vitest --coverage

# Run tests matching a pattern with watch mode
npx vitest --watch "validation"
```

## Configuration

Tests require environment variables to be set in `.env` file:

- `ZIPLINE_BASEURL` - Your Zipline instance URL
- `ZIPLINE_TOKEN` - Your Zipline API token

Tests will automatically skip network-dependent tests if these variables are not configured.

## Adding New Tests

When adding new test files:

1. Place them in this `tests/` directory
2. Use the `.test.ts` naming convention
3. Update the package.json scripts section if needed
4. Document the test purpose in this README
