#!/bin/bash
# Transcription validation script

echo "🔍 Running transcription validation..."

# Type checking
echo "1. Type checking..."
npm run type-check
if [ $? -ne 0 ]; then
  echo "❌ Type check failed"
  exit 1
fi

# Linting
echo "2. Linting..."
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ Lint check failed"
  exit 1
fi

# Unit tests
echo "3. Unit tests..."
npm run test:unit
if [ $? -ne 0 ]; then
  echo "❌ Unit tests failed"
  exit 1
fi

# Integration tests (if available)
echo "4. Integration tests..."
npm run test:integration
if [ $? -ne 0 ]; then
  echo "❌ Integration tests failed" 
  exit 1
fi

echo "✅ All validation checks passed!"