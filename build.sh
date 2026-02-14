#!/bin/bash
set -e

echo "======================================"
echo "🧠 Building NeuroEdge Core"
echo "======================================"

echo "📦 Tidying modules..."
go mod tidy

echo "⚙️ Compiling kernel..."
GOOS=linux GOARCH=amd64 go build -o neuroedge ./kernel/cmd/neuroedge

echo "✅ Build completed successfully"
echo "Binary output: ./neuroedge"
