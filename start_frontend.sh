#!/bin/bash

# Start PFMEA Frontend Server

cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start dev server
echo "Starting frontend server on http://localhost:5173"
npm run dev






