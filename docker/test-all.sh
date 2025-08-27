#!/bin/bash

# Run all Docker multi-account tests

echo "🧪 Running Docker Multi-Account Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo ""
echo "1️⃣ Running Orchestrator Tests..."
echo "─────────────────────────────────"
cd orchestrator
npm run test:run
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Orchestrator tests passed${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}✗ Orchestrator tests failed${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
cd ..
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo ""
echo "2️⃣ Running Worker Tests..."
echo "─────────────────────────────────"
cd claude-worker
npm run test:run
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Worker tests passed${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}✗ Worker tests failed${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
cd ..
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo ""
echo "3️⃣ Running Integration Tests..."
echo "─────────────────────────────────"
# Check if vitest is installed in parent directory
if [ -f "../node_modules/.bin/vitest" ]; then
    ../node_modules/.bin/vitest run integration.test.js
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Integration tests passed${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ Integration tests failed${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
else
    echo "⚠️  Vitest not found in parent directory, skipping integration tests"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Results Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total Test Suites: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ All tests passed successfully!${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}❌ Some tests failed. Please review the errors above.${NC}"
    exit 1
fi