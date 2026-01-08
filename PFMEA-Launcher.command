#!/bin/bash
# ============================================================
# PFMEA Analysis Tool - One-Click Launcher (macOS)
# Double-click this file to start the application
# ============================================================

# Get the directory where this script is located
cd "$(dirname "$0")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

clear
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║           🔧 PFMEA ANALYSIS TOOL                          ║"
echo "║                                                           ║"
echo "║     Process Failure Mode and Effects Analysis             ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check if Ollama is running
echo -e "${BLUE}Checking Ollama...${NC}"
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "${YELLOW}Starting Ollama...${NC}"
    open -a Ollama 2>/dev/null || ollama serve &
    sleep 3
fi

# Check for the models
echo -e "${BLUE}Checking AI models...${NC}"
if ! ollama list 2>/dev/null | grep -q "qwen3:4b"; then
    echo -e "${YELLOW}Downloading qwen3:4b (detailed mode, ~2.5GB)...${NC}"
    ollama pull qwen3:4b
fi
if ! ollama list 2>/dev/null | grep -q "llama3.2:3b"; then
    echo -e "${YELLOW}Downloading llama3.2:3b (fast mode, ~2GB)...${NC}"
    ollama pull llama3.2:3b
fi

echo -e "${GREEN}✓ AI Models Ready${NC}"
echo -e "   • qwen3:4b (Detailed mode)"
echo -e "   • llama3.2:3b (Fast mode)"
echo ""

# Start the app
echo -e "${BLUE}Starting application...${NC}"
./start.sh &

# Wait for servers to start
sleep 5

# Open browser
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}║   ✓ APPLICATION READY                                     ║${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}║   Opening browser to: http://localhost:5173               ║${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}║   To stop: Close this window or press Ctrl+C              ║${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Open default browser
open http://localhost:5173

# Keep the script running
echo "Press Ctrl+C to stop the application..."
wait

