#!/bin/bash

# PFMEA Analysis Tool - Auto Setup & Start Script
# This script automatically configures and starts the entire application

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored messages
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

print_header "PFMEA Analysis Tool - Auto Setup & Start"

# Check for clear-db flag
CLEAR_DB=false
if [ "$1" = "--clear-db" ] || [ "$1" = "-c" ]; then
    CLEAR_DB=true
    shift  # Remove the flag from arguments
fi

# Check prerequisites
print_info "Checking prerequisites..."

# Check Python
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed. Please install Python 3.11+ first."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 11 ]); then
    print_error "Python 3.11+ is required. Found: $PYTHON_VERSION"
    exit 1
fi
print_success "Python $PYTHON_VERSION found"

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
    print_error "Node.js 18+ is required. Found: $NODE_VERSION"
    exit 1
fi
print_success "Node.js $(node --version) found"

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi
print_success "npm $(npm --version) found"

# Check Ollama
if ! command -v ollama &> /dev/null; then
    print_warning "Ollama is not installed or not in PATH."
    print_warning "Please install Ollama from https://ollama.ai"
    print_warning "The application will start but LLM features won't work."
    OLLAMA_AVAILABLE=false
else
    print_success "Ollama found"
    OLLAMA_AVAILABLE=true
    
    # Check if Ollama is running
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        print_success "Ollama server is running"
    else
        print_warning "Ollama server is not running. Starting Ollama..."
        if command -v ollama &> /dev/null; then
            # Try to start Ollama in background (platform dependent)
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # macOS - Ollama usually runs as a service
                print_info "On macOS, Ollama should start automatically. If not, run: brew services start ollama"
            else
                # Linux - try to start in background
                nohup ollama serve > /dev/null 2>&1 &
                sleep 2
                if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
                    print_success "Ollama server started"
                else
                    print_warning "Could not start Ollama automatically. Please run 'ollama serve' manually."
                fi
            fi
        fi
    fi
    
    # Check if models are available
    if [ "$OLLAMA_AVAILABLE" = true ]; then
        # Check for detailed mode model (qwen3:4b)
        if ! ollama list 2>/dev/null | grep -q "qwen3:4b"; then
            print_warning "Pulling qwen3:4b (detailed mode)..."
            ollama pull qwen3:4b || print_warning "Failed to pull qwen3:4b"
        else
            print_success "LLM model available: qwen3:4b"
        fi
        # Check for fast mode model (llama3.2:3b)
        if ! ollama list 2>/dev/null | grep -q "llama3.2:3b"; then
            print_warning "Pulling llama3.2:3b (fast mode)..."
            ollama pull llama3.2:3b || print_warning "Failed to pull llama3.2:3b"
        else
            print_success "LLM model available: llama3.2:3b"
        fi
    fi
fi

# Setup Backend
print_header "Setting up Backend"

cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    print_info "Creating Python virtual environment..."
    python3 -m venv venv
    print_success "Virtual environment created"
fi

# Activate virtual environment
source venv/bin/activate

# Install/upgrade dependencies
print_info "Installing Python dependencies..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
print_success "Backend dependencies installed"

# Create uploads directory
mkdir -p uploads
print_success "Backend ready"

cd ..

# Setup Frontend
print_header "Setting up Frontend"

cd frontend

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_info "Installing Node.js dependencies (this may take a minute)..."
    npm install
    print_success "Frontend dependencies installed"
else
    print_success "Frontend dependencies already installed"
fi

cd ..

# Clear database if requested (after venv is set up)
if [ "$CLEAR_DB" = "true" ]; then
    print_warning "Clearing database..."
    cd backend
    
    # Activate venv (should exist by now)
    if [ -d "venv" ]; then
        source venv/bin/activate
        
        # Check if database file exists
        if [ -f "pfmea.db" ]; then
            python3 << 'PYEOF'
import os
import sys
sys.path.insert(0, os.getcwd())

from app.models.database import engine, Base
from app.models.analysis import Analysis, PFMEAResult

# Drop all tables
print("Dropping existing tables...")
Base.metadata.drop_all(bind=engine, checkfirst=True)

# Recreate tables
print("Recreating tables...")
Base.metadata.create_all(bind=engine)

print("✓ Database cleared and reinitialized")
PYEOF
            print_success "Database cleared"
        else
            print_info "No database file found, will be created on first run."
        fi
    else
        print_error "Virtual environment not found. Cannot clear database."
    fi
    cd ..
elif [ -f "backend/pfmea.db" ]; then
    print_info "Database exists. Use --clear-db flag to clear it on startup."
fi

# Create .env file if it doesn't exist
if [ ! -f "backend/.env" ]; then
    print_info "Creating backend/.env file..."
    cat > backend/.env << EOF
# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b

# Application
DEBUG=false

# File Upload
MAX_UPLOAD_SIZE_MB=50

# Database
DATABASE_URL=sqlite:///./pfmea.db

# CORS
ENABLE_CORS=true
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
EOF
    print_success "Configuration file created"
else
    # Ensure the correct model is set in existing .env
    if grep -q "OLLAMA_MODEL" backend/.env; then
        # Update existing OLLAMA_MODEL to qwen3:4b
        if ! grep -q "OLLAMA_MODEL=qwen3:4b" backend/.env; then
            print_info "Updating OLLAMA_MODEL to qwen3:4b..."
            sed -i.bak 's/OLLAMA_MODEL=.*/OLLAMA_MODEL=qwen3:4b/' backend/.env && rm -f backend/.env.bak
            print_success "Model configuration updated"
        fi
    else
        # Add OLLAMA_MODEL if not present
        print_info "Adding OLLAMA_MODEL to .env..."
        echo "OLLAMA_MODEL=qwen3:4b" >> backend/.env
        print_success "Model configuration added"
    fi
fi


# Check and kill existing processes
print_header "Checking for Existing Processes"

# Function to kill process on a port
kill_port() {
    local port=$1
    local service=$2
    
    # Find process using the port
    if command -v lsof &> /dev/null; then
        PIDS=$(lsof -ti:$port 2>/dev/null || true)
        if [ ! -z "$PIDS" ]; then
            print_warning "Found existing $service process(es) on port $port (PIDs: $PIDS). Killing..."
            for PID in $PIDS; do
                kill -9 $PID 2>/dev/null || true
            done
            sleep 2
            # Verify they're dead
            REMAINING=$(lsof -ti:$port 2>/dev/null || true)
            if [ ! -z "$REMAINING" ]; then
                print_error "Failed to kill all processes on port $port. Remaining PIDs: $REMAINING"
                print_error "Please kill them manually: kill -9 $REMAINING"
            else
                print_success "Killed existing $service process(es)"
            fi
        else
            print_success "Port $port is free"
        fi
    elif command -v netstat &> /dev/null; then
        # Alternative for systems without lsof (Linux)
        PIDS=$(netstat -tulpn 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f1 | grep -v "^$" | sort -u || true)
        if [ ! -z "$PIDS" ]; then
            print_warning "Found existing $service process(es) on port $port (PIDs: $PIDS). Killing..."
            for PID in $PIDS; do
                kill -9 $PID 2>/dev/null || true
            done
            sleep 2
            print_success "Killed existing $service process(es)"
        else
            print_success "Port $port is free"
        fi
    else
        print_warning "Cannot check for existing processes (lsof/netstat not available)"
    fi
}

# Function to kill processes by name pattern
kill_process_by_name() {
    local pattern=$1
    local service=$2
    
    if command -v pgrep &> /dev/null; then
        PIDS=$(pgrep -f "$pattern" 2>/dev/null || true)
        if [ ! -z "$PIDS" ]; then
            print_warning "Found existing $service process(es) matching '$pattern' (PIDs: $PIDS). Killing..."
            for PID in $PIDS; do
                kill -9 $PID 2>/dev/null || true
            done
            sleep 1
            print_success "Killed existing $service process(es)"
        fi
    fi
}

# Kill existing processes by name (more thorough)
print_info "Checking for existing server processes..."
kill_process_by_name "uvicorn.*app.main:app" "backend"
kill_process_by_name "vite.*dev" "frontend"

# Kill existing processes by port
kill_port 8000 "backend"
kill_port 5173 "frontend"

# Start servers
print_header "Starting Servers"

# Function to cleanup on exit
cleanup() {
    print_info "\nShutting down servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    print_success "Servers stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend
print_info "Starting backend server on http://localhost:8000"
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
print_info "Waiting for backend to start..."
sleep 3
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    print_success "Backend server is running"
else
    print_warning "Backend may still be starting. Check backend.log if issues occur."
fi

# Start frontend
print_info "Starting frontend server on http://localhost:5173"
cd frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait a bit for frontend
sleep 2

print_header "Application Started Successfully!"

echo -e "${GREEN}✓${NC} Backend:  ${BLUE}http://localhost:8000${NC}"
echo -e "${GREEN}✓${NC} Frontend: ${BLUE}http://localhost:5173${NC}"
echo -e "\n${YELLOW}Open your browser and navigate to:${NC} ${BLUE}http://localhost:5173${NC}\n"

if [ "$OLLAMA_AVAILABLE" = false ]; then
    echo -e "${YELLOW}⚠${NC} ${YELLOW}Warning: Ollama is not available. LLM features will not work.${NC}"
    echo -e "   Install from: ${BLUE}https://ollama.ai${NC}\n"
fi

echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}\n"

# Show logs
print_info "Server logs:"
echo -e "  Backend:  ${BLUE}tail -f backend.log${NC}"
echo -e "  Frontend: ${BLUE}tail -f frontend.log${NC}\n"

# Wait for processes
wait $BACKEND_PID $FRONTEND_PID

